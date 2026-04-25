import { input } from "@delofarag/base-utils/server"
import { logChunk } from "./helpers"
import type { Agent } from "./heart/agent"
import type { MemoryChain } from "./heart/memorychain"

type SessionStreamable = Agent<any> | MemoryChain<any>

type SessionProps = {
    streamable: SessionStreamable
    breakword?: string
    numberOfMessages?: number
    id?: string
}

/** 
 * die session funktion für ein streamable, wird hauptsächlich für testing eines agenten/memorychains verwendet
 * (diese 2 sind die einzigen Streamables die es gibt)
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
    id = `${Date.now()}`
}: SessionProps): Promise<void> {
    let messages = 0

    while (true) {
        try {
            const message = await input("You: ")
            if (message === breakword) {
                break
            }

            const response = streamable.stream({
                input: message,
                thread_id: id
            })
            console.log("Assistant: ")
            for await (const chunk of response) {
                logChunk(chunk)
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