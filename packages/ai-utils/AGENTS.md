# ai-utils — Agent Guide

Kurzreferenz für Entwicklung und AI-Assistenten in `@delofarag/ai-utils`.

## Aktuelle Architektur

| Modul | Pfad | Zweck |
|---|---|---|
| `Chain` | `src/heart/chain.ts` | Stateless LLM-Calls mit Zod-Output, optional RAG |
| `Agent` | `src/heart/agent.ts` | Tool-using ReAct-Agent, optional Memory + strukturierter Output |
| Memory | `src/helpers/memory.ts` | Checkpoint-Saver (Supabase, Smart-Summary) |
| RAG | `src/helpers/rag.ts` | Vector Stores, `createRAGChain`, `createRAGTool` |
| Tools | `src/heart/tools/` | `ToolRegistry`, `CombinedToolRegistry`, `ZodiosToolRegistry`, Tavily |
| Magic-Funcs | `src/magic-funcs/` | Einzeiler-LLM-Helper (ask, extract, classify, …) |
| Modalities | `src/modalities/` | STT, TTS, Vision, Image-Gen über OpenRouter |

## Entfernt / nicht mehr exportiert

- **`MemoryChain`** — existiert nicht mehr. Conversation Memory läuft über **`Agent` + `memory` + `thread_id`**.
- **`deepAgent.ts`** — aktuell leer, nicht in `index.ts` exportiert.
- **`helpers/deepagent/sandbox.ts`** — Stub, noch nicht fertig.

## Memory-Pattern (aktuell)

```ts
import { Agent, MemorySaver, SmartCheckpointSaver, getLLM } from "@delofarag/ai-utils"

const memory = new SmartCheckpointSaver(new MemorySaver(), {
    messagesBeforeSummary: 12,
    maxSummaries: 7,
    llm: getLLM({ provider: "openrouter" }),
})

const agent = new Agent({
    tools: [...],
    memory,
})

await agent.invoke({ input: "Ich heisse Max.", thread_id: "u1" })
await agent.invoke({ input: "Wie heisse ich?", thread_id: "u1" })
```

- `thread_id` ist **Pflicht**, wenn `memory` gesetzt ist.
- `Chain` ignoriert `thread_id` (loggt nur einen Error).
- Produktion: `SupabaseCheckpointSaver` statt `MemorySaver`.

## Agent vs Chain

| | `Chain` | `Agent` |
|---|---|---|
| Tools | nein | ja |
| Memory | nein | optional via `memory` |
| Output | Zod-Schema (default `{ output: string }`) | optional Zod via `output` |
| Stream | ja (Text) | ja (Text, ohne Tool-Nodes) |
| RAG | eingebaut via `vectorStore` | via `createRAGTool` als Tool |

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
