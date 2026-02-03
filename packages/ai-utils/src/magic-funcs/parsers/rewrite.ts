import { StringOutputParser } from "@langchain/core/output_parsers"
import { createSimpleChain, getLLM } from "../../helpers"
import { BaseChatModel } from "../../imports"
import { ChatPromptTemplate } from "../../imports"

export async function rewrite({
  data,
  instruction,
  llm = getLLM({ type: "groq", apikey: process.env.CHATGROQ_API_KEY ?? "" }),
  retries = 2
}: {
  data: any
  instruction: string
  llm?: BaseChatModel
  retries?: number
}): Promise<string> {
  const inputString = typeof data === "string" ? data : JSON.stringify(data, null, 2)

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `Du bist ein Text-Transformer. Deine Aufgabe: Den gegebenen Input genau so umwandeln, wie in der Anweisung beschrieben.

      Anweisung (unbedingt befolgen):
      {instruction}

      Regeln:
      - Gib NUR das Ergebnis aus, keinen Erklärungstext davor oder danach
      - Keine Markdown-Code-Blöcke um das Ergebnis (außer die Anweisung verlangt explizit welches Format)
      - Input kann Text, JSON oder anderes sein – wandle es strikt nach der Anweisung um`
    ],
    ["human", "{input}"]
  ])

  const chain = createSimpleChain(prompt, llm, new StringOutputParser())

  let lastError: Error | null = null
  for (let i = 0; i <= retries; i++) {
    try {
      const result = await chain.invoke({ input: inputString, instruction })
      return typeof result === "string" ? result : String(result)
    } catch (error) {
      lastError = error as Error
      if (i < retries) {
        console.warn(`rewrite() Versuch ${i + 1} fehlgeschlagen, retry...`)
      }
    }
  }
  throw new Error(`rewrite() failed after ${retries + 1} attempts. Last error: ${lastError?.message}`)
}
