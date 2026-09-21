import type { z } from "zod/v4"
import type { BaseCheckpointSaver } from "../../imports"
import type { MCPServerConfig } from "../../heart/tools/MCP"
import type { JevEntry } from "../classify"

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

export type JevToolReturn<TTools extends readonly AnyJevTool[]> = TTools[number]["func"] extends (
    ...args: any[]
) => infer TResult
    ? Awaited<TResult>
    : never

export type JevToolCallerReturn<
    TTools extends readonly AnyJevTool[],
    THasMcp extends boolean,
> = THasMcp extends true ? unknown : JevToolReturn<TTools>

export type JevToolCallerHasMcp<TConfig> =
    "mcpServer" extends keyof TConfig ? true : false

export type JevToolCallerResolvedReturn<
    TTools extends readonly AnyJevTool[],
    TConfig,
> = JevToolCallerReturn<TTools, JevToolCallerHasMcp<TConfig>>

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

export type JevUsageAccumulator = JevToolCallerUsage & { hasCost: boolean }
