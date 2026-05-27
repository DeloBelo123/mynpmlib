import type { InvokeInputBase } from "../../heart/chain"

export type DeepAgentAllowedDecision = "approve" | "edit" | "reject"

export type DeepAgentInterruptSingle = {
    kind: "interrupt"
    question: string
    decisions: DeepAgentAllowedDecision[]
    toolName?: string
    args?: Record<string, unknown>
}

export type DeepAgentInterruptBatch = {
    kind: "interrupt"
    items: Array<{
        question: string
        decisions: DeepAgentAllowedDecision[]
        toolName: string
        args: Record<string, unknown>
    }>
}

export type DeepAgentInterrupt = DeepAgentInterruptSingle | DeepAgentInterruptBatch

export type DeepAgentStreamChunk = string | DeepAgentInterrupt

export type DeepAgentUserDecision =
    | "approve"
    | "reject"
    | { type: "reject"; message: string }
    | { type: "edit"; args: Record<string, unknown> }

/** Basis-Input für invoke/stream — immer (mit/ohne interruptOn). */
export type DeepAgentRunInputBase = InvokeInputBase & {
    thread_id?: string
    context?: Record<string, unknown>
}

/** HITL-Felder — nur im Typ wenn interruptOn konfiguriert. */
export type DeepAgentHitlFields = {
    decision?: DeepAgentUserDecision
    decisions?: DeepAgentUserDecision[]
}
