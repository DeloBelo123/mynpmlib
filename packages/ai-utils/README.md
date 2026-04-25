# @delofarag/ai-utils

Ein Bauskasten für LLM-basierte Anwendungen: Chains, Agents, Memory, RAG, Magic-Funcs und mehr.

---

## ⚠️ Disclaimer: Default-LLM & getLLM()

(btw. nutz zod/v3, neuere versionen sind buggy mit langchain)

**Für alle LLM-gebundenen Utils** (Chain, MemoryChain, Agent, Chatbot, magic-funcs) gilt:

- **Default-Modell:** `llama-3.3-70b-versatile` von **ChatGroq**
- **API-Key:** `process.env.CHATGROQ_API_KEY`

**Wenn du `CHATGROQ_API_KEY` in deiner `.env` setzt und mit dem Modell zufrieden bist, musst du kein LLM übergeben** – alles funktioniert out-of-the-box.

Du kannst jederzeit ein eigenes LLM übergeben (z.B. anderes Modell, anderer Provider). Optimal dafür: die **`getLLM()`** Funktion aus `helpers.ts`. Sie ist eine Abstraktionsschicht für:

| Typ | Beispiel |
|-----|----------|
| **Groq** | `getLLM({ type: "groq", apikey: process.env.CHATGROQ_API_KEY!, model: "llama-3.3-70b-versatile" })` |
| **OpenRouter** | `getLLM({ type: "openrouter", apikey: process.env.OPENROUTER_API_KEY!, model: "openai/gpt-4o-mini" })` |
| **Ollama (lokal)** | `getLLM({ type: "local", model: "llama3.2:3b" })` |

---

## Die 4 Hauptklassen

### 1. Chain

**Was:** Stateless LLM-Chain mit strukturiertem Output (Zod-Schema) und optionalem RAG. Für `output` (Zod v3) kannst du **z.object()** oder **z.record()** verwenden.

**Wann:** Einmalige Abfragen ohne Konversationsgedächtnis. Ideal für formularähnliche Eingabe → strukturierte Ausgabe.

**Initialisierung:**

```ts
import { Chain, DEFAULT_OUTPUT_SCHEMA } from "@delofarag/ai-utils"
import { z } from "zod/v3"

const output = z.object({
    output: z.string().describe("Deine Antwort"),
    score: z.number().optional()
})
// alternativ: z.record(z.string()) für beliebige Key-Value-Struktur

const chain = new Chain({
    prompt: "Du bist ein hilfreicher Assistent.",
    // llm optional – Default: Groq
    output
})

const result = await chain.invoke({ input: "Was ist die Hauptstadt von Frankreich?" })
// result: { output: "Paris", score?: number }
```

**RAG:** Mit `chain.setContext(vectorStore)` und `chain.addContext(["Text 1", "Text 2"])` wird automatisch Retrieval vor dem LLM-Call eingebaut.

**Warum so:** Chain ist die kleinste Einheit – nur Prompt + LLM + Output (Zod-Schema für .invoke()). Kein Memory, keine Tools. Einfach zu testen und zu komponieren.

---

### 2. MemoryChain

**Was:** Chain mit Konversationsgedächtnis. Speichert User/AI-Messages pro `thread_id`.

**Wann:** Chat-ähnliche Flows, bei denen der Kontext der vorherigen Nachrichten wichtig ist.

**Initialisierung:**

```ts
import { MemoryChain, SmartCheckpointSaver, MemorySaver, getLLM } from "@delofarag/ai-utils"

const llm = getLLM({ type: "groq", apikey: process.env.CHATGROQ_API_KEY! })

const memoryChain = new MemoryChain({
    memory: new SmartCheckpointSaver(new MemorySaver(), { llm }),
    prompt: "Du bist ein hilfreicher Assistent.",
    llm
})

const result = await memoryChain.invoke({
    thread_id: "user-123",
    input: "Ich heiße Max."
})
const result2 = await memoryChain.invoke({
    thread_id: "user-123",
    input: "Wie heiße ich?"
})
// result2.output ≈ "Du heißt Max."
```

**Alternativ:** Du kannst eine bestehende `Chain` übergeben: `new MemoryChain({ chain: myChain, memory })`.

**Warum so:** MemoryChain kapselt nur die Memory-Logik – History laden, an den Prompt anhängen, Response speichern. Die eigentliche LLM-Logik bleibt in der Chain.

---

### 3. Agent

**Was:** LLM mit Tools (z.B. Web-Suche, API-Calls, RAG). Nutzt LangGraphs `createReactAgent` unter der Haube.

**Wann:** Wenn das LLM externe Aktionen ausführen soll (Suche, Rechner, Datenbank, etc.).

**Initialisierung:**

```ts
import { Agent, ToolRegistry, createRAGTool, createFaissStore, tavilySearchTool, getLLM } from "@delofarag/ai-utils"

const vectorStore = await createFaissStore(["Dokumenteninhalt..."])
const ragTool = createRAGTool({
    vectorStore,
    name: "search_context",
    description: "Durchsucht den Kontext nach relevanten Informationen"
})

const registry = new ToolRegistry([
    { name: "calculator", description: "...", schema: z.object({ a: z.number(), b: z.number() }), func: ({ a, b }) => a + b },
    tavilySearchTool,
    ragTool
])

const agent = new Agent({
    prompt: "Du bist ein hilfreicher Assistent mit Zugang zu Tools.",
    tools: registry.allTools,
    llm: getLLM({ type: "groq" }),
    memory: new SmartCheckpointSaver(new MemorySaver(), { llm }) // optional
})

const result = await agent.invoke({
    thread_id: "session-1",  // nötig wenn memory gesetzt
    input: "Was steht heute in den Nachrichten zu KI?"
})

agent.addTool(weiteresTool)  // Tools nachträglich hinzufügen
```

**RAG:** RAG ist ein normales Tool – nutze `createRAGTool({ vectorStore, name, description })` und füge es zu `tools` hinzu oder via `agent.addTool()`.

**Warum so:** Der Agent entscheidet selbst, wann er Tools nutzt. RAG wird wie jedes andere Tool behandelt (kein setContext/addContext mehr).

---

### 4. Chatbot

**Was:** High-Level Wrapper – je nach Konfiguration entweder ein `MemoryChain` oder ein `Agent`. Discriminated Union: `tools` → Agent, `vectorStore` → MemoryChain.

**Wann:** Schnell einen chatbasierten Assistenten bauen, mit oder ohne Tools.

**Initialisierung:**

```ts
import { Chatbot, createRAGTool, createFaissStore, tavilySearchTool, getLLM } from "@delofarag/ai-utils"

// Ohne Tools, mit RAG → MemoryChain + vectorStore
const vectorStore = await createFaissStore(["Kontextdaten..."])
const simpleChatbot = new Chatbot({
    llm: getLLM({ type: "groq" }),
    prompt: "Du bist ein freundlicher Assistent.",
    vectorStore
})

// Mit Tools → Agent (RAG als Tool möglich)
const toolChatbot = new Chatbot({
    llm: getLLM({ type: "groq" }),
    tools: [
        tavilySearchTool,
        createRAGTool({ vectorStore, name: "search", description: "Durchsucht den Kontext" })
    ],
    prompt: "Du bist ein Assistent mit Webzugang."
})

// Streaming-Chat
for await (const chunk of simpleChatbot.chat({ input: "Hallo!", thread_id: "user-1" })) {
    process.stdout.write(chunk)
}

// Interaktive Session (CLI)
await simpleChatbot.session({ breakword: "exit", id: "session-1" })
```

**Warum so:** Ein Einstiegspunkt für „einfach nur chatten“. Weniger Boilerplate als Chain/MemoryChain/Agent direkt zu bauen.

---

## Tool-Registrys

### ToolRegistry (BasicToolRegistry) – empfohlen

Registriert Tools mit `name`, `description`, `schema`, `func`. Perfekt für manuell definierte Tools.

```ts
import { ToolRegistry } from "@delofarag/ai-utils"
import { z } from "zod/v3"

const registry = new ToolRegistry([
    {
        name: "greet",
        description: "Begrüßt eine Person",
        schema: z.object({ name: z.string() }),
        func: ({ name }) => `Hallo, ${name}!`
    }
])

const tool = registry.getTool("greet")
const allTools = registry.allTools
```

### ZodiosToolRegistry – noch experimentell

Wandelt Zodios-API-Endpoints automatisch in Tools um. **Funktioniert derzeit nicht zuverlässig** – nur testen, nicht für Produktion.

### tavilySearchTool & TAVILY_API_KEY

Das `tavilySearchTool` ist ein vorgefertigtes Tool für Web-Suche via Tavily. Nutzung:

- **API-Key:** `process.env.TAVILY_API_KEY` (in `.env` setzen)
- **Import:** `tavilySearchTool` aus `@delofarag/ai-utils`
- **Beispiel:** Siehe Agent-Beispiel oben

Alternativ: `TavilySearch`-Klasse für direkten Aufruf (z.B. in `websearch()`).

---

## Magic-Funcs

Kleine, wiederverwendbare LLM-Funktionen. **Struktur:** Immer `{ llm?, ...params }` – `llm` optional, sonst Default (Groq).

### Answerers

- **ask(question)** – Einfache Frage → Textantwort  
- **websearch(query)** – Sucht im Web (Tavily), braucht `TAVILY_API_KEY`

### Evaluators

- **classify({ data, classes, context? })** – Ordnet Input einer von mehreren Klassen zu  
- **decide({ material, kriteria_to_decide })** – Ja/Nein/Unclear plus Begründung

### Parsers

- **extract({ data, schema, goal? })** – Extrahiert strukturierte Daten gemäß Zod-Schema  
- **structure({ data, into, retries? })** – Formatiert beliebigen Input in ein Zod-Schema  
- **rewrite({ data, instruction })** – Transformiert Text nach Anweisung  
- **summarize({ data, fokuss?, maxWords? })** – Fasst zusammen

### Optimizers

- **promptify({ request, agentRole? })** – Erzeugt System-Prompts aus Nutzeranfragen  
- **ragify({ data })** – Optimiert Text für RAG (strukturierter, informationsdicht)

**Beispiel – immer gleiche Struktur:**

```ts
import { classify, extract, summarize } from "@delofarag/ai-utils"
import { z } from "zod/v3"

const klasse = await classify({
    data: "Produktbewertung: Tolle Qualität!",
    classes: ["positiv", "negativ", "neutral"] as const
})

const infos = await extract({
    data: "Max, 30 Jahre, Berlin",
    schema: z.object({ name: z.string(), alter: z.number(), stadt: z.string() })
})

const kurz = await summarize({ data: langerText, maxWords: 50 })
```

---

## RAG-Implementierungen

**Vector Stores** (in `rag.ts`):

- **turn_to_docs(data)** – Wandelt Strings/Objekte in LangChain-`Document[]` um
- **createSupabaseVectoreStore({ supabase, data, table_name?, RPC_function? })** – Supabase Vector Store aus Daten
- **getSupabaseVectorStore({ supabase, table_name?, RPC_function? })** – Bestehenden Store holen
- **createFaissStore({ data, save_path?, embeddings? })** – FAISS-Store (lokal, speicherbar)
- **loadFaissStore({ path, embeddings? })** – FAISS-Store laden

**RAG als Tool** (für Agent):

- **createRAGTool({ vectorStore, name, description })** – Erzeugt ein Tool, mit dem der Agent den Vector Store durchsucht. In `tools` übergeben oder via `agent.addTool()`.

**Retrieval-Chains** (in `rag.ts`):

- **createRAGChain({ vectorStore, llm, prompt?, num_of_results_from_vdb? })** – Retrieval-Chain
- **createRAGChainFromRetriever({ retriever, llm, prompt? })** – Alternative mit eigenem Retriever

**Typischer Ablauf:**

1. Vector Store erstellen: `createFaissStore({ data })` oder `createSupabaseVectoreStore({ data })`
2. **Chain/MemoryChain:** `chain.setContext(vectorStore)` – RAG wird automatisch eingebaut. Optional `chain.addContext(weitereDaten)` für weitere Docs
3. **Agent/Chatbot:** `createRAGTool({ vectorStore, name, description })` als Tool übergeben

---

## Memory: SupabaseCheckpointSaver & SmartCheckpointSaver

### SupabaseCheckpointSaver

Speichert Checkpoints (inkl. Konversationsverlauf) in einer Supabase-Tabelle. Für persistente Chats über Sessions hinweg.

```ts
import { SupabaseCheckpointSaver, SupabaseCheckpointRow } from "@delofarag/ai-utils"
import { SupabaseTable } from "@delofarag/supabase-utils"

const table = new SupabaseTable<SupabaseCheckpointRow>({ /* ... */ })
const saver = new SupabaseCheckpointSaver(table)

const memoryChain = new MemoryChain({
    chain: myChain,
    memory: saver
})
```

**Hinweis:** Noch unter Test – Tabellen-Schema muss zu den Checkpoint-Strukturen passen.

### SmartCheckpointSaver

Wrapper um einen anderen `BaseCheckpointSaver` (z.B. `MemorySaver` oder `SupabaseCheckpointSaver`). Führt automatisch **Summarization** durch:

- Nach `messagesBeforeSummary` User/AI-Nachrichten (Default: 12) wird die Konversation zusammengefasst
- Die Zusammenfassung ersetzt die alten Messages → weniger Tokens, längerer Kontext
- `maxSummaries` (Default: 7): Maximal so viele Summaries werden behalten. Sobald eine neue erstellt würde und das Limit überschritten wäre, wird die älteste Summary gelöscht (Rolling-Window)

```ts
import { SmartCheckpointSaver, MemorySaver, getLLM } from "@delofarag/ai-utils"

const llm = getLLM({ type: "groq", apikey: process.env.CHATGROQ_API_KEY! })
const memory = new SmartCheckpointSaver(new MemorySaver(), {
    llm,
    messagesBeforeSummary: 12,
    maxSummaries: 7,
})

const chatbot = new Chatbot({ llm, memory })
```

**Warum so:** Lange Chats blähen den Kontext auf. SmartCheckpointSaver hält die wichtigsten Infos in Zusammenfassungen und reduziert Token-Verbrauch.

---

## Kurzüberblick

| Util | Zweck |
|------|-------|
| **Chain** | Stateless LLM + Schema, optional RAG (setContext/addContext) |
| **MemoryChain** | Chain + Konversations-Memory pro thread_id, optional RAG |
| **Agent** | LLM + Tools, optional Memory. RAG via createRAGTool + addTool |
| **Chatbot** | Discriminated Union: tools → Agent, vectorStore → MemoryChain |
| **ToolRegistry** | Tools registrieren (empfohlen) |
| **tavilySearchTool** | Web-Suche (TAVILY_API_KEY) |
| **Magic-Funcs** | ask, websearch, classify, decide, extract, structure, rewrite, summarize, promptify, ragify |
| **RAG** | createRAGTool, Supabase/FAISS Vector Stores, createRAGChain |
| **SupabaseCheckpointSaver** | Persistente Memory in Supabase |
| **SmartCheckpointSaver** | Memory mit Auto-Summarization |
| **getLLM()** | LLM aus Groq, OpenRouter oder Ollama |

---

## .env-Variablen

| Variable | Verwendung |
|----------|------------|
| `CHATGROQ_API_KEY` | Default für alle LLM-Utils |
| `TAVILY_API_KEY` | tavilySearchTool, websearch() |
