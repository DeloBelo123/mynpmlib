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
