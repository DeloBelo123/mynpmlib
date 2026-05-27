import { Command, type HITLRequest, type HITLResponse, type HitlUserDecision } from "../../imports"
import type { CreateDeepAgentParams, DynamicStructuredTool } from "../../imports"
import type { LocalShellBackend } from "deepagents"
import type { DenoSandbox } from "@langchain/deno"
import type { DaytonaSandbox } from "@langchain/daytona"
import type {
    DeepAgentAllowedDecision,
    DeepAgentInterrupt,
    DeepAgentUserDecision,
} from "./interruptTypes"

export type {
    DeepAgentAllowedDecision,
    DeepAgentInterrupt,
    DeepAgentInterruptSingle,
    DeepAgentInterruptBatch,
    DeepAgentStreamChunk,
    DeepAgentUserDecision,
    DeepAgentResumeInput,
} from "./interruptTypes"

/** Immer verfügbare Filesystem-Tools von DeepAgents (Middleware). */
export const DEEP_AGENT_FILESYSTEM_TOOLS = [
    "ls",
    "read_file",
    "write_file",
    "edit_file",
    "glob",
    "grep",
] as const

/** Shell-Tool — nur wenn Backend `execute()` unterstützt (LocalShell, Deno, Daytona). */
export const DEEP_AGENT_EXECUTE_TOOL = "execute" as const

export type DeepAgentFilesystemTool = (typeof DEEP_AGENT_FILESYSTEM_TOOLS)[number]
export type DeepAgentExecuteTool = typeof DEEP_AGENT_EXECUTE_TOOL
export type InterruptDecision = "approve" | "edit" | "reject"

type ToolCallLike = { name: string; args: Record<string, unknown> }
type InterruptDescription = string | ((toolCall: ToolCallLike) => string | Promise<string>)

type ExecuteCapableBackend = LocalShellBackend | DenoSandbox | DaytonaSandbox

/** Runtime: `execute` nur bei Shell/Sandbox-Backend — nicht bei `createWorkspaceBackend()` / Composite+StateBackend. */
export type BackendSupportsExecute<TBackend> =
    TBackend extends ExecuteCapableBackend
        ? true
        : TBackend extends Promise<infer P>
            ? BackendSupportsExecute<P>
            : false

export type ToolNamesOf<TTools extends readonly { name: string }[]> = {
    [K in keyof TTools]: TTools[K] extends { name: infer N extends string } ? N : never
}[number]

export type DeepAgentInterruptableToolName<
    TTools extends readonly { name: string }[] = readonly [],
    TBackend = unknown,
> =
    | DeepAgentFilesystemTool
    | ToolNamesOf<TTools>
    | (BackendSupportsExecute<TBackend> extends true ? DeepAgentExecuteTool : never)

type InterruptOnConfigObject = {
    allowedDecisions: InterruptDecision[]
    description?: InterruptDescription
    argsSchema?: Record<string, unknown>
}

type InterruptOnEntry = boolean | InterruptOnConfigObject

export type InterruptOnFor<TToolName extends string> = Partial<Record<TToolName, InterruptOnEntry>>

/** Untyped fallback — prefer `InterruptOnFor<DeepAgentInterruptableToolName<...>>` via DeepAgent generics. */
export type InterruptOn = NonNullable<CreateDeepAgentParams["interruptOn"]>

/**
 * Human-in-the-Loop (`interruptOn`-Prop) — pausiert den Agent **vor** Tool-Ausführung.
 *
 * Das ist **kein** `permissions`-Filesystem-ACL. Keys sind **Tool-Namen**:
 * - immer: `ls`, `read_file`, `write_file`, `edit_file`, `glob`, `grep`
 * - plus deine `tools: []` (mit `as const` für Literal-Autocomplete)
 * - plus `execute` nur bei Shell/Sandbox-Backend (LocalShell, Deno, Daytona)
 *
 * Braucht `checkpointer` + `thread_id`. Keine eingebaute UI — du liest
 * `result.__interrupt__` und setzt mit `createResumeCommand()` fort.
 *
 * **Nutzung — jede Util returned direkt ein gültiges `interruptOn`-Objekt:**
 *
 * ```ts
 * // 1) Ein Tool oder mehrere mit gleicher Regel → direkt zuweisen
 * interruptOn: requireApproval("read_file", "write_file")
 * interruptOn: approveOrReject("getCandidates", "Bewerberdaten abrufen?")
 * interruptOn: filesystemWritesRequireApproval()
 *
 * // 2) Verschiedene Regeln pro Tool → mergeInterruptOn (kein Spread nötig)
 * interruptOn: mergeInterruptOn(
 *     approveOrReject("getCandidates", "..."),
 *     requireApproval("execute"),
 * )
 * ```
 *
 * Pro Tool-Name nur **ein** Key im Objekt — doppelte Keys würden sich überschreiben.
 * Tools die nicht in der Map stehen, laufen ohne Pause (auto-approve).
 */

/**
 * Pause vor Tool-Ausführung. User darf approve, edit und reject.
 * Default-Text: "Tool execution requires approval" + Tool-Name + Args.
 *
 * @example
 * new DeepAgent({
 *     checkpointer: new MemorySaver(),
 *     interruptOn: requireApproval("getCandidates", "read_file"),
 * })
 */
export function requireApproval<const T extends string>(
    ...toolNames: T[]
): InterruptOnFor<T> {
    return Object.fromEntries(toolNames.map((name) => [name, true])) as InterruptOnFor<T>
}

/**
 * Tool explizit ohne Pause — läuft sofort durch.
 * Meist innerhalb von `mergeInterruptOn()` — selten alleine als ganzes `interruptOn`.
 *
 * @example
 * interruptOn: mergeInterruptOn(
 *     requireApproval("getCandidates"),
 *     autoApprove("ping"),
 * )
 */
export function autoApprove<const T extends string>(
    ...toolNames: T[]
): InterruptOnFor<T> {
    return Object.fromEntries(toolNames.map((name) => [name, false])) as InterruptOnFor<T>
}

/**
 * Pause mit eigenem Text. User darf nur approve oder reject (kein edit).
 *
 * @example
 * new DeepAgent({
 *     checkpointer: new MemorySaver(),
 *     interruptOn: approveOrReject(
 *         "getCandidates",
 *         "Der Agent möchte Bewerberdaten abrufen. Erlauben?",
 *     ),
 * })
 */
export function approveOrReject<const T extends string>(
    toolName: T,
    description?: string,
): InterruptOnFor<T> {
    return {
        [toolName]: {
            allowedDecisions: ["approve", "reject"],
            ...(description ? { description } : {}),
        },
    } as InterruptOnFor<T>
}

/**
 * Pause mit Prefix-Text + Tool-Args als JSON (dynamisch pro Call).
 *
 * @example
 * new DeepAgent({
 *     checkpointer: new MemorySaver(),
 *     interruptOn: withToolArgsDescription(
 *         "getCandidates",
 *         "Der Agent möchte Bewerber abrufen:",
 *     ),
 * })
 */
export function withToolArgsDescription<const T extends string>(
    toolName: T,
    prefix: string,
    allowedDecisions: InterruptDecision[] = ["approve", "reject"],
): InterruptOnFor<T> {
    return {
        [toolName]: {
            allowedDecisions,
            description: (toolCall: ToolCallLike) =>
                `${prefix}\n\nArgs: ${JSON.stringify(toolCall.args, null, 2)}`,
        },
    } as InterruptOnFor<T>
}

/**
 * Verschiedene Tool-Regeln zu einem `interruptOn`-Objekt zusammenführen.
 * Nur nötig wenn Tools **unterschiedliche** Configs brauchen — sonst direkt `interruptOn: util()`.
 *
 * @example
 * const sandbox = await createDenoSandbox()
 * new DeepAgent({
 *     tools: [getCandidates] as const,
 *     backend: sandbox,
 *     checkpointer: new MemorySaver(),
 *     interruptOn: mergeInterruptOn(
 *         requireApproval("execute"),
 *         approveOrReject("getCandidates", "Bewerberdaten abrufen?"),
 *     ),
 * })
 */
export function mergeInterruptOn<const T extends string>(
    ...configs: Array<Partial<Record<T, InterruptOnEntry>>>
): Partial<Record<T, InterruptOnEntry>> {
    return Object.assign({}, ...configs) as Partial<Record<T, InterruptOnEntry>>
}

/**
 * Preset: `write_file` und `edit_file` brauchen User-Freigabe.
 *
 * @example
 * new DeepAgent({
 *     checkpointer: new MemorySaver(),
 *     interruptOn: filesystemWritesRequireApproval(),
 * })
 */
export function filesystemWritesRequireApproval(
    description = "Datei-Schreiboperation — bitte bestätigen.",
): InterruptOnFor<"write_file" | "edit_file"> {
    return {
        write_file: {
            allowedDecisions: ["approve", "edit", "reject"],
            description,
        },
        edit_file: {
            allowedDecisions: ["approve", "edit", "reject"],
            description,
        },
    }
}

export type InferInterruptOn<
    TTools extends readonly DynamicStructuredTool[] = readonly DynamicStructuredTool[],
    TBackend = unknown,
> = InterruptOnFor<DeepAgentInterruptableToolName<TTools, TBackend>>

type InterruptResult = { __interrupt__?: Array<{ value: HITLRequest }> }

/**
 * Prüft ob ein Agent-Result pausiert hat (Human-in-the-Loop).
 *
 * @example
 * const result = await agent.invoke(input, { configurable: { thread_id: "1" } })
 * if (isInterruptResult(result)) {
 *     const hitl = getHitlRequest(result)
 * }
 */
export function isInterruptResult(result: unknown): result is InterruptResult & { __interrupt__: NonNullable<InterruptResult["__interrupt__"]> } {
    return (
        typeof result === "object"
        && result !== null
        && "__interrupt__" in result
        && Array.isArray((result as InterruptResult).__interrupt__)
        && ((result as InterruptResult).__interrupt__?.length ?? 0) > 0
    )
}

/**
 * Liest die HITL-Daten aus einem pausierten Result (`actionRequests`, `reviewConfigs`).
 *
 * @example
 * const hitl = getHitlRequest(result)
 * console.log(hitl?.actionRequests[0].description)
 */
export function getHitlRequest(result: InterruptResult): HITLRequest | undefined {
    return result.__interrupt__?.[0]?.value
}

/**
 * Einzelne User-Entscheidungen für `createResumeCommand()`.
 *
 * @example
 * createResumeCommand([approveDecision(), rejectDecision("Kein Zugriff")])
 */
export function approveDecision(): HitlUserDecision {
    return { type: "approve" }
}

export function rejectDecision(message?: string): HitlUserDecision {
    return message ? { type: "reject", message } : { type: "reject" }
}

export function editDecision(name: string, args: Record<string, unknown>): HitlUserDecision {
    return { type: "edit", editedAction: { name, args } }
}

/**
 * Alle pending Actions auf einmal approven.
 * Anzahl muss zu `actionRequests.length` passen.
 *
 * @example
 * createResumeCommand(approveAll(hitl.actionRequests.length))
 */
export function approveAll(count: number): HITLResponse {
    return {
        decisions: Array.from({ length: count }, () => approveDecision()),
    }
}

/**
 * Erstellt den LangGraph-`Command` zum Fortsetzen nach einem Interrupt.
 * **Pflicht** — ohne zweiten `invoke` mit diesem Command bleibt der Agent pausiert.
 *
 * Import: `Command` aus `@langchain/langgraph` (exportiert via `@delofarag/ai-utils`).
 *
 * @example
 * import { createResumeCommand, approveAll, getHitlRequest, isInterruptResult } from "@delofarag/ai-utils"
 *
 * const config = { configurable: { thread_id: "session-1" } }
 * let result = await agent.invoke({ messages: [...] }, config)
 *
 * while (isInterruptResult(result)) {
 *     const hitl = getHitlRequest(result)!
 *     // UI: hitl.actionRequests anzeigen, User entscheidet...
 *     result = await agent.invoke(
 *         createResumeCommand(approveAll(hitl.actionRequests.length)),
 *         config,
 *     )
 * }
 *
 * @example
 * // Einzelne Entscheidung
 * await agent.invoke(
 *     createResumeCommand([approveDecision()]),
 *     config,
 * )
 */
export function createResumeCommand(
    decisions: HitlUserDecision[] | HITLResponse,
): Command {
    const resume: HITLResponse = Array.isArray(decisions)
        ? { decisions }
        : decisions
    return new Command({ resume })
}

/**
 * Mappt LangGraph `HITLRequest` auf unser flaches `DeepAgentInterrupt`-Objekt.
 */
export function mapHitlToInterrupt(hitl: HITLRequest): DeepAgentInterrupt {
    const requests = hitl.actionRequests ?? []
    const reviews = hitl.reviewConfigs ?? []

    if (requests.length <= 1) {
        const action = requests[0]
        const review = reviews[0]
        return {
            kind: "interrupt",
            question: action?.description ?? `Tool: ${action?.name ?? "unknown"}`,
            decisions: (review?.allowedDecisions ?? ["approve", "reject"]) as DeepAgentAllowedDecision[],
            ...(action?.name ? { toolName: action.name } : {}),
            ...(action?.args ? { args: action.args as Record<string, unknown> } : {}),
        }
    }

    return {
        kind: "interrupt",
        items: requests.map((action, i) => ({
            question: action.description ?? `Tool: ${action.name}`,
            decisions: (reviews[i]?.allowedDecisions ?? ["approve", "reject"]) as DeepAgentAllowedDecision[],
            toolName: action.name,
            args: (action.args ?? {}) as Record<string, unknown>,
        })),
    }
}

export function mapResultToInterrupt(result: unknown): DeepAgentInterrupt | undefined {
    if (!isInterruptResult(result)) return undefined
    const hitl = getHitlRequest(result)
    if (!hitl) return undefined
    return mapHitlToInterrupt(hitl)
}

export function userDecisionToHitl(
    decision: DeepAgentUserDecision,
    toolName?: string,
): HitlUserDecision {
    if (decision === "approve") return approveDecision()
    if (decision === "reject") return rejectDecision()
    if (decision.type === "reject") return rejectDecision(decision.message)
    if (!toolName) {
        throw new Error("toolName is required for edit decisions")
    }
    return editDecision(toolName, decision.args)
}

export function expandResumeDecisions(
    decision: DeepAgentUserDecision | undefined,
    decisions: DeepAgentUserDecision[] | undefined,
    pendingCount: number,
    defaultToolName?: string,
): HitlUserDecision[] {
    if (decisions) {
        if (decisions.length !== pendingCount) {
            throw new Error(`Expected ${pendingCount} decisions, got ${decisions.length}`)
        }
        return decisions.map((d) => userDecisionToHitl(d, defaultToolName))
    }

    const single = decision ?? "approve"
    return Array.from({ length: pendingCount }, () => userDecisionToHitl(single, defaultToolName))
}

export async function getPendingInterruptCount(agent: any, config: Record<string, unknown> | undefined): Promise<number> {
    if (!agent?.getState || !config) return 1

    try {
        const state = await agent.getState(config)
        const tasks = state?.tasks ?? []
        for (const task of tasks) {
            const interrupts = task?.interrupts ?? []
            if (interrupts.length > 0) {
                const value = interrupts[0]?.value ?? interrupts[0]
                if (value?.actionRequests?.length) return value.actionRequests.length
            }
        }

        const values = state?.values
        if (values?.__interrupt__?.length) {
            const hitl = values.__interrupt__[0]?.value
            if (hitl?.actionRequests?.length) return hitl.actionRequests.length
        }
    } catch {
        return 1
    }

    return 1
}

export function extractInterruptFromStreamUpdate(data: unknown): DeepAgentInterrupt | undefined {
    if (!data || typeof data !== "object") return undefined

    const record = data as Record<string, unknown>
    if ("__interrupt__" in record && Array.isArray(record.__interrupt__)) {
        const hitl = (record.__interrupt__ as Array<{ value?: HITLRequest }>)[0]?.value
        if (hitl) return mapHitlToInterrupt(hitl)
    }

    for (const value of Object.values(record)) {
        if (!value || typeof value !== "object") continue
        const nested = value as Record<string, unknown>
        if ("__interrupt__" in nested && Array.isArray(nested.__interrupt__)) {
            const hitl = (nested.__interrupt__ as Array<{ value?: HITLRequest }>)[0]?.value
            if (hitl) return mapHitlToInterrupt(hitl)
        }
    }

    return undefined
}
