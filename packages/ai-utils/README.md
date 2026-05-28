# @delofarag/ai-utils

Ein praktisches Utility-Package für LLM-Apps mit LangChain:

- `Chain`, `Agent`, `DeepAgent`
- Memory via Checkpoint-Saver (`MemorySaver`, `SmartCheckpointSaver`, `SupabaseCheckpointSaver`)
- RAG-Helper (FAISS, Supabase, In-Memory)
- Tooling (`ToolRegistry`, `CombinedToolRegistry`, `ZodiosToolRegistry`, `createRAGTool`, `tavilySearchTool`)
- Magic-Funcs (Parser, Evaluator, Optimizer, Answerer)
- Modalities (STT, TTS, Vision, Image Generation)

---

## Standard-Default (wichtig)

Im Package gilt als Standard-LLM-Default für die allgemeine Nutzung:

- **Provider:** `openrouter`
- **Model:** `openai/gpt-5.4-mini`

Wenn du nichts explizit setzt, orientiere dich an diesem Default in deinen Aufrufen.

Für modality-spezifische Flows (`stt`, `tts`, `vision`, `image-gen`) wird zusätzlich mit `type` gearbeitet, damit passende Modelle gewählt werden können.

---

## Installation

```bash
npm i @delofarag/ai-utils
```

Peer dependency für Supabase-Features:

```bash
npm i @delofarag/supabase-utils
```

---

## Environment Variables

Empfohlen in `.env`:

```env
OPENROUTER_API_KEY=...
CHATGROQ_API_KEY=...
TAVILY_API_KEY=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

### Welche Variable wofür?

- `OPENROUTER_API_KEY`: OpenRouter-Modelle und Modalities
- `CHATGROQ_API_KEY`: wenn du `provider: "chatgroq"` nutzt
- `TAVILY_API_KEY`: `websearch()` / `tavilySearchTool`
- Supabase-Variablen: für `createSupabaseVectoreStore()`, `getSupabaseVectorStore()` und `SupabaseCheckpointSaver`

---

## Schnellstart: `getLLM()`

```ts
import { getLLM } from "@delofarag/ai-utils"

const llm = getLLM({ provider: "openrouter", model: "openai/gpt-5.4-mini" })
```

Beispiele:

```ts
const llmOpenRouter = getLLM({ provider: "openrouter", model: "openai/gpt-5.4-mini" })
const llmGroq = getLLM({ provider: "chatgroq", model: "llama-3.3-70b-versatile" })
const llmLocal = getLLM({ provider: "local", model: "llama3.2:3b" })
```

Modality-spezifisch:

```ts
getLLM({ provider: "openrouter", type: "stt" })
getLLM({ provider: "openrouter", type: "tts" })
getLLM({ provider: "openrouter", type: "vision" })
getLLM({ provider: "openrouter", type: "image-gen" })
```

EU-Datenrouting (OpenRouter):

```ts
getLLM({ provider: "openrouter", dataSafe: true })
```

---

## Core Classes

## 1) `Chain`

Stateless LLM-Chain für strukturierte Ergebnisse. Kein Memory — `thread_id` wird ignoriert.

### Custom Output Schema

```ts
import { Chain, getLLM } from "@delofarag/ai-utils"
import { z } from "zod/v4"

const productBriefSchema = z.object({
    title: z.string().describe("Kurzer Produktname"),
    targetAudience: z.string().describe("Wer soll das Produkt nutzen?"),
    keyBenefits: z.array(z.string()).describe("Top Vorteile"),
    pricePositioning: z.enum(["budget", "mid", "premium"])
})

const chain = new Chain({
    llm: getLLM({ provider: "openrouter", model: "openai/gpt-5.4-mini" }),
    prompt: "Du bist ein Product-Marketing-Assistent.",
    output: productBriefSchema
})

const result = await chain.invoke({
    product: "AI-Notizapp für Teams",
    market: "DACH SaaS"
})
```

### RAG mit `Chain`

```ts
import { Chain, createFaissStore } from "@delofarag/ai-utils"
import { z } from "zod/v4"

const vectorStore = await createFaissStore(["Dokument A", "Dokument B"])

const chain = new Chain({
    prompt: "Beantworte Fragen nur mit Kontext.",
    output: z.object({ output: z.string() }),
    vectorStore
})

await chain.addContext(["Dokument C"])

const answer = await chain.invoke({ question: "Was steht in Dokument C?" })
```

### Streaming

```ts
for await (const chunk of chain.stream({ question: "Erkläre das kurz." })) {
    process.stdout.write(chunk)
}
```

---

## 2) `Agent`

Tool-using Agent auf Basis von `createReactAgent`. Unterstützt optional Checkpointer (Thread-State) und strukturierten Output.

### Basis

```ts
import { Agent, ToolRegistry, getLLM } from "@delofarag/ai-utils"
import { z } from "zod/v4"

const tools = new ToolRegistry([
    {
        name: "sum",
        description: "Addiert zwei Zahlen",
        schema: z.object({ a: z.number(), b: z.number() }),
        func: ({ a, b }) => a + b
    }
]).allTools

const agent = new Agent({
    llm: getLLM({ provider: "openrouter", model: "openai/gpt-5.4-mini" }),
    prompt: "Du darfst Tools nutzen wenn nötig.",
    tools
})

const result = await agent.invoke({ input: "Was ist 8 + 13?" })
```

### Checkpointer mit `Agent`

Conversation State läuft über Checkpoint-Saver + `thread_id`:

```ts
import { Agent, MemorySaver, SmartCheckpointSaver, getLLM } from "@delofarag/ai-utils"

const checkpointer = new SmartCheckpointSaver(new MemorySaver(), {
    llm: getLLM({ provider: "openrouter" }),
    messagesBeforeSummary: 12,
    maxSummaries: 7
})

const agent = new Agent({
    tools: [...],
    prompt: "Du bist ein hilfreicher Assistent.",
    checkpointer
})

await agent.invoke({ thread_id: "u1", input: "Ich heisse Max." })
const r2 = await agent.invoke({ thread_id: "u1", input: "Wie heisse ich?" })
```

### Strukturierter Output

```ts
const agent = new Agent({
    tools,
    output: z.object({
        answer: z.string(),
        confidence: z.number()
    })
})

const result = await agent.invoke({ input: "Analysiere das..." })
// result: { answer: string, confidence: number }
```

### RAG als Tool

```ts
import { Agent, createRAGTool, createFaissStore } from "@delofarag/ai-utils"

const vectorStore = await createFaissStore(["Release Notes 2026-04", "Known Issues"])
const ragTool = createRAGTool({
    vectorStore,
    name: "search_docs",
    description: "Sucht relevante Produktdokumente"
})

const agent = new Agent({
    prompt: "Nutze search_docs für faktenbasierte Antworten.",
    tools: [ragTool]
})
```

### Streaming

```ts
for await (const chunk of agent.stream({ input: "Erkläre mir das.", thread_id: "u1" })) {
    process.stdout.write(chunk)
}
```

---

## 3) `DeepAgent`

LangChain Deep Agent auf Basis von `createDeepAgent()`. Bringt Filesystem, Planning, Subagents und optional Sandboxes mit.

### Basis

```ts
import {
    DeepAgent,
    createWorkspaceBackend,
    workspacePermissions,
    MemorySaver,
    getLLM,
} from "@delofarag/ai-utils"

const deepAgent = new DeepAgent({
    llm: getLLM({ provider: "openrouter", model: "openai/gpt-5.4-mini" }),
    prompt: "Du bist ein Coding Agent.",
    tools: [...],
    backend: createWorkspaceBackend({ rootDir: process.cwd() }),
    permissions: workspacePermissions(),
    checkpointer: new MemorySaver(),
})

const answer = await deepAgent.invoke({
    input: "Analysiere src/heart/agent.ts",
    thread_id: "u1",
})
```

### `agentsMd` vs `checkpointer`

| Prop | LangChain-Parameter | Bedeutung |
|---|---|---|
| `checkpointer` | `checkpointer` | Thread-State über `thread_id` |
| `agentsMd` | `memory` | AGENTS.md-Pfade als Startup-Kontext |

```ts
const deepAgent = new DeepAgent({
    agentsMd: ["./AGENTS.md", "./.deepagents/AGENTS.md"],
    checkpointer: new MemorySaver(),
})
```

### Subagents

```ts
import { DeepAgent, createSubAgent } from "@delofarag/ai-utils"

const deepAgent = new DeepAgent({
    subagents: [
        createSubAgent({
            name: "researcher",
            description: "Recherchiert komplexe Themen",
            prompt: "Du bist ein Research-Spezialist.",
            tools: [...],
        }),
    ],
})
```

### Sandbox

```ts
import { DeepAgent, createDenoSandbox } from "@delofarag/ai-utils"

const sandbox = await createDenoSandbox()
const deepAgent = new DeepAgent({
    backend: sandbox,
})

// sandbox.close() wenn fertig
```

### Human-in-the-Loop (`interruptOn`)

Pausiert den Agent **vor** Tool-Ausführung. Braucht `checkpointer` + `thread_id`.

```ts
import {
    DeepAgent,
    MemorySaver,
    StreamResponse,
} from "@delofarag/ai-utils"
import { isInterrupt } from "@delofarag/ai-utils/client"

const hrAgent = new DeepAgent({
    checkpointer: new MemorySaver(),
    interruptOn: {
        write_file: {
            decisions: ["approve", "edit", "reject"],
            question: "Der Agent möchte eine Datei schreiben. Erlauben?",
        },
    },
})

// invoke
let res = await hrAgent.invoke({ input: "Lösch alte Logs", thread_id: "u1" })
if (isInterrupt(res)) {
    res = await hrAgent.invoke({ thread_id: "u1", decision: "approve" })
}

// stream (NDJSON via StreamResponse)
for await (const chunk of hrAgent.stream({ input: "Analysiere...", thread_id: "u1" })) {
    if (isInterrupt(chunk)) break
    process.stdout.write(chunk)
}

// API route — gleiche Methode für Message und Resume
return StreamResponse(
    hrAgent.stream({
        thread_id: "u1",
        ...(decision ? { decision } : { input: message }),
    })
)
```

Frontend: `import { isInterrupt } from "@delofarag/ai-utils/client"` — kein LangChain im Bundle.

Ohne `interruptOn`: invoke/stream liefern plain `string` wie bisher.

### Backend-Helper

- `createStateBackend()`
- `createFilesystemBackend({ rootDir, virtualMode })`
- `createWorkspaceBackend({ rootDir, route })`
- `createLocalShellBackend()` (async, Host-Shell — nur Dev)
- `createDenoSandbox()` / `createDaytonaSandbox()` (async)

---

## Tool Registry

### `ToolRegistry`

Konvertiert einfache Tool-Definitionen zu `DynamicStructuredTool`:

- `getTool(name)`
- `getTools(...names)`
- `allTools`

```ts
import { ToolRegistry } from "@delofarag/ai-utils"
import { z } from "zod/v4"

const registry = new ToolRegistry([
    {
        name: "get_weather",
        description: "Liefert Wetter für eine Stadt",
        schema: z.object({ city: z.string() }),
        func: async ({ city }) => `${city}: sonnig`
    },
    {
        name: "get_time",
        description: "Liefert aktuelle Zeit",
        schema: z.object({}),
        func: async () => new Date().toISOString()
    }
])

const weatherTool = registry.getTool("get_weather")
const tools = registry.allTools
```

### `CombinedToolRegistry` + `ZodiosToolRegistry`

Kombiniert manuelle Tools mit einem Zodios-API-Client (max. 1 Client):

```ts
import { CombinedToolRegistry } from "@delofarag/ai-utils"
import { Zodios } from "zodios"

const registry = new CombinedToolRegistry([
    {
        name: "get_weather",
        description: "Wetter abfragen",
        schema: z.object({ city: z.string() }),
        func: async ({ city }) => `${city}: sonnig`
    },
    myZodiosClient
] as const)

const agent = new Agent({ tools: registry.allTools })
```

### Tavily

```ts
import { tavilySearchTool, TavilySearch } from "@delofarag/ai-utils"

const tavily = new TavilySearch({
    tavilyApiKey: process.env.TAVILY_API_KEY,
    maxResults: 5,
    topic: "general",
    includeAnswer: false
})

const response = await tavily.invoke({ query: "latest AI regulation EU" })
```

---

## Memory (Checkpoint-Saver)

Thread-State wird über LangGraph Checkpoint-Saver an `Agent` / `DeepAgent` gehängt — nicht über eine eigene Chain-Klasse.

### `MemorySaver` (in-memory, schnell für local/dev)

```ts
import { MemorySaver, SmartCheckpointSaver, getLLM } from "@delofarag/ai-utils"

const checkpointer = new SmartCheckpointSaver(new MemorySaver(), {
    llm: getLLM({ provider: "openrouter", model: "openai/gpt-5.4-mini" }),
    messagesBeforeSummary: 12,
    maxSummaries: 7
})
```

### `SmartCheckpointSaver`

- fasst alte Chatverläufe zusammen
- reduziert Token-Kosten
- erhält wichtige Fakten über mehrere Sessions

Optionen:

- `messagesBeforeSummary` (default `12`)
- `maxSummaries` (default `7`)
- `llm` (default OpenRouter `gpt-5.4-mini`)
- `debug`

### `SupabaseCheckpointSaver`

Persistiert Checkpoints in Supabase:

```ts
import { SupabaseCheckpointSaver, type SupabaseCheckpointRow } from "@delofarag/ai-utils"
import { SupabaseTable } from "@delofarag/supabase-utils"

const checkpointsTable = new SupabaseTable<SupabaseCheckpointRow>({
    // ... deine SupabaseTable Konfiguration
})

const saver = new SupabaseCheckpointSaver(checkpointsTable)

const agent = new Agent({
    tools: [...],
    checkpointer: saver
})
```

### Checkpoint-Helpers

```ts
import {
    formatCheckpointMessagesForLLM,
    getMessagesArrayFromCheckpoint,
    chatSummarizer
} from "@delofarag/ai-utils"
```

---

## RAG Utilities

### Vector Stores

- `createRAMVectoreStore(data)`
- `createSupabaseVectoreStore(data, config?)`
- `getSupabaseVectorStore(config?)`
- `createFaissStore(data, config?)`
- `loadFaissStore({ path })`
- `turn_to_docs(data)`

### RAG Chain

- `createRAGChain({ vectorStore, llm, prompt?, num_of_results_from_vdb? })`

### RAG Tool

- `createRAGTool({ vectorStore, name, description })`

```ts
import { createRAGTool, createFaissStore } from "@delofarag/ai-utils"

const vectorStore = await createFaissStore(["FAQ 1", "FAQ 2"])
const ragTool = createRAGTool({
    vectorStore,
    name: "search_faq",
    description: "Sucht in FAQ-Dokumenten"
})
```

---

## Magic-Funcs

### Answerers

- `ask({ question, llm? })`
- `websearch(query)` (braucht `TAVILY_API_KEY`)

### Evaluators

- `classify({ data, classes, context?, llm? })`
- `decide({ material, kriteria_to_decide, llm? })`

### Parsers

- `extract({ data, schema, goal?, llm? })`
- `structure({ data, into, retries?, llm? })`
- `rewrite({ data, instruction, llm? })`
- `summarize({ data, fokuss?, maxWords?, llm? })`

### Optimizers

- `promptify({ request, agentRole?, llm? })`
- `ragify({ data, llm? })`

Beispiel:

```ts
import { classify, extract, summarize } from "@delofarag/ai-utils"
import { z } from "zod/v4"

const sentiment = await classify({
    data: "Das Produkt ist wirklich gut.",
    classes: ["positiv", "negativ", "neutral"] as const
})

const person = await extract({
    data: "Max ist 30 und lebt in Berlin.",
    schema: z.object({
        name: z.string(),
        age: z.number(),
        city: z.string()
    })
})

const short = await summarize({
    data: "Sehr langer Text...",
    maxWords: 50
})
```

---

## Modalities

### STT

- `stt(...)`
- `createSTTPhoneSocketSession(...)` für live phone socket chunks (Twilio/Telnyx-style)

```ts
import { stt } from "@delofarag/ai-utils"

const result = await stt({
    audio: "./call.wav",
    prompt: "Transcribe in German."
})
```

### TTS

- `tts(...)`
- `streamTTSOverPhoneSocket(...)` für chunked outbound audio

```ts
import { tts, streamTTSOverPhoneSocket } from "@delofarag/ai-utils"

const speech = await tts({
    text: "Willkommen beim Support.",
    model: "nova"
})

await streamTTSOverPhoneSocket({
    text: "Einen Moment bitte.",
    model: "nova",
    onChunk: async (chunk) => {
        // socket send
    }
})
```

### Vision

```ts
import { vision } from "@delofarag/ai-utils"

const result = await vision({
    prompt: "Was ist auf dem Bild zu sehen?",
    images: ["https://example.com/photo.jpg"]
})
```

### Image Generation

```ts
import { generateImages } from "@delofarag/ai-utils"

const generated = await generateImages({
    prompt: "Generate a clean product hero image",
    imageConfig: { aspect_ratio: "16:9", image_size: "2K" }
})
```

---

## Session / Stream Helpers

```ts
import { session, StreamResponse } from "@delofarag/ai-utils"
```

- `session({ streamable, ... })`: CLI-like interactive loop (für `Agent.stream`)
- `StreamResponse(asyncIterable)`: streambares NDJSON-HTTP-Response-Objekt

```ts
await session({
    streamable: agent,
    breakword: "exit",
    id: "dev-session-1"
})
```

---

## Export Overview

Top-level Exports decken u. a. ab:

- Helpers (`helpers`, `memory`, `rag`, `llms`, `chatbot`)
- Core (`Agent`, `Chain`)
- Memory (`MemorySaver`, `SmartCheckpointSaver`, `SupabaseCheckpointSaver`, `chatSummarizer`)
- Tools (`ToolRegistry`, `CombinedToolRegistry`, `ZodiosToolRegistry`, `Tavily`, `RAGTool`)
- Magic-Funcs (answerers/evaluators/parsers/optimizers)
- Modalities (`stt`, `tts`, `vision`, `generateImages`)

---

## Empfehlungen

- Für strukturierte Outputs immer `zod/v4` verwenden.
- Für Produktion API-Keys als ENV setzen, nicht hardcoden.
- Bei langen Chats `SmartCheckpointSaver` am `Agent` verwenden.
- RAG als Tool im `Agent` ist in der Praxis oft robuster als RAG-only Prompting.
- `Chain` für stateless Tasks, `Agent` für Tools und Conversation Memory.
