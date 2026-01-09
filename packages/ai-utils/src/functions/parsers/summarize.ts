import { StringOutputParser } from "@langchain/core/output_parsers"
import { createSimpleChain } from "../../helpers"
import { BaseChatModel } from "../../imports"
import { ChatPromptTemplate } from "../../imports"
import { getLLM } from "../../helpers"

export async function summarize({
    llm = getLLM({type:"groq", apikey: process.env.CHATGROQ_API_KEY ?? ""}),
    data,
    fokuss,
    maxWords = 150
  }:{
    llm?:BaseChatModel,
    data:any,
    fokuss?:string,
    maxWords?:number
  }):Promise<string>{
      const inputString = typeof data === "string" ? data : JSON.stringify(data, null, 2)
      const prompt = ChatPromptTemplate.fromMessages([
        ["system", `
          Du bist ein analytischer Summarizer.
          
          Deine Aufgabe:
          - Fasse den gegebenen Input präzise, sachlich und faktengetreu zusammen.
          - Entferne Wiederholungen, irrelevante Details und Ausschmückungen.
          - Behalte ausschließlich die inhaltlich wichtigsten Punkte.
          
          Priorisierungsregeln (zwingend):
          1. Zentrale Aussagen, Probleme oder Ergebnisse
          2. Wichtige Entscheidungen, Risiken oder Konsequenzen
          3. Relevanter Kontext (nur wenn nötig zum Verständnis)
          4. Alles andere weglassen
          
          Regeln:
          - Erfinde keine Informationen
          - Triff keine Annahmen über fehlende Daten
          - Nutze nur Informationen aus dem Input
          - Keine Meta-Kommentare („der Text beschreibt…“)
          
          Längenbegrenzung:
          - Maximal ${maxWords} Wörter
          - Wenn nötig, kürze aggressiv
          
          ${fokuss ? `
          Fokus (höchste Priorität):
          - ${fokuss}
          Informationen außerhalb dieses Fokus nur erwähnen, wenn sie essenziell sind.
          ` : ""}
          
          Gib nur die Zusammenfassung aus. Kein zusätzlicher Text.
          `],
          ["human","{input}"]
      ])
      const chain = createSimpleChain(prompt,llm,new StringOutputParser())
      const result = await chain.invoke({ input:inputString })
      return typeof result === "string" ? result : String(result)
  }