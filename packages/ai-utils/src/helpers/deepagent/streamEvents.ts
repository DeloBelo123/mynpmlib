import type { DeepAgentInterrupt, DeepAgentToolEvent, DeepAgentReasoningEvent, DeepAgentSubagentEvent } from "./interruptTypes"
import { extractInterruptFromStreamUpdate } from "./interruptOn"
import { extractReasoningDelta } from "../../heart/chain"

function getMessageChunk(chunk: unknown) {
    return Array.isArray(chunk) ? chunk[0] : chunk
}

function getMessageMetadata(chunk: unknown) {
    return Array.isArray(chunk) ? chunk[1] : undefined
}

/**
 * LangGraph-Provenienz eines Chunks. Der Hauptagent läuft im Root-Namespace
 * (`""`), ein `task`-Subagent in einem verschachtelten NS (`tools:<id>|<node>`).
 * Genau diese Info steckt in den Metadaten — hier lesen wir sie aus, statt sie
 * (wie bisher) wegzuwerfen.
 */
function getCheckpointNamespace(chunk: unknown): string {
    const metadata = getMessageMetadata(chunk) as any
    return metadata?.langgraph_checkpoint_ns ?? metadata?.checkpoint_ns ?? ""
}

/** Verschachtelter Namespace (Tiefe > 1) ⇒ Text stammt aus einem Subagent-Subgraph. */
function isSubagentChunk(chunk: unknown): boolean {
    return getCheckpointNamespace(chunk).split("|").filter(Boolean).length > 1
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

/**
 * Text eines Chunks in den Output schieben — mit Herkunfts-Weiche:
 * Subagent-Text (verschachtelter Namespace) leckt sonst als nackter String in
 * den Haupt-Textstrom und sieht aus wie Text des Hauptagenten. Deshalb:
 *  - Hauptagent (Root-NS)       → nackter String (wie bisher)
 *  - Subagent (verschachtelt)   → nur mit `showSubagents` als eigenes Event,
 *                                 sonst verworfen (Default behebt das Leck)
 */
function pushTextFromChunk(
    chunkData: unknown,
    showSubagents: boolean,
    out: Array<string | DeepAgentInterrupt | DeepAgentToolEvent | DeepAgentReasoningEvent | DeepAgentSubagentEvent>,
) {
    const text = extractTextFromStreamMessageChunk(chunkData)
    if (!text) return
    if (isSubagentChunk(chunkData)) {
        if (showSubagents) {
            out.push({ kind: "subagent", text, namespace: getCheckpointNamespace(chunkData) })
        }
        return
    }
    out.push(text)
}

export function mapNativeStreamChunk(
    chunk: unknown,
    opts: {
        interruptOn: boolean
        showToolCalls: boolean
        showReasoning: boolean
        showSubagents?: boolean
        seenToolStarts: Set<string>
    },
): Array<string | DeepAgentInterrupt | DeepAgentToolEvent | DeepAgentReasoningEvent | DeepAgentSubagentEvent> {
    const out: Array<string | DeepAgentInterrupt | DeepAgentToolEvent | DeepAgentReasoningEvent | DeepAgentSubagentEvent> = []
    const showSubagents = opts.showSubagents === true

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
            pushTextFromChunk(data, showSubagents, out)
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

    pushTextFromChunk(chunk, showSubagents, out)
    return out
}
