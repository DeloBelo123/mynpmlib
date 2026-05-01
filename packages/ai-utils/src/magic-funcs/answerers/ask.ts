import { createSimpleChain } from "../../helpers/helpers"
import { getLLM } from "../../helpers/llms"
import { BaseChatModel, ChatPromptTemplate, StringOutputParser } from "../../imports"

/**
 * Stellt eine einfache Frage an ein LLM und gibt eine Textantwort zurueck.
 *
 * Sinnvoll fuer schnelle Q&A-Use-Cases ohne zusaetzliche Struktur oder Tools.
 *
 * @param params.llm Optionales Chat-LLM. Default: `getLLM({ provider: "openrouter" })`.
 * @param params.question Die Frage, die beantwortet werden soll.
 * @returns Die Modellantwort als String.
 *
 * @example
 * ```ts
 * const answer = await ask({
 *   question: "Was ist der Unterschied zwischen RAM und ROM?"
 * })
 * ```
 */
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
