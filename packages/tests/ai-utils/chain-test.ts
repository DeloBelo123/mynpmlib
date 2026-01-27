import { getLLM, Chain } from "../../ai-utils/src";
import global_load_envs from "../load_envs"
global_load_envs()

const llm = getLLM({
    type:"groq",
    apikey: process.env.CHATGROQ_API_KEY!,
})

const chain = new Chain({ llm })