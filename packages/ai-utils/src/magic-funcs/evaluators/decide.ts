import { z } from "zod/v4"
import { BaseChatModel } from "../../imports"
import { ChatPromptTemplate } from "../../imports"

import { StructuredOutputParser } from "../../imports"
import { createSimpleChain } from "../../helpers/helpers"
import { getLLM } from "../../helpers/llms"

const decideSchema = z.object({
    decision: z.enum(["yes", "no", "unclear"])
      .describe("Ergebnis der Entscheidung basierend auf dem Kriterium"),
    reason: z.string()
      .describe("Sachliche Begründung, die sich ausschließlich auf das gegebene Material bezieht"),
    confidence: z.number()
      .min(0)
      .max(100)
      .describe(
        "Sicherheit der Entscheidung. Regeln: " +
        "decision='unclear' → confidence=0. " +
        "decision='yes' oder 'no' → confidence > 0"
      )
  })
  
  /**
   * Trifft eine strukturierte Ja/Nein/Unklar-Entscheidung fuer ein gegebenes Kriterium.
   *
   * Sinnvoll fuer Gate-Checks, Policy-Validierung oder automatische Freigabeentscheidungen.
   *
   * @param params.llm Optionales Chat-LLM.
   * @param params.material Material/Datengrundlage fuer die Entscheidung.
   * @param params.kriteria_to_decide Kriterium, nach dem entschieden werden soll.
   * @returns Objekt mit `decision`, `reason` und `confidence`.
   *
   * @example
   * ```ts
   * const result = await decide({
   *   material: "Der User hat AGB akzeptiert und Email bestaetigt.",
   *   kriteria_to_decide: "Ist der User onboarding-ready?"
   * })
   * ```
   */
  export async function decide({
    llm = getLLM({provider:"openrouter", apikey: process.env.OPENROUTER_API_KEY ?? "", model: "openai/gpt-5.4-mini"}),
    material,
    kriteria_to_decide
  }: {
    llm?: BaseChatModel
    material: any
    kriteria_to_decide: string
  }): Promise<z.infer<typeof decideSchema>> {
  
    const inputString =
      typeof material === "string"
        ? material
        : JSON.stringify(material, null, 2)
  
    const jsonParser = StructuredOutputParser.fromZodSchema(decideSchema)
    const prompt = await ChatPromptTemplate.fromMessages([
      ["system", `
        Analytischer Entscheidungsagent.
        
        Entscheide anhand des Materials und des Kriteriums:
        - Ergebnis: "yes" | "no" | "unclear"
        - "unclear", wenn keine klare Entscheidung möglich ist
        - Begründung nur aus dem Material
        
        Regeln:
        - Keine Annahmen oder erfundenen Infos
        - decision="unclear" → confidence<10
        - decision≠"unclear" → confidence>10
        - Nur JSON gemäß Schema
        
        Kriterium:
        ${kriteria_to_decide}
        
        Schema:
        {format_instructions}
        `],      
      ["human", "{input}"]
    ]).partial({
      format_instructions: jsonParser.getFormatInstructions()
    })
    const chain = createSimpleChain(prompt, llm, jsonParser)
    const result = await chain.invoke({ input: inputString })
    return decideSchema.parse(result)
  }