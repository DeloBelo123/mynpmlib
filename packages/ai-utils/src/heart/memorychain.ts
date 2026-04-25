import { BaseCheckpointSaver, HumanMessage, AIMessage, LangGraphRunnableConfig, BaseMessage, CheckpointMetadata, VectorStore, MessagesPlaceholder, type Checkpoint } from "../imports"
import { BaseChatModel } from "../imports"
import { SmartCheckpointSaver } from "../memory"
import { Chain, DEFAULT_OUTPUT_SCHEMA, type InvokeInputBase, type OutputSchema } from "./chain"
import { MemorySaver } from "../imports"
import { z } from "zod/v3"
import { getLLM } from "../helpers"

type MemoryChainProps<T extends OutputSchema = typeof DEFAULT_OUTPUT_SCHEMA> = { llm?:BaseChatModel,memory?: BaseCheckpointSaver } & ({
    chain: Chain<T>
} | {
    prompt?: string | Array<string | MessagesPlaceholder<any>>
    output?:T
    vectorStore?: VectorStore
})

/**
 * CONSTRUCTOR 
 * @example 
 * constructor({memory, ...rest}: MemoryChainProps<T>){
        this.memory = memory ?? new SmartCheckpointSaver(new MemorySaver(), { llm: rest.llm ?? getLLM({type:"groq", apikey: process.env.CHATGROQ_API_KEY ?? ""}) })
        if ("chain" in rest){
            this.chain = rest.chain
        } else {
            this.chain = new Chain<T>({
                llm: rest.llm ?? getLLM({type:"groq", apikey: process.env.CHATGROQ_API_KEY ?? ""}),
                prompt: rest.prompt ?? "Du bist ein hilfreicher Assistent der mit dem User ein höffliches und hilfreiches Gespräch führt",
                output: (rest.output ?? DEFAULT_OUTPUT_SCHEMA) as unknown as T
                vectorStore: rest.vectorStore ?? undefined
            })
        }
    }
 * 
 * @example entweder gibst du direkt eine chain + memory:
 * @param props.memory 
 * @param props.chain 
 * 
 * @example oder eine chain wird anhand deines llms, prompts, usw... erstellt + memory:
 * @param props.memory
 * @param props.llm 
 * @param props.prompt 
 * @param props.output - Zod-Schema für den Rückgabewert von .invoke()
 * @param props.vectorStore 
 */
export class MemoryChain<T extends OutputSchema = typeof DEFAULT_OUTPUT_SCHEMA>{
    private memory: BaseCheckpointSaver
    private chain: Chain<T>

    constructor({memory, ...rest}: MemoryChainProps<T>){
        this.memory = memory ?? new SmartCheckpointSaver(new MemorySaver(), { llm: rest.llm ?? getLLM({ type:"groq" }) })
        if ("chain" in rest){
            this.chain = rest.chain
        } else {
            this.chain = new Chain<T>({
                llm: rest.llm ?? getLLM({ type:"groq" }),
                prompt: rest.prompt ?? "Du bist ein hilfreicher Assistent der mit dem User ein höffliches und hilfreiches Gespräch führt",
                output: (rest.output ?? DEFAULT_OUTPUT_SCHEMA) as unknown as T,
                vectorStore: rest.vectorStore ?? undefined
            })
        }
    }

    public async invoke(input: InvokeInputBase & { thread_id: string }): Promise<z.infer<T>> {
        const config: LangGraphRunnableConfig = {
            configurable: { thread_id: input.thread_id }
        }
        
        const checkpoint = await this.memory.get(config)
    
        let historyMessages: BaseMessage[] = []
        if (checkpoint && checkpoint.channel_values && checkpoint.channel_values.messages) {
            historyMessages = checkpoint.channel_values.messages as BaseMessage[]
        }

        const historyText = this.messagesToHistoryText(historyMessages)

        const { thread_id, debug, promptVars, ...restInput } = input
        
        const invokeInput: Record<string, any> = {}
        for (const key in restInput) {
            const value = restInput[key]
            if (historyText) {
                invokeInput[key] = typeof value === 'string' 
                    ? `${historyText}\n\nUser: ${key} = ${value}`
                    : `${historyText}\n\nUser: ${key} = ${JSON.stringify(value)}`
            } else {
                invokeInput[key] = value
            }
        }

        if (debug) {
            invokeInput.debug = true
        }
        if (promptVars !== undefined) {
            invokeInput.promptVars = promptVars
        }

        const response = await this.chain.invoke(invokeInput)
        
        const responseText = typeof response === 'object' && 'output' in response 
            ? response.output 
            : typeof response === 'string' 
            ? response 
            : JSON.stringify(response)

        const userMessages = Object.entries(restInput).map(([key, value]) => 
            new HumanMessage(`${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
        )
        await this.saveResponse(thread_id, userMessages, responseText, historyMessages)

        return response
    }

    public async *stream(input: InvokeInputBase & { thread_id: string }): AsyncGenerator<string, string, unknown> {
        const config: LangGraphRunnableConfig = {
            configurable: { thread_id: input.thread_id }
        }
        
        const checkpoint = await this.memory.get(config)
    
        let historyMessages: BaseMessage[] = []
        if (checkpoint && checkpoint.channel_values && checkpoint.channel_values.messages) {
            historyMessages = checkpoint.channel_values.messages as BaseMessage[]
        }

        const historyText = this.messagesToHistoryText(historyMessages)

        const { thread_id, promptVars, debug, ...restInput } = input

        const userMessages = Object.entries(restInput).map(([key, value]) => 
            new HumanMessage(`${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
        )

        const streamInput: Record<string, any> = {}
        for (const key in restInput) {
            if (historyText) {
                streamInput[key] = typeof restInput[key] === 'string'
                    ? `${historyText}\n\nUser: ${key} = ${restInput[key]}`
                    : `${historyText}\n\nUser: ${key} = ${JSON.stringify(restInput[key])}`
            } else {
                streamInput[key] = restInput[key]
            }
        }
        if (debug) {
            streamInput.debug = true
        }
        if (promptVars !== undefined) {
            streamInput.promptVars = promptVars
        }

        const chunks: string[] = []
        
        try {
            for await (const chunk of this.chain.stream(streamInput)) {
                chunks.push(chunk)
                yield chunk
            }
        } finally {
            const responseText = chunks.join('')
            await this.saveResponse(thread_id, userMessages, responseText, historyMessages)
        }
        
        return chunks.join('')
    }

    public async addContext(data: Array<any>){
        await this.chain.addContext(data)
    }

    public setContext(vectorStore: VectorStore){
        this.chain.setContext(vectorStore)
    }

    public clearContext(){
        this.chain.clearContext()
    }

    private messagesToHistoryText(messages: BaseMessage[]): string {
        return messages.map(msg => {
            if (msg instanceof HumanMessage) {
                return `User: ${typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}`
            } else if (msg instanceof AIMessage) {
                return `Assistant: ${typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}`
            } else {
                return `System: ${typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}`
            }
        }).join('\n\n')
    }

    private async saveResponse(
        thread_id: string,
        userMessages: BaseMessage[],
        responseText: string,
        historyMessages: BaseMessage[]
    ): Promise<void> {
        if (!responseText || responseText.length === 0) return

        const config: LangGraphRunnableConfig = {
            configurable: { thread_id }
        }

        const checkpoint = await this.memory.get(config)

        const aiMessage = new AIMessage(responseText)
        const newMessages = [...historyMessages, ...userMessages, aiMessage]

        const newCheckpoint = {
            ...checkpoint,
            channel_values: {
                ...(checkpoint?.channel_values || {}),
                messages: newMessages
            },
            channel_versions: {
                ...(checkpoint?.channel_versions || {}),
                messages: newMessages.length
            },
            versions_seen: checkpoint?.versions_seen || {},
            v: (checkpoint?.v || 0) + 1,
            id: checkpoint?.id || `${thread_id}-${Date.now()}`,
            ts: checkpoint?.ts || new Date().toISOString()
        }

        const metadata: CheckpointMetadata = {
            source: "input",
            step: (checkpoint?.v || 0) + 1,
            parents: {}
        } as CheckpointMetadata & { writes?: Record<string, any> }

        const newCheckpointWithPendingSends = {
            ...newCheckpoint,
            pending_sends: []
        } as Checkpoint & { pending_sends?: any[] }

        await this.memory.put(config, newCheckpointWithPendingSends, metadata, { messages: newMessages.length })
    }

}
