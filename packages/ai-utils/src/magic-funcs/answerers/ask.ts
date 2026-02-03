import { createSimpleChain, getLLM } from "../../helpers"
import { BaseChatModel, ChatPromptTemplate, StringOutputParser } from "../../imports"

export async function ask(input:string | {llm:BaseChatModel, question:string}){
    const llm = typeof input === "string" ? getLLM({type:"groq", apikey: process.env.CHATGROQ_API_KEY ?? ""}) : input.llm
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", `Du bist ein hilfreicher Assistent.`],
      ["human", "{input}"]
    ])
    const chain = createSimpleChain(prompt, llm, new StringOutputParser())
    if(typeof input === "string"){
      return await chain.invoke({ input })
    } else {
      return await chain.invoke({ input: input.question})
    }
  }
