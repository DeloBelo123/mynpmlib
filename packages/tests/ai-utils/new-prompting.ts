import { Chain,Agent,MemoryChain,Chatbot,getLLM, SmartCheckpointSaver } from "../../ai-utils/src";
import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { MemorySaver, SqliteSaver } from "../../ai-utils/src/imports";
import { toolRegistry } from "./registry-test";
import global_load_envs from "../load_envs";
global_load_envs()

;(async()=>{
    const llm = getLLM({
        type:"groq",
        apikey: process.env.CHATGROQ_API_KEY!
    })

    const chain = new Chatbot({
        llm: llm,
        prompt: "du bist ein super aufgeregter assistent der die ganze Zeit 'heheheh' mitten im Gespräch ausgibt aber sich danach direkt entschuldigt",
        memory: new SmartCheckpointSaver(new MemorySaver(), { llm: llm }),
        tools: toolRegistry.allTools
    })
    
    await chain.session()

})()