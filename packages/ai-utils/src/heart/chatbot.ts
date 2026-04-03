import { BaseCheckpointSaver, VectorStore, DynamicStructuredTool } from "../imports"
import { BaseChatModel } from "../imports"
import { getLLM } from "../helpers"
import { SmartCheckpointSaver } from "../memory"
import { MemorySaver } from "../imports"
import { logChunk } from "../helpers"
import { input } from "@delofarag/base-utils/server"
import { MemoryChain } from "./memorychain"
import { Agent } from "./agent"

type ChatbotProps = {
    llm: BaseChatModel
    prompt?: string | Array<string>
    tools?: DynamicStructuredTool[]
    memory?: BaseCheckpointSaver
} | {
    llm: BaseChatModel
    prompt?: string | Array<string>
    memory?: BaseCheckpointSaver
    vectorStore?: VectorStore
}

/**
 * CONSTRUCTOR:
 * @example 
 * constructor(props: ChatbotProps){
        const llm = props.llm ?? getLLM({type:"groq", apikey: process.env.CHATGROQ_API_KEY ?? ""})
        const memory = props.memory ?? new SmartCheckpointSaver(new MemorySaver(), { llm })
        const prompt = props.prompt ?? "Du bist ein hilfreicher chatbot der mit dem User ein höffliches Gespräch führt"

        if ("tools" in props) {
            this.agent = new Agent({
                memory,
                tools: props.tools ?? [],
                prompt,
                llm,
            })
        } else {
            const vectorStore = "vectorStore" in props ? props.vectorStore : undefined
            this.chain = new MemoryChain({
                memory,
                prompt,
                llm,
                vectorStore
            })
        }
    }
 */
export class Chatbot {
    private chain: MemoryChain | undefined
    private agent: Agent<any> | undefined

    constructor(props: ChatbotProps){
        const llm = props.llm ?? getLLM({ type:"groq" })
        const memory = props.memory ?? new SmartCheckpointSaver(new MemorySaver(), { llm })
        const prompt = props.prompt ?? "Du bist ein hilfreicher chatbot der mit dem User ein höffliches Gespräch führt"

        if ("tools" in props) {
            this.agent = new Agent({
                memory,
                tools: props.tools ?? [],
                prompt,
                llm,
            })
        } else {
            const vectorStore = "vectorStore" in props ? props.vectorStore : undefined
            this.chain = new MemoryChain({
                memory,
                prompt,
                llm,
                vectorStore
            })
        }
    }

    public async *chat({input,thread_id}:{input:string, thread_id:string}): AsyncGenerator<string, string, unknown> {
        const streamable = this.chain ? this.chain : this.agent
        if (!streamable) throw new Error("kein streamable!")
        let fullResponse = ""
        for await (const chunk of streamable.stream({input,thread_id})){
            fullResponse += chunk
            yield chunk
        }
        return fullResponse
    }

    public async session({
        breakword = "exit",
        numberOfMessages = Number.POSITIVE_INFINITY,
        id = `${Date.now()}`
    }:{
        breakword?:string,
        numberOfMessages?:number,
        id?:string
    } = {}){
        let messages = 0
        while(true){
            try{
                const message = await input("You: ")
                if(message === breakword){
                    break
                }
                const response = this.chat({
                    input: message, 
                    thread_id: id,
                })
                console.log("Assistant: ")
                for await (const chunk of response) {
                    logChunk(chunk)
                }
                console.log("") // Zeilenumbruch nach dem Streamen, damit Output nicht überschrieben wird
            } catch(e){
                console.error("Error: ", e)
            }
            messages = messages + 2
            if(messages > numberOfMessages){
                console.log(`Message-limit of ${numberOfMessages} reached, stopping session`)
                break
            }
        }
    }
}