import { input } from "@delofarag/base-utils/server"
import { logChunk } from "./helpers"
import { isInterrupt } from "../client/index"
import type { DeepAgentStreamChunkWithTools, DeepAgentUserDecision } from "./deepagent/interruptTypes"

type SessionStreamable = {
    stream(input: {
        input?: string
        thread_id: string
        decision?: DeepAgentUserDecision
        showToolCalls?: true
    }): AsyncIterable<DeepAgentStreamChunkWithTools>
}

type SessionProps = {
    streamable: SessionStreamable
    breakword?: string
    numberOfMessages?: number
    id?: string
    isDeepAgent?: boolean
}

function parseDeepAgentDecision(message: string): DeepAgentUserDecision | undefined {
    const normalized = message.trim().toLowerCase()
    if (!normalized) return undefined

    if (normalized.startsWith("reject:")) {
        return { type: "reject", message: message.slice("reject:".length).trim() }
    }

    const approveWords = ["approve", "approved", "aprove", "yes", "y", "ja", "ok", "okay"]
    if (approveWords.includes(normalized) || normalized.includes("darf") || normalized.includes("klar")) {
        return "approve"
    }

    const rejectWords = ["reject", "rejected", "no", "n", "nein"]
    if (rejectWords.includes(normalized)) {
        return "reject"
    }

    return undefined
}

/** 
 * die session funktion für ein streamable, wird hauptsächlich für testing eines agenten verwendet
 * @param streamable das streamable welches die session führt
 * @param breakword das wort welches die session beendet
 * @param numberOfMessages die maximale anzahl von messages welche die session senden kann
 * @param id die id der session
 * @returns void
 */
export async function session({
    streamable,
    breakword = "exit",
    numberOfMessages = Number.POSITIVE_INFINITY,
    id = `${Date.now()}`,
    isDeepAgent = false,
}: SessionProps): Promise<void> {
    let messages = 0
    let pendingInterrupt = false

    while (true) {
        try {
            const message = await input("You: ")
            if (message === breakword) {
                break
            }

            const deepAgentStreamOpts = isDeepAgent ? { showToolCalls: true as const } : {}
            const decision = pendingInterrupt && isDeepAgent
                ? parseDeepAgentDecision(message)
                : undefined

            if (pendingInterrupt && isDeepAgent && !decision) {
                console.log("Pending interrupt. Bitte antworte mit approve oder reject.")
                continue
            }

            const streamInput = decision !== undefined
                ? {
                    thread_id: id,
                    decision,
                    ...deepAgentStreamOpts,
                }
                : {
                    input: message,
                    thread_id: id,
                    ...deepAgentStreamOpts,
                }

            pendingInterrupt = false
            const response = streamable.stream(streamInput)
            console.log("Assistant: ")
            for await (const chunk of response) {
                logChunk(chunk)
                if (isDeepAgent && isInterrupt(chunk)) {
                    pendingInterrupt = true
                }
            }
            console.log("")
        } catch (e) {
            console.error("Error: ", e)
        }

        messages = messages + 2
        if (messages > numberOfMessages) {
            console.log(`Message-limit of ${numberOfMessages} reached, stopping session`)
            break
        }
    }
}

type StreamResponseInit = ResponseInit & {
    encoder?: TextEncoder;
  };
  
/** 
 * eine HTTP-Response objekt erweiterung welches einen stream returnbar macht. ein stream kann halt nicht per
 * json einfach geschickt werden weil das nicht serialisiert werden kann, deswegen muss es einen prozess nochmal
 * untergehen befor man das "returnen" kann
 * @param aiStream der stream von der ai
 * @param init die initialisierung des response objekts
 * @returns das response objekt
 */
export function StreamResponse<T>(
    aiStream: AsyncIterable<T>,
    init: StreamResponseInit = {}
  ): Response {
    const encoder = init.encoder ?? new TextEncoder();
  
    const { encoder: _encoder, headers, ...responseInit } = init;
  
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of aiStream) {
            controller.enqueue(
              encoder.encode(JSON.stringify(chunk) + "\n")
            );
          }
  
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });
  
    return new Response(stream, {
      ...responseInit,
      headers: {
        "Content-Type": "application/x-ndjson",
        ...headers,
      },
    });
  }
