import { z } from "zod/v3"
import type { OutputSchema } from "./chain"
import { DynamicStructuredTool} from "../imports"
import { BaseChatModel } from "../imports"
import { BaseCheckpointSaver } from "../imports"
import { VectorStore } from "../imports"
import { turn_to_docs, baseSplitter } from "../rag"
import { createReactAgent } from "../imports"
import { HumanMessage} from "../imports"
import { getLLM, stream } from "../helpers"
import { structure } from "../magic-funcs/parsers/structure"

/*
    KOMPLETTER REWRITTE: lösch die ganze rag scheisse beim init und behandle die wie normale tools du pic, erstell einfach eine
    "createRAGTool" func oder so ein scheiss und gib den einfach beim init ein. mach sogar die "setContext()" func weg, wenn man 
    rag eingeben will dann soll man die "addTool()" func aufrufen mit dem RAGTool amk. entfern alles "...Context()" relatete!
*/

interface AgentProps<T extends OutputSchema>{
    tools: DynamicStructuredTool[]
    prompt?: string | Array<string>
    llm?: BaseChatModel
    output?: T
    memory?: BaseCheckpointSaver
}

/**
 * CONSTRUCTOR:
 * @example 
 * constructor({
        prompt = `Du bist ein hilfreicher Assistent.`,
        llm = getLLM({ type:"groq" }),
        tools,
        output,
        memory,
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
        this.memory = memory
    }
 * @param output - Zod-Schema: beschreibt die Struktur des Rückgabewerts von .invoke()
 */
export class Agent<T extends OutputSchema> {
    private prompt: Array<["system", string]>
    private tools: DynamicStructuredTool[]
    private llm: BaseChatModel
    private output: T | undefined
    private agent: any
    private memory: BaseCheckpointSaver | undefined
    private should_use_output: boolean = true

    constructor({
        prompt = `Du bist ein hilfreicher Assistent.`,
        llm = getLLM({ type:"groq" }),
        tools,
        output,
        memory,
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
        this.memory = memory
    }

    public async invoke(invokeInput: Record<string, any> & { thread_id?: string, debug?: boolean }): Promise<T extends undefined ? string : z.infer<T>> {
        const { thread_id, debug, ...variables } = invokeInput

        if(this.memory && !thread_id) throw new Error("thread_id is required when using memory, else no memory is stored")
        if(!this.memory && thread_id) console.warn("WARN: thread_id is provided but no memory is set, so no memory is stored")
        
        const humanMessages: HumanMessage[] = Object.entries(variables).map(
            ([key, value]) => new HumanMessage(`${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`)
        );


        this.agent = createReactAgent({
            llm: this.llm as any,
            tools: this.tools as any,
            checkpointSaver: this.memory as any,
            prompt: (state) => [
                ...this.prompt,  
                ...state.messages  
            ] 
        })
        
        const config = thread_id && this.memory ? { configurable: { thread_id } } : undefined
        if(thread_id && !this.memory) console.warn("thread_id wurde beim invoke des agenten mitgegeben aber keine memory, somit wird nichts gespeichert und die thread_id ist gleichgültig")
        const result = await this.agent.invoke({ messages: humanMessages } as any, config)
        if(debug) return result
        const lastMessage = result.messages[result.messages.length - 1]
        const raw = lastMessage?.content
        const content = typeof raw === "string" ? raw : (Array.isArray(raw) ? raw.map((c: any) => c?.text ?? c).join("") : String(raw ?? ""))

        if (this.output && this.should_use_output) {
            return await structure({ data: content, into: this.output, llm: this.llm }) as any
        } else {
            return content as any
        }
    }

    /** bro nutzt später vielleicht intern mal die native .stream() von createReactAgent */
    public async *stream(invokeInput: Record<string, any> & { thread_id?: string, debug?: boolean, stream_delay?: number }): AsyncGenerator<string, void, unknown> {
        this.should_use_output = false
        try{
            const { stream_delay = 50, ...rest } = invokeInput
            const response = await this.invoke(rest)
            const responseStr = typeof response === "string" ? response : JSON.stringify(response)
            const words = responseStr.split(" ")
            for await (const word of stream(words,stream_delay)){
                yield word + " "
            }
        } finally {
            this.should_use_output = true
        }
    }

    public addTool(tool:DynamicStructuredTool){
        this.tools.push(tool)
    }

    public get currentTools(): string[] {
        return this.tools.map(tool => tool.name)
    }
}


