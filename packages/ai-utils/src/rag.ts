import { 
    SupabaseVectorStore, 
    OllamaEmbeddings, 
    RecursiveCharacterTextSplitter, 
    FaissStore, 
    MemoryVectorStore,
    Document, 
    Embeddings,
    createStuffDocumentsChain,
    createRetrievalChain,
    ChatPromptTemplate,
    BaseChatModel,
    VectorStore,
    BaseRetriever
} from "./imports"
import { SupabaseClient } from "@delofarag/supabase-utils"
import { createClient } from "@supabase/supabase-js"

interface SupabaseStoreConfig {
    table_name?: string
    RPC_function?: string
    supabase?: SupabaseClient
}

export const baseEmbeddings = new OllamaEmbeddings({
    model: "nomic-embed-text"
})

export const baseSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 50
})

export function turn_to_docs<T>(docs: T[]): Document<Record<string,any>>[] {
    return docs.map(doc => new Document({
        pageContent: typeof doc === "string" ? doc : JSON.stringify(doc,null,2),
        metadata: {}
    }))
}

/** nur für demos */
export async function createRAMVectoreStore(
    data: string[],
    {
        embeddings = baseEmbeddings
    }: { embeddings?: Embeddings } = {}
) {
    const docs = turn_to_docs(data)
    const splitted_docs = await baseSplitter.splitDocuments(docs)
    return await MemoryVectorStore.fromDocuments(splitted_docs, embeddings)
}

export async function createSupabaseVectoreStore(
    data:string[], 
    {
        supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!),
        table_name = "documents", 
        RPC_function = "match_documents", 
    }:SupabaseStoreConfig = {}) {
    const docs = turn_to_docs(data)
    const splitted_docs = await baseSplitter.splitDocuments(docs)
    return await SupabaseVectorStore.fromDocuments(  
        splitted_docs,
        baseEmbeddings,
        {
            client: supabase,
            tableName: table_name,
            queryName: RPC_function
        }
    )
}

// Bestehenden Supabase Store holen (ohne neue Docs)
export function getSupabaseVectorStore({
    supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!),
    table_name = "documents", 
    RPC_function = "match_documents"
}: SupabaseStoreConfig = {}) {
    return new SupabaseVectorStore(baseEmbeddings, {
        client: supabase,
        tableName: table_name,
        queryName: RPC_function
    })
}

export async function createFaissStore(
    data:string[], 
    { 
        save_path = "faiss_rag", 
        embeddings = baseEmbeddings
    }: { save_path?: string, embeddings?: Embeddings} = {}) {
    const docs = turn_to_docs(data)
    const splitted_docs = await baseSplitter.splitDocuments(docs)
    const vectore_store = await FaissStore.fromDocuments(
        splitted_docs,
        embeddings
    )
    if (save_path) {
        await vectore_store.save(save_path)
    }
    return vectore_store
}

export async function loadFaissStore({path, embeddings = baseEmbeddings}: {path: string, embeddings?: Embeddings}) {
    return await FaissStore.load(path, embeddings)
}

export async function createRAGChain({
    vectorStore,
    llm,
    prompt,
    num_of_results_from_vdb = 4
}: {
    vectorStore: VectorStore,
    llm: BaseChatModel,
    prompt?: ChatPromptTemplate,
    num_of_results_from_vdb?: number
}) {
    const model = llm
    const retriever = vectorStore.asRetriever({ k: num_of_results_from_vdb })
    
    // Document Chain: Kombiniert Docs in den Prompt
    const documentChain = await createStuffDocumentsChain({
        llm: model as any,
        prompt: prompt as any
    })
    
    // Retrieval Chain: Verbindet Retriever mit Document Chain
    const retrievalChain = await createRetrievalChain({
        retriever: retriever as any,
        combineDocsChain: documentChain
    })
    
    return retrievalChain
}

