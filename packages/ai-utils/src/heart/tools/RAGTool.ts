import { DynamicStructuredTool } from "@langchain/core/tools"
import { VectorStore } from "@langchain/core/vectorstores"
import { z } from "zod/v4"

export interface RAGProps {
    vectorStore: VectorStore
    name: string
    description: string
    k?: number
    filter?: VectorStore["FilterType"]
}

export function createRAGTool({vectorStore,name,description,k = 4,filter}:RAGProps){
    return new DynamicStructuredTool({ name,description,
        schema: z.object({
            query:z.string().describe("der query womit du im Vector Store suchst")
        }),
        func: async ({ query }) => {
            const results = await vectorStore.similaritySearch(query, k, filter)
            const text = results.map(r => r.pageContent).join("\n\n")
            return text || "Keine relevanten Ergebnisse gefunden."
        }
    })
}
