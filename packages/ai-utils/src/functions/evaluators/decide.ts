import { z } from "zod/v3"
import { BaseChatModel } from "../../imports"
import { ChatPromptTemplate } from "../../imports"
import { getLLM } from "../../helpers"
import { StructuredOutputParser } from "../../imports"
import { createSimpleChain } from "../../helpers"

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
  
  export async function decide({
    llm = getLLM({type:"groq", apikey: process.env.CHATGROQ_API_KEY ?? ""}),
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