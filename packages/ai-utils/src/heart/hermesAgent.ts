import { BaseChatModel } from "../imports"
import { getLLM } from "../helpers/llm/llms"
import { z } from "zod"

interface HermesAgentInit {
    baseUrl?: string
    apikey?: string // selbst erstellter apikey der einfach geprüft wird
    llm?: BaseChatModel
    prompt?: string
    output?: z.ZodObject | z.ZodRecord
}
export class HermesAgent {
    private url?: string
    private apikey?: string // selbst erstellter apikey der einfach geprüft wird
    private llm?: BaseChatModel
    private prompt?: string
    private output?: z.ZodObject | z.ZodRecord

    constructor({ output,prompt,llm,apikey,baseUrl }:HermesAgentInit){
        this.output = output
        this.prompt = prompt
        this.llm = llm
        this.apikey = apikey
        this.url = baseUrl ? `${baseUrl}/v1/chat/completions` : "http://localhost:8642/v1/chat/completions" 
    }

    public async invoke(){

    }

    public async stream(){

    }

    private initAgent(stream:boolean){

    }
}