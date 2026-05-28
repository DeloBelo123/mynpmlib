import { Command, type HITLRequest, type HITLResponse, type HitlUserDecision } from "../../imports"
import type { CreateDeepAgentParams, DynamicStructuredTool } from "../../imports"
import type { LocalShellBackend } from "deepagents"
import type { DenoSandbox } from "@langchain/deno"
import type { DaytonaSandbox } from "@langchain/daytona"
import type {
    DeepAgentAllowedDecision,
    DeepAgentInterrupt,
    DeepAgentInterruptConfig,
    DeepAgentUserDecision,
} from "./interruptTypes"

export type {
    DeepAgentAllowedDecision,
    DeepAgentInterrupt,
    DeepAgentInterruptSingle,
    DeepAgentInterruptBatch,
    DeepAgentStreamChunk,
    DeepAgentUserDecision,
    DeepAgentRunInputBase,
    DeepAgentHitlFields,
    DeepAgentInterruptConfig,
    DeepAgentInterruptToolCall,
    DeepAgentInterruptQuestion,
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

type ExecuteCapableBackend = LocalShellBackend | DenoSandbox | DaytonaSandbox

/** Von `createLocalShellBackend()` etc. — aktiviert `execute` im interruptOn-Autocomplete. */
export type ExecuteCapableDeepAgentBackend = { readonly __deepAgentExecute?: true }

/** Runtime: `execute` nur bei Shell/Sandbox-Backend — nicht bei `createWorkspaceBackend()` / Composite+StateBackend. */
export type BackendSupportsExecute<TBackend> =
    TBackend extends ExecuteCapableBackend | ExecuteCapableDeepAgentBackend
        ? true
        : TBackend extends Promise<infer P>
            ? BackendSupportsExecute<P>
            : false

type LiteralToolName<TName extends string> = string extends TName ? never : TName

export type ToolNamesOf<TTools extends readonly { name: string }[]> = {
    [K in keyof TTools]: TTools[K] extends { name: infer TName extends string }
        ? LiteralToolName<TName>
        : never
}[number]

/** Alle Tool-Namen die der Agent haben kann — Keys für `interruptOn`. */
export type DeepAgentInterruptableToolName<
    TTools extends readonly { name: string }[] = readonly [],
    TBackend = unknown,
> =
    | DeepAgentFilesystemTool
    | ToolNamesOf<TTools>
    | (BackendSupportsExecute<TBackend> extends true ? DeepAgentExecuteTool : never)

export type InterruptOnFor<TToolName extends string> = {
    [K in TToolName]?: DeepAgentInterruptConfig
}

/** Untyped fallback — prefer `InterruptOnFor<DeepAgentInterruptableToolName<...>>` via DeepAgent generics. */
export type InterruptOn = InterruptOnFor<string>

/**
 * Human-in-the-Loop (`interruptOn`-Prop) — pausiert den Agent **vor** Tool-Ausführung.
 *
 * Keys = Tool-Namen die der Agent hat (Autocomplete via DeepAgent-Generics):
 * - immer: `ls`, `read_file`, `write_file`, `edit_file`, `glob`, `grep`
 * - plus deine `tools: []` (`.name`, z.B. aus ToolRegistry)
 * - plus `execute` nur bei Shell/Sandbox-Backend (LocalShell, Deno, Daytona)
 *
 * Tools die **nicht** im Objekt stehen, laufen ohne Pause.
 *
 * @example
 * new DeepAgent({
 *     tools: [pingTool] as const,
 *     checkpointer: new MemorySaver(),
 *     interruptOn: {
 *         ping: {
 *             decisions: ["approve", "reject"],
 *             question: "Ping ausführen?",
 *         },
 *         write_file: {
 *             decisions: ["approve", "edit", "reject"],
 *             question: (call) =>
 *                 `Datei schreiben?\n\nPfad: ${call.args.path ?? "?"}`,
 *         },
 *     },
 * })
 *
 * `question` als Function: wird von LangGraph **vor** der Pause mit dem
 * geplanten Tool-Call aufgerufen — `call.name` + `call.args`.
 */
export function mapInterruptOnToNative(
    interruptOn: InterruptOnFor<string> | undefined,
): NonNullable<CreateDeepAgentParams["interruptOn"]> | undefined {
    if (!interruptOn) return undefined

    return Object.fromEntries(
        Object.entries(interruptOn)
            .filter((entry): entry is [string, DeepAgentInterruptConfig] => entry[1] !== undefined)
            .map(([tool, config]) => [
                tool,
                {
                    allowedDecisions: config.decisions,
                    description: config.question,
                },
            ]),
    ) as NonNullable<CreateDeepAgentParams["interruptOn"]>
}

export type InferInterruptOn<
    TTools extends readonly DynamicStructuredTool[] = readonly DynamicStructuredTool[],
    TBackend = unknown,
> = InterruptOnFor<DeepAgentInterruptableToolName<TTools, TBackend>>

type InterruptResult = { __interrupt__?: Array<{ value: HITLRequest }> }

/**
 * Prüft ob ein Agent-Result pausiert hat (Human-in-the-Loop).
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

export function getHitlRequest(result: InterruptResult): HITLRequest | undefined {
    return result.__interrupt__?.[0]?.value
}

export function approveDecision(): HitlUserDecision {
    return { type: "approve" }
}

export function rejectDecision(message?: string): HitlUserDecision {
    return message ? { type: "reject", message } : { type: "reject" }
}

export function editDecision(name: string, args: Record<string, unknown>): HitlUserDecision {
    return { type: "edit", editedAction: { name, args } }
}

export function approveAll(count: number): HITLResponse {
    return {
        decisions: Array.from({ length: count }, () => approveDecision()),
    }
}

export function createResumeCommand(
    decisions: HitlUserDecision[] | HITLResponse,
): Command {
    const resume: HITLResponse = Array.isArray(decisions)
        ? { decisions }
        : decisions
    return new Command({ resume })
}

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
