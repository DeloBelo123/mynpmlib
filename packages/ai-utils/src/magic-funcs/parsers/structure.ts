import { createSimpleChain, getLLM } from "../../helpers"
import { BaseChatModel, StructuredOutputParser } from "../../imports"
import { ChatPromptTemplate } from "../../imports"
import { z } from "zod/v3"

export async function structure<T extends z.ZodObject<any, any>>({
    data,
    into,
    llm = getLLM({type:"groq", apikey: process.env.CHATGROQ_API_KEY ?? ""}),
    retries = 2
}:{
    data: any,
    into: T,
    llm?: BaseChatModel,
    retries?: number
}): Promise<z.infer<T>> {
    if(!process.env.CHATGROQ_API_KEY) throw new Error("CHATGROQ_API_KEY is not set for structure() call")
    const inputString = typeof data === "string" ? data : JSON.stringify(data, null, 2)
    const jsonParser = StructuredOutputParser.fromZodSchema(into)
    const prompt = await ChatPromptTemplate.fromMessages([
        ["system", `Du bist ein JSON-Formatierer. 
            REGELN:
            - Gib NUR valides JSON zurück, KEIN anderer Text
            - Keine Markdown Code-Blöcke (\`\`\`json)
            - Halte dich EXAKT an das Schema

            Schema:
            {format_instructions}`],
        ["human", "{input}"]
    ]).partial({ format_instructions: jsonParser.getFormatInstructions() })
    const chain = createSimpleChain(prompt, llm, jsonParser)

    let lastError: Error | null = null
    for (let i = 0; i <= retries; i++) {
        try {
            const result = await chain.invoke({ input: inputString })
            return into.parse(result)
        } catch (error) {
            lastError = error as Error
            if (i < retries) {
                console.warn(`structure() Versuch ${i + 1} fehlgeschlagen, retry...`)
            }
        }
    }
    throw new Error(`structure() failed after ${retries + 1} attempts, Error: ${lastError?.message}`)
}