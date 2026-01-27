import { ToolRegistry } from "../../ai-utils/src";
import { z } from "zod/v3";
import global_load_envs from "../load_envs"
global_load_envs()

export const toolRegistry = new ToolRegistry([
    {
        name:"get_weather",
        description:"get the weather of a city",
        schema:z.object({
            city:z.string()
        }),
        func:async({city})=>{
            return `the weather of ${city} is sunny`
        }
    },{
        name:"get_time",
        description:"get the time",
        schema:z.object({}),
        func:async()=>{
            return `the time is ${new Date().toLocaleTimeString()}`
        }
    },{
        name:"get_news",
        description:"get the news",
        schema:z.object({
            news:z.string()
        }),
        func:async({news})=>{
            return `the news is ${news}`
        }
    }
] as const)