import { createSimpleChain } from "../../helpers/helpers"
import { BaseChatModel } from "../../imports"
import { ChatPromptTemplate } from "../../imports"
import { z } from "zod/v4"

import { StructuredOutputParser } from "../../imports"
import { getLLM } from "../../helpers/llms"

/**
 * Extrahiert strukturierte Daten aus unstrukturiertem Input anhand eines Zod-Schemas.
 *
 * Sinnvoll fuer Information Extraction aus Texten, Notizen, Tickets oder Logs.
 *
 * @param params.llm Optionales Chat-LLM.
 * @param params.data Eingabedaten (String oder Objekt).
 * @param params.goal Optionales Extraktionsziel zur Fokussierung.
 * @param params.schema Zod-Schema der gewuenschten Ausgabe.
 * @returns Geparstes Ergebnis als `z.infer<T>`.
 *
 * @example
 * ```ts
 * const result = await extract({
 *   data: "Max Mustermann, 32, Berlin",
 *   schema: z.object({
 *     name: z.string(),
 *     age: z.number(),
 *     city: z.string()
 *   })
 * })
 * ```
 */
export async function extract<T extends z.ZodObject>({
    llm = getLLM({provider:"openrouter", apikey: process.env.OPENROUTER_API_KEY ?? "", model: "openai/gpt-5.4-mini"}),
    data,
    goal,
    schema
  }: {
    llm?: BaseChatModel
    data: any
    goal?: string
    schema: T
  }): Promise<z.infer<T>> {
  
    const inputString = typeof data === "string"
      ? data
      : JSON.stringify(data, null, 2)
  
    const parser = StructuredOutputParser.fromZodSchema(schema)
    const prompt = await ChatPromptTemplate.fromMessages([
      ["system", `
        Du bist ein präziser Informationsextraktor.
  
        
          ${goal ? `
        Ziel:
        Extrahiere ausschließlich die Informationen, die für folgendes Ziel relevant sind: 
        - "${goal}"` 
        :
         "- Extrahiere ALLE Informationen aus dem Input, die zum angegebenen Schema passen."}
  
        Regeln:
        - Keine Interpretation
        - Keine Ergänzungen
        - Nur Informationen, die explizit im Input enthalten sind
        - Antworte ausschließlich im JSON-Schema
  
        Schema:
        {format_instructions}
            `],
      ["human", "{input}"]
    ]).partial({ format_instructions: parser.getFormatInstructions() })
    const chain = createSimpleChain(prompt, llm, parser)
    const result = await chain.invoke({ input: inputString })
    return schema.parse(result)
  }