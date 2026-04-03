import { DynamicStructuredTool } from "@langchain/core/tools"
import { VectorStore } from "@langchain/core/vectorstores"
import z from "zod/v3"

export interface RAGProps {
    vectorStore: VectorStore
    name: string
    description: string
}

export function createRAGTool({vectorStore,name,description}:RAGProps){
    return new DynamicStructuredTool({ name,description,
        schema: z.object({
            query:z.string().describe("der query womit du im Vector Store suchst")
        }),
        func: async ({ query }) => {
            const results = await vectorStore.similaritySearch(query)
            const text = results.map(r => r.pageContent).join("\n\n")
            return text || "Keine relevanten Ergebnisse gefunden."
        }
    })
}
