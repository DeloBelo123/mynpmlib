import { z } from "zod/v4"
import { PromptTemplate } from "@langchain/core/prompts"
import type { OutputSchema } from "./chain"
import {
    DynamicStructuredTool,
    BaseChatModel,
    BaseCheckpointSaver,
    createDeepAgent,
    HumanMessage,
    MemorySaver,
    type AgentMiddleware,
    type BaseStore,
    type CreateDeepAgentParams,
    type SubAgent,
    type FilesystemPermission,
} from "../imports"
import { getLLM } from "../helpers/llms"
import { structure } from "../magic-funcs/parsers/structure"
import type {
    DeepAgentInterrupt,
    DeepAgentRunInputBase,
    DeepAgentHitlFields,
    DeepAgentShowToolCallsField,
    DeepAgentToolEvent,
    DeepAgentUserDecision,
} from "../helpers/deepagent/interruptTypes"
import {
    createResumeCommand,
    expandResumeDecisions,
    getPendingInterruptCount,
    mapInterruptOnToNative,
    mapResultToInterrupt,
    type DeepAgentInterruptableToolName,
    type InterruptOnFor,
} from "../helpers/deepagent/interruptOn"
import { mapNativeStreamChunk } from "../helpers/deepagent/streamEvents"
import type { DeepAgentBackend } from "../helpers/deepagent/backend"

interface DeepAgentProps<
    T extends OutputSchema | undefined = undefined,
    TTools extends readonly DynamicStructuredTool[] = readonly [],
    TBackend extends DeepAgentBackend | undefined = undefined,
> {
    tools?: TTools
    prompt?: string | Array<string>
    llm?: BaseChatModel
    output?: T
    checkpointer?: BaseCheckpointSaver | boolean
    agentsMd?: string[]
    subagents?: SubAgent[]
    backend?: TBackend
    permissions?: FilesystemPermission[]
    skills?: string[]
    middleware?: AgentMiddleware[]
    interruptOn?: InterruptOnFor<DeepAgentInterruptableToolName<TTools, TBackend>>
    store?: BaseStore
    name?: string
    contextSchema?: CreateDeepAgentParams["contextSchema"]
}

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

/**
 * @example
 constructor({
        prompt = `Du bist ein hilfreicher Deep Agent.`,
        llm = getLLM({ provider: "openrouter", model: "openai/gpt-5.4-mini" }),
        tools = [] as unknown as TTools,
        output,
        checkpointer = new MemorySaver(),
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
    }: DeepAgentProps<T, TTools, TBackend, TInterruptOn> = {} as DeepAgentProps<T, TTools, TBackend, TInterruptOn>) {
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
        this.interruptOn = interruptOn as TInterruptOn
        this.store = store
        this.name = name
        this.contextSchema = contextSchema
    }
 */
export class DeepAgent<
    T extends OutputSchema | undefined = undefined,
    const TTools extends readonly DynamicStructuredTool[] = readonly [],
    TBackend extends DeepAgentBackend | undefined = undefined,
    THasInterrupt extends boolean = false,
> {
    private prompt: Array<["system", string]>
    private tools: TTools
    private llm: BaseChatModel
    private output: T | undefined
    private agent: any
    private agentCacheDirty = true
    private checkpointer: BaseCheckpointSaver | boolean
    private agentsMd: string[] | undefined
    private subagents: SubAgent[] | undefined
    private backend: TBackend | undefined
    private permissions: FilesystemPermission[] | undefined
    private skills: string[] | undefined
    private middleware: AgentMiddleware[] | undefined
    private interruptOn: InterruptOnFor<DeepAgentInterruptableToolName<TTools, TBackend>> | undefined
    private store: BaseStore | undefined
    private name: string | undefined
    private contextSchema: CreateDeepAgentParams["contextSchema"]
    private should_use_output: boolean = true

    constructor({
        prompt = `Du bist ein hilfreicher Deep Agent.`,
        llm = getLLM({ provider: "openrouter", model: "openai/gpt-5.4-mini" }),
        tools = [] as unknown as TTools,
        output,
        checkpointer = new MemorySaver(),
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
    }: DeepAgentProps<T, TTools, TBackend> = {} as DeepAgentProps<T, TTools, TBackend>) {
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

    static create<
        const TTools extends readonly DynamicStructuredTool[],
        TBackend extends DeepAgentBackend | undefined = undefined,
    >(
        props: DeepAgentProps<undefined, TTools, TBackend> & {
            interruptOn: InterruptOnFor<DeepAgentInterruptableToolName<TTools, TBackend>>
        },
    ): DeepAgent<undefined, TTools, TBackend, true>
    static create<
        const TTools extends readonly DynamicStructuredTool[],
        TBackend extends DeepAgentBackend | undefined = undefined,
        U extends OutputSchema = OutputSchema,
    >(
        props: DeepAgentProps<U, TTools, TBackend> & {
            interruptOn: InterruptOnFor<DeepAgentInterruptableToolName<TTools, TBackend>>
        },
    ): DeepAgent<U, TTools, TBackend, true>
    static create<
        const TTools extends readonly DynamicStructuredTool[],
        TBackend extends DeepAgentBackend | undefined = undefined,
    >(
        props: DeepAgentProps<undefined, TTools, TBackend>,
    ): DeepAgent<undefined, TTools, TBackend, false>
    static create<
        const TTools extends readonly DynamicStructuredTool[],
        TBackend extends DeepAgentBackend | undefined = undefined,
        U extends OutputSchema = OutputSchema,
    >(
        props: DeepAgentProps<U, TTools, TBackend>,
    ): DeepAgent<U, TTools, TBackend, false>
    static create(props: DeepAgentProps<any, any, DeepAgentBackend | undefined>): DeepAgent<any, any, DeepAgentBackend | undefined, any> {
        return new DeepAgent(props)
    }

    private markAgentDirty() {
        this.agentCacheDirty = true
    }

    private async ensureAgent(systemPrompt: string) {
        if (!this.agentCacheDirty && this.agent) {
            return this.agent
        }

        this.agent = createDeepAgent({
            model: this.llm as any,
            systemPrompt,
            tools: this.tools as any,
            ...(this.output ? { responseFormat: this.output as any } : {}),
            checkpointer: this.checkpointer,
            ...(this.agentsMd ? { memory: this.agentsMd } : {}),
            ...(this.subagents ? { subagents: this.subagents } : {}),
            ...(this.backend ? { backend: this.backend } : {}),
            ...(this.permissions ? { permissions: this.permissions } : {}),
            ...(this.skills ? { skills: this.skills } : {}),
            ...(this.middleware ? { middleware: this.middleware as any } : {}),
            ...(this.interruptOn ? { interruptOn: mapInterruptOnToNative(this.interruptOn) as any } : {}),
            ...(this.store ? { store: this.store } : {}),
            ...(this.name ? { name: this.name } : {}),
            ...(this.contextSchema ? { contextSchema: this.contextSchema as any } : {}),
        })
        this.agentCacheDirty = false
        return this.agent
    }

    private buildConfig(thread_id?: string, context?: Record<string, any>) {
        return thread_id && this.checkpointer
            ? { configurable: { thread_id }, ...(context ? { context } : {}) }
            : context
                ? { context }
                : undefined
    }

    private validateThreadConfig(thread_id?: string) {
        if (this.checkpointer && !thread_id) {
            throw new Error("thread_id is required when using checkpointer, else no state is stored")
        }
        if (!this.checkpointer && thread_id) {
            console.warn("WARN: thread_id is provided but no checkpointer is set, so no state is stored")
        }
    }

    private async mapInvokeResult(result: any): Promise<string | z.infer<OutputSchema> | DeepAgentInterrupt> {
        const interrupt = mapResultToInterrupt(result)
        if (interrupt) return interrupt

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

    private validateHitlResume(thread_id: string | undefined, variables: Record<string, unknown>) {
        if (!this.interruptOn) {
            throw new Error("decision requires interruptOn to be configured on DeepAgent")
        }
        if (!this.checkpointer) {
            throw new Error("decision requires a checkpointer")
        }
        if (!thread_id) {
            throw new Error("thread_id is required when resuming with decision")
        }
        if (Object.keys(variables).length > 0) {
            throw new Error("use decision or input, not both")
        }
    }

    private async runResumeInvoke(input: {
        thread_id: string
        context?: Record<string, unknown>
        decision?: DeepAgentUserDecision
        decisions?: DeepAgentUserDecision[]
    }): Promise<string | z.infer<T> | DeepAgentInterrupt> {
        const { thread_id, context, decision, decisions } = input

        const systemPrompt = blocksToSystemPrompt(this.prompt)
        const agent = await this.ensureAgent(systemPrompt)
        const config = this.buildConfig(thread_id, context)

        const pendingCount = await getPendingInterruptCount(agent, config as Record<string, unknown> | undefined)
        const hitlDecisions = expandResumeDecisions(decision, decisions, pendingCount)
        const command = createResumeCommand(hitlDecisions)

        const result = await agent.invoke(command as any, config)
        return this.mapInvokeResult(result) as Promise<string | z.infer<T> | DeepAgentInterrupt>
    }

    private async *runResumeStream(input: {
        thread_id: string
        context?: Record<string, unknown>
        decision?: DeepAgentUserDecision
        decisions?: DeepAgentUserDecision[]
        showToolCalls?: boolean
    }): AsyncGenerator<string | DeepAgentInterrupt | DeepAgentToolEvent, void, unknown> {
        const { thread_id, context, decision, decisions, showToolCalls = false } = input
        this.should_use_output = false
        const seenToolStarts = new Set<string>()

        try {
            const systemPrompt = blocksToSystemPrompt(this.prompt)
            const agent = await this.ensureAgent(systemPrompt)
            const config = this.buildConfig(thread_id, context)

            const pendingCount = await getPendingInterruptCount(agent, config as Record<string, unknown> | undefined)
            const hitlDecisions = expandResumeDecisions(decision, decisions, pendingCount)
            const command = createResumeCommand(hitlDecisions)

            const nativeStream = await agent.stream(
                command as any,
                { ...(config ?? {}), streamMode: ["messages", "updates"] } as any,
            )

            for await (const chunk of nativeStream) {
                for (const mapped of mapNativeStreamChunk(chunk, {
                    interruptOn: true,
                    showToolCalls,
                    seenToolStarts,
                })) {
                    if (typeof mapped === "object" && mapped !== null && mapped.kind === "interrupt") {
                        yield mapped
                        return
                    }
                    yield mapped
                }
            }
        } finally {
            this.should_use_output = true
        }
    }

    private async *runNativeStream(
        agent: any,
        input: { messages: HumanMessage[] },
        config: Record<string, unknown> | undefined,
        showToolCalls: boolean,
    ): AsyncGenerator<string | DeepAgentInterrupt | DeepAgentToolEvent, void, unknown> {
        const streamMode = this.interruptOn || showToolCalls
            ? (["messages", "updates"] as const)
            : "messages"
        const nativeStream = await agent.stream(
            input as any,
            { ...(config ?? {}), streamMode } as any,
        )
        const seenToolStarts = new Set<string>()

        for await (const chunk of nativeStream) {
            for (const mapped of mapNativeStreamChunk(chunk, {
                interruptOn: Boolean(this.interruptOn),
                showToolCalls,
                seenToolStarts,
            })) {
                if (typeof mapped === "object" && mapped !== null && mapped.kind === "interrupt") {
                    yield mapped
                    return
                }
                yield mapped
            }
        }
    }

    public async invoke(
        this: DeepAgent<undefined, TTools, TBackend, true>,
        invokeInput: DeepAgentRunInputBase & DeepAgentHitlFields,
    ): Promise<string | DeepAgentInterrupt>
    public async invoke<U extends OutputSchema>(
        this: DeepAgent<U, TTools, TBackend, true>,
        invokeInput: DeepAgentRunInputBase & DeepAgentHitlFields,
    ): Promise<z.infer<U> | DeepAgentInterrupt>
    public async invoke(
        this: DeepAgent<undefined, TTools, TBackend, false>,
        invokeInput: DeepAgentRunInputBase,
    ): Promise<string>
    public async invoke<U extends OutputSchema>(
        this: DeepAgent<U, TTools, TBackend, false>,
        invokeInput: DeepAgentRunInputBase,
    ): Promise<z.infer<U>>
    public async invoke(
        invokeInput: DeepAgentRunInputBase & Partial<DeepAgentHitlFields>,
    ): Promise<string | z.infer<OutputSchema> | DeepAgentInterrupt> {
        const { thread_id, decision, decisions, context, debug, promptVars, ...variables } = invokeInput
        const isResume = decision !== undefined || decisions !== undefined

        if (isResume) {
            this.validateHitlResume(thread_id, variables)
            return this.runResumeInvoke({
                thread_id: thread_id!,
                context,
                decision,
                decisions,
            }) as Promise<string | z.infer<OutputSchema> | DeepAgentInterrupt>
        }

        this.validateThreadConfig(thread_id)
        if (Object.keys(variables).length === 0) {
            throw new Error("input required")
        }

        const humanMessages: HumanMessage[] = Object.entries(variables).map(
            ([key, value]) => new HumanMessage(`${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`)
        )

        const resolvedPrompt = await resolveSystemPromptBlocks(this.prompt, promptVars)
        const systemPrompt = blocksToSystemPrompt(resolvedPrompt)
        const agent = await this.ensureAgent(systemPrompt)
        const config = this.buildConfig(thread_id, context)

        const result = await agent.invoke({ messages: humanMessages } as any, config)
        if (debug) return result

        return this.mapInvokeResult(result)
    }

    public stream(
        this: DeepAgent<T, TTools, TBackend, true>,
        invokeInput: DeepAgentRunInputBase & DeepAgentHitlFields,
    ): AsyncGenerator<string | DeepAgentInterrupt, void, unknown>
    public stream(
        this: DeepAgent<T, TTools, TBackend, true>,
        invokeInput: DeepAgentRunInputBase & DeepAgentHitlFields & DeepAgentShowToolCallsField,
    ): AsyncGenerator<string | DeepAgentInterrupt | DeepAgentToolEvent, void, unknown>
    public stream(
        this: DeepAgent<T, TTools, TBackend, false>,
        invokeInput: DeepAgentRunInputBase,
    ): AsyncGenerator<string, void, unknown>
    public stream(
        this: DeepAgent<T, TTools, TBackend, false>,
        invokeInput: DeepAgentRunInputBase & DeepAgentShowToolCallsField,
    ): AsyncGenerator<string | DeepAgentToolEvent, void, unknown>
    public async *stream(
        invokeInput: DeepAgentRunInputBase & Partial<DeepAgentHitlFields> & { showToolCalls?: boolean },
    ): AsyncGenerator<string | DeepAgentInterrupt | DeepAgentToolEvent, void, unknown> {
        const { thread_id, decision, decisions, context, promptVars, showToolCalls, ...variables } = invokeInput
        const isResume = decision !== undefined || decisions !== undefined

        if (isResume) {
            this.validateHitlResume(thread_id, variables)
            yield* this.runResumeStream({
                thread_id: thread_id!,
                context,
                decision,
                decisions,
                showToolCalls: showToolCalls === true,
            })
            return
        }

        this.should_use_output = false
        try {
            this.validateThreadConfig(thread_id)
            if (Object.keys(variables).length === 0) {
                throw new Error("input required")
            }

            const humanMessages: HumanMessage[] = Object.entries(variables).map(
                ([key, value]) => new HumanMessage(`${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`)
            )

            const resolvedPrompt = await resolveSystemPromptBlocks(this.prompt, promptVars)
            const systemPrompt = blocksToSystemPrompt(resolvedPrompt)
            const agent = await this.ensureAgent(systemPrompt)
            const config = this.buildConfig(thread_id, context)

            yield* this.runNativeStream(
                agent,
                { messages: humanMessages },
                config as Record<string, unknown> | undefined,
                showToolCalls === true,
            )
        } finally {
            this.should_use_output = true
        }
    }

    public addTool(tool: DynamicStructuredTool) {
        ;(this.tools as unknown as DynamicStructuredTool[]).push(tool)
        this.markAgentDirty()
    }

    public get currentTools(): string[] {
        return (this.tools as unknown as DynamicStructuredTool[]).map(tool => tool.name)
    }
}
