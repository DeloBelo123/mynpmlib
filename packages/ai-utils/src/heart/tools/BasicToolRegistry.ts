import { DynamicStructuredTool } from "@langchain/core/tools"
import type { ExtractToolNames } from "./CombinedRegistry"
import { z } from "zod/v3"

export interface Tool<T extends z.ZodObject<any,any>> {
    name:string
    description:string
    schema:T
    func:(input:z.infer<T>) => any
}

/**
 * vergiss nicht 'as const' am ende des input-arrays zu verwenden für perekten autocomplete!!!
 */
export class ToolRegistry<T extends readonly Tool<z.ZodObject<any,any>>[]> {
    private tools:DynamicStructuredTool[]
    constructor(tools:T){
        this.tools = tools.map(tool => tool instanceof DynamicStructuredTool ? tool : this.turnToTool(tool)) 
        if (this.checkDuplicatedTools()){
            throw new Error(`Error! mehrere tools wurden unter den gleichen Namen registriert!`)
        }
    }

    public getTool(name:ExtractToolNames<T>): DynamicStructuredTool | undefined{
        const tools = this.tools.filter(tool => tool.name.toLowerCase() === name.toLowerCase())
        if (tools.length > 1) {
            throw new Error(`Error! mehrere tools wurden unter den gleichen Namen ${name} registriert!`)
        }
        if (tools.length !== 1){
            console.error(`unter ${name} wurde kein Tool gefunden`)
            return
        }
        return tools[0]
    }

    public getTools(...names:ExtractToolNames<T>[]){
        return names.map(name => this.getTool(name))
    }

    private turnToTool<U extends z.ZodObject<any,any>>(tool:Tool<U>):DynamicStructuredTool{
        return new DynamicStructuredTool({
            name:tool.name,
            description:tool.description,
            schema:tool.schema,
            func:tool.func
        })

    }

    private checkDuplicatedTools():boolean{
        const dublikaes = this.tools.filter((tool,index)=>{
            return this.tools.indexOf(tool) !== index
        })
        return dublikaes.length > 0 ? true : false
    }

    public get allTools():DynamicStructuredTool[]{
        return this.tools
    }
}




