import { summarize, getLLM, decide, extract, classify, ragify, promptify } from "../../ai-utils/src";
import global_load_envs from "../load_envs"
global_load_envs()

const llm = getLLM({
    type:"groq",
    apikey: process.env.CHATGROQ_API_KEY!,
})


const request = "prompte meinen Finanz agent so das er am optimalsten den markt analysiert"


;(async()=>{
    console.log( await promptify({ request, agentRole:"Finanz-Agent" }))
})()