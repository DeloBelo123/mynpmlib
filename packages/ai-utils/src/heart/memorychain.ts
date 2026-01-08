import { BaseCheckpointSaver, HumanMessage, AIMessage, LangGraphRunnableConfig, BaseMessage, CheckpointMetadata, VectorStore, MessagesPlaceholder, type Checkpoint } from "../imports"
import { BaseChatModel } from "../imports"
import { SmartCheckpointSaver } from "../memory"
import { Chain, DEFAULT_SCHEMA } from "./chain"
import { MemorySaver } from "../imports"
import { z } from "zod/v3"

type MemoryChainProps<T extends z.ZodObject<any,any> = typeof DEFAULT_SCHEMA> = { llm:BaseChatModel,memory?: BaseCheckpointSaver } & ({
    chain: Chain<T>
} | {
    prompt?: string | Array<string | MessagesPlaceholder<any>>
    schema?:T
})

/**
 * CONSTRUCTOR
 * @example  constructor({memory, ...rest}: MemoryChainProps<T> = {}){
        this.memory = memory ?? new SmartCheckpointSaver(new MemorySaver(), { llm: rest.llm })
        if ("chain" in rest){
            this.chain = rest.chain
        } else {
            this.chain = new Chain<T>({
                llm: rest.llm,
                prompt: rest.prompt ?? "Du bist ein hilfreicher Chatbot der mit dem User ein höffliches und hilfreiches Gespräch führt",
                schema: (rest.schema ?? DEFAULT_SCHEMA) as unknown as T
            })
        }
    }
 * 
 * @example entweder gibst du direkt eine chain + memory:
 * @param props.memory 
 * @param props.chain 
 * 
 * @example oder eine chain wird anhand deines llms, schemas oder prompts erstellt + memory:
 * @param props.memory
 * @param props.llm 
 * @param props.prompt 
 * @param props.schema
 */
export class MemoryChain<T extends z.ZodObject<any,any> = typeof DEFAULT_SCHEMA>{
    private memory: BaseCheckpointSaver
    private chain: Chain<T>

    constructor({memory, ...rest}: MemoryChainProps<T>){
        this.memory = memory ?? new SmartCheckpointSaver(new MemorySaver(), { llm: rest.llm })
        if ("chain" in rest){
            this.chain = rest.chain
        } else {
            this.chain = new Chain<T>({
                llm: rest.llm,
                prompt: rest.prompt ?? "Du bist ein hilfreicher Assistent der mit dem User ein höffliches und hilfreiches Gespräch führt",
                schema: (rest.schema ?? DEFAULT_SCHEMA) as unknown as T
            })
        }
    }

    public async invoke(input: Record<string, any> & { thread_id: string, debug?: boolean }): Promise<z.infer<T>> {
        const config: LangGraphRunnableConfig = {
            configurable: { thread_id: input.thread_id }
        }
        
        const checkpoint = await this.memory.get(config)
    
        let historyMessages: BaseMessage[] = []
        if (checkpoint && checkpoint.channel_values && checkpoint.channel_values.messages) {
            historyMessages = checkpoint.channel_values.messages as BaseMessage[]
        }

        const historyText = this.messagesToHistoryText(historyMessages)

        const { thread_id, debug, ...restInput } = input
        
        const invokeInput: Record<string, any> = {}
        for (const key in restInput) {
            if (key === "debug") continue
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

    public async *stream(input:Record<string,any> & { thread_id:string }): AsyncGenerator<string, string, unknown> {
        const config: LangGraphRunnableConfig = {
            configurable: { thread_id: input.thread_id }
        }
        
        const checkpoint = await this.memory.get(config)
    
        let historyMessages: BaseMessage[] = []
        if (checkpoint && checkpoint.channel_values && checkpoint.channel_values.messages) {
            historyMessages = checkpoint.channel_values.messages as BaseMessage[]
        }

        const historyText = this.messagesToHistoryText(historyMessages)

        const { thread_id, ...restInput } = input

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
        this.chain.addContext(data)
    }

    public async setContext(vectorStore: VectorStore){
        this.chain.setContext(vectorStore)
    }

    public async clearContext(){
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
