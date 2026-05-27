export type {
    DeepAgentAllowedDecision,
    DeepAgentInterrupt,
    DeepAgentInterruptSingle,
    DeepAgentInterruptBatch,
    DeepAgentStreamChunk,
    DeepAgentUserDecision,
    DeepAgentResumeInput,
} from "../helpers/deepagent/interruptTypes"

import type { DeepAgentInterrupt } from "../helpers/deepagent/interruptTypes"

export function isInterrupt(value: unknown): value is DeepAgentInterrupt {
    return (
        typeof value === "object"
        && value !== null
        && "kind" in value
        && (value as DeepAgentInterrupt).kind === "interrupt"
    )
}
