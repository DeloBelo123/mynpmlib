import { z } from "zod/v4"
import { PromptTemplate } from "@langchain/core/prompts"
import { extractReasoningDelta, type InvokeInputBase, type OutputSchema, type ReasoningEvent } from "./chain"
import { DynamicStructuredTool} from "../imports"
import { BaseChatModel } from "../imports"
import { BaseCheckpointSaver } from "../imports"
import { createReactAgent } from "../imports"
import { HumanMessage} from "../imports"

import { structure } from "../magic-funcs/parsers/structure"
import { getLLM } from "../helpers/llm/llms"
import { buildMcpClient, buildMcpPromptBlock, type MCPServersInput } from "./tools/MCP"

async function resolveSystemPromptBlocks(
    blocks: Array<["system", string]>,
    promptVars?: Record<string, any>
): Promise<Array<["system", string]>> {
    if (!promptVars || Object.keys(promptVars).length === 0) {
        return blocks
    }
    const out: Array<["system", string]> = []
    for (const [role, text] of blocks) {
        try {
            const formatted = await PromptTemplate.fromTemplate(text).format(promptVars as Record<string, any>)
            out.push([role, formatted])
        } catch {
            out.push([role, text])
        }
    }
    return out
}

interface AgentProps<T extends OutputSchema | undefined = undefined>{
    tools: DynamicStructuredTool[]
    prompt?: string | Array<string>
    llm?: BaseChatModel
    output?: T
    checkpointer?: BaseCheckpointSaver
    /**
     * MCP-Server, deren Tools dem Agent zur Verfügung gestellt werden.
     * Pro invoke()/stream() wird ein frischer MultiServerMCPClient gebaut,
     * die Tools per getTools() geladen und der Client am Ende wieder geschlossen.
     */
    mcpServer?: MCPServersInput
}

/**
 * CONSTRUCTOR:
 * @example
 * constructor({
        prompt = `Du bist ein hilfreicher Assistent.`,
        llm = getLLM({ provider:"openrouter", model: "openai/gpt-5.4-mini"}),
        tools,
        output,
        checkpointer,
        mcpServer,
    }: AgentProps<T>) {
        this.prompt = typeof prompt === "string" ? [["system", prompt]] : Array.isArray(prompt) ? prompt.map((p:string)=>{
            if(typeof p === "string"){
                return ["system", p]
            } else {
                return p // weil wenn es kein string ist muss es ein MessagePlaceholder sein
            }
        }) : []
        this.prompt.push(["system",`WICHTIG:
            - Nutze Tools NUR wenn nötig
            - Nach jedem Tool-Call: Prüfe ob du die vollständige Antwort hast oder ob du noch weitere Tools brauchst
            - Wenn du die vollständige Antwort hast, gib sie direkt zurück und rufe keine weiteren Tools auf
            - Vermeide unnötige Tool-Calls, die dem user nichts bringen`])
        this.tools = tools
        this.llm = llm
        this.output = output
        this.checkpointer = checkpointer
        this.mcpServer = mcpServer
    }
 * @param output - Zod-Schema: beschreibt die Struktur des Rückgabewerts von .invoke()
 */
export class Agent<T extends OutputSchema | undefined = undefined> {
    private prompt: Array<["system", string]>
    private tools: DynamicStructuredTool[]
    private llm: BaseChatModel
    private output: T | undefined
    private agent: any
    private checkpointer: BaseCheckpointSaver | undefined
    private mcpServer: MCPServersInput | undefined
    private should_use_output: boolean = true

    constructor({
        prompt = `Du bist ein hilfreicher Assistent.`,
        llm = getLLM({ provider:"openrouter", model: "openai/gpt-5.4-mini"}),
        tools,
        output,
        checkpointer,
        mcpServer,
    }: AgentProps<T>) {
        this.prompt = typeof prompt === "string" ? [["system", prompt]] : Array.isArray(prompt) ? prompt.map((p:string)=>{
            if(typeof p === "string"){
                return ["system", p]
            } else {
                return p // weil wenn es kein string ist muss es ein MessagePlaceholder sein
            }
        }) : []
        this.prompt.push(["system",`WICHTIG:
            - Nutze Tools NUR wenn nötig
            - Nach jedem Tool-Call: Prüfe ob du die vollständige Antwort hast oder ob du noch weitere Tools brauchst
            - Wenn du die vollständige Antwort hast, gib sie direkt zurück und rufe keine weiteren Tools auf
            - Vermeide unnötige Tool-Calls, die dem user nichts bringen`])
        this.tools = tools
        this.llm = llm
        this.output = output
        this.checkpointer = checkpointer
        this.mcpServer = mcpServer
    }

    /** bruder ich weiss functional overloading tot aber muss hier sein! so kann sicher gesagt werden: wenn kein output gesetzt = string, wenn doch = z.infer<output>! */
    public async invoke(this: Agent<undefined>, invokeInput: InvokeInputBase & { thread_id?: string }): Promise<string>
    public async invoke<U extends OutputSchema>(this: Agent<U>, invokeInput: InvokeInputBase & { thread_id?: string }): Promise<z.infer<U>>
    public async invoke(invokeInput: InvokeInputBase & { thread_id?: string }): Promise<string | z.infer<OutputSchema>> {
        const { thread_id, debug, promptVars, ...variables } = invokeInput

        if(this.checkpointer && !thread_id) throw new Error("thread_id is required when using checkpointer, else no state is stored")
        if(!this.checkpointer && thread_id) console.warn("WARN: thread_id is provided but no checkpointer is set, so no state is stored")

        const humanMessages: HumanMessage[] = Object.entries(variables).map(
            ([key, value]) => new HumanMessage(`${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`)
        );

        const resolvedPrompt = await resolveSystemPromptBlocks(this.prompt, promptVars)
        const mcpBlock = buildMcpPromptBlock(this.mcpServer)
        const promptBlocks: Array<["system", string]> = mcpBlock ? [...resolvedPrompt, ["system", mcpBlock]] : resolvedPrompt

        const config = thread_id && this.checkpointer ? { configurable: { thread_id } } : undefined
        if(thread_id && !this.checkpointer) console.warn("thread_id wurde beim invoke des agenten mitgegeben aber kein checkpointer, somit wird nichts gespeichert und die thread_id ist gleichgültig")

        const mcpClient = buildMcpClient(this.mcpServer)
        try {
            const tools = mcpClient ? [...this.tools, ...await mcpClient.getTools()] : this.tools

            this.agent = createReactAgent({
                llm: this.llm as any,
                tools: tools as any,
                checkpointSaver: this.checkpointer as any,
                prompt: (state) => [
                    ...promptBlocks,
                    ...state.messages
                ]
            })

            const result = await this.agent.invoke({ messages: humanMessages } as any, config)
            if(debug) return result
            const lastMessage = result.messages[result.messages.length - 1]
            const raw = lastMessage?.content
            const content = typeof raw === "string" ? raw : (Array.isArray(raw) ? raw.map((c: any) => c?.text ?? c).join("") : String(raw ?? ""))

            if (this.output && this.should_use_output) {
                return await structure({ data: content, into: this.output, llm: this.llm })
            } else {
                return content
            }
        } finally {
            await mcpClient?.close()
        }
    }

    public stream(invokeInput: InvokeInputBase & { thread_id?: string; stream_delay?: number; showReasoning: true }): AsyncGenerator<string | ReasoningEvent, void, unknown>
    public stream(invokeInput: InvokeInputBase & { thread_id?: string; stream_delay?: number }): AsyncGenerator<string, void, unknown>
    public async *stream(invokeInput: InvokeInputBase & { thread_id?: string; stream_delay?: number; showReasoning?: boolean }): AsyncGenerator<string | ReasoningEvent, void, unknown> {
        this.should_use_output = false
        const mcpClient = buildMcpClient(this.mcpServer)
        try {
            const { thread_id, promptVars, showReasoning, ...variables } = invokeInput

            if (this.checkpointer && !thread_id) throw new Error("thread_id is required when using checkpointer, else no state is stored")
            if (!this.checkpointer && thread_id) console.warn("WARN: thread_id is provided but no checkpointer is set, so no state is stored")

            const humanMessages: HumanMessage[] = Object.entries(variables).map(
                ([key, value]) => new HumanMessage(`${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`)
            )

            const resolvedPrompt = await resolveSystemPromptBlocks(this.prompt, promptVars)
            const mcpBlock = buildMcpPromptBlock(this.mcpServer)
            const promptBlocks: Array<["system", string]> = mcpBlock ? [...resolvedPrompt, ["system", mcpBlock]] : resolvedPrompt

            const tools = mcpClient ? [...this.tools, ...await mcpClient.getTools()] : this.tools

            this.agent = createReactAgent({
                llm: this.llm as any,
                tools: tools as any,
                checkpointSaver: this.checkpointer as any,
                prompt: (state) => [
                    ...promptBlocks,
                    ...state.messages
                ]
            })

            const config = thread_id && this.checkpointer ? { configurable: { thread_id } } : undefined
            if (thread_id && !this.checkpointer) console.warn("thread_id wurde beim invoke des agenten mitgegeben aber kein checkpointer, somit wird nichts gespeichert und die thread_id ist gleichgültig")

            const nativeStream = await this.agent.stream(
                { messages: humanMessages } as any,
                { ...(config ?? {}), streamMode: "messages" } as any
            )

            for await (const chunk of nativeStream) {
                const messageChunk = Array.isArray(chunk) ? chunk[0] : chunk
                const metadata = Array.isArray(chunk) ? chunk[1] : undefined
                const node = metadata?.langgraph_node
                const messageType = typeof messageChunk?._getType === "function" ? messageChunk._getType() : messageChunk?._getType

                if (node === "tools" || messageType === "tool") {
                    continue
                }

                if (showReasoning) {
                    const reasoning = extractReasoningDelta(messageChunk)
                    if (reasoning) yield { kind: "reasoning", text: reasoning }
                }

                const raw = messageChunk?.content
                if (typeof raw === "string") {
                    if (raw.length > 0) yield raw
                    continue
                }
                if (Array.isArray(raw)) {
                    const text = raw.map((part: any) => part?.text ?? "").join("")
                    if (text.length > 0) yield text
                }
            }
        } finally {
            this.should_use_output = true
            await mcpClient?.close()
        }
    }

    public addTool(tool:DynamicStructuredTool){
        this.tools.push(tool)
    }

    public get currentTools(): string[] {
        return this.tools.map(tool => tool.name)
    }
}
