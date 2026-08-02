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

/** Tool-Calls einer AI-Message — funktioniert mit LangChain-Klassen, serialisierten Objekten und OpenAI-Format in additional_kwargs. */
export function checkpointToolCalls(message: unknown): Array<{ name?: string, args?: unknown, id?: string }> {
    if (message === null || message === undefined || typeof message !== "object") return []
    const raw = message as Record<string, unknown>
    const kw = raw.kwargs && typeof raw.kwargs === "object" ? (raw.kwargs as Record<string, unknown>) : {}

    const direct = (raw.tool_calls ?? kw.tool_calls) as unknown
    if (Array.isArray(direct) && direct.length > 0) {
        return direct.map((tc: Record<string, unknown>) => ({
            name: typeof tc?.name === "string" ? tc.name : undefined,
            args: tc?.args,
            id: typeof tc?.id === "string" ? tc.id : undefined,
        }))
    }

    const ak = (raw.additional_kwargs ?? kw.additional_kwargs) as Record<string, unknown> | undefined
    const akCalls = ak && Array.isArray(ak.tool_calls) ? (ak.tool_calls as Array<Record<string, unknown>>) : []
    return akCalls.map(tc => {
        const fn = tc?.function as Record<string, unknown> | undefined
        return {
            name: typeof fn?.name === "string" ? fn.name : undefined,
            args: fn?.arguments,
            id: typeof tc?.id === "string" ? tc.id : undefined,
        }
    })
}

/** Grobe Token-Schätzung (~4 Zeichen pro Token) über Message-Inhalte inkl. Tool-Calls — keine Tokenizer-Dependency. */
export function approxCheckpointTokens(messages: unknown[]): number {
    let chars = 0
    for (const msg of messages) {
        chars += checkpointMessageBody(msg).length
        const toolCalls = checkpointToolCalls(msg)
        if (toolCalls.length > 0) {
            try { chars += JSON.stringify(toolCalls).length } catch { chars += 100 }
        }
        chars += 20 // Rollen-/Struktur-Overhead pro Message
    }
    return Math.ceil(chars / 4)
}

/**
 * Für Prompts/System-Kontext: klare Labels, Reihenfolge wie im Checkpoint-Channel `messages`,
 * ohne extra DB-Spalte `conversation`.
 */
export function formatCheckpointMessagesForLLM(messages: unknown[], maxToolResultChars?: number): string {
    if (!messages.length) return ""
    const blocks: string[] = []
    for (const msg of messages) {
        const role = checkpointMessageRole(msg)
        let body = checkpointMessageBody(msg).trim()

        let heading: string
        if (role === "human") heading = "**User** (human message)"
        else if (role === "ai") heading = "**Assistant** (AI message)"
        else if (role === "system") heading = "**System**"
        else if (role === "tool") {
            const toolName = checkpointToolDisplayName(msg)
            heading = toolName ? `**Tool**: \`${toolName}\`` : "**Tool result**"
        } else heading = "**Other / unknown role**"

        if (role === "tool" && maxToolResultChars && body.length > maxToolResultChars) {
            body = `${body.slice(0, maxToolResultChars)}\n…[gekürzt]`
        }

        // Tool-Calls einer AI-Message kompakt mit ausgeben, damit der agentic Trace sichtbar bleibt
        if (role === "ai") {
            const toolCalls = checkpointToolCalls(msg)
            if (toolCalls.length > 0) {
                const callLines = toolCalls.map(tc => {
                    let args: string
                    try { args = typeof tc.args === "string" ? tc.args : JSON.stringify(tc.args ?? {}) } catch { args = "…" }
                    if (args.length > 300) args = `${args.slice(0, 300)}…`
                    return `→ Tool-Call: \`${tc.name ?? "unknown"}\` mit ${args}`
                }).join("\n")
                body = body ? `${body}\n\n${callLines}` : callLines
            }
        }

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
    /** Primärer Trigger: approx. Token-Budget über ALLE Messages (inkl. Tool-Results). Default 24000 */
    maxTokens?: number
    /** Sekundärer Trigger: Anzahl User/AI Messages seit der letzten Zusammenfassung. Default 12 */
    messagesBeforeSummary?: number
    /** Verbatim-Tail: so viele der letzten User/AI Messages bleiben wörtlich erhalten (auf Tool-Unit-Grenzen ausgerichtet). Default 4 */
    keepLastMessages?: number
    /** Max. Wörter der Zusammenfassung. Default 300 */
    maxSummaryWords?: number
    /** Tool-Results werden im Summarizer-Input auf diese Zeichenzahl gekürzt. Default 3000 */
    maxToolResultChars?: number
    /** LLM für die Zusammenfassung. Default (lazy): openrouter openai/gpt-5.4-mini */
    llm?: BaseChatModel
    debug?: boolean
}

const SMART_SUMMARY_FLAG = "__smart_summary"
const SMART_SUMMARY_PREFIX = "Zusammenfassung der vorherigen Konversation:"

/**
 * Wrapper um einen beliebigen CheckpointSaver, der beim Speichern alte Messages
 * in EINE rollierende Zusammenfassung konsolidiert (agentic-tauglich: Tool-Calls
 * und Tool-Results werden mitgezählt, mitsummarized und nie auseinandergerissen).
 */
export class SmartCheckpointSaver extends BaseCheckpointSaver {
    private checkpointSaver: BaseCheckpointSaver
    private maxTokens: number
    private messagesBeforeSummary: number
    private keepLastMessages: number
    private maxSummaryWords: number
    private maxToolResultChars: number
    private llm: BaseChatModel | undefined
    private debug: boolean
    private lastDebugState: string | undefined

    constructor(
        checkpointSaver: BaseCheckpointSaver,{
            maxTokens = 24_000,
            messagesBeforeSummary = 12,
            keepLastMessages = 4,
            maxSummaryWords = 300,
            maxToolResultChars = 3000,
            llm,
            debug = false
        }: SmartCheckpointSaverOptions = {}
    ) {
        super()
        this.checkpointSaver = checkpointSaver
        this.maxTokens = maxTokens
        this.messagesBeforeSummary = messagesBeforeSummary
        this.keepLastMessages = keepLastMessages
        this.maxSummaryWords = maxSummaryWords
        this.maxToolResultChars = maxToolResultChars
        this.llm = llm
        this.debug = debug
    }

    /** Default-LLM lazy erzeugen — so ist kein OPENROUTER_API_KEY nötig, solange nie summarized wird oder ein eigenes LLM übergeben wurde. */
    private getSummaryLLM(): BaseChatModel {
        if (!this.llm) {
            this.llm = getLLM({ provider: "openrouter", model: "openai/gpt-5.4-mini" })
        }
        return this.llm
    }

    /** Erkennt die Summary-System-Message über das additional_kwargs-Flag; Fallback auf den Text-Prefix für alte persistierte Threads. */
    private isSummaryMessage(message: BaseMessage): boolean {
        if (checkpointMessageRole(message) !== "system") return false
        const raw = message as unknown as Record<string, unknown>
        const kw = raw.kwargs && typeof raw.kwargs === "object" ? (raw.kwargs as Record<string, unknown>) : {}
        const ak = (raw.additional_kwargs ?? kw.additional_kwargs) as Record<string, unknown> | undefined
        if (ak && typeof ak === "object" && ak[SMART_SUMMARY_FLAG]) return true
        return checkpointMessageBody(message).startsWith(SMART_SUMMARY_PREFIX)
    }

    private countChatMessages(messages: BaseMessage[]): number {
        return messages.filter(msg => {
            const role = checkpointMessageRole(msg)
            return role === "human" || role === "ai"
        }).length
    }

    /**
     * Gruppiert Messages in atomare Units: eine AI-Message mit tool_calls bildet mit
     * allen direkt folgenden Tool-Messages EINE Unit. Schnitte passieren nur an
     * Unit-Grenzen — orphaned Tool-Messages sind damit strukturell unmöglich.
     */
    private groupIntoUnits(messages: BaseMessage[]): BaseMessage[][] {
        const units: BaseMessage[][] = []
        let i = 0
        while (i < messages.length) {
            const msg = messages[i]
            const role = checkpointMessageRole(msg)
            if (role === "ai" && checkpointToolCalls(msg).length > 0) {
                const unit: BaseMessage[] = [msg]
                let j = i + 1
                while (j < messages.length && checkpointMessageRole(messages[j]) === "tool") {
                    unit.push(messages[j])
                    j++
                }
                units.push(unit)
                i = j
            } else {
                units.push([msg])
                i++
            }
        }
        return units
    }


    private async applySmartSummarization(checkpoint: Checkpoint): Promise<Checkpoint> {
        if (!checkpoint) {
            return checkpoint
        }

        const channelValues = checkpoint.channel_values || {}
        const messages = (channelValues.messages as BaseMessage[]) || []
        if (messages.length === 0) {
            return checkpoint
        }

        // Nur am Ende eines abgeschlossenen Turns summarizen: letzte Message muss eine
        // AI-Antwort OHNE pending tool_calls sein (sonst sind wir mitten im Tool-Loop)
        const lastMessage = messages[messages.length - 1]
        if (checkpointMessageRole(lastMessage) !== "ai" || checkpointToolCalls(lastMessage).length > 0) {
            return checkpoint
        }

        // Führende System-Messages (z.B. Agent-Systemprompt) bleiben immer unangetastet
        let headEnd = 0
        while (
            headEnd < messages.length &&
            checkpointMessageRole(messages[headEnd]) === "system" &&
            !this.isSummaryMessage(messages[headEnd])
        ) {
            headEnd++
        }
        const head = messages.slice(0, headEnd)

        // Bisherige Summary-Messages rausziehen — sie werden in die neue, konsolidierte Summary eingespeist
        const previousSummaries = messages.slice(headEnd).filter(msg => this.isSummaryMessage(msg))
        const rest = messages.slice(headEnd).filter(msg => !this.isSummaryMessage(msg))

        // Trigger: Token-Budget überschritten ODER genug Chat-Messages seit der letzten Summary
        const totalTokens = approxCheckpointTokens(messages)
        const chatMessageCount = this.countChatMessages(rest)
        const shouldSummarize = totalTokens > this.maxTokens || chatMessageCount >= this.messagesBeforeSummary

        if (this.debug) {
            const debugState = `${previousSummaries.length}:${chatMessageCount}:${totalTokens}:${shouldSummarize}`
            if (debugState !== this.lastDebugState) {
                console.log(`[SmartCheckpointSaver] ~${totalTokens} tokens, ${chatMessageCount} chat messages since last summary (trigger: >${this.maxTokens} tokens or >=${this.messagesBeforeSummary} messages)`)
                this.lastDebugState = debugState
            }
        }

        if (!shouldSummarize) {
            return checkpoint
        }

        // Auswahl an Unit-Grenzen: die letzten keepLastMessages Chat-Messages bleiben
        // wörtlich erhalten, alles Ältere wird zusammengefasst
        const units = this.groupIntoUnits(rest)
        let cutIndex = units.length
        let keptChat = 0
        while (cutIndex > 0 && keptChat < this.keepLastMessages) {
            cutIndex--
            keptChat += this.countChatMessages(units[cutIndex])
        }
        const unitsToSummarize = units.slice(0, cutIndex)
        const messagesToSummarize = unitsToSummarize.flat()
        if (messagesToSummarize.length === 0) {
            return checkpoint
        }

        // Summarizer-Input: bisherige Summary + neuer Verlauf inkl. Tool-Calls/-Results (gekürzt)
        const conversationText = formatCheckpointMessagesForLLM(messagesToSummarize, this.maxToolResultChars)
        const previousSummaryText = previousSummaries.map(msg => checkpointMessageBody(msg)).join("\n\n")
        const summarizerInput = previousSummaryText
            ? `Bisherige Zusammenfassung:\n${previousSummaryText}\n\n---\n\nNeuer Verlauf:\n${conversationText}`
            : conversationText

        // Fail-Open: ein Summarizer-Fehler darf nie den Agent-Run killen — dann unsummarized speichern
        let summary: string
        try {
            summary = await chatSummarizer({
                conversation: summarizerInput,
                llm: this.getSummaryLLM(),
                maxWords: this.maxSummaryWords
            })
        } catch (error) {
            if (this.debug) {
                console.warn(`[SmartCheckpointSaver] Summarization failed, saving checkpoint unsummarized:`, error)
            }
            return checkpoint
        }

        const summarySystemMessage = new SystemMessage({
            content: `${SMART_SUMMARY_PREFIX}\n${summary}`,
            additional_kwargs: { [SMART_SUMMARY_FLAG]: true }
        })

        const newMessages = [...head, summarySystemMessage, ...units.slice(cutIndex).flat()]

        if (this.debug) {
            const tokensAfter = approxCheckpointTokens(newMessages)
            console.log(`[SmartCheckpointSaver] Summarized ${unitsToSummarize.length} units (${messagesToSummarize.length} messages): ~${totalTokens} -> ~${tokensAfter} tokens`)
            console.log(`[SmartCheckpointSaver] Summary: ${summary}`)
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
 * Fasst einen Konversations-Verlauf zusammen — agentic-tauglich: Tool-Calls und deren
 * Ergebnisse werden mitverdichtet, damit ein Agent mit reduziertem Kontext nahtlos weiterarbeiten kann.
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
        ["system", `Du fasst den bisherigen Verlauf einer Konversation zwischen User und einem AI-Assistant/-Agent zusammen (inklusive eventueller Tool-Aufrufe und deren Ergebnisse). Die Zusammenfassung ersetzt den Verlauf im Kontext — der Assistant muss damit nahtlos weiterarbeiten können.
          Die Zusammenfassung MUSS enthalten (soweit im Verlauf vorhanden):
          1. Ziel/Auftrag des Users
          2. Alle wichtigen Fakten: Namen, Zahlen, IDs, Präferenzen, Entscheidungen, Vereinbarungen
          3. Alle Termine, Fristen und geplante Ereignisse (z.B. Kündigungsfristen, Umzüge, Deadlines, vereinbarte Zeitpunkte) — auch wenn sie nur einmal erwähnt wurden
          4. Ausgeführte Aktionen: welche Tools mit welchem Kern-Input aufgerufen wurden und was das Ergebnis war (kompakt, 1 Zeile pro Aktion)
          5. Aktueller Stand und offene Punkte / nächste Schritte
          6. Constraints und Vereinbarungen, die weiterhin gelten
          WICHTIG:
          - Du bist NICHT Teil der Konversation. Antworte NIEMALS auf Fragen aus dem Verlauf — deine Ausgabe ist ausschliesslich die Zusammenfassung des Verlaufs
          - Falls eine "Bisherige Zusammenfassung" mitgegeben wird: konsolidiere sie mit dem neuen Verlauf zu EINER Zusammenfassung. Fakten, Termine und Fristen aus der bisherigen Zusammenfassung NIE verwerfen, solange sie nicht explizit erledigt oder überholt sind
          - Bei Widersprüchen zwischen bisheriger Zusammenfassung und neuem Verlauf gilt IMMER der neue Verlauf (er ist aktueller)
          - Behalte chronologischen Kontext wo relevant für Verständnis
          - Fasse auf max. ${maxWords} Wörter zusammen
          - Ignoriere Small-Talk, fokussiere auf inhaltliche Punkte`],
        ...focusMessage,
        ["human", `Fasse den folgenden Verlauf zusammen (NICHT beantworten, nur zusammenfassen):\n\n<verlauf>\n{conversation}\n</verlauf>`]
    ])

    const chain = createSimpleChain(prompt, llm, new StringOutputParser())
    const result = await chain.invoke({ conversation })
    return typeof result === "string" ? result : String(result)
}