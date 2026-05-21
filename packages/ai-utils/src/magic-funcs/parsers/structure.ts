import { createSimpleChain } from "../../helpers/helpers"
import { BaseChatModel, StructuredOutputParser } from "../../imports"
import { ChatPromptTemplate } from "../../imports"
import type { OutputSchema } from "../../heart/chain"
import { z } from "zod/v4"
import { getLLM } from "../../helpers/llms"

/**
 * Bringt beliebigen Input in ein vorgegebenes Zod-Schema.
 *
 * Sinnvoll wenn Modelloutput robust als JSON-Struktur benoetigt wird.
 *
 * @param params.data Rohdaten, die strukturiert werden sollen.
 * @param params.into Ziel-Schema (`z.object(...)` oder `z.record(...)`).
 * @param params.llm Optionales Chat-LLM.
 * @param params.retries Anzahl der Wiederholungsversuche bei Parsing-Fehlern.
 * @returns Valider, schema-konformer Output als `z.infer<T>`.
 *
 * @example
 * ```ts
 * const result = await structure({
 *   data: "Titel: Demo, Prioritaet: hoch",
 *   into: z.object({
 *     title: z.string(),
 *     priority: z.enum(["niedrig", "mittel", "hoch"])
 *   })
 * })
 * ```
 */
export async function structure<T extends OutputSchema>({
    data,
    into,
    llm = getLLM({provider:"openrouter", apikey: process.env.OPENROUTER_API_KEY ?? "", model: "openai/gpt-5.4-mini"}),
    retries = 2
}:{
    data: any,
    into: T,
    llm?: BaseChatModel,
    retries?: number
}): Promise<z.infer<T>> {
    if(!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not set for structure() call")
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
            return into.parse(result) as z.infer<T>
        } catch (error) {
            lastError = error as Error
            if (i < retries) {
                console.warn(`structure() Versuch ${i + 1} fehlgeschlagen, retry...`)
            }
        }
    }
    throw new Error(`structure() failed after ${retries + 1} attempts, Error: ${lastError?.message}`)
}