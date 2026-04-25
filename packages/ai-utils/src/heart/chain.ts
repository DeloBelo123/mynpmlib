import { getLLM } from "../helpers"
import { 
    BaseChatModel,
    StructuredOutputParser,
    ChatPromptTemplate, 
    MessagesPlaceholder, 
    VectorStore,
    createRetrievalChain, 
    createStuffDocumentsChain,
} from "../imports"
import { turn_to_docs, baseSplitter } from "../rag"
import { z } from "zod/v3"

/** Output-Schema für .invoke(): z.object() oder z.record() (Zod v3). */
export type OutputSchema = z.ZodObject<any, any, any> | z.ZodRecord<any, any>

export const DEFAULT_OUTPUT_SCHEMA = z.object({ 
    output: z.string().describe("Dein Output zur anfrage des Users") 
})

/**
 * Input für .invoke() / .stream(): beliebige dynamische Keys + optionale Steuerfelder.
 * Bekannte Keys zuerst + Index-Signature — so schlagen IDEs `debug` / `promptVars` zuverlässig vor (reines `Record<string, any> & { debug? }` nicht).
 */
export interface InvokeInputBase {
    debug?: boolean
    promptVars?: Record<string, any>
    [key: string]: any
}

interface ChainProps<T extends OutputSchema>{
    prompt?:string | Array<string | MessagesPlaceholder<any>>
    llm?:BaseChatModel
    output?:T,
    vectorStore?: VectorStore 
}

/**
 * CONSTRUCTOR:
 * @example 
 * constructor({
        prompt = "du bist ein hilfreicher Assistent",
        llm = getLLM({type:"groq", apikey: process.env.CHATGROQ_API_KEY ?? ""}),
        output = DEFAULT_OUTPUT_SCHEMA as unknown as T as T
        vectorStore = undefined
    }:ChainProps<T>){
        this.prompt = typeof prompt === "string" ? [["system", prompt]] : Array.isArray(prompt) ? prompt.map((p:string | MessagesPlaceholder<any>)=>{
            if(typeof p === "string"){
                return ["system", p]
            } else {
                return p // weil wenn es kein string ist dann ist es ein MessagePlaceholder
            }
        }) : []
        this.llm = llm
        this.vectorStore = vectorStore
        this.output = output
        this.parser = StructuredOutputParser.fromZodSchema(this.output)
    }
 * @param output - Zod-Schema: beschreibt die Struktur des Rückgabewerts von .invoke()
 */
export class Chain<T extends OutputSchema = typeof DEFAULT_OUTPUT_SCHEMA> {
    private prompt:Array<["human" | "system", string] | MessagesPlaceholder<any>>
    private vectorStore: VectorStore | undefined
    private times_of_added_context: number = 0
    private parser:StructuredOutputParser<T>
    private llm:BaseChatModel
    private output:T

    constructor({
        prompt = "du bist ein hilfreicher Assistent",
        llm = getLLM({ type:"groq" }),
        output = DEFAULT_OUTPUT_SCHEMA as unknown as T as T,
        vectorStore = undefined
    }:ChainProps<T> = {}){
        this.prompt = typeof prompt === "string" ? [["system", prompt]] : Array.isArray(prompt) ? prompt.map((p:string | MessagesPlaceholder<any>)=>{
            if(typeof p === "string"){
                return ["system", p]
            } else {
                return p // weil wenn es kein string ist dann ist es ein MessagePlaceholder, sonst ist jeder string prompt ein system prompt, humanprompts geben nur wir
            }
        }) : []
        this.vectorStore = vectorStore
        this.llm = llm
        this.output = output
        this.parser = StructuredOutputParser.fromZodSchema(this.output)
    }

    public async invoke(input: InvokeInputBase): Promise<z.infer<T>> {
        const { debug, promptVars, ...dynamicFields } = input
        const messagesArray = [...this.prompt]
        messagesArray.push(["system", "You MUST respond ONLY with valid JSON matching this exact schema:\n{format_instructions}\n\nIMPORTANT: \n- Output ONLY valid JSON, no markdown code blocks\n- No backslashes or line breaks in strings\n- All strings must be on single lines\n- Do NOT wrap in ```json``` blocks\n- Return the JSON object DIRECTLY"])
        if(this.vectorStore) messagesArray.push(["system", "Hier ist relevanter Kontext:\n{context}"])
        for(const key in dynamicFields){
            if(key === "thread_id"){
                console.error("eine normale chain hat keine memory, deswegen wird thread_id ignoriert")
                continue
            } 
            if(typeof dynamicFields[key] !== "string"){
                messagesArray.push(["human",`${key}:${JSON.stringify(dynamicFields[key])}`])
            } else {
                messagesArray.push(["human",`${key}:{${key}}`])
            }
        }
        const true_prompt = ChatPromptTemplate.fromMessages(messagesArray)
        if(debug) console.log("Prompt: ", true_prompt)
        // promptVars nach dynamicFields: gleiche Keys überschreiben für LangChain-{var}
        const invokeInput = { ...dynamicFields, ...(promptVars ?? {}), format_instructions: this.parser.getFormatInstructions() }
        
        if(this.vectorStore){
            const retriever = this.vectorStore.asRetriever()
            const stuff_chain = await createStuffDocumentsChain({
                llm: this.llm,
                prompt: true_prompt,
                outputParser: this.parser
            })
            const chain = await createRetrievalChain({
                combineDocsChain: stuff_chain,
                retriever: retriever
            })
            if (debug) console.log("created retrieval chain")
            const respo = await chain.invoke({ input: JSON.stringify(dynamicFields), ...invokeInput })
            return this.output.parse(respo.answer)
        }
        
        const chain = true_prompt.pipe(this.llm).pipe(this.parser)
        if (debug) console.log("created normal chain")
        const respo = await chain.invoke(invokeInput)
        return this.output.parse(respo) 
    }


    public async *stream(input: Record<string, any> & { debug?: boolean }): AsyncGenerator<string, void, unknown> {
        const messagesArray = [...this.prompt]
        // Beim Streamen KEIN Schema-Prompt - nur reiner Text
        if(this.vectorStore) messagesArray.push(["system", "Hier ist relevanter Kontext:\n{context}"])
            for(const key in input){
                if(key === "debug") continue
                if(key === "thread_id"){
                    console.error("eine normale chain hat keine memory, deswegen wird thread_id ignoriert")
                    continue
                } 
                if(typeof input[key] !== "string"){
                    messagesArray.push(["human",`${key}:${JSON.stringify(input[key])}`])
                } else {
                    messagesArray.push(["human",`${key}:{${key}}`])
                }
            }
        const true_prompt = ChatPromptTemplate.fromMessages(messagesArray)
        if(input.debug) console.log("Prompt: ", true_prompt)
        const invokeInput = {...input}
        
        if(this.vectorStore){
            const retriever = this.vectorStore.asRetriever({ k:4 })
            if(input.debug) console.log("created retrieval chain (streaming)")
            
            // Für RAG: Hole Context und stream dann die LLM-Antwort
            const contextDocs = await retriever.invoke(JSON.stringify(input))
            const contextText = contextDocs.map((doc: any) => doc.pageContent).join("\n\n")
            
            // Stream die LLM-Antwort mit Context
            const streamChain = true_prompt.pipe(this.llm)
            const stream = await streamChain.stream({...invokeInput, context: contextText})
            
            for await (const chunk of stream) {
                if (chunk && typeof chunk === 'object' && 'content' in chunk) {
                    yield chunk.content as string
                } else if (typeof chunk === 'string') {
                    yield chunk
                }
            }
        } else {
            // Ohne RAG: Stream direkt
            const streamChain = true_prompt.pipe(this.llm)
            if(input.debug) console.log("created normal chain (streaming)")
            
            const stream = await streamChain.stream(invokeInput)
            for await (const chunk of stream) {
                if (chunk && typeof chunk === 'object' && 'content' in chunk) {
                    yield chunk.content as string
                } else if (typeof chunk === 'string') {
                    yield chunk
                }
            }
        }
    }

    /** Fügt RAG-Kontext hinzu. Docs werden EINMAL zum VectorStore hinzugefügt. */
    public async addContext(data: Array<any>){
        if(!this.vectorStore) {
            throw new Error("Cant add context, no vector store set")
        }
        this.times_of_added_context++
        const docs = turn_to_docs(data)
        const splitted = await baseSplitter.splitDocuments(docs)
        await this.vectorStore.addDocuments(splitted)
        console.log(`Added context ${this.times_of_added_context} ${this.times_of_added_context === 1 ? "time" : "times"}`)
    }

    public setContext(vectorStore: VectorStore){
        console.log("Setting context")
        this.vectorStore = vectorStore
    }

    public clearContext(){
        this.vectorStore = undefined
        this.times_of_added_context = 0
        console.log("Context cleared")
    }
}

