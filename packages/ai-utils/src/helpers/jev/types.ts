import type { z } from "zod/v4"
import type { BaseCheckpointSaver } from "../../imports"
import type { MCPServerConfig } from "../../heart/tools/MCP"
import type { JevEntry, JevJsonValue } from "../classify"

export type JevModel = `~typesafe/${string}`

export type JevContextSchema = z.ZodObject

export type JevContextValue<TSchema extends JevContextSchema> = z.infer<TSchema>

export type JevToolCallerHistoryEntry = {
    role: "user" | "assistant" | "system"
    content: JevEntry
}

export type JevToolCallerState = {
    system_prompt: string
    message_history: JevToolCallerHistoryEntry[]
}

export interface JevToolRuntimeContext<TContext = undefined> {
    /** State evaluated by JEV, including the current user message. */
    state: JevToolCallerState
    /** Thread used by the optional checkpointer. */
    thread_id?: string
    /** Validated local execution context. It is never sent to JEV or persisted. */
    context: TContext
}

/** Input passed to a tool function. Runtime-selected values live in `params`. */
export type JevToolFunctionInput<TContext = undefined> = JevToolRuntimeContext<TContext> & {
    params: Record<string, any>
}

export type JevRuntimeParamChoices = Record<string, readonly JevEntry[]>

export type JevRuntimeParams<
    TChoices extends JevRuntimeParamChoices = JevRuntimeParamChoices,
> = TChoices

/** Static bounded choices or a provider that computes them for the selected tool. */
export type JevParams<TContext = undefined> =
    | JevRuntimeParamChoices
    | ((
        runtimeContext: JevToolRuntimeContext<TContext>,
    ) => JevRuntimeParamChoices | Promise<JevRuntimeParamChoices>)

export interface JevMcpToolRuntimeContext<TContext = undefined>
    extends JevToolRuntimeContext<TContext> {
    /** MCP server that owns the selected tool. Never sent to JEV. */
    server: JevMCPServerConfig<TContext>
}

export type JevMcpToolParams<TContext = undefined> =
    | JevRuntimeParamChoices
    | ((
        runtimeContext: JevMcpToolRuntimeContext<TContext>,
    ) => JevRuntimeParamChoices | Promise<JevRuntimeParamChoices>)

export type JevMcpRuntimeParams<TContext = undefined> = Record<
    string,
    JevMcpToolParams<TContext>
>

export interface JevMCPServerConfig<TContext = undefined> extends MCPServerConfig {
    /** Runtime choices keyed by the MCP tool's unprefixed name. */
    params?: JevMcpRuntimeParams<TContext>
}

export type JevMCPServersInput<TContext = undefined> =
    | JevMCPServerConfig<TContext>
    | JevMCPServerConfig<TContext>[]

export type JevTool<
    TResult = unknown,
    TContext = undefined,
> = {
    name: string
    description: string
    /** Optional static or runtime-computed bounded values for this tool's arguments. */
    params?: JevParams<TContext>
    func: (input: JevToolFunctionInput<TContext>) => TResult | Promise<TResult>
}

/** @internal Common tool shape used to preserve each local tool's return type. */
export type AnyJevTool<TContext = any> = {
    name: string
    description: string
    params?:
        | JevRuntimeParamChoices
        | ((runtimeContext: JevToolRuntimeContext<TContext>) => unknown)
    func: (input: JevToolFunctionInput<TContext>) => any
}

type JevToolCallerBaseProps<TTools extends readonly AnyJevTool[]> = {
    model?: JevModel
    prompt?: string
    tools: TTools
    checkpointer?: BaseCheckpointSaver
}

export type JevToolCallerProps<
    TTools extends readonly AnyJevTool<NoInfer<TContext>>[],
    TContext = undefined,
> = JevToolCallerBaseProps<TTools> & {
    contextSchema?: JevContextSchema & z.ZodType<TContext>
    /** Remote tools loaded and closed for every invoke. */
    mcpServer?: JevMCPServersInput<NoInfer<TContext>>
    /**
     * Human-in-the-Loop: pausiert vor `func()`-Ausführung. Value ist die
     * Freigabe-Frage (String oder Function mit `{ tool, params, state, thread_id, context }`).
     * Erfordert `checkpointer` + `thread_id` — sonst Throw im Constructor.
     * Nur `approve`/`reject`; `func()` läuft bei Reject nie.
     */
    interruptOn?: JevInterruptOn<TTools, NoInfer<TContext>>
    /**
     * Qualitäts-Gate: immer aktiv. Effektiver Threshold pro Tool ist
     * `tools[name] ?? minConfidence ?? 0.5`. Unterschreitet die Tool- oder eine
     * Param-Confidence den Threshold, wird `func()` nicht ausgeführt und
     * `invoke()` gibt `{ kind: "gated", ... }` zurück. `minConfidence: 0`
     * schaltet den Gate faktisch ab.
     */
    confidenceGate?: JevGateConfig<TTools>
}

type JevToolCallerInvokeControls = {
    debug?: boolean
    thread_id?: string
    signal?: AbortSignal
    decision?: JevUserDecision
    [key: string]: unknown
}

export type JevToolCallerInvokeInput<
    TContext = undefined,
> = JevToolCallerInvokeControls &
    ([TContext] extends [undefined]
        ? { context?: never }
        : { context: TContext })

/** v1: nur approve/reject — keine generierten Argumente, keine Edits. */
export type JevUserDecision = "approve" | "reject"

/** Untergrenze, wenn weder `minConfidence` noch ein Tool-Override gesetzt ist. */
export const DEFAULT_MIN_CONFIDENCE = 0.5

export interface JevToolSelection {
    name: string
    /** JEV tool-choice confidence; 1 wenn via `callTool()` explizit gewählt. */
    confidence: number
}

export interface JevParamSelection {
    value: JevEntry
    /** JEV param-choice confidence; 1 wenn deterministisch oder explizit gewählt. */
    confidence: number
}

export type JevToolNameOf<TTools extends readonly AnyJevTool[]> = {
    [K in keyof TTools]: TTools[K] extends { name: infer TName extends string }
        ? (string extends TName ? never : TName)
        : never
}[number]

/** Kontext für `question`-Functions — läuft lokal, wird nie an JEV gesendet oder persistiert. */
export interface JevInterruptQuestionContext<TContext = undefined> {
    tool: string
    params: Record<string, JevEntry>
    state: JevToolCallerState
    thread_id?: string
    context: TContext
}

export type JevInterruptQuestion<TContext = undefined> =
    | string
    | ((call: JevInterruptQuestionContext<TContext>) => string | Promise<string>)

/**
 * HITL-Policy pro Tool. Keys sind Tool-Namen (Autocomplete für lokale Tools,
 * freie Strings für dynamische `<server>__<tool>` MCP-Namen). Tools ohne
 * Eintrag laufen ohne Pause direkt durch.
 */
export type JevInterruptOn<
    TTools extends readonly AnyJevTool[] = readonly AnyJevTool[],
    TContext = any,
> = {
    [K in JevToolNameOf<TTools>]?: JevInterruptQuestion<TContext>
} & {
    [toolName: string]: JevInterruptQuestion<TContext> | undefined
}

export type JevGateThresholds<
    TTools extends readonly AnyJevTool[] = readonly AnyJevTool[],
> = {
    [K in JevToolNameOf<TTools>]?: number
} & {
    [toolName: string]: number | undefined
}

export interface JevGateConfig<
    TTools extends readonly AnyJevTool[] = readonly AnyJevTool[],
> {
    /** Default-Threshold für jedes Tool; fallback ist `DEFAULT_MIN_CONFIDENCE`. */
    minConfidence?: number
    /** Per-Tool-Override: `tools[name] ?? minConfidence ?? 0.5`. */
    tools?: JevGateThresholds<TTools>
}

export interface JevGateBreach {
    scope: "tool" | `params.${string}`
    confidence: number
    required: number
}

/** Pause vor `func()` — wird per `decision` in einem zweiten `invoke()` fortgesetzt. */
export interface JevInterrupt {
    kind: "interrupt"
    question: string
    tool: JevToolSelection
    params: Record<string, JevParamSelection>
}

/** Gate hat Nein gesagt — `func()` lief nicht. */
export interface JevGatedResult {
    kind: "gated"
    tool: JevToolSelection
    params: Record<string, JevParamSelection>
    below: JevGateBreach[]
}

/** Manueller Ausführungspfad ohne JEV-Auswahl. */
export type JevCallToolInput<
    TTools extends readonly AnyJevTool[] = readonly AnyJevTool[],
    TContext = undefined,
> = {
    debug?: boolean
    thread_id?: string
    signal?: AbortSignal
    /** Tool-Name — Union lokaler Namen, freie Strings für `<server>__<tool>`. */
    tool: JevToolNameOf<TTools> | (string & {})
    /** Explizite Werte — werden gegen die Tool-Candidates validiert (bounded). */
    params?: Record<string, JevEntry>
} & ([TContext] extends [undefined]
    ? { context?: never }
    : { context: TContext }) & {
    [key: string]: unknown
}

/** @internal Geparkter Vorschlag zwischen Propose und Resume — JSON-serialisierbar. */
export interface JevInterruptPending {
    toolName: string
    params: Record<string, JevEntry>
    userRequest: Record<string, JevJsonValue>
    question: string
    tool: JevToolSelection
    paramSelections: Record<string, JevParamSelection>
    toolMeta: {
        confidence: number
        probabilities: Record<string, number>
    }
    paramsMeta: Record<string, JevToolCallerSelectionMetadata>
    usage: JevUsageAccumulator
}

export type JevToolReturn<TTools extends readonly AnyJevTool[]> = TTools[number]["func"] extends (
    ...args: any[]
) => infer TResult
    ? Awaited<TResult>
    : never

/** Stabiler Result-Shape jedes `invoke()`/`callTool()`-Returns — immer mit `kind`. */
export type JevToolCallerResult<TResult> =
    | {
        kind: "return"
        value: TResult
        tool: JevToolSelection
        params: Record<string, JevParamSelection>
        rejected?: false
    }
    | {
        kind: "return"
        /** `reject` — `func()` lief nie. */
        value: null
        tool: JevToolSelection
        params: Record<string, JevParamSelection>
        rejected: true
    }

/** @internal The raw value produced by the selected tool. */
export type JevToolCallerValue<
    TTools extends readonly AnyJevTool[],
    THasMcp extends boolean,
> = THasMcp extends true ? unknown : JevToolReturn<TTools>

export type JevToolCallerReturn<
    TTools extends readonly AnyJevTool[],
    THasMcp extends boolean,
> = JevToolCallerResult<JevToolCallerValue<TTools, THasMcp>>

export type JevToolCallerHasMcp<TConfig> =
    "mcpServer" extends keyof TConfig ? true : false

export type JevToolCallerResolvedReturn<
    TTools extends readonly AnyJevTool[],
    TConfig,
> = JevToolCallerReturn<TTools, JevToolCallerHasMcp<TConfig>>

/** @internal Raw selected-tool value resolved from the caller configuration. */
export type JevToolCallerResolvedValue<
    TTools extends readonly AnyJevTool[],
    TConfig,
> = JevToolCallerValue<TTools, JevToolCallerHasMcp<TConfig>>

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

export type JevToolCallerDebugResult<TResult> = JevToolCallerResult<TResult> & {
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

export type JevUsageAccumulator = JevToolCallerUsage & { hasCost: boolean }
