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

export type DeepAgentResumeInput = {
    thread_id: string
    context?: Record<string, unknown>
    decision?: DeepAgentUserDecision
    decisions?: DeepAgentUserDecision[]
}
