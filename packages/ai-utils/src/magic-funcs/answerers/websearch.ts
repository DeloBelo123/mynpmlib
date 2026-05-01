import { classify } from "../evaluators/classify"
import { TavilySearch } from "../../heart/tools/Tavily"

/**
 * Fuehrt eine Websuche via Tavily aus und gibt die zusammengefasste Antwort zurueck.
 *
 * Die Query wird vorher in ein Tavily-Topic klassifiziert (`general`, `news`, `finance`),
 * damit passend gesucht wird.
 *
 * @param query Suchanfrage als Freitext.
 * @returns Tavily-Antworttext (falls vorhanden).
 * @throws Wenn `TAVILY_API_KEY` nicht gesetzt ist.
 *
 * @example
 * ```ts
 * const answer = await websearch("Aktuelle Nachrichten zu OpenAI in der EU")
 * ```
 */
export async function websearch(query:string){
    if(!process.env.TAVILY_API_KEY) throw new Error("TAVILY_API_KEY is not set for websearch() call")
    const topic = await classify({
      data:query,
      classes:["general","news","finance"] as const,
      context:"die query soll in einem websearch verwendet werden, um relevante informationen zu finden, welcher gegebenen klasse passt der am besten?"
    })
    const tavily = new TavilySearch({
      maxResults:10,
      tavilyApiKey:process.env.TAVILY_API_KEY!,
      includeAnswer:true,
      topic:topic.class
    })
    return (await tavily.invoke({ query })).answer
  }