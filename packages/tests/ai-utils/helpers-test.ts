import { summarize, getLLM, decide, extract, classify, ragify, promptify, rewrite, ask } from "../../ai-utils/src";
import global_load_envs from "../load_envs"
global_load_envs()

const llm = getLLM({
    type:"groq",
    apikey: process.env.CHATGROQ_API_KEY!,
})

const data = "johannes ist 19 jahre alt, Max ist 20 Jahre alt und Clara ist 21 Jahre alt"

;(async()=>{
    console.log( await ask("wie geht es dir?"))
})()