import { HumanMessage } from "../../../imports"
import { getLLM, OpenRouterSTTModel } from "../../../helpers/llms"
import { LLMInstance, getOpenRouterRuntime } from "../../openrouter"
import { STTAudioInput, toBase64Audio } from "./helpers"

type STTOptions = {
    llm?: LLMInstance
    audio: STTAudioInput
    prompt?: string
    audioFormat?: "wav" | "mp3" | "aiff" | "aac" | "ogg" | "flac" | "m4a" | "pcm16" | "pcm24"
    model?: OpenRouterSTTModel
}

type PhoneSocketChunk = string | Buffer | Uint8Array

type STTPhoneSocketSessionOptions = {
    llm?: LLMInstance
    prompt?: string
    audioFormat?: "wav" | "mp3" | "aiff" | "aac" | "ogg" | "flac" | "m4a" | "pcm16" | "pcm24"
    model?: OpenRouterSTTModel
    flushIntervalMs?: number
    minBufferBytes?: number
    onTranscription?: (result: { text: string; raw: unknown }) => Promise<void> | void
}

function normalizePhoneSocketChunk(chunk: PhoneSocketChunk): Buffer {
    if (typeof chunk === "string") {
        return Buffer.from(chunk, "base64")
    }

    if (Buffer.isBuffer(chunk)) {
        return chunk
    }

    return Buffer.from(chunk)
}

/**
 * Transcribes audio to text using an OpenRouter speech-capable model.
 *
 * Internally this function sends an `input_audio` payload through the OpenRouter
 * chat-completions-compatible flow. If no `llm` is provided, it builds one with
 * `getLLM({ provider: "openrouter", type: "stt" })` and reads
 * `process.env.OPENROUTER_API_KEY`.
 *
 * Make sure `OPENROUTER_API_KEY` is set in your `.env`.
 *
 * @param params.llm Optional LLM instance from `getLLM(...)`.
 * @param params.audio Audio source as file path, base64 string, `Buffer`, or `Uint8Array`.
 * @param params.prompt Optional instruction text for the transcription model.
 * @param params.audioFormat Audio format sent to the model (for example `wav`, `mp3`, `ogg`).
 * @param params.model Optional model override for this call.
 * @returns Promise with normalized `text` and full provider response in `raw`.
 *
 * @example
 * CONFIG:
 * ```ts
 * stt({
 *     llm = getLLM({ provider: "openrouter", type: "stt" }),
 *     prompt = "Please transcribe this audio file.",
 *     audioFormat = "wav",
 *     model,
 *     audio
 * })
 * ```
 *
 * @example
 * ```ts
 * const result = await stt({
 *     audio: "./audio/meeting.wav",
 *     prompt: "Transcribe this in German."
 * });
 *
 * console.log(result.text);
 * ```
 */
export async function stt({
    llm = getLLM({ provider: "openrouter", type: "stt" }),
    prompt = "Please transcribe this audio file.",
    audioFormat = "wav",
    model,
    audio
}: STTOptions): Promise<{ text: string; raw: unknown }> {
    const runtime = getOpenRouterRuntime(llm)
    const audioBase64 = await toBase64Audio(audio)

    const message = new HumanMessage({
        content: [
            {
                type: "text",
                text: prompt
            },
            {
                type: "input_audio",
                input_audio: {
                    data: audioBase64,
                    format: audioFormat
                }
            }
        ]
    })

    const runtimeLLM =
        model && model !== runtime.model
            ? getLLM({
                  provider: "openrouter",
                  type: "stt",
                  model,
                  apikey: runtime.apiKey
              })
            : llm

    const response = await runtimeLLM.invoke([message])
    const text = typeof response.content === "string" ? response.content : JSON.stringify(response.content)

    return {
        text,
        raw: response
    }
}

/**
 * Creates a lightweight live STT session for phone sockets (for example Twilio/Telnyx media chunks).
 *
 * Internally this helper buffers incoming live audio frames and repeatedly calls `stt()`
 * to emit near-real-time transcriptions through `onTranscription`.
 *
 * @param params.llm Optional LLM instance from `getLLM(...)`.
 * @param params.prompt Optional transcription instruction prompt.
 * @param params.audioFormat Audio format for incoming phone media chunks.
 * @param params.model Optional model override for this session.
 * @param params.flushIntervalMs Interval in milliseconds for automatic transcription flushes.
 * @param params.minBufferBytes Minimum buffered bytes required before transcribing.
 * @param params.onTranscription Optional callback that receives each partial transcription.
 * @returns Session controller with `pushChunk`, `flush`, and `stop`.
 *
 * @example
 * CONFIG:
 * ```ts
 * createSTTPhoneSocketSession({
 *     llm = getLLM({ provider: "openrouter", type: "stt" }),
       flushIntervalMs = 2000,
       minBufferBytes = 1024,
       prompt = "Please transcribe",
       audioFormat = "wav",
       model,
       onTranscription
 * })
 * ```
 *
 * @example
 * ```ts
 * const session = createSTTPhoneSocketSession({
 *     audioFormat: "pcm16",
 *     onTranscription: ({ text }) => console.log(text)
 * });
 *
 * session.pushChunk(mediaPayloadBase64);
 * await session.stop();
 * ```
 */
export function createSTTPhoneSocketSession({
    llm = getLLM({ provider: "openrouter", type: "stt" }),
    flushIntervalMs = 2000,
    minBufferBytes = 1024,
    prompt = "Please transcribe",
    audioFormat = "wav",
    model,
    onTranscription
}: STTPhoneSocketSessionOptions) {
    const chunks: Buffer[] = []
    let isFlushing = false
    let isStopped = false

    const flush = async () => {
        if (isFlushing || isStopped) {
            return
        }

        const totalBytes = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
        if (totalBytes < minBufferBytes) {
            return
        }

        isFlushing = true
        const merged = Buffer.concat(chunks)
        chunks.length = 0

        try {
            const result = await stt({
                llm,
                prompt,
                audioFormat,
                model,
                audio: merged
            })

            if (onTranscription) {
                await onTranscription(result)
            }
        } finally {
            isFlushing = false
        }
    }

    const timer = setInterval(() => {
        void flush()
    }, flushIntervalMs)

    return {
        pushChunk(chunk: PhoneSocketChunk) {
            if (isStopped) {
                return
            }
            chunks.push(normalizePhoneSocketChunk(chunk))
        },
        async flush() {
            await flush()
        },
        async stop() {
            isStopped = true
            clearInterval(timer)
            await flush()
        }
    }
}

