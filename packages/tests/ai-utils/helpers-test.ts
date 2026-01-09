import { summarize, getLLM, decide, extract, classify, ragify, promptify } from "../../ai-utils/src";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { resolve, dirname } from "path";
import z from "zod/v3";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../.env") });

const llm = getLLM({
    type:"groq",
    apikey: process.env.CHATGROQ_API_KEY!,
})


const request = "prompte meinen Finanz agent so das er am optimalsten den markt analysiert"


;(async()=>{
    console.log( await promptify({ request, agentRole:"Finanz-Agent" }))
})()