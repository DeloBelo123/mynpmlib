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
    deepEqualJev,
    parseJevHistoryContent,
    toJevRecord,
    toPublicJevUsage,
    toStoredJevValue,
} from "../helpers/jev/utils"
import {
    DEFAULT_MIN_CONFIDENCE,
} from "../helpers/jev/types"
import type {
    AnyJevTool,
    JevCallToolInput,
    JevGateBreach,
    JevGatedResult,
    JevInterrupt,
    JevInterruptPending,
    JevMCPServersInput,
    JevModel,
    JevParamSelection,
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
    JevToolSelection,
    JevInterruptOn,
    JevUserDecision,
    JevUsageAccumulator,
} from "../helpers/jev/types"

export * from "../helpers/jev"

const JEV_PENDING_CHANNEL = "jev_pending"

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
 * Every `invoke()` returns `{ kind: "return", value, tool, params }`. `value`
 * is the selected tool's return value, `tool` holds the selected tool name and
 * its JEV choice confidence, and `params` maps every argument name to its
 * selected value and confidence. Deterministic single-candidate params and
 * explicitly chosen `callTool()` values carry confidence `1` — no JEV call
 * happened for them. A quality gate (`confidenceGate`, always active with
 * `tools[name] ?? minConfidence ?? 0.5`) returns `{ kind: "gated", ... }`
 * instead of executing when a confidence falls below the threshold.
 * `interruptOn` pauses before execution with `{ kind: "interrupt", ... }`.
 * Debug mode adds `metadata` without making additional JEV calls.
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
        interruptOn,
        confidenceGate,
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
 * console.log(status.value, status.tool)
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
    public readonly interruptOn: JevInterruptOn<TTools, TContext> | undefined
    public readonly confidenceGate: JevToolCallerProps<TTools, TContext>["confidenceGate"]
    private readonly warnedPolicyKeys = new Set<string>()
    private readonly checkpointer: BaseCheckpointSaver | undefined
    private readonly contextSchema: JevToolCallerProps<
        TTools,
        TContext
    >["contextSchema"]
    private readonly mcpServer: JevMCPServersInput<TContext> | undefined

    constructor(props: JevToolCallerProps<TTools, TContext> & TConfig) {
        const {
            model = "~typesafe/jev-latest",
            prompt,
            tools,
            checkpointer,
            contextSchema,
            mcpServer,
            confidenceGate,
            interruptOn,
        } = props
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
        this.interruptOn = interruptOn && Object.keys(interruptOn).length > 0
            ? interruptOn
            : undefined
        this.confidenceGate = confidenceGate
        this.validateMcpServers()
        this.validateInterruptOn()
        this.validateConfidenceGate()
    }

    public async invoke(
        input: JevToolCallerInvokeInput<TContext> & { debug: true },
    ): Promise<
        | JevToolCallerDebugResult<JevToolCallerResolvedValue<TTools, TConfig>>
        | JevGatedResult
        | JevInterrupt
    >
    public async invoke(
        input: JevToolCallerInvokeInput<TContext> & { debug?: false | undefined },
    ): Promise<
        | JevToolCallerResolvedReturn<TTools, TConfig>
        | JevGatedResult
        | JevInterrupt
    >
    public async invoke(
        input: JevToolCallerInvokeInput<TContext>,
    ): Promise<
        | JevToolCallerResolvedReturn<TTools, TConfig>
        | JevToolCallerDebugResult<JevToolCallerResolvedValue<TTools, TConfig>>
        | JevGatedResult
        | JevInterrupt
    > {
        const { decision, ...rest } = input as JevToolCallerInvokeInput<TContext> & {
            decision?: JevUserDecision
        }
        const proposeInput = rest as unknown as JevToolCallerInvokeInput<TContext>
        if (decision !== undefined) {
            if (!this.interruptOn) {
                throw new Error("decision requires interruptOn to be configured on JevToolCaller")
            }
            return await this.resumeWithDecision(proposeInput, decision)
        }
        this.validateThreadConfig(proposeInput.thread_id)
        const context = this.parseContext(proposeInput.context)
        const mcpClient = buildMcpClient(this.mcpServer)
        try {
            const mcpTools = mcpClient ? await mcpClient.getTools() : []
            const availableTools: readonly AnyJevTool<TContext>[] = [
                ...this.tools,
                ...this.adaptMcpTools(mcpTools),
            ]
            this.validateAvailableTools(availableTools)
            this.warnUnknownPolicyKeys(availableTools)
            return await this.invokeWithTools(proposeInput, availableTools, context)
        } finally {
            await mcpClient?.close()
        }
    }

    /**
     * Manueller Ausführungspfad ohne JEV-Auswahl — z.B. um ein `gated`-Ergebnis
     * bewusst trotzdem auszuführen. `params` werden gegen die Tool-Candidates
     * validiert (bounded), Request-Felder werden als User-Eintrag in State und
     * History übernommen. Gate und `interruptOn` werden bewusst umgangen
     * (Override-Semantik): `func()` läuft immer.
     */
    public async callTool(
        input: JevCallToolInput<TTools, TContext>,
    ): Promise<JevToolCallerResolvedReturn<TTools, TConfig>> {
        const {
            thread_id,
            tool: toolName,
            params: givenParams,
            context: _context,
            debug: _debug,
            signal: _signal,
            ...request
        } = input
        this.validateThreadConfig(thread_id)
        const context = this.parseContext(input.context)
        const mcpClient = buildMcpClient(this.mcpServer)
        try {
            const mcpTools = mcpClient ? await mcpClient.getTools() : []
            const availableTools: readonly AnyJevTool<TContext>[] = [
                ...this.tools,
                ...this.adaptMcpTools(mcpTools),
            ]
            this.validateAvailableTools(availableTools)
            const tool = availableTools.find(candidate => candidate.name === toolName)
            if (!tool) {
                throw new Error(`Unknown tool "${toolName}" — no such local or MCP tool`)
            }

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
            const candidates = await this.loadCandidates(tool, runtimeContext)
            const params = { ...(givenParams ?? {}) }
            this.validateCallParams(tool.name, candidates, params)

            const executableTool = tool as unknown as {
                func: (input: JevToolFunctionInput<TContext>) => unknown
            }
            const value = (await executableTool.func({
                ...runtimeContext,
                params,
            })) as JevToolCallerResolvedValue<TTools, TConfig>
            await this.saveHistory(thread_id, userRequest, tool.name, params, value)

            return {
                kind: "return",
                value,
                tool: { name: tool.name, confidence: 1 },
                params: Object.fromEntries(
                    Object.entries(params).map(([name, paramValue]) => [
                        name,
                        { value: paramValue, confidence: 1 },
                    ]),
                ),
            }
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
        | JevGatedResult
        | JevInterrupt
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

        const candidates = await this.loadCandidates(selectedTool, runtimeContext)
        const resolvedParams: Record<string, JevEntry> = {}
        const selectedParamMetadata: Record<string, JevToolCallerSelectionMetadata> = {}
        const ambiguous: Array<{
            paramName: string
            values: readonly JevEntry[]
        }> = []
        for (const [paramName, values] of Object.entries(candidates)) {
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

        const executableTool = selectedTool as unknown as {
            func: (input: JevToolFunctionInput<TContext>) => unknown
        }

        const tool: JevToolSelection = {
            name: selectedTool.name,
            confidence: toolAnswer.confidence,
        }
        const params: Record<string, JevParamSelection> = {}
        for (const [paramName, value] of Object.entries(resolvedParams)) {
            params[paramName] = {
                value,
                confidence: selectedParamMetadata[paramName]?.confidence ?? 1,
            }
        }

        const gateBreaches = this.evaluateGate(selectedTool.name, toolAnswer.confidence, selectedParamMetadata)
        if (gateBreaches.length > 0) {
            return { kind: "gated", tool, params, below: gateBreaches }
        }

        const questionOrFn = this.interruptOn?.[selectedTool.name]
        if (questionOrFn !== undefined) {
            if (!thread_id) {
                throw new Error("thread_id is required to park a pending interrupt")
            }
            const question = typeof questionOrFn === "function"
                ? await questionOrFn({
                    tool: selectedTool.name,
                    params: resolvedParams,
                    state,
                    thread_id,
                    context,
                })
                : questionOrFn
            const pending: JevInterruptPending = {
                toolName: selectedTool.name,
                params: resolvedParams,
                userRequest,
                question,
                tool,
                paramSelections: params,
                toolMeta: {
                    confidence: toolAnswer.confidence,
                    probabilities: { ...toolAnswer.probabilities },
                },
                paramsMeta: { ...selectedParamMetadata },
                usage: { ...usage },
            }
            await this.parkPending(thread_id, pending)
            return { kind: "interrupt", question, tool, params }
        }

        const value = (await executableTool.func({
            ...runtimeContext,
            params: resolvedParams,
        })) as JevToolCallerResolvedValue<TTools, TConfig>
        await this.saveHistory(thread_id, userRequest, selectedTool.name, resolvedParams, value)

        const output = { value, tool, params }

        if (!debug) {
            return { ...output, kind: "return" as const }
        }

        return {
            ...output,
            kind: "return" as const,
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

    private async resumeWithDecision(
        input: JevToolCallerInvokeInput<TContext>,
        decision: JevUserDecision,
    ): Promise<
        | JevToolCallerResolvedReturn<TTools, TConfig>
        | JevToolCallerDebugResult<JevToolCallerResolvedValue<TTools, TConfig>>
    > {
        const { debug = false, thread_id, signal: _signal, context: _context, ...request } = input
        if (!this.checkpointer) {
            throw new Error("decision requires a checkpointer")
        }
        if (!thread_id) {
            throw new Error("thread_id is required when resuming with decision")
        }
        if (Object.keys(request).length > 0) {
            throw new Error("use decision or input, not both")
        }
        if (decision !== "approve" && decision !== "reject") {
            throw new TypeError(`Unknown decision "${decision}" — expected "approve" or "reject"`)
        }

        const context = this.parseContext(input.context)
        const pending = await this.loadPending(thread_id)
        if (!pending) {
            throw new Error(`No pending interrupt for thread_id "${thread_id}" — invoke with a request first`)
        }

        const state: JevToolCallerState = {
            system_prompt: this.prompt,
            message_history: [
                ...await this.loadHistory(thread_id),
                { role: "user", content: pending.userRequest },
            ],
        }

        if (decision === "reject") {
            await this.saveHistory(thread_id, pending.userRequest, pending.toolName, pending.params, {
                rejected: true,
            })
            await this.clearPending(thread_id)
            const output = {
                value: null,
                tool: pending.tool,
                params: pending.paramSelections,
                rejected: true as const,
            }
            if (!debug) return { ...output, kind: "return" as const }
            return { ...output, kind: "return" as const, metadata: this.resumeMetadata(pending, state) }
        }

        const { tool, mcpClient } = await this.resolveToolWithClient(pending.toolName)
        try {
            const executableTool = tool as unknown as {
                func: (input: JevToolFunctionInput<TContext>) => unknown
            }
            const value = (await executableTool.func({
                state,
                thread_id,
                context,
                params: pending.params,
            })) as JevToolCallerResolvedValue<TTools, TConfig>
            await this.saveHistory(thread_id, pending.userRequest, pending.toolName, pending.params, value)
            await this.clearPending(thread_id)

            const output = { value, tool: pending.tool, params: pending.paramSelections }
            if (!debug) return { ...output, kind: "return" as const }
            return { ...output, kind: "return" as const, metadata: this.resumeMetadata(pending, state) }
        } finally {
            await mcpClient?.close()
        }
    }

    private resumeMetadata(pending: JevInterruptPending, state: JevToolCallerState) {
        return {
            selected_tool: {
                name: pending.toolName,
                confidence: pending.toolMeta.confidence,
                probabilities: pending.toolMeta.probabilities,
            },
            selected_params: pending.paramsMeta,
            arguments: pending.params,
            usage: toPublicJevUsage(pending.usage),
            state,
        }
    }

    private async resolveToolWithClient(toolName: string): Promise<{
        tool: AnyJevTool<TContext>
        mcpClient: NonNullable<ReturnType<typeof buildMcpClient>> | undefined
    }> {
        const local = (this.tools as readonly AnyJevTool<TContext>[]).find(
            tool => tool.name === toolName,
        )
        if (local) return { tool: local, mcpClient: undefined }
        const mcpClient = buildMcpClient(this.mcpServer)
        if (!mcpClient) {
            throw new Error(`Unknown tool "${toolName}" — no pending tool found`)
        }
        let match: AnyJevTool<TContext> | undefined
        try {
            match = this.adaptMcpTools(await mcpClient.getTools()).find(
                tool => tool.name === toolName,
            )
        } catch (error) {
            await mcpClient.close()
            throw error
        }
        if (!match) {
            await mcpClient.close()
            throw new Error(`Unknown tool "${toolName}" — no pending tool found`)
        }
        return { tool: match, mcpClient }
    }

    private async loadCandidates(
        tool: AnyJevTool<TContext>,
        runtimeContext: JevToolRuntimeContext<TContext>,
    ): Promise<Record<string, readonly JevEntry[]>> {
        if (!tool.params) return {}
        const params = typeof tool.params === "function"
            ? await tool.params(runtimeContext)
            : tool.params
        if (params === null || typeof params !== "object" || Array.isArray(params)) {
            throw new TypeError(`params for tool "${tool.name}" must resolve to an object`)
        }
        const candidates: Record<string, readonly JevEntry[]> = {}
        for (const [paramName, values] of Object.entries(params)) {
            if (paramName.length === 0) {
                throw new TypeError(
                    `params for tool "${tool.name}" contains an empty key`,
                )
            }
            if (!Array.isArray(values)) {
                throw new TypeError(
                    `Runtime parameter "${paramName}" for tool "${tool.name}" must be an array`,
                )
            }
            if (values.length === 0) {
                throw new JevNoParamOptionsError(tool.name, paramName)
            }
            candidates[paramName] = values
        }
        return candidates
    }

    private validateCallParams(
        toolName: string,
        candidates: Record<string, readonly JevEntry[]>,
        params: Record<string, JevEntry>,
    ): void {
        for (const key of Object.keys(params)) {
            if (!(key in candidates)) {
                throw new TypeError(`Unknown parameter "${key}" for tool "${toolName}"`)
            }
        }
        for (const key of Object.keys(candidates)) {
            if (!(key in params)) {
                throw new TypeError(`Missing parameter "${key}" for tool "${toolName}"`)
            }
        }
        for (const [key, value] of Object.entries(params)) {
            const allowed = candidates[key] ?? []
            if (!allowed.some(candidate => deepEqualJev(candidate, value))) {
                throw new TypeError(
                    `Value for parameter "${key}" of tool "${toolName}" is not one of its candidates`,
                )
            }
        }
    }

    private resolveThreshold(toolName: string): number {
        return this.confidenceGate?.tools?.[toolName]
            ?? this.confidenceGate?.minConfidence
            ?? DEFAULT_MIN_CONFIDENCE
    }

    private evaluateGate(
        toolName: string,
        toolConfidence: number,
        paramsMeta: Record<string, JevToolCallerSelectionMetadata>,
    ): JevGateBreach[] {
        const required = this.resolveThreshold(toolName)
        const below: JevGateBreach[] = []
        if (toolConfidence < required) {
            below.push({ scope: "tool", confidence: toolConfidence, required })
        }
        for (const [paramName, meta] of Object.entries(paramsMeta)) {
            if (meta.confidence < required) {
                below.push({ scope: `params.${paramName}`, confidence: meta.confidence, required })
            }
        }
        return below
    }

    private validateConfidenceGate(): void {
        const gate = this.confidenceGate
        if (!gate) return
        const thresholds = [
            gate.minConfidence,
            ...Object.values(gate.tools ?? {}),
        ]
        for (const threshold of thresholds) {
            if (threshold === undefined) continue
            if (typeof threshold !== "number" || Number.isNaN(threshold) || threshold < 0 || threshold > 1) {
                throw new TypeError("JevToolCaller confidence thresholds must be numbers between 0 and 1")
            }
        }
        for (const key of Object.keys(gate.tools ?? {})) {
            if (key.trim().length === 0) {
                throw new TypeError("JevToolCaller confidenceGate tool keys must not be empty")
            }
        }
    }

    private warnUnknownPolicyKeys(availableTools: readonly AnyJevTool<TContext>[]): void {
        if (!this.interruptOn && !this.confidenceGate?.tools) return
        const names = new Set(availableTools.map(tool => tool.name))
        for (const key of Object.keys({ ...this.confidenceGate?.tools, ...this.interruptOn })) {
            if (!names.has(key) && !this.warnedPolicyKeys.has(key)) {
                this.warnedPolicyKeys.add(key)
                console.warn(`WARN: JevToolCaller policy key "${key}" matches no local or MCP tool`)
            }
        }
    }

    private async parkPending(threadId: string, pending: JevInterruptPending): Promise<void> {
        if (!this.checkpointer) return
        const baseConfig = { configurable: { thread_id: threadId } }
        const previous = await this.checkpointer.getTuple(baseConfig)
        const previousCheckpoint = previous?.checkpoint
        const pendingVersion = this.checkpointer.getNextVersion(
            typeof (previousCheckpoint?.channel_versions as Record<string, unknown> | undefined)?.[JEV_PENDING_CHANNEL] === "number"
                ? (previousCheckpoint?.channel_versions as Record<string, number>)[JEV_PENDING_CHANNEL]
                : undefined,
        )
        const checkpoint: Checkpoint = {
            v: 4,
            id: uuid6(-2),
            ts: new Date().toISOString(),
            channel_values: {
                ...(previousCheckpoint?.channel_values ?? {}),
                [JEV_PENDING_CHANNEL]: pending,
            },
            channel_versions: {
                ...(previousCheckpoint?.channel_versions ?? {}),
                [JEV_PENDING_CHANNEL]: pendingVersion,
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
            { [JEV_PENDING_CHANNEL]: pendingVersion },
        )
    }

    private async loadPending(threadId: string): Promise<JevInterruptPending | undefined> {
        if (!this.checkpointer) return undefined
        const checkpoint = await this.checkpointer.get({ configurable: { thread_id: threadId } })
        const pending = (checkpoint?.channel_values as Record<string, unknown> | undefined)?.[
            JEV_PENDING_CHANNEL
        ]
        if (!pending || typeof pending !== "object") return undefined
        const candidate = pending as Record<string, unknown>
        if (typeof candidate.toolName !== "string") return undefined
        if (!candidate.params || typeof candidate.params !== "object") return undefined
        if (!candidate.userRequest || typeof candidate.userRequest !== "object") return undefined
        return pending as JevInterruptPending
    }

    private async clearPending(threadId: string): Promise<void> {
        if (!this.checkpointer) return
        const baseConfig = { configurable: { thread_id: threadId } }
        const previous = await this.checkpointer.getTuple(baseConfig)
        const previousCheckpoint = previous?.checkpoint
        if (!previousCheckpoint) return
        const channel_values = { ...(previousCheckpoint.channel_values ?? {}) }
        delete channel_values[JEV_PENDING_CHANNEL]
        const checkpoint: Checkpoint = {
            v: previousCheckpoint.v,
            id: uuid6(-2),
            ts: new Date().toISOString(),
            channel_values,
            channel_versions: { ...(previousCheckpoint.channel_versions ?? {}) },
            versions_seen: previousCheckpoint.versions_seen ?? {},
        }
        await this.checkpointer.put(
            previous?.config ?? baseConfig,
            checkpoint,
            {
                source: "update",
                step: (previous?.metadata?.step ?? -1) + 1,
                parents: previous?.metadata?.parents ?? {},
            },
            {},
        )
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

    private validateInterruptOn(): void {
        if (!this.interruptOn) return
        if (!this.checkpointer) {
            throw new Error("interruptOn requires a checkpointer on JevToolCaller, else resume is impossible")
        }
        for (const key of Object.keys(this.interruptOn)) {
            if (key.trim().length === 0) {
                throw new TypeError("JevToolCaller interruptOn keys must not be empty")
            }
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
