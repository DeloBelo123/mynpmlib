import { classify } from "../evaluators/classify"
import { TavilySearch } from "../../heart/tools/Tavily"

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