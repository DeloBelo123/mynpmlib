import { createSimpleChain } from "../../helpers"
import { BaseChatModel } from "../../imports"
import { ChatPromptTemplate } from "../../imports"
import { z } from "zod/v3"
import { getLLM } from "../../helpers"
import { StructuredOutputParser } from "../../imports"

export async function extract<T extends z.ZodObject<any>>({
    llm = getLLM({type:"groq", apikey: process.env.CHATGROQ_API_KEY ?? ""}),
    data,
    goal,
    schema
  }: {
    llm?: BaseChatModel
    data: any
    goal?: string
    schema: T
  }): Promise<z.infer<T>> {
  
    const inputString = typeof data === "string"
      ? data
      : JSON.stringify(data, null, 2)
  
    const parser = StructuredOutputParser.fromZodSchema(schema)
    const prompt = await ChatPromptTemplate.fromMessages([
      ["system", `
        Du bist ein präziser Informationsextraktor.
  
        
          ${goal ? `
        Ziel:
        Extrahiere ausschließlich die Informationen, die für folgendes Ziel relevant sind: 
        - "${goal}"` 
        :
         "- Extrahiere ALLE Informationen aus dem Input, die zum angegebenen Schema passen."}
  
        Regeln:
        - Keine Interpretation
        - Keine Ergänzungen
        - Nur Informationen, die explizit im Input enthalten sind
        - Antworte ausschließlich im JSON-Schema
  
        Schema:
        {format_instructions}
            `],
      ["human", "{input}"]
    ]).partial({ format_instructions: parser.getFormatInstructions() })
    const chain = createSimpleChain(prompt, llm, parser)
    const result = await chain.invoke({ input: inputString })
    return schema.parse(result)
  }