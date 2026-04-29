import { getLLM } from "../../helpers/llms"
import { BaseChatModel } from "../../imports"
import { ChatPromptTemplate } from "../../imports"
import { createSimpleChain } from "../../helpers/helpers"
import { StringOutputParser } from "../../imports"

export async function ragify({
    llm = getLLM({ provider: "chatgroq", apikey: process.env.CHATGROQ_API_KEY ?? "" }),
    data,
  }: {
    llm?: BaseChatModel
    data: string
  }): Promise<string> {
  
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", `
        Du bist ein RAG-Kontext-Optimierer.
  
        Aufgabe:
        - Wandle den gegebenen Input in einen strukturierten, informationsdichten Kontext um,
          der für nachgelagertes Reasoning optimal geeignet ist.
  
        Regeln:
        - Nutze ausschließlich Informationen aus dem Input
        - Keine Annahmen, keine Ergänzungen
        - Entferne Redundanz und Füllwörter
        - Erhalte alle relevanten Fakten, Risiken, Entscheidungen und Zusammenhänge
        - Schreibe sachlich, präzise und explizit
  
        Struktur:
        - Nutze klare Abschnitte mit Überschriften
        - Bevorzuge Listen gegenüber Fließtext
        - Jede Aussage muss eigenständig verständlich sein
  
        Ausgabe:
        - Gib ausschließlich den strukturierten Kontext als Text zurück
        - Kein JSON, kein Meta-Text
        - Bevorzuge Fakten, Beobachtungen und Risiken gegenüber narrativen Zusammenfassungen.
        - Wenn ein Satz mit „es gibt“, „wird angesehen“, „könnte“ beginnt,
          ist er fast immer zu weich für gutes RAG.
  
            `],
      ["human", "{input}"] 
    ])
  
    const chain = createSimpleChain(prompt, llm, new StringOutputParser())
    const result = await chain.invoke({ input: data })
  
    return result as string
  }