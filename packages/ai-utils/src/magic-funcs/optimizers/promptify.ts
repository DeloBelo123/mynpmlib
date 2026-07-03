import { getLLM } from "../../helpers/llm/llms"
import { BaseChatModel } from "../../imports"
import { ChatPromptTemplate } from "../../imports"
import { createSimpleChain } from "../../helpers/helpers"
import { StringOutputParser } from "../../imports"

/**
 * Erzeugt aus einer Nutzeranforderung einen robusten System-Prompt fuer Agents.
 *
 * Sinnvoll wenn aus vagen Anforderungen ein klarer, wiederverwendbarer Prompt entstehen soll.
 *
 * @param params.llm Optionales Chat-LLM.
 * @param params.request Urspruengliche Nutzeranfrage.
 * @param params.agentRole Optionaler Rollen-Kontext fuer den Ziel-Agenten.
 * @returns Finaler System-Prompt als String.
 *
 * @example
 * ```ts
 * const systemPrompt = await promptify({
 *   request: "Baue einen Assistenten fuer technische Kundentickets.",
 *   agentRole: "Senior Support Engineer"
 * })
 * ```
 */
export async function promptify({
    llm = getLLM({ provider: "chatgroq", apikey: process.env.CHATGROQ_API_KEY ?? "" }),
    request,
    agentRole,
  }: {
    llm?: BaseChatModel
    request: string
    agentRole?: string
    outputFormat?: string
  }): Promise<string> {
  
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", `
        Du bist ein Prompt-Engineering-Experte für KI-Agenten.
        
        Deine Aufgabe:
        - Erstelle aus der Nutzeranfrage einen präzisen, stabilen System-Prompt
          für einen spezialisierten KI-Agenten.
        
        Grundprinzip:
        - Der Prompt soll das Denken des Agenten steuern, nicht nur sein Verhalten.
        
        Regeln für den zu erzeugenden Prompt:
        - Definiere Rolle, Ziel, Vorgehen, Regeln und Output klar und explizit
        - Vermeide vage oder motivierende Sprache
        - Keine Marketingbegriffe, kein Berater-Ton
        - Keine Annahmen über Nutzerziele oder Kontext, außer sie sind explizit genannt
        - Erlaube explizit Unsicherheit und den Hinweis auf fehlende Informationen
        - Trenne Fakten klar von Einschätzungen
        - Keine Empfehlungen oder Handlungsaufforderungen, außer sie sind ausdrücklich gefordert
        
        Zwingende Struktur des erzeugten Prompts:
        1. Rolle des Agenten
        2. Ziel / Aufgabe
        3. Vorgehensweise (Analyse- oder Denkprinzipien)
        4. Regeln & Einschränkungen
        5. Erwartetes Output-Format
        
        ${agentRole ? `
        Agent-Rolle (stilistischer Kontext, keine Logikannahmen):
        - ${agentRole}
        ` : ""}
        
        Ausgabe:
        - Gib ausschließlich den finalen System-Prompt als Klartext zurück
        - Keine Meta-Erklärungen, keine Kommentare
        `],
      ["human", "{input}"]
    ])
  
    const chain = createSimpleChain(prompt, llm, new StringOutputParser())
    const result = await chain.invoke({ input: request })
  
    return result as string
  }