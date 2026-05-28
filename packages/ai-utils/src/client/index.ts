export type {
    DeepAgentAllowedDecision,
    DeepAgentInterrupt,
    DeepAgentInterruptSingle,
    DeepAgentInterruptBatch,
    DeepAgentStreamChunk,
    DeepAgentStreamChunkWithTools,
    DeepAgentToolEvent,
    DeepAgentUserDecision,
    DeepAgentRunInputBase,
    DeepAgentHitlFields,
    DeepAgentShowToolCallsField,
} from "../helpers/deepagent/interruptTypes"

import type { DeepAgentInterrupt, DeepAgentToolEvent } from "../helpers/deepagent/interruptTypes"

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
