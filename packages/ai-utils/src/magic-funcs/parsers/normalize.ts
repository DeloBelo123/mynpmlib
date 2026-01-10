import { createSimpleChain } from "../../helpers"
import { BaseChatModel } from "../../imports"
import { ChatPromptTemplate } from "../../imports"
import { z } from "zod/v3"
import { getLLM } from "../../helpers"
import { StructuredOutputParser } from "../../imports"

export async function normalize<T extends z.ZodObject<any>>({
    llm = getLLM({ type: "groq", apikey: process.env.CHATGROQ_API_KEY ?? ""}),
    data,
    into,
    retries = 2
  }: {
    llm?: BaseChatModel
    data: any
    into: T
    retries?: number
  }): Promise<z.infer<T>> {
  
    const inputString =
      typeof data === "string"
        ? data
        : JSON.stringify(data, null, 2)
  
    const parser = StructuredOutputParser.fromZodSchema(into)
  
    const prompt = await ChatPromptTemplate.fromMessages([
      ["system", `
        Du bist ein strenger Normalisierungs-Parser.
  
        Deine Aufgabe:
        - Wandle den gegebenen Input in die EXAKTE Zielstruktur um
        - Nutze ausschließlich Informationen aus dem Input
        - Führe nur offensichtliche, deterministische Normalisierungen durch
  
        Erlaubt:
        - Formatvereinheitlichung (z. B. Datumsformate, Booleans, Numbers)
        - Entfernen irrelevanter Felder
        - Umwandlung äquivalenter Werte (z. B. "yes" → true)
  
        NICHT erlaubt:
        - Raten oder Ergänzen fehlender Informationen
        - Interpretation oder Bedeutungsänderung
        - Ableitung impliziter Fakten
        - Kreative oder heuristische Entscheidungen
  
        Wenn ein Wert nicht eindeutig normalisiert werden kann:
        - Setze ihn auf null ODER
        - lasse ihn weg (wenn optional)
        - aber erfinde nichts
  
        Antwort:
        - AUSSCHLIESSLICH valides JSON
        - KEIN zusätzlicher Text
        - KEINE Markdown-Blöcke
  
        Schema:
        {format_instructions}
            `],
      ["human", "{input}"]
    ]).partial({
      format_instructions: parser.getFormatInstructions()
    })
  
    const chain = createSimpleChain(prompt, llm, parser)
  
    let lastError: Error | null = null
  
    for (let i = 0; i <= retries; i++) {
      try {
        const result = await chain.invoke({ input: inputString })
        return into.parse(result)
      } catch (error) {
        lastError = error as Error
        if (i < retries) {
          console.warn(`normalize() Versuch ${i + 1} fehlgeschlagen, retry...`)
        }
      }
    }
  
    throw new Error(
      `normalize() failed after ${retries + 1} attempts. Last error: ${lastError?.message}`
    )
  }