import { z } from "zod/v4"
import { PromptTemplate } from "@langchain/core/prompts"
import type { InvokeInputBase, OutputSchema } from "./chain"
import {
    DynamicStructuredTool,
    BaseChatModel,
    BaseCheckpointSaver,
    createDeepAgent,
    HumanMessage,
    type AgentMiddleware,
    type BaseStore,
    type CreateDeepAgentParams,
    type SubAgent,
    type FilesystemPermission,
} from "../imports"
import { getLLM } from "../helpers/llms"
import { structure } from "../magic-funcs/parsers/structure"

type DeepAgentInterruptOn = NonNullable<CreateDeepAgentParams["interruptOn"]>

async function resolveSystemPromptBlocks(
    blocks: Array<["system", string]>,
    promptVars?: Record<string, any>
): Promise<Array<["system", string]>> {
    if (!promptVars || Object.keys(promptVars).length === 0) {
        return blocks
    }
    const out: Array<["system", string]> = []
    for (const [role, text] of blocks) {
        try {
            const formatted = await PromptTemplate.fromTemplate(text).format(promptVars as Record<string, any>)
            out.push([role, formatted])
        } catch {
            out.push([role, text])
        }
    }
    return out
}

function blocksToSystemPrompt(blocks: Array<["system", string]>): string {
    return blocks.map(([, text]) => text).join("\n\n")
}

interface DeepAgentProps<T extends OutputSchema | undefined = undefined> {
    tools?: DynamicStructuredTool[]
    prompt?: string | Array<string>
    llm?: BaseChatModel
    output?: T
    checkpointer?: BaseCheckpointSaver | boolean
    agentsMd?: string[]
    subagents?: SubAgent[]
    backend?: CreateDeepAgentParams["backend"]
    permissions?: FilesystemPermission[]
    skills?: string[]
    middleware?: AgentMiddleware[]
    interruptOn?: DeepAgentInterruptOn
    store?: BaseStore
    name?: string
    contextSchema?: CreateDeepAgentParams["contextSchema"]
}

/**
 * CONSTRUCTOR:
 * @example
 * constructor({
        prompt = `Du bist ein hilfreicher Deep Agent.`,
        llm = getLLM({ provider: "openrouter", model: "openai/gpt-5.4-mini" }),
        tools = [],
        output,
        checkpointer,
        agentsMd,
        subagents,
        backend,
        permissions,
        skills,
        middleware,
        interruptOn,
        store,
        name,
        contextSchema,
    }: DeepAgentProps<T> = {} as DeepAgentProps<T>) {
        this.prompt = typeof prompt === "string"
            ? [["system", prompt]]
            : prompt.map((p: string) => ["system", p] as ["system", string])
        this.tools = tools
        this.llm = llm
        this.output = output
        this.checkpointer = checkpointer
        this.agentsMd = agentsMd
        this.subagents = subagents
        this.backend = backend
        this.permissions = permissions
        this.skills = skills
        this.middleware = middleware
        this.interruptOn = interruptOn
        this.store = store
        this.name = name
        this.contextSchema = contextSchema
    }
 */
export class DeepAgent<T extends OutputSchema | undefined = undefined> {
    private prompt: Array<["system", string]>
    private tools: DynamicStructuredTool[]
    private llm: BaseChatModel
    private output: T | undefined
    private agent: any
    private checkpointer: BaseCheckpointSaver | boolean | undefined
    private agentsMd: string[] | undefined
    private subagents: SubAgent[] | undefined
    private backend: CreateDeepAgentParams["backend"]
    private permissions: FilesystemPermission[] | undefined
    private skills: string[] | undefined
    private middleware: AgentMiddleware[] | undefined
    private interruptOn: DeepAgentInterruptOn | undefined
    private store: BaseStore | undefined
    private name: string | undefined
    private contextSchema: CreateDeepAgentParams["contextSchema"]
    private should_use_output: boolean = true

    constructor({
        prompt = `Du bist ein hilfreicher Deep Agent.`,
        llm = getLLM({ provider: "openrouter", model: "openai/gpt-5.4-mini" }),
        tools = [],
        output,
        checkpointer,
        agentsMd,
        subagents,
        backend,
        permissions,
        skills,
        middleware,
        interruptOn,
        store,
        name,
        contextSchema,
    }: DeepAgentProps<T> = {} as DeepAgentProps<T>) {
        this.prompt = typeof prompt === "string"
            ? [["system", prompt]]
            : prompt.map((p: string) => ["system", p] as ["system", string])
        this.tools = tools
        this.llm = llm
        this.output = output
        this.checkpointer = checkpointer
        this.agentsMd = agentsMd
        this.subagents = subagents
        this.backend = backend
        this.permissions = permissions
        this.skills = skills
        this.middleware = middleware
        this.interruptOn = interruptOn
        this.store = store
        this.name = name
        this.contextSchema = contextSchema
    }

    public async invoke(this: DeepAgent<undefined>, invokeInput: InvokeInputBase & { thread_id?: string; context?: Record<string, any> }): Promise<string>
    public async invoke<U extends OutputSchema>(this: DeepAgent<U>, invokeInput: InvokeInputBase & { thread_id?: string; context?: Record<string, any> }): Promise<z.infer<U>>
    public async invoke(invokeInput: InvokeInputBase & { thread_id?: string; context?: Record<string, any> }): Promise<string | z.infer<OutputSchema>> {
        const { thread_id, debug, promptVars, context, ...variables } = invokeInput

        if (this.checkpointer && !thread_id) {
            throw new Error("thread_id is required when using checkpointer, else no state is stored")
        }
        if (!this.checkpointer && thread_id) {
            console.warn("WARN: thread_id is provided but no checkpointer is set, so no state is stored")
        }

        const humanMessages: HumanMessage[] = Object.entries(variables).map(
            ([key, value]) => new HumanMessage(`${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`)
        )

        const resolvedPrompt = await resolveSystemPromptBlocks(this.prompt, promptVars)
        const systemPrompt = blocksToSystemPrompt(resolvedPrompt)

        this.agent = createDeepAgent({
            model: this.llm as any,
            systemPrompt,
            tools: this.tools as any,
            ...(this.output ? { responseFormat: this.output as any } : {}),
            ...(this.checkpointer !== undefined ? { checkpointer: this.checkpointer } : {}),
            ...(this.agentsMd ? { memory: this.agentsMd } : {}),
            ...(this.subagents ? { subagents: this.subagents } : {}),
            ...(this.backend ? { backend: this.backend } : {}),
            ...(this.permissions ? { permissions: this.permissions } : {}),
            ...(this.skills ? { skills: this.skills } : {}),
            ...(this.middleware ? { middleware: this.middleware as any } : {}),
            ...(this.interruptOn ? { interruptOn: this.interruptOn } : {}),
            ...(this.store ? { store: this.store } : {}),
            ...(this.name ? { name: this.name } : {}),
            ...(this.contextSchema ? { contextSchema: this.contextSchema as any } : {}),
        })

        const config = thread_id && this.checkpointer
            ? { configurable: { thread_id }, ...(context ? { context } : {}) }
            : context
                ? { context }
                : undefined

        const result = await this.agent.invoke({ messages: humanMessages } as any, config)
        if (debug) return result

        if (this.output && this.should_use_output && result?.structuredResponse !== undefined) {
            return result.structuredResponse as z.infer<OutputSchema>
        }

        const lastMessage = result.messages[result.messages.length - 1]
        const raw = lastMessage?.content
        const content = typeof raw === "string"
            ? raw
            : (Array.isArray(raw) ? raw.map((c: any) => c?.text ?? c).join("") : String(raw ?? ""))

        if (this.output && this.should_use_output) {
            return await structure({ data: content, into: this.output, llm: this.llm })
        }

        return content
    }

    public async *stream(invokeInput: InvokeInputBase & { thread_id?: string; context?: Record<string, any> }): AsyncGenerator<string, void, unknown> {
        this.should_use_output = false
        try {
            const { thread_id, promptVars, context, ...variables } = invokeInput

            if (this.checkpointer && !thread_id) {
                throw new Error("thread_id is required when using checkpointer, else no state is stored")
            }
            if (!this.checkpointer && thread_id) {
                console.warn("WARN: thread_id is provided but no checkpointer is set, so no state is stored")
            }

            const humanMessages: HumanMessage[] = Object.entries(variables).map(
                ([key, value]) => new HumanMessage(`${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`)
            )

            const resolvedPrompt = await resolveSystemPromptBlocks(this.prompt, promptVars)
            const systemPrompt = blocksToSystemPrompt(resolvedPrompt)

            this.agent = createDeepAgent({
                model: this.llm as any,
                systemPrompt,
                tools: this.tools as any,
                ...(this.checkpointer !== undefined ? { checkpointer: this.checkpointer } : {}),
                ...(this.agentsMd ? { memory: this.agentsMd } : {}),
                ...(this.subagents ? { subagents: this.subagents } : {}),
                ...(this.backend ? { backend: this.backend } : {}),
                ...(this.permissions ? { permissions: this.permissions } : {}),
                ...(this.skills ? { skills: this.skills } : {}),
                ...(this.middleware ? { middleware: this.middleware as any } : {}),
                ...(this.interruptOn ? { interruptOn: this.interruptOn } : {}),
                ...(this.store ? { store: this.store } : {}),
                ...(this.name ? { name: this.name } : {}),
                ...(this.contextSchema ? { contextSchema: this.contextSchema as any } : {}),
            })

            const config = thread_id && this.checkpointer
                ? { configurable: { thread_id }, ...(context ? { context } : {}) }
                : context
                    ? { context }
                    : undefined

            const nativeStream = await this.agent.stream(
                { messages: humanMessages } as any,
                { ...(config ?? {}), streamMode: "messages" } as any
            )

            for await (const chunk of nativeStream) {
                const messageChunk = Array.isArray(chunk) ? chunk[0] : chunk
                const metadata = Array.isArray(chunk) ? chunk[1] : undefined
                const node = metadata?.langgraph_node
                const messageType = typeof messageChunk?._getType === "function" ? messageChunk._getType() : messageChunk?._getType

                if (node === "tools" || messageType === "tool") {
                    continue
                }

                const raw = messageChunk?.content
                if (typeof raw === "string") {
                    if (raw.length > 0) yield raw
                    continue
                }
                if (Array.isArray(raw)) {
                    const text = raw.map((part: any) => part?.text ?? "").join("")
                    if (text.length > 0) yield text
                }
            }
        } finally {
            this.should_use_output = true
        }
    }

    public addTool(tool: DynamicStructuredTool) {
        this.tools.push(tool)
    }

    public get currentTools(): string[] {
        return this.tools.map(tool => tool.name)
    }
}
