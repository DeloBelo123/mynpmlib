import type {
    JevEntry,
    JevJsonValue,
    JevUsage,
} from "../classify"
import type {
    JevToolCallerUsage,
    JevUsageAccumulator,
} from "./types"

export const DEFAULT_JEV_TOOL_CALLER_PROMPT =
    "Treat the latest user message as the current request and earlier messages only as context. Select the available tool that best fulfills the request."

export function addJevUsage(total: JevUsageAccumulator, usage: JevUsage): void {
    total.calls++
    total.input_tokens += usage.input_tokens
    total.output_tokens += usage.output_tokens
    if (usage.cost !== undefined) {
        total.cost = (total.cost ?? 0) + usage.cost
        total.hasCost = true
    }
}

export function toPublicJevUsage(total: JevUsageAccumulator): JevToolCallerUsage {
    return {
        calls: total.calls,
        input_tokens: total.input_tokens,
        output_tokens: total.output_tokens,
        ...(total.hasCost ? { cost: total.cost } : {}),
    }
}

export function toJevRecord(value: Record<string, unknown>): Record<string, JevJsonValue> {
    let serialized: string
    try {
        serialized = JSON.stringify(value)
    } catch (error) {
        throw new TypeError("JevToolCaller input must be JSON-serializable", { cause: error })
    }

    const parsed = JSON.parse(serialized) as unknown
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new TypeError("JevToolCaller input must serialize to an object")
    }
    return parsed as Record<string, JevJsonValue>
}

export function toStoredJevValue(value: unknown): JevJsonValue {
    try {
        const serialized = JSON.stringify(value)
        if (serialized === undefined) return null
        return JSON.parse(serialized) as JevJsonValue
    } catch {
        return String(value)
    }
}

export function parseJevHistoryContent(content: string): JevEntry {    try {
        const parsed = JSON.parse(content) as unknown
        if (
            parsed === null ||
            typeof parsed === "string" ||
            Array.isArray(parsed) ||
            typeof parsed === "object"
        ) {
            return parsed as JevEntry
        }
    } catch {
        // Plain text from checkpoints created by another runtime remains plain text.
    }
    return content
}

export function deepEqualJev(left: JevJsonValue | undefined, right: JevJsonValue | undefined): boolean {
    if (left === right) return true
    if (typeof left !== typeof right) return false
    if (left === null || right === null) return false
    if (typeof left !== "object" || typeof right !== "object") return false
    if (Array.isArray(left) || Array.isArray(right)) {
        if (!Array.isArray(left) || !Array.isArray(right)) return false
        if (left.length !== right.length) return false
        return left.every((item, index) => deepEqualJev(item, right[index]))
    }
    const leftRecord = left as Record<string, JevJsonValue>
    const rightRecord = right as Record<string, JevJsonValue>
    const leftKeys = Object.keys(leftRecord)
    if (leftKeys.length !== Object.keys(rightRecord).length) return false
    return leftKeys.every(key =>
        Object.hasOwn(rightRecord, key) && deepEqualJev(leftRecord[key], rightRecord[key]),
    )
}
