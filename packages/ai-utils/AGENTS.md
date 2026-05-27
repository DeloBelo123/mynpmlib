# ai-utils — Agent Guide

Kurzreferenz für Entwicklung und AI-Assistenten in `@delofarag/ai-utils`.

## Aktuelle Architektur

| Modul | Pfad | Zweck |
|---|---|---|
| `Chain` | `src/heart/chain.ts` | Stateless LLM-Calls mit Zod-Output, optional RAG |
| `Agent` | `src/heart/agent.ts` | Tool-using ReAct-Agent, optional Checkpointer + strukturierter Output |
| `DeepAgent` | `src/heart/deepAgent.ts` | LangChain Deep Agent (Filesystem, Subagents, Sandboxes) |
| Checkpointer | `src/helpers/memory.ts` | Checkpoint-Saver (Supabase, Smart-Summary) |
| RAG | `src/helpers/rag.ts` | Vector Stores, `createRAGChain`, `createRAGTool` |
| DeepAgent-Helper | `src/helpers/deepagent/` | Backend, Sandbox, Subagent, Permissions |
| Tools | `src/heart/tools/` | `ToolRegistry`, `CombinedToolRegistry`, `ZodiosToolRegistry`, Tavily |
| Magic-Funcs | `src/magic-funcs/` | Einzeiler-LLM-Helper (ask, extract, classify, …) |
| Modalities | `src/modalities/` | STT, TTS, Vision, Image-Gen über OpenRouter |

## Entfernt / nicht mehr exportiert

- **`MemoryChain`** — existiert nicht mehr. Thread-State läuft über **`Agent` / `DeepAgent` + `checkpointer` + `thread_id`**.
- **`Agent.memory`** — umbenannt zu **`checkpointer`** (Breaking Change).

## Checkpointer-Pattern

```ts
import { Agent, MemorySaver, SmartCheckpointSaver, getLLM } from "@delofarag/ai-utils"

const checkpointer = new SmartCheckpointSaver(new MemorySaver(), {
    messagesBeforeSummary: 12,
    maxSummaries: 7,
    llm: getLLM({ provider: "openrouter" }),
})

const agent = new Agent({
    tools: [...],
    checkpointer,
})

await agent.invoke({ input: "Ich heisse Max.", thread_id: "u1" })
await agent.invoke({ input: "Wie heisse ich?", thread_id: "u1" })
```

- `thread_id` ist **Pflicht**, wenn `checkpointer` gesetzt ist.
- `Chain` ignoriert `thread_id` (loggt nur einen Error).
- Produktion: `SupabaseCheckpointSaver` statt `MemorySaver`.

## DeepAgent-Pattern

```ts
import { DeepAgent, createWorkspaceBackend, MemorySaver, getLLM } from "@delofarag/ai-utils"

const deepAgent = new DeepAgent({
    llm: getLLM({ provider: "openrouter" }),
    tools: [...],
    agentsMd: ["./AGENTS.md"],
    backend: createWorkspaceBackend({ rootDir: process.cwd() }),
    checkpointer: new MemorySaver(),
})

await deepAgent.invoke({ input: "Analysiere das Projekt.", thread_id: "u1" })
```

- `agentsMd` → `createDeepAgent({ memory })` (AGENTS.md Startup-Kontext, kein Chat-Verlauf)
- `checkpointer` → LangGraph Thread-Persistenz (wie bei `Agent`)

## Chain vs Agent vs DeepAgent

| | `Chain` | `Agent` | `DeepAgent` |
|---|---|---|---|
| Runtime | prompt pipe / RAG | `createReactAgent` | `createDeepAgent` |
| Tools | nein | ja | ja + built-in fs/planning/subagents |
| Thread-State | nein | optional via `checkpointer` | optional via `checkpointer` |
| AGENTS.md-Kontext | nein | nein | optional via `agentsMd` |
| Output | Zod (default schema) | optional Zod via `output` | optional Zod via `output` |
| Stream | ja (Text) | ja (Text) | ja (Text) |
| RAG | `vectorStore` | `createRAGTool` | `createRAGTool` |
| Filesystem / Sandbox | nein | nein | ja via `backend` |

## Tool-Registries

1. **`ToolRegistry`** — einfache `{ name, description, schema, func }` Tools
2. **`ZodiosToolRegistry`** — Zodios-Client → ein Tool pro API-Endpoint
3. **`CombinedToolRegistry`** — beides kombiniert (max. 1 Zodios-Client)

`createRAGTool()` gibt direkt ein `DynamicStructuredTool` zurück — kein manuelles Wrapping nötig.

## Defaults

- Provider: `openrouter`
- Model: `openai/gpt-5.4-mini`
- Zod: `zod/v4`
- Embeddings (RAG): Ollama `nomic-embed-text`

## Wichtige Env-Vars

- `OPENROUTER_API_KEY` — LLM + Modalities
- `CHATGROQ_API_KEY` — optional für `provider: "chatgroq"`
- `TAVILY_API_KEY` — `websearch()` / Tavily-Tools
- Supabase — `createSupabaseVectoreStore` / `SupabaseCheckpointSaver`

## Coding-Konventionen im Package

- 4 Spaces Indentation
- Minimale Comments
- `console.error` nur bei echten Fehlern
- Einfachste Lösung bevorzugen, keine Over-Abstraction
- Neue Public API immer über `src/index.ts` exportieren

## Beim Dokumentieren

README und dieser Guide müssen synchron bleiben. Nicht dokumentieren, was nicht exportiert wird.
