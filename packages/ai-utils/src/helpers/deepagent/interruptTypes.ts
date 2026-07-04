import type { InvokeInputBase, ReasoningEvent } from "../../heart/chain"

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

export type DeepAgentToolEvent =
    | { kind: "tool"; phase: "start"; toolName: string; args?: Record<string, unknown> }
    | { kind: "tool"; phase: "end"; toolName: string; output?: string }

/** Reasoning-Delta des Models — nur im Stream, wenn `showReasoning: true` gesetzt ist. */
export type DeepAgentReasoningEvent = ReasoningEvent

/**
 * Text-Delta eines `task`-Subagenten (läuft als Subgraph in verschachteltem
 * Namespace). Standardmäßig wird dieser Text NICHT in den Haupt-Textstrom
 * gemischt — sonst sähe er aus wie Text des Hauptagenten. Nur mit
 * `showSubagents: true` kommt er als eigenes Event durch, sodass Consumer selbst
 * entscheiden (unterdrücken, als „recherchiert…"-Karte rendern, als Note loggen).
 * `namespace` ist die LangGraph-Provenienz (`tools:<taskCallId>|<node>`) und
 * identifiziert die konkrete Subagent-Invocation.
 */
export type DeepAgentSubagentEvent = { kind: "subagent"; text: string; namespace?: string }

export type DeepAgentStreamChunk = string | DeepAgentInterrupt

export type DeepAgentStreamChunkWithTools = DeepAgentStreamChunk | DeepAgentToolEvent

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

/** stream()-only — Return-Typ enthält dann DeepAgentToolEvent. */
export type DeepAgentShowToolCallsField = {
    showToolCalls: true
}

/** stream()-only — Return-Typ enthält dann DeepAgentReasoningEvent. */
export type DeepAgentShowReasoningField = {
    showReasoning: true
}

/** stream()-only — Return-Typ enthält dann DeepAgentSubagentEvent. */
export type DeepAgentShowSubagentsField = {
    showSubagents: true
}

/** Tool-Call der an `question`-Functions übergeben wird (vor der Pause). */
export type DeepAgentInterruptToolCall = {
    name: string
    args: Record<string, unknown>
}

export type DeepAgentInterruptQuestion =
    | string
    | ((toolCall: DeepAgentInterruptToolCall) => string | Promise<string>)

/** User-Config pro Tool für `interruptOn` auf DeepAgent. */
export type DeepAgentInterruptConfig = {
    decisions: DeepAgentAllowedDecision[]
    question: DeepAgentInterruptQuestion
}
