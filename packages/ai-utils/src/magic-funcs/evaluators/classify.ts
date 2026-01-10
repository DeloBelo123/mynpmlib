import { createSimpleChain } from "../../helpers"
import { BaseChatModel } from "../../imports"
import { ChatPromptTemplate } from "../../imports"
import { z } from "zod/v3"
import { getLLM } from "../../helpers"
import { StructuredOutputParser } from "../../imports"

function createClassificationSchema<T extends readonly [string, ...string[]]>(classes: T) {
    return z.object({
      class: z.enum(classes),
      confidence: z.number()
        .min(0)
        .max(100)
        .describe("Sicherheit der Klassifikation"),
      reasoning: z.string()
        .describe("Kurze Begründung basierend auf dem Input")
    })
  }
  
  export async function classify<T extends readonly [string, ...string[]]>({
    llm = getLLM({type:"groq", apikey: process.env.CHATGROQ_API_KEY ?? ""}),
    data,
    classes,
    context
  }: {
    llm?: BaseChatModel
    data: any,
    classes: T,
    context?: string
  }): Promise<z.infer<ReturnType<typeof createClassificationSchema<T>>>> {
  
    const inputString =
      typeof data === "string"
        ? data
        : JSON.stringify(data, null, 2)
  
    const schema = createClassificationSchema(classes)
    const parser = StructuredOutputParser.fromZodSchema(schema)
  
    const prompt = await ChatPromptTemplate.fromMessages([
      ["system", `
        Du bist ein präziser Klassifizierungsagent.
  
        Aufgabe:
        - Ordne den gegebenen Input exakt EINER der folgenden Klassen zu:
        ${classes.map(c => `- ${c}`).join("\n")}
  
        Regeln:
        - Wähle genau eine Klasse
        - Nutze nur Informationen aus dem Input
        - Keine Annahmen oder erfundene Inhalte
        - Wenn die Zuordnung unsicher ist, wähle die wahrscheinlichste Klasse und setze eine niedrige Confidence
  
        Confidence:
        - 0 = reine Vermutung
        - 100 = absolut sicher
  
        Antwort:
        - Ausschließlich valides JSON gemäß Schema
        - Kein zusätzlicher Text
  
        ${context ? `
        Etwas Kontext, um dir das klassifizieren zu erleichtern:
        ${context}
        ` : ""}
  
        Schema:
        {format_instructions}
        `],
      ["human", "{input}"]
    ]).partial({
      format_instructions: parser.getFormatInstructions()
    })
  
    const chain = createSimpleChain(prompt, llm, parser)
    const result = await chain.invoke({ input: inputString })
  
    return schema.parse(result)
  }