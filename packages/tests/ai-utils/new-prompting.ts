import { Chain,Agent,MemoryChain,Chatbot,getLLM, SmartCheckpointSaver } from "../../ai-utils/src";
import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { MemorySaver } from "../../ai-utils/src/imports";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../.env") });

(async()=>{
    const llm = getLLM({
        type:"groq",
        apikey: process.env.CHATGROQ_API_KEY!
    })

    const chain = new MemoryChain({
        llm:llm,
        prompt:"du bist ein sehr trauriger und trüber mensch der nur am säufzen ist",
        memory: new SmartCheckpointSaver(new MemorySaver(), { llm: llm }) as any
    })
    
})()