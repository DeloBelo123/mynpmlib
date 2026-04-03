import { DynamicStructuredTool } from "@langchain/core/tools"
import type { ExtractToolNames } from "./zodios/CombinedRegistry"
import { z } from "zod/v3"

export interface Tool {
    name:string
    description:string
    schema:z.ZodObject<any,any>
    func:(input: any) => any
}

export class ToolRegistry<const T extends Tool[]> {
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

    private turnToTool(tool:Tool):DynamicStructuredTool{
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

const t = new ToolRegistry([
    {
        name:"get_weather",
        description:"get the weather of a city",
        schema:z.object({
            city:z.string()
        }),
        func:async({city}:{city:string})=>{
            return `the weather of ${city} is sunny`
        }
    },
    {
        name:"get_time",
        description:"get the time",
        schema:z.object({}),
        func:async()=>{
            return `the time is ${new Date().toLocaleTimeString()}`
        }
    }
])

t.getTool("get_weather")