# @delofarag/ai-utils

Ein praktisches Utility-Package für LLM-Apps mit LangChain:

- `Chain`, `Agent`, `DeepAgent` (Filesystem, HITL, Sandboxes, Subagents)
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

> **DeepAgent-Dokumentation:** Abschnitt [3) DeepAgent](#3-deepagent) — Feature-Übersicht, Backend, HITL, Stream-Chunks, CLI-Testing.

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

LangChain Deep Agent (`createDeepAgent()`) als typisierte Wrapper-Klasse. Für autonome Tasks mit Filesystem, Planning, Subagents und optional Sandboxes.

### DeepAgent auf einen Blick

| Feature | Kurz erklärt |
|---|---|
| **Filesystem-Tools** | `ls`, `read_file`, `write_file`, `edit_file`, `glob`, `grep` (built-in) |
| **Custom Tools** | Eigene Tools via `ToolRegistry` / `DynamicStructuredTool` |
| **`execute`** | Shell-Befehle — nur mit Shell/Sandbox-Backend (`createLocalShellBackend`, Deno, Daytona) |
| **`backend`** | Wo Dateien physisch liegen + wie der Agent Pfade sieht |
| **`permissions`** | Statische FS-Regeln (allow/deny) — **kein** User-Dialog |
| **`interruptOn`** | Human-in-the-Loop — pausiert **vor** Tool-Ausführung, User entscheidet |
| **`checkpointer` + `thread_id`** | Conversation-State über Runs hinweg (Pflicht für HITL) |
| **`invoke` / `stream`** | Gleiche API für Message **und** HITL-Resume via `decision` |
| **`showToolCalls`** | Streamt `[tool:start]` / `[tool:end]` Events (nur `stream()`) |
| **`agentsMd`** | AGENTS.md-Dateien als Startup-Kontext |
| **`subagents`** | Delegation an spezialisierte Sub-Agents |
| **`skills`** | Skill-Dateien vom Backend laden |
| **`output`** | Optional strukturierter Zod-Output |

### Wann `DeepAgent` statt `Agent`?

| | `Agent` | `DeepAgent` |
|---|---|---|
| Tool-using ReAct | ja | ja |
| Built-in Filesystem | nein | ja |
| Backend / Sandbox | nein | ja |
| Subagents / Skills | nein | ja |
| HITL (`interruptOn`) | nein | ja |
| Typischer Use-Case | Chatbots, API-Tools | Coding Agents, autonome Tasks |

---

### Alle Props

`DeepAgent` wrappt intern LangChains `createDeepAgent()`. Die Tabelle unten listet die Props, die du über `@delofarag/ai-utils` setzt — für den **vollen Einblick aller nativen Parameter** (z. B. `cache`, `debug`, Middleware-Details, Backend-Protokolle) in die **LangChain Deep Agents Docs** schauen:

- [Deep Agents Overview](https://docs.langchain.com/oss/javascript/deepagents/overview)
- [`createDeepAgent()` Reference (JS)](https://reference.langchain.com/javascript/deepagents/agent/createDeepAgent)

Einige Namen weichen in ai-utils ab: `prompt` → `systemPrompt`, `agentsMd` → `memory`, `interruptOn` → `interrupt_on`.

```ts
new DeepAgent({
    prompt,           // string | string[] — System-Prompt(s)
    llm,              // BaseChatModel (Default: OpenRouter gpt-5.4-mini)
    tools,            // readonly DynamicStructuredTool[] (z.B. ToolRegistry.allTools)
    output,           // Zod-Schema für strukturierten Output
    checkpointer,     // BaseCheckpointSaver | boolean (Default: MemorySaver)
    backend,          // DeepAgentBackend — siehe Backend-Abschnitt
    permissions,      // FilesystemPermission[] — statische FS-Regeln
    interruptOn,      // pro Tool: decisions + question (HITL)
    agentsMd,         // string[] — Pfade zu AGENTS.md
    subagents,        // SubAgent[]
    skills,           // string[] — Skill-Pfade relativ zum Backend
    middleware,       // AgentMiddleware[]
    store,            // BaseStore — LangGraph Store
    name,             // Agent-Name
    contextSchema,    // Runtime-Context-Schema
})
```

**Wichtig:** `backend` erwartet eine **Instanz** (oder Factory) — kein `Promise`. Async Backends vorher mit `await` erstellen:

```ts
// ❌ backend: createLocalShellBackend({ ... })
// ✅ backend: await createLocalShellBackend({ ... })
```

Typ: `DeepAgentBackend` (= native deepagents `AnyBackendProtocol | Factory`).

---

### Basis: Coding Agent mit isoliertem Workspace

```ts
import path from "node:path"
import {
    DeepAgent,
    createLocalShellBackend,
    workspacePermissions,
    ToolRegistry,
    MemorySaver,
    getLLM,
} from "@delofarag/ai-utils"
import { z } from "zod/v4"

const tools = new ToolRegistry([
    {
        name: "get_weather",
        description: "Wetter für eine Stadt",
        schema: z.object({ city: z.string() }),
        func: async ({ city }) => `${city}: sonnig`,
    },
]).allTools

const agent = new DeepAgent({
    llm: getLLM({ provider: "openrouter", model: "openai/gpt-5.4-mini" }),
    prompt: "Du bist ein Coding Agent. Arbeite nur im Workspace.",
    tools,
    checkpointer: new MemorySaver(),
    backend: await createLocalShellBackend({
        rootDir: path.join(process.cwd(), "coding_space"),
        route: "/workspace/",
    }),
    permissions: workspacePermissions("/workspace/"),
})

const answer = await agent.invoke({
    input: "Erstelle eine kleine HTML-Seite",
    thread_id: "session-1",
})
```

---

### Backend: `rootDir` vs `route`

Zwei getrennte Konzepte — oft verwechselt:

| Prop | Bedeutung | Beispiel |
|---|---|---|
| **`rootDir`** | Echter Ordner auf der Festplatte | `"./coding_space"` oder absoluter Pfad |
| **`route`** | Virtueller Pfad, den der **Agent sieht** | `"/workspace/"` |

Mapping:

```
Agent schreibt:  /workspace/index.html
                         ↓
Physisch auf Disk: coding_space/index.html
```

Der Agent kennt `coding_space` nicht — nur `/workspace/`. Du entscheidest mit `rootDir`, wo Dateien wirklich landen.

**Relative Pfade für `rootDir` funktionieren** — deepagents resolved sie via `path.resolve(rootDir)`.

---

### Backend-Helper

| Helper | Async? | `execute`? | Wofür |
|---|---|---|---|
| `createStateBackend()` | nein | nein | Ephemeral — Dateien nur im Agent-State |
| `createFilesystemBackend({ rootDir })` | nein | nein | Direktes FS ohne StateBackend |
| `createWorkspaceBackend({ rootDir, route? })` | nein | nein | StateBackend + FS unter `route` (empfohlen für reines Coden) |
| `createLocalShellBackend({ rootDir, route? })` | **ja** | **ja** | Wie Workspace + Shell auf Host (**nur Dev**) |
| `createDenoSandbox()` | **ja** | ja | Isolierte Deno-Sandbox |
| `createDaytonaSandbox()` | **ja** | ja | Isolierte Daytona-Sandbox |

```ts
// Reines Filesystem (kein Shell)
backend: createWorkspaceBackend({
    rootDir: path.join(process.cwd(), "coding_space"),
    route: "/workspace/",
})

// Mit Shell (Dev only — execute läuft auf dem Host!)
backend: await createLocalShellBackend({
    rootDir: path.join(process.cwd(), "coding_space"),
    route: "/workspace/",
})
```

---

### `permissions` vs `interruptOn`

Zwei verschiedene Sicherheitsmechanismen:

| | `permissions` | `interruptOn` |
|---|---|---|
| **Was** | Statische Regeln | User-Dialog vor Tool-Ausführung |
| **Wann** | Sofort beim Tool-Call | Pause + warte auf Entscheidung |
| **Tools** | Nur FS: `ls`, `read_file`, `write_file`, `edit_file`, `glob`, `grep` | Alle konfigurierten Tools inkl. Custom + `execute` |
| **`execute`** | Wird **nicht** enforced | Kann konfiguriert werden |

Helper für `permissions`:

```ts
import { workspacePermissions, allowRead, denyWrite } from "@delofarag/ai-utils"

permissions: workspacePermissions("/workspace/")
// = lesen + schreiben nur unter /workspace/**, sonst deny
```

---

### Built-in Filesystem-Tools

DeepAgent bringt diese Tools automatisch mit (via deepagents Middleware):

- `ls`, `read_file`, `write_file`, `edit_file`, `glob`, `grep`
- `execute` — nur wenn Backend Shell/Sandbox unterstützt

Custom Tools aus `ToolRegistry` kommen dazu. Für `interruptOn`-Autocomplete werden alle verfügbaren Tool-Namen typisiert.

---

### `invoke()` — Message und HITL-Resume in einer API

**Normale Message:**

```ts
const result = await agent.invoke({
    input: "Analysiere die Codebase",
    thread_id: "u1",
})
// result: string (oder Zod-Output wenn output gesetzt)
```

**Nach Interrupt — Resume:**

```ts
let result = await agent.invoke({ input: "Schreib eine Datei", thread_id: "u1" })

if (typeof result === "object" && result.kind === "interrupt") {
    result = await agent.invoke({
        thread_id: "u1",
        decision: "approve",
    })
}
```

**Entscheidungs-Typen (`DeepAgentUserDecision`):**

```ts
"approve"
"reject"
{ type: "reject", message: "Zu gefährlich" }
{ type: "edit", args: { file_path: "/workspace/safe.txt", content: "..." } }
```

**Mehrere parallele Tool-Calls (Batch-Interrupt):**

```ts
await agent.invoke({
    thread_id: "u1",
    decisions: ["approve", "approve"],
})
```

Regeln:
- `thread_id` **Pflicht** wenn `checkpointer` gesetzt
- `decision`/`decisions` und `input` **nicht gleichzeitig**
- `checkpointer` **Pflicht** für HITL-Resume

---

### Human-in-the-Loop (`interruptOn`)

Pausiert den Agent **vor** Tool-Ausführung. Tools die **nicht** im Objekt stehen, laufen ohne Pause.

```ts
const agent = new DeepAgent({
    checkpointer: new MemorySaver(),
    tools: myTools,
    interruptOn: {
        write_file: {
            decisions: ["approve", "reject"],
            question: "Datei schreiben?",
        },
        edit_file: {
            decisions: ["approve", "edit", "reject"],
            question: (call) =>
                `Editieren?\nPfad: ${call.args.file_path ?? "?"}`,
        },
        get_weather: {
            decisions: ["approve", "reject"],
            question: (call) => `Wetter für ${call.args.city} abrufen?`,
        },
        execute: {
            decisions: ["approve", "reject"],
            question: "Shell-Befehl ausführen?",
        },
    },
})
```

**Config pro Tool:**

| Feld | Typ | Beschreibung |
|---|---|---|
| `decisions` | `("approve" \| "edit" \| "reject")[]` | Erlaubte User-Antworten |
| `question` | `string \| (toolCall) => string` | Frage an den User (statisch oder dynamisch) |

**Typisierte Keys (Autocomplete):** alle FS-Tools + deine Custom-Tools + `execute` (wenn Shell-Backend). Mit `interruptOn` gesetzt liefert `invoke()`/`stream()` zusätzlich `DeepAgentInterrupt`-Chunks.

HITL-Helper (optional, low-level):

```ts
import {
    approveDecision,
    rejectDecision,
    editDecision,
    approveAll,
    createResumeCommand,
    isInterruptResult,
    mapResultToInterrupt,
} from "@delofarag/ai-utils"
```

---

### `stream()` — Text, Interrupts und Tool-Events

Gleiche Input-API wie `invoke()` — plus optionale Tool-Events:

```ts
for await (const chunk of agent.stream({
    input: "Baue eine Website",
    thread_id: "u1",
    showToolCalls: true,
})) {
    if (typeof chunk === "string") {
        process.stdout.write(chunk)
    } else if (chunk.kind === "interrupt") {
        console.log("Interrupt:", chunk.question)
        console.log("Decisions:", chunk.decisions)
    } else if (chunk.kind === "tool") {
        console.log(`[tool:${chunk.phase}]`, chunk.toolName)
    }
}
```

**Stream-Chunk-Typen:**

| Chunk | Wann | Shape |
|---|---|---|
| `string` | LLM-Text-Tokens | `"Hallo..."` |
| `DeepAgentInterrupt` | HITL-Pause | `{ kind: "interrupt", question, decisions, toolName?, args? }` |
| `DeepAgentInterruptBatch` | Mehrere Tools gleichzeitig | `{ kind: "interrupt", items: [...] }` |
| `DeepAgentToolEvent` | Mit `showToolCalls: true` | `{ kind: "tool", phase: "start"\|"end", toolName, args? }` |

**Resume im Stream:**

```ts
for await (const chunk of agent.stream({
    thread_id: "u1",
    decision: "approve",
    showToolCalls: true,
})) { ... }
```

Frontend ohne LangChain-Bundle:

```ts
import { isInterrupt, isToolEvent } from "@delofarag/ai-utils/client"
```

---

### `agentsMd` vs `checkpointer`

| Prop | LangChain-Parameter | Bedeutung |
|---|---|---|
| `checkpointer` | `checkpointer` | Thread-State über `thread_id` (Chat-Verlauf) |
| `agentsMd` | `memory` | AGENTS.md-Pfade als Startup-Kontext (kein Chat-Memory) |

```ts
const agent = new DeepAgent({
    agentsMd: ["./AGENTS.md", "./.deepagents/AGENTS.md"],
    checkpointer: new MemorySaver(),
})
```

---

### Subagents

```ts
import { DeepAgent, createSubAgent } from "@delofarag/ai-utils"

const agent = new DeepAgent({
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

---

### Skills

Skill-Dateien vom Backend laden (deepagents native Feature):

```ts
const agent = new DeepAgent({
    backend: await createLocalShellBackend({ rootDir: "./coding_space" }),
    skills: ["./skills/refactor/SKILL.md", "./skills/test/SKILL.md"],
})
```

Pfade relativ zum Backend — der Agent kann Skills zur Laufzeit einlesen.

---

### Sandbox (Production)

```ts
import { DeepAgent, createDenoSandbox } from "@delofarag/ai-utils"

const sandbox = await createDenoSandbox()
const agent = new DeepAgent({
    backend: sandbox,
    permissions: workspacePermissions("/workspace/"),
})

// sandbox.close() wenn fertig
```

---

### Runtime-Methoden

```ts
agent.addTool(extraTool)       // Tool nachträglich hinzufügen
agent.currentTools           // string[] — alle registrierten Tool-Namen
```

---

### API-Route Pattern (NDJSON Stream)

```ts
import { StreamResponse } from "@delofarag/ai-utils"
import { isInterrupt } from "@delofarag/ai-utils/client"

// Gleiche stream()-Methode für Message und HITL-Resume
return StreamResponse(
    agent.stream({
        thread_id,
        ...(decision ? { decision } : { input: message }),
        showToolCalls: true,
    })
)
```

Response: `Content-Type: application/x-ndjson` — ein JSON-Objekt pro Zeile.

---

## Tool Registry

### `ToolRegistry`

Konvertiert einfache Tool-Definitionen zu `DynamicStructuredTool`:

- `getTool(name)` — wirft `Error` wenn Tool nicht existiert (kein `undefined`)
- `getTools(...names)` — mehrere Tools, wirft bei unbekanntem Namen
- `allTools` — alle Tools als Array

Tool-Namen werden als Literal-Typen erhalten — wichtig für `interruptOn`-Autocomplete bei `new DeepAgent()`.

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
import { session, StreamResponse, logChunk } from "@delofarag/ai-utils"
```

### `session()` — CLI-Testloop

Interaktive Konsole für `Agent.stream()` oder `DeepAgent.stream()`.

| Prop | Default | Beschreibung |
|---|---|---|
| `streamable` | — | Objekt mit `.stream({ input, thread_id, ... })` |
| `breakword` | `"exit"` | Beendet die Session |
| `id` | Timestamp | Wird als `thread_id` genutzt |
| `numberOfMessages` | `Infinity` | Max. User+Assistant-Runden |
| `isDeepAgent` | `false` | HITL-Modus für DeepAgent (siehe unten) |

**Normaler Agent:**

```ts
await session({
    streamable: agent,
    breakword: "exit",
    id: "dev-session-1",
})
```

**DeepAgent mit HITL + Tool-Logs:**

```ts
await session({
    streamable: deepAgent,
    isDeepAgent: true,
    id: "dev-session-1",
})
```

Mit `isDeepAgent: true` passiert automatisch:

- `showToolCalls: true` — `[tool:start]` / `[tool:end]` in der Konsole
- Nach einem Interrupt wartet die Session auf deine Entscheidung statt neuer Message
- Erkannte Antworten: `approve`, `ja`, `ok`, `reject`, `reject: Grund hier`
- `logChunk()` formatiert Text, Interrupts und Tool-Events lesbar

Flow:

```
You: Schreib eine Datei
Assistant: [tool:start] write_file {...}
           [interrupt] Datei schreiben?
           decisions: approve, reject
You: approve
Assistant: [tool:end] write_file
           Fertig!
```

### `StreamResponse()` — NDJSON für HTTP

Wrappt einen `AsyncIterable` als HTTP-Response (`application/x-ndjson`). Jeder Chunk = eine JSON-Zeile. Ideal für `DeepAgent.stream()` in API-Routes.

### `logChunk()`

Hilfsfunktion für Stream-Output in der Konsole — nutzt intern `isInterrupt()` und `isToolEvent()`.

---

## Export Overview

Top-level Exports (`@delofarag/ai-utils`):

- Helpers (`helpers`, `memory`, `rag`, `llms`, `chatbot`, `logChunk`)
- Core (`Agent`, `Chain`, `DeepAgent`)
- DeepAgent (`createWorkspaceBackend`, `createLocalShellBackend`, `createDenoSandbox`, `workspacePermissions`, `createSubAgent`, `interruptOn`-Helper, alle `DeepAgent*`-Types)
- Memory (`MemorySaver`, `SmartCheckpointSaver`, `SupabaseCheckpointSaver`, `chatSummarizer`)
- Tools (`ToolRegistry`, `CombinedToolRegistry`, `ZodiosToolRegistry`, `Tavily`, `RAGTool`)
- Magic-Funcs (answerers/evaluators/parsers/optimizers)
- Modalities (`stt`, `tts`, `vision`, `generateImages`)

Client-Subpath (`@delofarag/ai-utils/client`) — ohne LangChain-Bundle, für Frontend:

- Types: `DeepAgentInterrupt`, `DeepAgentToolEvent`, `DeepAgentStreamChunk`, ...
- Guards: `isInterrupt()`, `isToolEvent()`

---

## Empfehlungen

- Für strukturierte Outputs immer `zod/v4` verwenden.
- Für Produktion API-Keys als ENV setzen, nicht hardcoden.
- Bei langen Chats `SmartCheckpointSaver` am `Agent` verwenden.
- RAG als Tool im `Agent` ist in der Praxis oft robuster als RAG-only Prompting.
- `Chain` für stateless Tasks, `Agent` für Tools und Conversation Memory, `DeepAgent` für autonome Coding-/Research-Agents.
- DeepAgent: `rootDir` + `route` klar trennen — Agent sieht nur den virtuellen Pfad.
- DeepAgent HITL: immer `checkpointer` + `thread_id`; `interruptOn` pro Tool konfigurieren.
- DeepAgent Shell: `createLocalShellBackend` nur lokal/Dev — `execute` läuft auf dem Host.
- DeepAgent testen: `session({ streamable: agent, isDeepAgent: true })`.
