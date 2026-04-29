import { getLLM } from "../../../helpers/llms"
import { LLMInstance, getOpenRouterRuntime } from "../../openrouter"
import { createTTSPayload, OpenRouterTTSVoice, TTSResponseFormat } from "./helpers"

type TTSOptions = {
    llm?: LLMInstance
    text: string
    model: OpenRouterTTSVoice
    responseFormat?: TTSResponseFormat
    speed?: number
}

type TTSPhoneSocketStreamOptions = TTSOptions & {
    chunkSizeBytes?: number
    emitBase64?: boolean
    onChunk: (chunk: Uint8Array | string, index: number) => Promise<void> | void
}

/**
 * Converts text to speech via OpenRouter's dedicated `/audio/speech` endpoint.
 *
 * Internally this function calls OpenRouter directly and returns raw audio bytes.
 * If no `llm` is provided, it creates one with
 * `getLLM({ provider: "openrouter", type: "tts" })` and reads
 * `process.env.OPENROUTER_API_KEY`.
 *
 * Make sure `OPENROUTER_API_KEY` is set in your `.env`.
 *
 * @param params.llm Optional LLM instance from `getLLM(...)`.
 * @param params.text Text that should be synthesized to audio.
 * @param params.model Voice identifier to use for speech generation.
 * @param params.responseFormat Audio response format (`mp3` or `pcm`).
 * @param params.speed Playback speed multiplier (default `1.0`).
 * @returns Promise with `audioBytes` and optional response metadata headers.
 *
 * @example
 * CONFIG:
 * ```ts
 * tts({
 *     llm = getLLM({ provider: "openrouter", type: "tts" }),
 *     responseFormat = "mp3",
 *     speed = 1.0,
 *     text,
 *     model
 * })
 * ```
 *
 * @example
 * ```ts
 * const speech = await tts({
 *     text: "Hallo! Das ist ein Test.",
 *     model: "nova",
 *     responseFormat: "mp3"
 * });
 *
 * console.log(speech.audioBytes.length);
 * ```
 */
export async function tts({
    llm = getLLM({ provider: "openrouter", type: "tts" }),
    responseFormat = "mp3",
    speed = 1.0,
    text,
    model
}: TTSOptions): Promise<{ audioBytes: Uint8Array; contentType?: string; generationId?: string }> {
    const runtime = getOpenRouterRuntime(llm)

    const payload = createTTSPayload({
        model: runtime.model,
        input:text,
        voice:model,
        response_format: responseFormat,
        speed
    })

    const response = await fetch(`${runtime.baseURL}/audio/speech`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${runtime.apiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`OpenRouter TTS failed (${response.status}): ${errorText}`)
    }

    const audioBuffer = await response.arrayBuffer()
    return {
        audioBytes: new Uint8Array(audioBuffer),
        contentType: response.headers.get("content-type") ?? undefined,
        generationId: response.headers.get("x-generation-id") ?? undefined
    }
}

/**
 * Streams synthesized TTS audio as sequential chunks for phone socket pipelines
 * (for example Twilio/Telnyx websocket media send loops).
 *
 * Internally this helper calls `tts()` once and splits the returned audio into
 * chunked payloads that can be forwarded to a live call socket.
 *
 * @param params.llm Optional LLM instance from `getLLM(...)`.
 * @param params.text Text that should be synthesized to audio.
 * @param params.model Voice identifier for speech generation.
 * @param params.responseFormat Audio response format (`mp3` or `pcm`).
 * @param params.speed Playback speed multiplier.
 * @param params.chunkSizeBytes Size of each emitted audio chunk.
 * @param params.emitBase64 If true, emits base64 chunks; otherwise emits `Uint8Array`.
 * @param params.onChunk Callback that receives each emitted chunk in order.
 * @returns Promise with total emitted chunks and response metadata.
 *
 * @example
 * CONFIG:
 * ```ts
 * streamTTSOverPhoneSocket({
 *     llm = getLLM({ provider: "openrouter", type: "tts" }),
       speed = 1.0,
       chunkSizeBytes = 3200,
       emitBase64 = true,
       responseFormat = "mp3",
       text,
       model,
       onChunk
 * })
 * ```
 *
 * @example
 * ```ts
 * await streamTTSOverPhoneSocket({
    model,
    onChunk
 * })
 * ```
 *
 * @example
 * ```ts
 * await streamTTSOverPhoneSocket({
 *     text: "Willkommen beim Support.",
 *     model: "nova",
 *     onChunk: async (chunk) => socket.send(String(chunk))
 * });
 * ```
 */
export async function streamTTSOverPhoneSocket({
    llm = getLLM({ provider: "openrouter", type: "tts" }),
    speed = 1.0,
    chunkSizeBytes = 3200,
    emitBase64 = true,
    responseFormat = "mp3",
    text,
    model,
    onChunk
}: TTSPhoneSocketStreamOptions): Promise<{ totalChunks: number; contentType?: string; generationId?: string }> {
    const result = await tts({
        llm,
        text,
        model,
        responseFormat,
        speed
    })

    let index = 0
    for (let offset = 0; offset < result.audioBytes.length; offset += chunkSizeBytes) {
        const chunk = result.audioBytes.slice(offset, offset + chunkSizeBytes)
        const outgoing = emitBase64 ? Buffer.from(chunk).toString("base64") : chunk
        await onChunk(outgoing, index)
        index += 1
    }

    return {
        totalChunks: index,
        contentType: result.contentType,
        generationId: result.generationId
    }
}

