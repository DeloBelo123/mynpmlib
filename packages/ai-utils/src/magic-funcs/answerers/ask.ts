import { createSimpleChain } from "../../helpers/helpers"
import { getLLM } from "../../helpers/llms"
import { BaseChatModel, ChatPromptTemplate, StringOutputParser } from "../../imports"

export async function ask({
    llm = getLLM({ provider: "openrouter" }),
    question
}: {
    llm?: BaseChatModel
    question: string
}){
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", `Du bist ein hilfreicher Assistent.`],
      ["human", "{input}"]
    ])
    const chain = createSimpleChain(prompt, llm, new StringOutputParser())
    return await chain.invoke({ input: question })
  }
