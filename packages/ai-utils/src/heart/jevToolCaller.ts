import { AIMessage, HumanMessage, type BaseCheckpointSaver, type Checkpoint } from "../imports"
import { uuid6 } from "@langchain/langgraph-checkpoint"
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
} from "../helpers/classify"
import { buildMcpClient } from "./tools/MCP"
import { JevNoParamOptionsError } from "../helpers/jev/errors"
import {
    DEFAULT_JEV_TOOL_CALLER_PROMPT,
    addJevUsage,
    parseJevHistoryContent,
    toJevRecord,
    toPublicJevUsage,
    toStoredJevValue,
} from "../helpers/jev/utils"
import type {
    AnyJevTool,
    JevMCPServersInput,
    JevModel,
    JevToolCallerConfidence,
    JevToolCallerDebugResult,
    JevToolCallerHistoryEntry,
    JevToolCallerInvokeInput,
    JevToolCallerProps,
    JevToolCallerResolvedReturn,
    JevToolCallerResolvedValue,
    JevToolCallerSelectionMetadata,
    JevToolCallerState,
    JevToolFunctionInput,
    JevToolRuntimeContext,
    JevUsageAccumulator,
} from "../helpers/jev/types"

export * from "../helpers/jev"

/**
 * Bounded tool caller powered by TypeSafe AI JEV.
 *
 * JEV first selects one registered tool from a Choice whose keys are tool names
 * and whose values are tool descriptions. If that tool defines
 * `params`, JEV then selects every ambiguous argument from its exact bounded
 * values. `params` can be a static choices object or a function that computes
 * the choices from the runtime context. The original selected values are passed
 * to the tool; JEV never generates arbitrary arguments.
 *
 * `func()` receives one object containing `state`, `thread_id`, `context`, and
 * `params`. Each selected runtime value is stored in `params` under its unchanged
 * candidate key. Without a tool-level `params` definition, the function-level
 * `params` is `{}` and the tool
 * executes immediately after the initial tool-selection call.
 *
 * An optional `contextSchema` validates local execution data such as auth,
 * session IDs, secrets, or environment-derived configuration. The inferred
 * `context` is available to the `params` function and `func()`, but is never included
 * in JEV state, debug metadata, or checkpoint history.
 *
 * The current request is appended to `state.message_history` before JEV sees it.
 * Flow: message history → tool Choice → optional params and argument
 * Choices → one tool execution. This is not ReAct, planning, or generative tool
 * calling and no tool schema is required.
 *
 * Optional MCP servers are loaded per `invoke()`. Their tools use the
 * `<server>__<tool>` prefix and the MCP client is always closed afterward.
 *
 * The optional constructor `prompt` contains domain-specific instructions. A
 * built-in instruction to treat the latest user message as the current request
 * and select the best available tool is always appended automatically. Without
 * a custom `prompt`, that built-in instruction is the complete system prompt.
 *
 * Every successful `invoke()` returns `{ value, confidence }`. `value` is the
 * selected tool's return value, while `confidence.toolChoice` is the confidence
 * already reported by the tool-selection JEV call. `confidence.paramsChoice`
 * maps parameter names to their confidence when JEV had to choose among multiple
 * candidates. Debug mode adds `metadata` without changing this stable shape or
 * making additional JEV calls.
 *
 * Internally uses this package's `classify()` utility.
 *
 * @example
 * CONSTRUCTOR:
 * constructor({
        model = "~typesafe/jev-latest",
        prompt,
        tools,
        checkpointer,
        contextSchema,
        mcpServer,
    }: JevToolCallerProps<TTools, TContext> & TConfig) {
        const hasMcpServer = Array.isArray(mcpServer)
            ? mcpServer.length > 0
            : mcpServer !== undefined
        if (tools.length === 0 && !hasMcpServer) {
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
        this.prompt = [prompt?.trim(), DEFAULT_JEV_TOOL_CALLER_PROMPT]
            .filter(Boolean)
            .join("\n\n")
        this.tools = tools
        this.checkpointer = checkpointer
        this.contextSchema = contextSchema
        this.mcpServer = mcpServer
        this.validateMcpServers()
    }
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
 *             params: async ({ context }) => ({
 *                 region: await loadRegions(context.apiKey),
 *             }),
 *             func: async ({ params, context }) => {
 *                 return getStatus(params.region, context.sessionId)
 *             },
 *         },
 *         {
 *             name: "take_action",
 *             description: "Runs an action with the selected permission.",
 *             params: { permission: ["read", "write"] },
 *             func: async ({ params }) => runAction(params.permission),
 *         },
 *     ],
 * })
 *
 * const status = await caller.invoke({
 *     request: "Is the EU service available?",
 *     context: { apiKey: process.env.API_KEY!, sessionId: "session-1" },
 * })
 * console.log(status.value, status.confidence.toolChoice)
 * ```
 *
 * @see https://docs.typesafe.ai/primitives
 * @see https://docs.typesafe.ai/cookbooks/function_calling
 */
export class JevToolCaller<
    const TContext = undefined,
    const TTools extends readonly AnyJevTool<NoInfer<TContext>>[] =
        readonly AnyJevTool<NoInfer<TContext>>[],
    const TConfig extends object = {},
> {
    public readonly model: JevModel
    public readonly prompt: string
    public readonly tools: TTools
    private readonly checkpointer: BaseCheckpointSaver | undefined
    private readonly contextSchema: JevToolCallerProps<
        TTools,
        TContext
    >["contextSchema"]
    private readonly mcpServer: JevMCPServersInput<TContext> | undefined

    constructor({
        model = "~typesafe/jev-latest",
        prompt,
        tools,
        checkpointer,
        contextSchema,
        mcpServer,
    }: JevToolCallerProps<TTools, TContext> & TConfig) {
        const hasMcpServer = Array.isArray(mcpServer)
            ? mcpServer.length > 0
            : mcpServer !== undefined
        if (tools.length === 0 && !hasMcpServer) {
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
        this.prompt = [prompt?.trim(), DEFAULT_JEV_TOOL_CALLER_PROMPT]
            .filter(Boolean)
            .join("\n\n")
        this.tools = tools
        this.checkpointer = checkpointer
        this.contextSchema = contextSchema
        this.mcpServer = mcpServer
        this.validateMcpServers()
    }

    public async invoke(
        input: JevToolCallerInvokeInput<TContext> & { debug: true },
    ): Promise<JevToolCallerDebugResult<JevToolCallerResolvedValue<TTools, TConfig>>>
    public async invoke(
        input: JevToolCallerInvokeInput<TContext> & { debug?: false | undefined },
    ): Promise<JevToolCallerResolvedReturn<TTools, TConfig>>
    public async invoke(
        input: JevToolCallerInvokeInput<TContext>,
    ): Promise<
        | JevToolCallerResolvedReturn<TTools, TConfig>
        | JevToolCallerDebugResult<JevToolCallerResolvedValue<TTools, TConfig>>
    >
    public async invoke(
        input: JevToolCallerInvokeInput<TContext>,
    ): Promise<
        | JevToolCallerResolvedReturn<TTools, TConfig>
        | JevToolCallerDebugResult<JevToolCallerResolvedValue<TTools, TConfig>>
    > {
        this.validateThreadConfig(input.thread_id)
        const context = this.parseContext(input.context)
        const mcpClient = buildMcpClient(this.mcpServer)
        try {
            const mcpTools = mcpClient ? await mcpClient.getTools() : []
            const availableTools: readonly AnyJevTool<TContext>[] = [
                ...this.tools,
                ...this.adaptMcpTools(mcpTools),
            ]
            this.validateAvailableTools(availableTools)
            return await this.invokeWithTools(input, availableTools, context)
        } finally {
            await mcpClient?.close()
        }
    }

    private async invokeWithTools(
        input: JevToolCallerInvokeInput<TContext>,
        availableTools: readonly AnyJevTool<TContext>[],
        context: TContext,
    ): Promise<
        | JevToolCallerResolvedReturn<TTools, TConfig>
        | JevToolCallerDebugResult<JevToolCallerResolvedValue<TTools, TConfig>>
    > {
        const { debug = false, thread_id, signal, context: _context, ...request } = input

        const userRequest = toJevRecord(request)
        const state: JevToolCallerState = {
            system_prompt: this.prompt,
            message_history: [
                ...await this.loadHistory(thread_id),
                { role: "user", content: userRequest },
            ],
        }
        const runtimeContext: JevToolRuntimeContext<TContext> = {
            state,
            thread_id,
            context,
        }
        const usage: JevUsageAccumulator = {
            calls: 0,
            input_tokens: 0,
            output_tokens: 0,
            hasCost: false,
        }

        const toolCriteria = Object.fromEntries(
            availableTools.map(tool => [tool.name, tool.description]),
        )
        const toolDecision = await classify({
            state,
            questions: {
                tool: {
                    type: "choice",
                    instructions:
                        "Select the tool that best fulfills the latest user message while respecting system_prompt and the full message_history.",
                    criteria: toolCriteria,
                },
            },
            model: this.model,
            signal,
        })
        addJevUsage(usage, toolDecision.usage)

        const toolAnswer = toolDecision.answers.tool
        const selectedTool = availableTools.find(tool => tool.name === toolAnswer.choice)
        if (!selectedTool) {
            throw new Error(`JEV selected an unknown tool: "${toolAnswer.choice}"`)
        }

        const resolvedParams: Record<string, JevEntry> = {}
        const selectedParamMetadata: Record<string, JevToolCallerSelectionMetadata> = {}

        if (selectedTool.params) {
            const params = typeof selectedTool.params === "function"
                ? await selectedTool.params(runtimeContext)
                : selectedTool.params
            if (params === null || typeof params !== "object" || Array.isArray(params)) {
                throw new TypeError(`params for tool "${selectedTool.name}" must resolve to an object`)
            }

            const ambiguous: Array<{
                paramName: string
                values: readonly JevEntry[]
            }> = []
            for (const [paramName, values] of Object.entries(params)) {
                if (paramName.length === 0) {
                    throw new TypeError(
                        `params for tool "${selectedTool.name}" contains an empty key`,
                    )
                }
                if (!Array.isArray(values)) {
                    throw new TypeError(
                        `Runtime parameter "${paramName}" for tool "${selectedTool.name}" must be an array`,
                    )
                }
                if (values.length === 0) {
                    throw new JevNoParamOptionsError(selectedTool.name, paramName)
                }
                if (values.length === 1) {
                    resolvedParams[paramName] = values[0]
                } else {
                    ambiguous.push({ paramName, values })
                }
            }

            if (ambiguous.length > 0) {
                const questions: Record<string, JevChoiceQuestion> = {}
                for (const { paramName, values } of ambiguous) {
                    questions[paramName] = {
                        type: "choice",
                        instructions: `Select one value from runtime parameter "${paramName}" that best fulfills the latest user message.`,
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
                addJevUsage(usage, parameterDecision.usage)

                for (const { paramName, values } of ambiguous) {
                    const answer = parameterDecision.answers[paramName]
                    if (!answer || answer.type !== "choice") {
                        throw new TypeError(
                            `JEV returned no choice for runtime parameter "${paramName}"`,
                        )
                    }

                    const optionIndex = Number.parseInt(answer.choice.slice("option_".length), 10)
                    if (`option_${optionIndex}` !== answer.choice || values[optionIndex] === undefined) {
                        throw new TypeError(
                            `JEV returned an invalid choice for runtime parameter "${paramName}": "${answer.choice}"`,
                        )
                    }

                    resolvedParams[paramName] = values[optionIndex]
                    selectedParamMetadata[paramName] = {
                        choice: answer.choice,
                        confidence: answer.confidence,
                        probabilities: answer.probabilities,
                    }
                }
            }
        }

        const executableTool = selectedTool as unknown as {
            func: (input: JevToolFunctionInput<TContext>) => unknown
        }
        const value = (await executableTool.func({
            ...runtimeContext,
            params: resolvedParams,
        })) as JevToolCallerResolvedValue<TTools, TConfig>
        await this.saveHistory(thread_id, userRequest, selectedTool.name, resolvedParams, value)

        const paramsChoice = Object.fromEntries(
            Object.entries(selectedParamMetadata).map(([name, metadata]) => [
                name,
                metadata.confidence,
            ]),
        )
        const confidence: JevToolCallerConfidence = {
            toolChoice: toolAnswer.confidence,
            ...(Object.keys(paramsChoice).length > 0 ? { paramsChoice } : {}),
        }
        const output = { value, confidence }

        if (!debug) return output

        return {
            ...output,
            metadata: {
                selected_tool: {
                    name: selectedTool.name,
                    confidence: toolAnswer.confidence,
                    probabilities: toolAnswer.probabilities,
                },
                selected_params: selectedParamMetadata,
                arguments: resolvedParams,
                usage: toPublicJevUsage(usage),
                state,
            },
        }
    }

    private adaptMcpTools(mcpTools: readonly any[]): AnyJevTool<TContext>[] {
        const servers = this.mcpServer
            ? Array.isArray(this.mcpServer)
                ? this.mcpServer
                : [this.mcpServer]
            : []

        return mcpTools.map((tool) => {
            const toolName = String(tool.name ?? "")
            const server = [...servers]
                .sort((left, right) => right.name.length - left.name.length)
                .find(candidate =>
                    toolName.startsWith(`${candidate.name}__`),
                )
            if (!server) {
                throw new Error(
                    `Could not resolve the MCP server for prefixed tool "${toolName}"`,
                )
            }

            const unprefixedToolName = toolName.slice(`${server.name}__`.length)
            const params = server.params?.[unprefixedToolName]
            const adaptedParams = typeof params === "function"
                ? (runtimeContext: JevToolRuntimeContext<TContext>) =>
                      params({
                          ...runtimeContext,
                          server,
                      })
                : params

            return {
                name: toolName,
                description: [
                    server.description,
                    typeof tool.description === "string" && tool.description.trim().length > 0
                        ? tool.description
                        : `MCP tool ${toolName}`,
                ].filter(Boolean).join("\n"),
                ...(adaptedParams
                    ? {
                          params: adaptedParams,
                      }
                    : {}),
                func: async ({ params }: JevToolFunctionInput<TContext>) =>
                    await tool.invoke(params),
            }
        })
    }

    private validateAvailableTools(tools: readonly AnyJevTool<TContext>[]): void {
        if (tools.length === 0) {
            throw new TypeError("JevToolCaller requires at least one available tool")
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
    }

    private validateMcpServers(): void {
        if (!this.mcpServer) return
        const servers = Array.isArray(this.mcpServer) ? this.mcpServer : [this.mcpServer]
        const names = new Set<string>()
        for (const server of servers) {
            if (server.name.trim().length === 0) {
                throw new TypeError("JevToolCaller MCP server names must not be empty")
            }
            if (names.has(server.name)) {
                throw new TypeError(
                    `JevToolCaller MCP server names must be unique: "${server.name}"`,
                )
            }
            names.add(server.name)
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
                content: parseJevHistoryContent(checkpointMessageBody(message)),
            })
        }
        return history
    }

    private async saveHistory(
        threadId: string | undefined,
        userRequest: Record<string, JevJsonValue>,
        toolName: string,
        params: Record<string, JevEntry>,
        result: unknown,
    ): Promise<void> {
        if (!this.checkpointer || !threadId) return

        const baseConfig = { configurable: { thread_id: threadId } }
        const previous = await this.checkpointer.getTuple(baseConfig)
        const previousCheckpoint = previous?.checkpoint
        const messages = getMessagesArrayFromCheckpoint(previousCheckpoint)
        const assistantContent = {
            tool: toolName,
            arguments: params,
            result: toStoredJevValue(result),
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
