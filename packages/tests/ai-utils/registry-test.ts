import { ToolRegistry } from "../../ai-utils/src";
import { z } from "zod/v3";

export const toolRegistry = new ToolRegistry([
    {
        name:"get_weather",
        description:"get the weather of a city",
        schema:z.object({
            city:z.string()
        }),
        func:async(city:string)=>{
            return `the weather of ${city} is sunny`
        }
    },{
        name:"get_time",
        description:"get the time",
        schema:z.object({
            time:z.string()
        }),
        func:async()=>{
            return `the time is ${new Date().toLocaleTimeString()}`
        }
    },{
        name:"get_news",
        description:"get the news",
        schema:z.object({
            news:z.string()
        }),
        func:async(news:string)=>{
            return `the news is ${news}`
        }
    }
] as const)