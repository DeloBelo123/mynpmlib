import { AIMessage, HumanMessage, type BaseCheckpointSaver, type Checkpoint } from "../imports"
import { uuid6 } from "@langchain/langgraph-checkpoint"
import { z } from "zod/v4"
import {
    checkpointMessageBody,
    checkpointMessageRole,
    getMessagesArrayFromCheckpoint,
} from "../helpers/memory"
import {
    classify,
    type JevChoiceQuestion,
    type JevEntry,
    type JevJsonValue,
    type JevQuestions,
    type JevUsage,
} from "../helpers/classify"

export type JevModel = `~typesafe/${string}`

export type JevContextSchema = z.ZodObject

export type JevContextValue<TSchema extends JevContextSchema> = z.infer<TSchema>

export interface JevToolRuntimeContext<TContext = undefined> {
    state: JevToolCallerState
    thread_id?: string
    /** Validated local execution context. It is never sent to JEV or persisted. */
    context: TContext
}

export type JevRuntimeParamChoices = Record<string, readonly JevEntry[]>

export type JevRuntimeParams<
    TChoices extends JevRuntimeParamChoices = JevRuntimeParamChoices,
> = TChoices

export type JevTool<
    TResult = unknown,
    TContext = undefined,
> = {
    name: string
    description: string
    runtimeParams?: (
        runtimeContext: JevToolRuntimeContext<TContext>,
    ) => JevRuntimeParamChoices | Promise<JevRuntimeParamChoices>
    func: (
        args: Record<string, JevEntry>,
        runtimeContext: JevToolRuntimeContext<TContext>,
    ) => TResult | Promise<TResult>
}

type AnyJevTool<TContext = any> = {
    name: string
    description: string
    runtimeParams?: (
        runtimeContext: JevToolRuntimeContext<TContext>,
    ) => unknown
    func: (args: any, runtimeContext: JevToolRuntimeContext<TContext>) => any
}

type JevToolCallerBaseProps<TTools extends readonly AnyJevTool[]> = {
    model?: JevModel
    prompt: string
    tools: TTools
    checkpointer?: BaseCheckpointSaver
    describe?: string
}

export type JevToolCallerProps<
    TTools extends readonly AnyJevTool<NoInfer<TContext>>[],
    TContext = undefined,
> = JevToolCallerBaseProps<TTools> & {
    contextSchema?: JevContextSchema & z.ZodType<TContext>
}

type JevToolCallerInvokeControls = {
    debug?: boolean
    thread_id?: string
    signal?: AbortSignal
    [key: string]: unknown
}

export type JevToolCallerInvokeInput<
    TContext = undefined,
> = JevToolCallerInvokeControls &
    ([TContext] extends [undefined]
        ? { context?: never }
        : { context: TContext })

export type JevToolCallerHistoryEntry = {
    role: "user" | "assistant" | "system"
    content: JevEntry
}

export type JevToolCallerState = {
    system_prompt: string
    message_history: JevToolCallerHistoryEntry[]
    user_request: Record<string, JevJsonValue>
}

export type JevToolReturn<TTools extends readonly AnyJevTool[]> = TTools[number]["func"] extends (
    ...args: any[]
) => infer TResult
    ? Awaited<TResult>
    : never

export interface JevToolCallerSelectionMetadata {
    choice: string
    confidence: number
    probabilities: Readonly<Record<string, number>>
}

export interface JevToolCallerUsage {
    calls: number
    input_tokens: number
    output_tokens: number
    cost?: number
}

export interface JevToolCallerDebugResult<TResult> {
    result: TResult
    metadata: {
        selected_tool: {
            name: string
            confidence: number
            probabilities: Readonly<Record<string, number>>
        }
        selected_params: Record<string, JevToolCallerSelectionMetadata>
        arguments: Record<string, JevEntry>
        usage: JevToolCallerUsage
        state: JevToolCallerState
    }
}

type UsageAccumulator = JevToolCallerUsage & { hasCost: boolean }

function addUsage(total: UsageAccumulator, usage: JevUsage): void {
    total.calls++
    total.input_tokens += usage.input_tokens
    total.output_tokens += usage.output_tokens
    if (usage.cost !== undefined) {
        total.cost = (total.cost ?? 0) + usage.cost
        total.hasCost = true
    }
}

function publicUsage(total: UsageAccumulator): JevToolCallerUsage {
    return {
        calls: total.calls,
        input_tokens: total.input_tokens,
        output_tokens: total.output_tokens,
        ...(total.hasCost ? { cost: total.cost } : {}),
    }
}

function toJevRecord(value: Record<string, unknown>): Record<string, JevJsonValue> {
    let serialized: string
    try {
        serialized = JSON.stringify(value)
    } catch (error) {
        throw new TypeError("JevToolCaller input must be JSON-serializable", { cause: error })
    }

    const parsed = JSON.parse(serialized) as unknown
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new TypeError("JevToolCaller input must serialize to an object")
    }
    return parsed as Record<string, JevJsonValue>
}

function toStoredValue(value: unknown): JevJsonValue {
    try {
        const serialized = JSON.stringify(value)
        if (serialized === undefined) return null
        return JSON.parse(serialized) as JevJsonValue
    } catch {
        return String(value)
    }
}

function parseHistoryContent(content: string): JevEntry {
    try {
        const parsed = JSON.parse(content) as unknown
        if (
            parsed === null ||
            typeof parsed === "string" ||
            Array.isArray(parsed) ||
            typeof parsed === "object"
        ) {
            return parsed as JevEntry
        }
    } catch {
        // Plain text from checkpoints created by another runtime remains plain text.
    }
    return content
}

/**
 * Bounded tool caller powered by TypeSafe AI JEV.
 *
 * JEV first selects one registered tool from a Choice whose keys are tool names
 * and whose values are tool descriptions. If that tool defines
 * `runtimeParams()`, JEV then selects every ambiguous argument from the exact
 * bounded values returned at runtime. The original selected values are passed to
 * the tool; JEV never generates arbitrary arguments.
 *
 * Each selected runtime value is passed to `func()` under its unchanged
 * `runtimeParams()` key. For example, `{ user: User[] }` becomes `{ user: User }`.
 *
 * An optional `contextSchema` validates local execution data such as auth,
 * session IDs, secrets, or environment-derived configuration. The inferred
 * `context` is available to `runtimeParams()` and `func()`, but is never included
 * in JEV state, debug metadata, or checkpoint history.
 *
 * Flow: user request → tool Choice → runtimeParams() → argument Choices → one
 * tool execution. This is not ReAct, planning, or generative tool calling and no
 * tool schema is required.
 *
 * Internally uses this package's `classify()` utility.
 *
 * @example
 * ```ts
 * import { JevToolCaller } from "@delofarag/ai-utils"
 * import { z } from "zod/v4"
 *
 * const contextSchema = z.object({ apiKey: z.string(), sessionId: z.string() })
 *
 * const caller = new JevToolCaller({
 *     prompt: "Select the tool that best fulfills the user's request.",
 *     contextSchema,
 *     tools: [
 *         {
 *             name: "get_status",
 *             description: "Returns the service status for a region.",
 *             runtimeParams: async ({ context }) => ({
 *                 region: await loadRegions(context.apiKey),
 *             }),
 *             func: async ({ region }, { context }) => {
 *                 return getStatus(region, context.sessionId)
 *             },
 *         },
 *     ],
 * })
 *
 * const status = await caller.invoke({
 *     request: "Is the EU service available?",
 *     context: { apiKey: process.env.API_KEY!, sessionId: "session-1" },
 * })
 * ```
 *
 * @see https://docs.typesafe.ai/primitives
 * @see https://docs.typesafe.ai/cookbooks/function_calling
 */
export interface JevToolCaller<
    TTools extends readonly AnyJevTool[] = readonly AnyJevTool[],
    TContext = undefined,
> {
    readonly model: JevModel
    readonly prompt: string
    readonly tools: TTools
    readonly checkpointer: BaseCheckpointSaver | undefined
    readonly describe: string | undefined
    readonly contextSchema: (JevContextSchema & z.ZodType<TContext>) | undefined

    invoke(
        input: JevToolCallerInvokeInput<TContext> & { debug: true },
    ): Promise<JevToolCallerDebugResult<JevToolReturn<TTools>>>
    invoke(
        input: JevToolCallerInvokeInput<TContext> & { debug?: false | undefined },
    ): Promise<JevToolReturn<TTools>>
    invoke(
        input: JevToolCallerInvokeInput<TContext>,
    ): Promise<JevToolReturn<TTools> | JevToolCallerDebugResult<JevToolReturn<TTools>>>
}

class JevToolCallerImplementation<
    TContext,
    TTools extends readonly AnyJevTool<TContext>[],
> implements JevToolCaller<TTools, TContext> {
    public readonly model: JevModel
    public readonly prompt: string
    public readonly tools: TTools
    public readonly checkpointer: BaseCheckpointSaver | undefined
    public readonly describe: string | undefined
    public readonly contextSchema: (JevContextSchema & z.ZodType<TContext>) | undefined

    constructor({
        model = "~typesafe/jev-latest",
        prompt,
        tools,
        checkpointer,
        describe,
        contextSchema,
    }: JevToolCallerProps<TTools, TContext>) {
        if (tools.length === 0) {
            throw new TypeError("JevToolCaller requires at least one tool")
        }

        const names = new Set<string>()
        for (const tool of tools) {
            if (tool.name.trim().length === 0) {
                throw new TypeError("JevToolCaller tool names must not be empty")
            }
            if (tool.description.trim().length === 0) {
                throw new TypeError(`JevToolCaller tool "${tool.name}" requires a description`)
            }
            if (names.has(tool.name)) {
                throw new TypeError(`JevToolCaller tool names must be unique: "${tool.name}"`)
            }
            names.add(tool.name)
        }

        this.model = model
        this.prompt = prompt
        this.tools = tools
        this.checkpointer = checkpointer
        this.describe = describe
        this.contextSchema = contextSchema
    }

    public async invoke(
        input: JevToolCallerInvokeInput<TContext> & { debug: true },
    ): Promise<JevToolCallerDebugResult<JevToolReturn<TTools>>>
    public async invoke(
        input: JevToolCallerInvokeInput<TContext> & { debug?: false | undefined },
    ): Promise<JevToolReturn<TTools>>
    public async invoke(
        input: JevToolCallerInvokeInput<TContext>,
    ): Promise<JevToolReturn<TTools> | JevToolCallerDebugResult<JevToolReturn<TTools>>>
    public async invoke(
        input: JevToolCallerInvokeInput<TContext>,
    ): Promise<JevToolReturn<TTools> | JevToolCallerDebugResult<JevToolReturn<TTools>>> {
        const { debug = false, thread_id, signal, context: rawContext, ...request } = input
        this.validateThreadConfig(thread_id)
        const context = this.parseContext(rawContext)

        const userRequest = toJevRecord(request)
        const state: JevToolCallerState = {
            system_prompt: this.prompt,
            message_history: await this.loadHistory(thread_id),
            user_request: userRequest,
        }
        const runtimeContext: JevToolRuntimeContext<TContext> = {
            state,
            thread_id,
            context,
        }
        const usage: UsageAccumulator = {
            calls: 0,
            input_tokens: 0,
            output_tokens: 0,
            hasCost: false,
        }

        const toolCriteria = Object.fromEntries(
            this.tools.map(tool => [tool.name, tool.description]),
        )
        const toolDecision = await classify({
            state,
            questions: {
                tool: {
                    type: "choice",
                    instructions:
                        "Select the tool that best fulfills the current user_request while respecting system_prompt and message_history.",
                    criteria: toolCriteria,
                },
            },
            model: this.model,
            signal,
        })
        addUsage(usage, toolDecision.usage)

        const toolAnswer = toolDecision.answers.tool
        const selectedTool = this.tools.find(tool => tool.name === toolAnswer.choice)
        if (!selectedTool) {
            throw new Error(`JEV selected an unknown tool: "${toolAnswer.choice}"`)
        }

        const args: Record<string, JevEntry> = {}
        const selectedParams: Record<string, JevToolCallerSelectionMetadata> = {}

        if (selectedTool.runtimeParams) {
            const runtimeParams = await selectedTool.runtimeParams(runtimeContext)
            if (runtimeParams === null || typeof runtimeParams !== "object" || Array.isArray(runtimeParams)) {
                throw new TypeError(`runtimeParams() for tool "${selectedTool.name}" must return an object`)
            }

            const ambiguous: Array<{
                runtimeName: string
                values: readonly JevEntry[]
            }> = []
            for (const [runtimeName, values] of Object.entries(runtimeParams)) {
                if (runtimeName.length === 0) {
                    throw new TypeError(
                        `runtimeParams() for tool "${selectedTool.name}" contains an empty key`,
                    )
                }
                if (!Array.isArray(values)) {
                    throw new TypeError(
                        `Runtime parameter "${runtimeName}" for tool "${selectedTool.name}" must be an array`,
                    )
                }
                if (values.length === 0) {
                    throw new Error(
                        `Runtime parameter "${runtimeName}" for tool "${selectedTool.name}" has no candidates`,
                    )
                }
                if (values.length === 1) {
                    args[runtimeName] = values[0]
                } else {
                    ambiguous.push({ runtimeName, values })
                }
            }

            if (ambiguous.length > 0) {
                const questions: Record<string, JevChoiceQuestion> = {}
                for (const { runtimeName, values } of ambiguous) {
                    questions[runtimeName] = {
                        type: "choice",
                        instructions: `Select one value from runtime parameter "${runtimeName}" that best fulfills the current user_request.`,
                        criteria: Object.fromEntries(
                            values.map((value, index) => [`option_${index}`, value]),
                        ),
                    }
                }

                const parameterState = {
                    ...state,
                    selected_tool: {
                        name: selectedTool.name,
                        description: selectedTool.description,
                    },
                }
                const parameterDecision = await classify({
                    state: parameterState,
                    questions: questions as JevQuestions,
                    model: this.model,
                    signal,
                })
                addUsage(usage, parameterDecision.usage)

                for (const { runtimeName, values } of ambiguous) {
                    const answer = parameterDecision.answers[runtimeName]
                    if (!answer || answer.type !== "choice") {
                        throw new TypeError(
                            `JEV returned no choice for runtime parameter "${runtimeName}"`,
                        )
                    }

                    const optionIndex = Number.parseInt(answer.choice.slice("option_".length), 10)
                    if (`option_${optionIndex}` !== answer.choice || values[optionIndex] === undefined) {
                        throw new TypeError(
                            `JEV returned an invalid choice for runtime parameter "${runtimeName}": "${answer.choice}"`,
                        )
                    }

                    args[runtimeName] = values[optionIndex]
                    selectedParams[runtimeName] = {
                        choice: answer.choice,
                        confidence: answer.confidence,
                        probabilities: answer.probabilities,
                    }
                }
            }
        }

        const executableTool = selectedTool as unknown as {
            func: (
                args: Record<string, JevEntry>,
                runtimeContext: JevToolRuntimeContext<TContext>,
            ) => unknown
        }
        const result = (await executableTool.func(args, runtimeContext)) as JevToolReturn<TTools>
        await this.saveHistory(thread_id, userRequest, selectedTool.name, args, result)

        if (!debug) return result

        return {
            result,
            metadata: {
                selected_tool: {
                    name: selectedTool.name,
                    confidence: toolAnswer.confidence,
                    probabilities: toolAnswer.probabilities,
                },
                selected_params: selectedParams,
                arguments: args,
                usage: publicUsage(usage),
                state,
            },
        }
    }

    private validateThreadConfig(threadId?: string): void {
        if (this.checkpointer && !threadId) {
            throw new Error("thread_id is required when using checkpointer, else no state is stored")
        }
        if (!this.checkpointer && threadId) {
            console.warn("WARN: thread_id is provided but no checkpointer is set, so no state is stored")
        }
    }

    private parseContext(value: unknown): TContext {
        if (!this.contextSchema) {
            if (value !== undefined) {
                throw new TypeError("context requires a contextSchema on JevToolCaller")
            }
            return undefined as TContext
        }
        return this.contextSchema.parse(value) as TContext
    }

    private async loadHistory(threadId?: string): Promise<JevToolCallerHistoryEntry[]> {
        if (!this.checkpointer || !threadId) return []

        const checkpoint = await this.checkpointer.get({ configurable: { thread_id: threadId } })
        const history: JevToolCallerHistoryEntry[] = []
        for (const message of getMessagesArrayFromCheckpoint(checkpoint)) {
            const checkpointRole = checkpointMessageRole(message)
            const role =
                checkpointRole === "human"
                    ? "user"
                    : checkpointRole === "ai"
                      ? "assistant"
                      : checkpointRole === "system"
                        ? "system"
                        : undefined
            if (!role) continue
            history.push({
                role,
                content: parseHistoryContent(checkpointMessageBody(message)),
            })
        }
        return history
    }

    private async saveHistory(
        threadId: string | undefined,
        userRequest: Record<string, JevJsonValue>,
        toolName: string,
        args: Record<string, JevEntry>,
        result: unknown,
    ): Promise<void> {
        if (!this.checkpointer || !threadId) return

        const baseConfig = { configurable: { thread_id: threadId } }
        const previous = await this.checkpointer.getTuple(baseConfig)
        const previousCheckpoint = previous?.checkpoint
        const messages = getMessagesArrayFromCheckpoint(previousCheckpoint)
        const assistantContent = {
            tool: toolName,
            arguments: args,
            result: toStoredValue(result),
        }
        const previousMessageVersion = previousCheckpoint?.channel_versions.messages
        const messageVersion = this.checkpointer.getNextVersion(
            typeof previousMessageVersion === "number" ? previousMessageVersion : undefined,
        )
        const checkpoint: Checkpoint = {
            v: 4,
            id: uuid6(-2),
            ts: new Date().toISOString(),
            channel_values: {
                ...(previousCheckpoint?.channel_values ?? {}),
                messages: [
                    ...messages,
                    new HumanMessage(JSON.stringify(userRequest)),
                    new AIMessage(JSON.stringify(assistantContent)),
                ],
            },
            channel_versions: {
                ...(previousCheckpoint?.channel_versions ?? {}),
                messages: messageVersion,
            },
            versions_seen: previousCheckpoint?.versions_seen ?? {},
        }

        await this.checkpointer.put(
            previous?.config ?? baseConfig,
            checkpoint,
            {
                source: "update",
                step: (previous?.metadata?.step ?? -1) + 1,
                parents: previous?.metadata?.parents ?? {},
            },
            { messages: messageVersion },
        )
    }
}

export interface JevToolCallerConstructor {
    new<
        const TContext,
        const TTools extends readonly AnyJevTool<NoInfer<TContext>>[],
    >(props: {
        model?: JevModel
        prompt: string
        tools: TTools
        checkpointer?: BaseCheckpointSaver
        describe?: string
        contextSchema: JevContextSchema & z.ZodType<TContext>
    }): JevToolCaller<TTools, TContext>

    new<
        const TTools extends readonly AnyJevTool<undefined>[],
    >(props: {
        model?: JevModel
        prompt: string
        tools: TTools
        checkpointer?: BaseCheckpointSaver
        describe?: string
        contextSchema?: never
    }): JevToolCaller<TTools, undefined>
}

/** Construct a bounded JEV tool caller. See {@link JevToolCaller}. */
export const JevToolCaller =
    JevToolCallerImplementation as unknown as JevToolCallerConstructor
