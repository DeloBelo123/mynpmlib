import { SupabaseTable } from "@delofarag/supabase-utils"
import { createSimpleChain } from "./helpers"
import { getLLM } from "./llm/llms"
import {
    BaseCheckpointSaver,
    BaseMessage,
    HumanMessage,
    AIMessage,
    SystemMessage,
    BaseChatModel,
    type Checkpoint,
    type CheckpointMetadata,
    type LangGraphRunnableConfig,
    type RunnableConfig,
    type CheckpointTuple,
    type CheckpointListOptions,
    type PendingWrite,
    type ChannelVersions,
    StringOutputParser,
    ChatPromptTemplate
} from "../imports"

import {
    ToolMessage,
} from "@langchain/core/messages"


/** Rolle einer Chat-Message im Checkpoint (Nach Json aus der DB oft Plain-Objects). */
export type CheckpointChatRole = "human" | "ai" | "system" | "tool" | "other"

export interface SupabaseCheckpointRow {
    thread_id: string
    checkpoint: Checkpoint
    metadata: CheckpointMetadata
    created_at?: string
    updated_at?: string
}

/** Nachrichten-Channel aus einem gespeicherten Checkpoint (meist `channel_values.messages`). */
export function getMessagesArrayFromCheckpoint(checkpoint: Checkpoint | undefined | null): unknown[] {
    if (!checkpoint?.channel_values) return []
    const msgs = (checkpoint.channel_values as Record<string, unknown>).messages
    return Array.isArray(msgs) ? msgs : []
}

export function checkpointMessageBody(message: unknown): string {
    if (message === null || message === undefined) return ""
    const m = message as Record<string, unknown>
    const rawContent =
        m.content ??
        (m.kwargs && typeof m.kwargs === "object"
            ? (m.kwargs as Record<string, unknown>).content
            : undefined) ??
        ""
    if (typeof rawContent === "string") return rawContent
    if (Array.isArray(rawContent))
        return rawContent
            .map((part: unknown) =>
                typeof part === "object" && part !== null && "text" in part
                    ? String((part as { text?: unknown }).text ?? "")
                    : JSON.stringify(part),
            )
            .join("")
    return JSON.stringify(rawContent)
}

/** Erkennung Human / AI / System / Tool — funktioniert mit LangChain-Klassen und serialisierten JSON-Objekten. */
export function checkpointMessageRole(message: unknown): CheckpointChatRole {
    if (message === null || message === undefined || typeof message !== "object") return "other"

    const m = message as BaseMessage
    if (m instanceof HumanMessage) return "human"
    if (m instanceof AIMessage) return "ai"
    if (m instanceof SystemMessage) return "system"
    if (m instanceof ToolMessage) return "tool"

    const raw = message as Record<string, unknown>
    const kw = raw.kwargs && typeof raw.kwargs === "object" ? (raw.kwargs as Record<string, unknown>) : {}

    const t =
        typeof (raw as any)._getType === "function"
            ? (raw as any)._getType()
            : typeof raw.type === "string"
              ? raw.type
              : undefined
    if (t === "human" || t === "user") return "human"
    if (t === "ai" || t === "assistant") return "ai"
    if (t === "system") return "system"
    if (t === "tool") return "tool"

    const idArr = raw.id as unknown
    const idLast = Array.isArray(idArr) ? idArr[idArr.length - 1] : undefined
    if (idLast === "HumanMessage") return "human"
    if (idLast === "AIMessage" || idLast === "AIMessageChunk") return "ai"
    if (idLast === "SystemMessage") return "system"
    if (idLast === "ToolMessage") return "tool"

    const role = (kw.role ?? raw.role) as string | undefined
    if (role === "human" || role === "user") return "human"
    if (role === "ai" || role === "assistant") return "ai"
    if (role === "system") return "system"
    if (role === "tool") return "tool"

    return "other"
}

function checkpointToolDisplayName(message: unknown): string | undefined {
    if (message === null || message === undefined || typeof message !== "object") return undefined
    if (message instanceof ToolMessage) return message.name ?? undefined
    const raw = message as Record<string, unknown>
    const kw = raw.kwargs && typeof raw.kwargs === "object" ? (raw.kwargs as Record<string, unknown>) : {}
    const name =
        typeof raw.name === "string"
            ? raw.name
            : typeof kw.name === "string"
              ? kw.name
              : undefined
    return name || undefined
}

/**
 * Für Prompts/System-Kontext: klare Labels, Reihenfolge wie im Checkpoint-Channel `messages`,
 * ohne extra DB-Spalte `conversation`.
 */
export function formatCheckpointMessagesForLLM(messages: unknown[]): string {
    if (!messages.length) return ""
    const blocks: string[] = []
    for (const msg of messages) {
        const role = checkpointMessageRole(msg)
        const body = checkpointMessageBody(msg).trim()

        let heading: string
        if (role === "human") heading = "**User** (human message)"
        else if (role === "ai") heading = "**Assistant** (AI message)"
        else if (role === "system") heading = "**System**"
        else if (role === "tool") {
            const toolName = checkpointToolDisplayName(msg)
            heading = toolName ? `**Tool**: \`${toolName}\`` : "**Tool result**"
        } else heading = "**Other / unknown role**"

        if (!body) continue
        blocks.push(`${heading}\n\n${body}`)
    }
    return blocks.join("\n\n---\n\n")
}


/**
 * needs testing!!!
 */
export class SupabaseCheckpointSaver extends BaseCheckpointSaver {
    private table: SupabaseTable<SupabaseCheckpointRow>

    constructor(supabaseTable: SupabaseTable<SupabaseCheckpointRow>) {
        super()
        this.table = supabaseTable
    }

    /** Messages aus gespeicherter `checkpoint`-Spalte (`channel_values.messages`). */
    async getCheckpointMessages(threadId: string): Promise<unknown[]> {
        const rows = await this.table.select({
            columns: ["checkpoint"],
            where: [{ column: "thread_id", is: threadId }],
            limited_to: 1,
        })
        const ck = rows[0]?.checkpoint as Checkpoint | undefined
        return getMessagesArrayFromCheckpoint(ck)
    }

    /** Lesbarer Kontext für Prompts (aus Checkpoint, keine `conversation`-Spalte). */
    async getConversationAsLLMContext(threadId: string): Promise<string> {
        const messages = await this.getCheckpointMessages(threadId)
        return formatCheckpointMessagesForLLM(messages)
    }
    
    async put(
        config: LangGraphRunnableConfig,
        checkpoint: Checkpoint,
        metadata: CheckpointMetadata,
        newVersions: ChannelVersions,
    ): Promise<RunnableConfig> {
        if (!checkpoint) return config
        const threadId = config.configurable?.thread_id || "default"
        const now = new Date().toISOString()
        
        const existingRows = await this.table.select({
            columns: ["created_at"],
            where: [{ column: "thread_id", is: threadId }],
            limited_to: 1,
        })
        const existing = existingRows[0]

        const createdAt = existing?.created_at || now
        
        await this.table.upsert({
            where: [{ column: "thread_id", is: threadId }],
            upsert: {
                checkpoint: checkpoint,
                metadata: metadata,
                created_at: createdAt,
                updated_at: now,
            },
            onConflict: "thread_id",
        })

        const checkpoint_ns = config.configurable?.checkpoint_ns ?? ""

        return {
            configurable: {
                thread_id: threadId,
                checkpoint_ns,
                checkpoint_id: checkpoint.id,
            },
        }
    }
    
    async get(config: LangGraphRunnableConfig): Promise<Checkpoint | undefined> {
        const threadId = config.configurable?.thread_id || "default"
        
        const rows = await this.table.select({
            columns: ["checkpoint"],
            where: [{ column: "thread_id", is: threadId }],
            limited_to: 1,
        })

        return rows[0]?.checkpoint
    }
    
    async *list(config: LangGraphRunnableConfig, options?: CheckpointListOptions): AsyncGenerator<CheckpointTuple> {
        const threadId = config.configurable?.thread_id
        if (!threadId) return
        
        const data = await this.table.select({
            columns: ["checkpoint", "metadata"],
            where: [{ column: "thread_id", is: threadId }],
        })

        const checkpoint_ns = config.configurable?.checkpoint_ns ?? ""

        for (const row of data || []) {
            const ckpt = row.checkpoint as Checkpoint | undefined
            if (!ckpt) continue
            yield {
                config: {
                    configurable: {
                        thread_id: threadId,
                        checkpoint_ns,
                        checkpoint_id: ckpt.id,
                    },
                },
                checkpoint: ckpt,
                metadata: (row.metadata ?? {}) as CheckpointMetadata,
            }
        }
    }
    
    async delete(config: LangGraphRunnableConfig): Promise<void> {
        const threadId = config.configurable?.thread_id || "default"
        
        await this.table.delete({
            where: [{ column: "thread_id", is: threadId }]
        })
    }
    
    async getTuple(config: LangGraphRunnableConfig): Promise<CheckpointTuple | undefined> {
        const threadId = config.configurable?.thread_id || "default"
        const checkpoint_ns = config.configurable?.checkpoint_ns ?? ""

        const rows = await this.table.select({
            columns: ["checkpoint", "metadata"],
            where: [{ column: "thread_id", is: threadId }],
            limited_to: 1,
        })
        const row = rows[0]
        const checkpoint = row?.checkpoint as Checkpoint | undefined
        if (!checkpoint) return undefined

        return {
            config: {
                configurable: {
                    thread_id: threadId,
                    checkpoint_ns,
                    checkpoint_id: checkpoint.id,
                },
            },
            checkpoint,
            metadata: (row.metadata ?? {}) as CheckpointMetadata,
        }
    }
    
    async putWrites(_config: RunnableConfig, _writes: PendingWrite[], _taskId: string): Promise<void> {
        // pending writes brauchen wir nicht separat zu persistieren -
        // der finale Checkpoint kommt sowieso über put() rein
        return
    }
    
    async deleteThread(threadId: string): Promise<void> {
        await this.table.delete({
            where: [{ column: "thread_id", is: threadId }]
        })
    }
}

interface SmartCheckpointSaverOptions {
    messagesBeforeSummary?: number
    maxSummaries?: number
    llm?: BaseChatModel
    debug?: boolean
}
/**
 * CONSTRUCTOR:
 * @example
 * constructor(
        checkpointSaver: BaseCheckpointSaver,
        {
            messagesBeforeSummary = 12,
            maxSummaries = 7,
            llm = getLLM({ provider:"openrouter", model: "openai/gpt-5.4-mini"}),
            debug = false
        }: SmartCheckpointSaverOptions = {}
    ) {
        super()
        this.checkpointSaver = checkpointSaver
        this.messagesBeforeSummary = messagesBeforeSummary
        this.maxSummaries = maxSummaries
        this.llm = llm
        this.debug = debug
    }
 */
export class SmartCheckpointSaver extends BaseCheckpointSaver {
    private checkpointSaver: BaseCheckpointSaver
    private messagesBeforeSummary: number
    private maxSummaries: number
    private llm: BaseChatModel
    private debug: boolean
    private lastDebugState: string | undefined

    constructor(
        checkpointSaver: BaseCheckpointSaver,{
            messagesBeforeSummary = 12,
            maxSummaries = 7,
            llm = getLLM({ provider:"openrouter", model: "openai/gpt-5.4-mini"}),
            debug = false
        }: SmartCheckpointSaverOptions = {}
    ) {
        super()
        this.checkpointSaver = checkpointSaver
        this.messagesBeforeSummary = messagesBeforeSummary
        this.maxSummaries = maxSummaries
        this.llm = llm
        this.debug = debug
    }
    
    private getMessageRole(message: BaseMessage): "human" | "ai" | "system" | "other" {
        const r = checkpointMessageRole(message)
        if (r === "tool" || r === "other") return "other"
        return r
    }

    private getMessageContent(message: BaseMessage): string {
        return checkpointMessageBody(message)
    }

    /**
     * Zählt User/AI Messages (ignoriert System-Messages)
     */
    private countChatMessages(messages: BaseMessage[]): number {
        return messages.filter(msg => {
            const role = this.getMessageRole(msg)
            return role === "human" || role === "ai"
        }).length
    }
    
    /**
     * Findet alle System-Messages die Zusammenfassungen sind
     */
    private findSummaryMessages(messages: BaseMessage[]): Array<{ index: number, message: BaseMessage }> {
        const summaries: Array<{ index: number, message: BaseMessage }> = []
        messages.forEach((msg, index) => {
            if (this.getMessageRole(msg) === "system" && this.getMessageContent(msg).includes("Zusammenfassung")) {
                summaries.push({ index, message: msg })
            }
        })
        return summaries
    }
    
    /**
     * Konvertiert Messages zu Text für Summarization
     */
    private messagesToText(messages: BaseMessage[]): string {
        return messages.map(msg => {
            const role = this.getMessageRole(msg)
            const label = role === "human" ? "User" : role === "ai" ? "Assistant" : "System"
            return `${label}: ${this.getMessageContent(msg)}`
        }).join('\n\n')
    }
    

    private async applySmartSummarization(checkpoint: Checkpoint): Promise<Checkpoint> {
        // Guard: Wenn checkpoint undefined ist, gib ihn zurück
        if (!checkpoint) {
            return checkpoint
        }
        
        // Messages sind in channel_values gespeichert
        const channelValues = checkpoint.channel_values || {}
        const messages = (channelValues.messages as BaseMessage[]) || []
        
        // Finde alle Zusammenfassungs-System-Messages
        const summaryMessages = this.findSummaryMessages(messages)
        
        // Finde den Index der letzten Zusammenfassung (falls vorhanden)
        const lastSummaryIndex = summaryMessages.length > 0 
            ? summaryMessages[summaryMessages.length - 1].index 
            : -1
        
        // Finde die Messages NACH der letzten Zusammenfassung
        const messagesAfterLastSummary = messages.slice(lastSummaryIndex + 1)
        const chatMessagesAfterLastSummary = messagesAfterLastSummary.filter(msg => {
            const role = this.getMessageRole(msg)
            return role === "human" || role === "ai"
        })
        const lastChatMessageRole = chatMessagesAfterLastSummary.length > 0
            ? this.getMessageRole(chatMessagesAfterLastSummary[chatMessagesAfterLastSummary.length - 1])
            : "other"
        
        // Zähle nur User/AI Messages NACH der letzten Zusammenfassung
        const chatMessageCount = chatMessagesAfterLastSummary.length
        if (this.debug) {
            const missingUntilNextSummary = Math.max(0, this.messagesBeforeSummary - chatMessageCount)
            const debugState = `${summaryMessages.length}:${chatMessageCount}:${missingUntilNextSummary}:${lastChatMessageRole}`
            if (debugState !== this.lastDebugState) {
                console.log(`[SmartCheckpointSaver] Chat messages since last summary: ${chatMessageCount}`)
                console.log(`[SmartCheckpointSaver] Messages until next summary: ${missingUntilNextSummary}`)
                this.lastDebugState = debugState
            }
        }
        
        // Wenn noch nicht genug Messages nach der letzten Zusammenfassung, keine Summarization
        if (chatMessageCount < this.messagesBeforeSummary || lastChatMessageRole !== "ai") {
            return checkpoint
        }
        
        // Finde die Indizes der letzten X User/AI Messages NACH der letzten Zusammenfassung die zusammengefasst werden sollen
        const indicesToSummarize: number[] = []
        const messagesToSummarize: BaseMessage[] = []
        let chatCount = 0
        
        // Gehe rückwärts durch Messages NACH der letzten Zusammenfassung
        for (let i = messagesAfterLastSummary.length - 1; i >= 0 && chatCount < this.messagesBeforeSummary; i--) {
            const msg = messagesAfterLastSummary[i]
            const role = this.getMessageRole(msg)
            if (role === "human" || role === "ai") {
                const originalIndex = lastSummaryIndex + 1 + i // Original-Index im messages Array
                indicesToSummarize.unshift(originalIndex) // Am Anfang einfügen für korrekte Reihenfolge
                messagesToSummarize.unshift(msg) // Am Anfang einfügen für korrekte Reihenfolge
                chatCount++
            }
        }
        
        if (messagesToSummarize.length === 0) {
            return checkpoint
        }
        
        // Erstelle Zusammenfassung
        const conversationText = this.messagesToText(messagesToSummarize)
        const summary = await chatSummarizer({
            conversation: conversationText,
            llm: this.llm,
            maxWords: 150
        })
        if (this.debug) {
            console.log(`Summary erstellt beim SmartCheckpointSaver: ${summary}`)
        }
        
        // Erstelle neue System-Message mit Zusammenfassung
        const summarySystemMessage = new SystemMessage(
            `Zusammenfassung der vorherigen Konversation:\n${summary}`
        )
        
        // Entferne die Messages die zusammengefasst wurden (verwende Indizes)
        const remainingMessages = messages.filter((_: BaseMessage, index: number) => 
            !indicesToSummarize.includes(index)
        )
        
        // Finde die Position der letzten Zusammenfassung im remainingMessages Array
        // (Die Indizes haben sich verschoben, aber die letzte Zusammenfassung sollte noch da sein)
        const remainingSummaryMessages = this.findSummaryMessages(remainingMessages)
        const lastSummaryIndexInRemaining = remainingSummaryMessages.length > 0 
            ? remainingSummaryMessages[remainingSummaryMessages.length - 1].index 
            : -1
        
        // Füge Zusammenfassung direkt nach der letzten Zusammenfassung ein
        // Wenn keine Zusammenfassung vorhanden, füge am Anfang ein (nach System-Messages)
        let newMessages: BaseMessage[]
        if (lastSummaryIndexInRemaining >= 0) {
            const beforeSummary = remainingMessages.slice(0, lastSummaryIndexInRemaining + 1)
            const afterSummary = remainingMessages.slice(lastSummaryIndexInRemaining + 1)
            newMessages = [...beforeSummary, summarySystemMessage, ...afterSummary]
        } else {
            // Keine Zusammenfassung vorhanden: Füge nach System-Messages ein
            const systemMessages = remainingMessages.filter((msg: BaseMessage) => this.getMessageRole(msg) === "system")
            const nonSystemMessages = remainingMessages.filter((msg: BaseMessage) => this.getMessageRole(msg) !== "system")
            newMessages = [...systemMessages, summarySystemMessage, ...nonSystemMessages]
        }
        
        // Prüfe ob zu viele Zusammenfassungen vorhanden sind
        const allSummaries = this.findSummaryMessages(newMessages)
        if (allSummaries.length > this.maxSummaries) {
            // Entferne die älteste Zusammenfassung
            const oldestSummary = allSummaries[0]
            const finalMessages = newMessages.filter((_: BaseMessage, index: number) => index !== oldestSummary.index)
            
            return {
                ...checkpoint,
                channel_values: {
                    ...channelValues,
                    messages: finalMessages
                }
            }
        }
        
        return {
            ...checkpoint,
            channel_values: {
                ...channelValues,
                messages: newMessages
            }
        }
    }
    
    async put(config: LangGraphRunnableConfig, checkpoint: Checkpoint, metadata: CheckpointMetadata, newVersions: ChannelVersions): Promise<RunnableConfig> {
        // Guard: Wenn checkpoint undefined ist, gib ihn direkt weiter
        if (!checkpoint) {
            return await this.checkpointSaver.put(config, checkpoint, metadata, newVersions)
        }
        
        // Wende Smart Summarization an
        const optimizedCheckpoint = await this.applySmartSummarization(checkpoint)
        
        // Speichere im unterliegenden CheckpointSaver
        return await this.checkpointSaver.put(config, optimizedCheckpoint, metadata, newVersions)
    }
    
    async get(config: LangGraphRunnableConfig): Promise<Checkpoint | undefined> {
        return await this.checkpointSaver.get(config)
    }
    
    async *list(config: LangGraphRunnableConfig, options?: CheckpointListOptions): AsyncGenerator<CheckpointTuple> {
        yield* this.checkpointSaver.list(config, options)
    }
    
    async delete(config: LangGraphRunnableConfig): Promise<void> {
        const threadId = config.configurable?.thread_id || "default"
        return await this.checkpointSaver.deleteThread(threadId)
    }
    
    
    async getTuple(config: LangGraphRunnableConfig): Promise<CheckpointTuple | undefined> {
        return await this.checkpointSaver.getTuple(config)
    }
    
    async putWrites(config: RunnableConfig, writes: PendingWrite[], taskId: string): Promise<void> {
        // putWrites wird für Channel-Updates verwendet, nicht für vollständige Checkpoints
        // Summarization wird nur in put() angewendet, wo vollständige Checkpoints gespeichert werden
        // Daher delegieren wir direkt an den unterliegenden Saver
        await this.checkpointSaver.putWrites(config, writes, taskId)
    }
    
    async deleteThread(threadId: string): Promise<void> {
        return await this.checkpointSaver.deleteThread(threadId)
    }
}

/**
 * fasst eine Chat-Konversation zwischen User und Assistant zusammen
 */
export async function chatSummarizer({
    conversation,
    fokuss,
    llm,
    maxWords = 150
}: {
    conversation: string,
    fokuss?: string,
    llm: BaseChatModel,
    maxWords?: number
}): Promise<string> {
    const focusMessage: Array<["system", string]> = fokuss 
        ? [["system", `Fokussiere dich besonders auf die folgenden Themen:\n${fokuss}`]]
        : []
    
    const prompt = ChatPromptTemplate.fromMessages([
        ["system", `Du fasst eine Chat-Konversation zwischen User und Assistant zusammen.
          WICHTIG:
          - Behalte ALLE wichtigen Fakten: Namen, Präferenzen, Entscheidungen, Vereinbarungen
          - Behalte chronologischen Kontext wo relevant für Verständnis
          - Fasse auf max. ${maxWords} Wörter zusammen
          - Format: Kurze, prägnante Zusammenfassung ohne Bullet-Points
          - Ignoriere Small-Talk, fokussiere auf inhaltliche Punkte`],
        ...focusMessage,
        ["human", "{conversation}"]
    ])
    
    const chain = createSimpleChain(prompt, llm, new StringOutputParser())
    const result = await chain.invoke({ conversation })
    return typeof result === "string" ? result : String(result)
}