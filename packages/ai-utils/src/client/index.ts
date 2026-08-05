export type {
    DeepAgentAllowedDecision,
    DeepAgentInterrupt,
    DeepAgentInterruptSingle,
    DeepAgentInterruptBatch,
    DeepAgentStreamChunk,
    DeepAgentStreamChunkWithTools,
    DeepAgentToolEvent,
    DeepAgentReasoningEvent,
    DeepAgentSubagentEvent,
    DeepAgentUserDecision,
    DeepAgentRunInputBase,
    DeepAgentHitlFields,
    DeepAgentShowToolCallsField,
} from "../helpers/deepagent/interruptTypes"

import type {
    DeepAgentInterrupt,
    DeepAgentReasoningEvent,
    DeepAgentSubagentEvent,
    DeepAgentToolEvent,
} from "../helpers/deepagent/interruptTypes"

export function isInterrupt(value: unknown): value is DeepAgentInterrupt {
    return (
        typeof value === "object"
        && value !== null
        && "kind" in value
        && (value as DeepAgentInterrupt).kind === "interrupt"
    )
}

export function isToolEvent(value: unknown): value is DeepAgentToolEvent {
    return (
        typeof value === "object"
        && value !== null
        && "kind" in value
        && (value as DeepAgentToolEvent).kind === "tool"
    )
}

/**
 * Reasoning-Delta aus dem Stream (`showReasoning: true`). Pendant zu
 * {@link isToolEvent}: `stream()` liefert je nach Flags vier verschiedene
 * Objekt-Sorten, und ohne Guard muss jeder Consumer `kind === "reasoning"`
 * selbst prüfen und den Chunk casten.
 */
export function isReasoningEvent(value: unknown): value is DeepAgentReasoningEvent {
    return (
        typeof value === "object"
        && value !== null
        && "kind" in value
        && (value as DeepAgentReasoningEvent).kind === "reasoning"
        && typeof (value as DeepAgentReasoningEvent).text === "string"
    )
}

/**
 * Subagenten-Delta aus dem Stream (`showSubagents: true`) — der vierte
 * Chunk-Typ, damit die Guard-Familie vollständig ist.
 */
export function isSubagentEvent(value: unknown): value is DeepAgentSubagentEvent {
    return (
        typeof value === "object"
        && value !== null
        && "kind" in value
        && (value as DeepAgentSubagentEvent).kind === "subagent"
        && typeof (value as DeepAgentSubagentEvent).text === "string"
    )
}
