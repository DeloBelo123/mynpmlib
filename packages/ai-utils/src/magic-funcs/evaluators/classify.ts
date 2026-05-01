import { createSimpleChain } from "../../helpers/helpers"
import { BaseChatModel } from "../../imports"
import { ChatPromptTemplate } from "../../imports"
import { z } from "zod/v3"

import { StructuredOutputParser } from "../../imports"
import { getLLM } from "../../helpers/llms"

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
  
  /**
   * Klassifiziert Input in genau eine vordefinierte Klasse und liefert Confidence + Begruendung.
   *
   * Sinnvoll fuer Routing, Labeling, Topic-Erkennung oder Vorentscheidungen in Flows.
   *
   * @param params.llm Optionales Chat-LLM.
   * @param params.data Zu klassifizierender Input (String oder Objekt).
   * @param params.classes Erlaubte Klassen als konstantes Tuple.
   * @param params.context Optionaler Zusatzkontext fuer die Entscheidung.
   * @returns Objekt mit `class`, `confidence` (0-100) und `reasoning`.
   *
   * @example
   * ```ts
   * const result = await classify({
   *   data: "Der Kunde moechte kuendigen und ist unzufrieden.",
   *   classes: ["support", "sales", "churn"] as const
   * })
   * ```
   */
  export async function classify<const T extends readonly [string, ...string[]]>({
    llm = getLLM({provider:"openrouter", apikey: process.env.OPENROUTER_API_KEY ?? "", model: "openai/gpt-5.4-mini"}),
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

