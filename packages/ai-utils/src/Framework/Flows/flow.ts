import { Agent } from "../../heart/agent"
import { getLLM } from "../../helpers"
import { BaseMessage, MemorySaver } from "../../imports"
import { SmartCheckpointSaver } from "../../memory"
import { z } from "zod/v3"
import { agentFlowSchema } from "./types"

export const agentFlow = new Agent({
    tools: [],
    llm: getLLM({ type: "groq", apikey: process.env.CHATGROQ_API_KEY! }),
    prompt: "Du bist ein Flow-Agent der von node zu node geht und die Aufgabe in jeder Node erfüllt",
    memory: new SmartCheckpointSaver(new MemorySaver(), { llm: getLLM({ type: "groq", apikey: process.env.CHATGROQ_API_KEY! }) }),
    schema: agentFlowSchema
})