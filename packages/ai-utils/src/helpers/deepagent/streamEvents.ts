import type { DeepAgentInterrupt, DeepAgentToolEvent, DeepAgentReasoningEvent } from "./interruptTypes"
import { extractInterruptFromStreamUpdate } from "./interruptOn"
import { extractReasoningDelta } from "../../heart/chain"

function getMessageChunk(chunk: unknown) {
    return Array.isArray(chunk) ? chunk[0] : chunk
}

function getMessageMetadata(chunk: unknown) {
    return Array.isArray(chunk) ? chunk[1] : undefined
}

function getMessageType(messageChunk: any): string | undefined {
    if (typeof messageChunk?._getType === "function") {
        return messageChunk._getType()
    }
    return messageChunk?._getType
}

function parseToolArgs(args: unknown): Record<string, unknown> | undefined {
    if (args === undefined || args === null) return undefined
    if (typeof args === "object" && !Array.isArray(args)) {
        return args as Record<string, unknown>
    }
    if (typeof args === "string" && args.length > 0) {
        try {
            const parsed = JSON.parse(args)
            if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
                return parsed as Record<string, unknown>
            }
        } catch {
            return undefined
        }
    }
    return undefined
}

export function extractToolStartsFromMessageChunk(
    chunk: unknown,
    seenIds: Set<string>,
): DeepAgentToolEvent[] {
    const messageChunk = getMessageChunk(chunk)
    const events: DeepAgentToolEvent[] = []

    for (const call of messageChunk?.tool_calls ?? []) {
        const id = call?.id ?? call?.name
        if (!id || !call?.name || seenIds.has(id)) continue
        seenIds.add(id)
        events.push({
            kind: "tool",
            phase: "start",
            toolName: call.name,
            args: parseToolArgs(call.args),
        })
    }

    for (const call of messageChunk?.tool_call_chunks ?? []) {
        const id = call?.id ?? `${call?.index ?? 0}-${call?.name ?? "tool"}`
        if (!call?.name || seenIds.has(id)) continue
        seenIds.add(id)
        events.push({
            kind: "tool",
            phase: "start",
            toolName: call.name,
            args: parseToolArgs(call.args),
        })
    }

    return events
}

export function extractToolEndFromMessageChunk(chunk: unknown): DeepAgentToolEvent | undefined {
    const messageChunk = getMessageChunk(chunk)
    const metadata = getMessageMetadata(chunk)
    const node = metadata?.langgraph_node
    const messageType = getMessageType(messageChunk)

    if (messageType !== "tool" && node !== "tools") {
        return undefined
    }

    const toolName = messageChunk?.name
    if (!toolName || typeof toolName !== "string") {
        return undefined
    }

    const raw = messageChunk?.content
    const output = typeof raw === "string"
        ? raw
        : raw !== undefined
            ? JSON.stringify(raw)
            : undefined

    return {
        kind: "tool",
        phase: "end",
        toolName,
        output,
    }
}

export function extractTextFromStreamMessageChunk(chunk: unknown): string | undefined {
    const messageChunk = getMessageChunk(chunk)
    const metadata = getMessageMetadata(chunk)
    const node = metadata?.langgraph_node
    const messageType = getMessageType(messageChunk)

    if (node === "tools" || messageType === "tool") {
        return undefined
    }

    const raw = messageChunk?.content
    if (typeof raw === "string") {
        return raw.length > 0 ? raw : undefined
    }
    if (Array.isArray(raw)) {
        const text = raw.map((part: any) => part?.text ?? "").join("")
        return text.length > 0 ? text : undefined
    }
    return undefined
}

export function extractReasoningFromMessageChunk(chunk: unknown): DeepAgentReasoningEvent | undefined {
    const text = extractReasoningDelta(getMessageChunk(chunk))
    return text ? { kind: "reasoning", text } : undefined
}

export function mapNativeStreamChunk(
    chunk: unknown,
    opts: {
        interruptOn: boolean
        showToolCalls: boolean
        showReasoning: boolean
        seenToolStarts: Set<string>
    },
): Array<string | DeepAgentInterrupt | DeepAgentToolEvent | DeepAgentReasoningEvent> {
    const out: Array<string | DeepAgentInterrupt | DeepAgentToolEvent | DeepAgentReasoningEvent> = []

    const isMultimode = Array.isArray(chunk)
        && chunk.length === 2
        && typeof chunk[0] === "string"

    if (isMultimode) {
        const [mode, data] = chunk as [string, unknown]
        if (mode === "updates") {
            if (opts.interruptOn) {
                const interrupt = extractInterruptFromStreamUpdate(data)
                if (interrupt) out.push(interrupt)
            }
            return out
        }
        if (mode === "messages") {
            if (opts.showToolCalls) {
                for (const toolStart of extractToolStartsFromMessageChunk(data, opts.seenToolStarts)) {
                    out.push(toolStart)
                }
                const toolEnd = extractToolEndFromMessageChunk(data)
                if (toolEnd) out.push(toolEnd)
            }
            if (opts.showReasoning) {
                const reasoning = extractReasoningFromMessageChunk(data)
                if (reasoning) out.push(reasoning)
            }
            const text = extractTextFromStreamMessageChunk(data)
            if (text) out.push(text)
            return out
        }
        return out
    }

    if (opts.showToolCalls) {
        for (const toolStart of extractToolStartsFromMessageChunk(chunk, opts.seenToolStarts)) {
            out.push(toolStart)
        }
        const toolEnd = extractToolEndFromMessageChunk(chunk)
        if (toolEnd) out.push(toolEnd)
    }

    if (opts.showReasoning) {
        const reasoning = extractReasoningFromMessageChunk(chunk)
        if (reasoning) out.push(reasoning)
    }

    const text = extractTextFromStreamMessageChunk(chunk)
    if (text) out.push(text)
    return out
}
