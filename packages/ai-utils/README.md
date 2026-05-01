# @delofarag/ai-utils

Ein praktisches Utility-Package für LLM-Apps mit LangChain:

- `Chain`, `MemoryChain`, `Agent`
- RAG-Helper (FAISS, Supabase, In-Memory)
- Tooling (`ToolRegistry`, `createRAGTool`, `tavilySearchTool`)
- Magic-Funcs (Parser, Evaluator, Optimizer, Answerer)
- Modalities (STT, TTS, Vision, Image Generation)

---

## Standard-Default (wichtig)

Im Package gilt als Standard-LLM-Default für die allgemeine Nutzung:

- **Provider:** `openrouter`
- **Model:** `openai/gpt-5.4-mini`

Wenn du nichts explizit setzt, orientiere dich an diesem Default in deinen Aufrufen.

Für modality-spezifische Flows (`stt`, `tts`, `vision`, `image-gen`) wird zusätzlich mit `type` gearbeitet, damit passende Modelle gewählt werden koennen.

---

## Installation

```bash
npm i @delofarag/ai-utils
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

### Welche Variable wofuer?

- `OPENROUTER_API_KEY`: OpenRouter-Modelle und Modalities
- `CHATGROQ_API_KEY`: wenn du `provider: "chatgroq"` nutzt
- `TAVILY_API_KEY`: `websearch()` / `tavilySearchTool`
- Supabase-Variablen: fuer `createSupabaseVectoreStore()` und `getSupabaseVectorStore()`

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

---

## Core Classes

## 1) `Chain`

Stateless LLM-Chain fuer strukturierte Ergebnisse.

### Besseres Praxisbeispiel (custom output schema)

```ts
import { Chain, getLLM } from "@delofarag/ai-utils"
import { z } from "zod/v3"

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
    product: "AI-Notizapp fuer Teams",
    market: "DACH SaaS"
})
```

### RAG mit `Chain`

```ts
import { Chain, createFaissStore } from "@delofarag/ai-utils"
import { z } from "zod/v3"

const vectorStore = await createFaissStore(["Dokument A", "Dokument B"])

const chain = new Chain({
    prompt: "Beantworte Fragen nur mit Kontext.",
    output: z.object({ output: z.string() }),
    vectorStore
})

await chain.addContext(["Dokument C"])

const answer = await chain.invoke({ question: "Was steht in Dokument C?" })
```

---

## 2) `MemoryChain`

`Chain` + Conversation Memory ueber `thread_id`.

### Basis

```ts
import { MemoryChain, getLLM } from "@delofarag/ai-utils"

const memoryChain = new MemoryChain({
    llm: getLLM({ provider: "openrouter", model: "openai/gpt-5.4-mini" }),
    prompt: "Du bist ein hilfreicher Assistent."
})

await memoryChain.invoke({ thread_id: "u1", input: "Ich heisse Max." })
const r2 = await memoryChain.invoke({ thread_id: "u1", input: "Wie heisse ich?" })
```

### RAG mit `MemoryChain`

```ts
import { MemoryChain, createFaissStore } from "@delofarag/ai-utils"
import { z } from "zod/v3"

const vectorStore = await createFaissStore(["Policy A", "Policy B"])

const memoryChain = new MemoryChain({
    prompt: "Nutze Kontext und Gespraechshistorie.",
    vectorStore,
    output: z.object({ output: z.string() })
})

const response = await memoryChain.invoke({
    thread_id: "support-77",
    question: "Welche Regel steht in Policy B?"
})
```

---

## 3) `Agent`

Tool-using Agent auf Basis von `createReactAgent`.

### Basis

```ts
import { Agent, ToolRegistry, getLLM } from "@delofarag/ai-utils"
import { z } from "zod/v3"

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
    prompt: "Du darfst Tools nutzen wenn noetig.",
    tools
})

const result = await agent.invoke({ input: "Was ist 8 + 13?" })
```

### RAG mit `Agent` (als Tool)

```ts
import { Agent, ToolRegistry, createRAGTool, createFaissStore } from "@delofarag/ai-utils"

const vectorStore = await createFaissStore(["Release Notes 2026-04", "Known Issues"])
const ragTool = createRAGTool({
    vectorStore,
    name: "search_docs",
    description: "Sucht relevante Produktdokumente"
})

const registry = new ToolRegistry([
    {
        name: "search_docs",
        description: "Sucht relevante Produktdokumente",
        schema: ragTool.schema as any,
        func: ragTool.func as any
    }
])

const agent = new Agent({
    prompt: "Nutze search_docs fuer faktenbasierte Antworten.",
    tools: [...registry.allTools, ragTool]
})
```

---

## Tool Registry (eigene Section)

`ToolRegistry` konvertiert einfache Tool-Definitionen zu `DynamicStructuredTool` und bietet:

- `getTool(name)`
- `getTools(...names)`
- `allTools`

```ts
import { ToolRegistry } from "@delofarag/ai-utils"
import { z } from "zod/v3"

const registry = new ToolRegistry([
    {
        name: "get_weather",
        description: "Liefert Wetter fuer eine Stadt",
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

### Tavily Tooling

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

## Memory Section (ausfuehrlich)

### `MemorySaver` (in-memory, schnell fuer local/dev)

```ts
import { MemorySaver, SmartCheckpointSaver, getLLM } from "@delofarag/ai-utils"

const memory = new SmartCheckpointSaver(new MemorySaver(), {
    llm: getLLM({ provider: "openrouter", model: "openai/gpt-5.4-mini" }),
    messagesBeforeSummary: 12,
    maxSummaries: 7
})
```

### `SmartCheckpointSaver`

Was es macht:

- fasst alte Chatverlaeufe zusammen
- reduziert Token-Kosten
- erhaelt wichtige Fakten ueber mehrere Sessions

Wichtige Optionen:

- `messagesBeforeSummary` (default `12`)
- `maxSummaries` (default `7`)
- `llm` (default OpenRouter `gpt-5.4-mini`)
- `debug`

### `SupabaseCheckpointSaver`

Persistiert Checkpoints in Supabase.

```ts
import { SupabaseCheckpointSaver, type SupabaseCheckpointRow } from "@delofarag/ai-utils"
import { SupabaseTable } from "@delofarag/supabase-utils"

const checkpointsTable = new SupabaseTable<SupabaseCheckpointRow>({
    // ... deine SupabaseTable Konfiguration
})

const saver = new SupabaseCheckpointSaver(checkpointsTable)
```

Typischer Einsatz:

```ts
import { MemoryChain } from "@delofarag/ai-utils"

const memoryChain = new MemoryChain({
    prompt: "Du bist ein Support Assistant.",
    memory: saver
})
```

---

## RAG Utilities (Detail)

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
import { z } from "zod/v3"

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
- `createSTTPhoneSocketSession(...)` fuer live phone socket chunks (Twilio/Telnyx-style)

```ts
import { stt } from "@delofarag/ai-utils"

const result = await stt({
    audio: "./call.wav",
    prompt: "Transcribe in German."
})
```

### TTS

- `tts(...)`
- `streamTTSOverPhoneSocket(...)` fuer chunked outbound audio

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

- `session({ streamable, ... })`: CLI-like interactive loop
- `StreamResponse(asyncIterable)`: streambares NDJSON-HTTP-Response-Objekt

---

## Export Overview (high-level)

Top-level Exports decken u. a. ab:

- Helpers (`helpers`, `memory`, `rag`, `llms`, `chatbot`)
- Core (`Agent`, `Chain`, `MemoryChain`)
- Tools (`ToolRegistry`, `Tavily`, `RAGTool`, Zodios registries)
- Magic-Funcs (answerers/evaluators/parsers/optimizers)
- Modalities (`stt`, `tts`, `vision`, `generateImages`)

---

## Empfehlungen

- Fuer strukturierte Outputs immer `zod/v3` verwenden.
- Fuer Produktion API-Keys als ENV setzen, nicht hardcoden.
- Bei langen Chats `SmartCheckpointSaver` verwenden.
- RAG als Tool im `Agent` ist in der Praxis oft robuster als RAG-only Prompting.
