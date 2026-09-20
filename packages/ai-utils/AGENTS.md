# ai-utils — Agent Guide

Kurzreferenz für Entwicklung und AI-Assistenten in `@delofarag/ai-utils`.

## Aktuelle Architektur

| Modul | Pfad | Zweck |
|---|---|---|
| `Chain` | `src/heart/chain.ts` | Stateless LLM-Calls mit Zod-Output, optional RAG |
| `classify` | `src/helpers/classify.ts` | Typisierte JEV-Klassifikation (`noul`, `choice`, `score`) über OpenRouter |
| `JevToolCaller` | `src/heart/jevToolCaller.ts` | Bounded JEV-Tool- und Runtime-Parameter-Auswahl ohne generiertes Argument-Schema |
| `Agent` | `src/heart/agent.ts` | Tool-using ReAct-Agent, optional Checkpointer + strukturierter Output |
| `DeepAgent` | `src/heart/deepAgent.ts` | LangChain Deep Agent (Filesystem, Subagents, Sandboxes) |
| Checkpointer | `src/helpers/memory.ts` | Checkpoint-Saver (Supabase, Smart-Summary) |
| RAG | `src/helpers/rag.ts` | Vector Stores, `createRAGChain`, `createRAGTool` |
| DeepAgent-Helper | `src/helpers/deepagent/` | Backend, Sandbox, Subagent, Permissions |
| Tools | `src/heart/tools/` | `ToolRegistry`, RAG, Tavily, MCP-Server |
| Magic-Funcs | `src/magic-funcs/` | `extract`, `structure`, `rewrite`, `summarize` |
| Modalities | `src/modalities/` | Vision und Image-Gen über OpenRouter |

## Entfernt / nicht mehr exportiert

- **`MemoryChain`** — existiert nicht mehr. Thread-State läuft über **`Agent` / `DeepAgent` + `checkpointer` + `thread_id`**.
- **`Agent.memory`** — umbenannt zu **`checkpointer`** (Breaking Change).
- **Alte Magic-Funcs `ask`, `websearch`, `decide`, `promptify`, `ragify`** — nicht mehr exportiert. `classify()` ist jetzt der JEV-basierte Classifier.

## Checkpointer-Pattern

```ts
import { Agent, MemorySaver, SmartCheckpointSaver, getLLM } from "@delofarag/ai-utils"

const checkpointer = new SmartCheckpointSaver(new MemorySaver(), {
    maxTokens: 24_000,
    keepLastMessages: 4,
    llm: getLLM({ from: "openrouter" }),
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
    llm: getLLM({ from: "openrouter" }),
    tools: [...],
    agentsMd: ["./AGENTS.md"],
    backend: createWorkspaceBackend({ rootDir: process.cwd() }),
    checkpointer: new MemorySaver(),
})

await deepAgent.invoke({ input: "Analysiere das Projekt.", thread_id: "u1" })
```

- `agentsMd` → `createDeepAgent({ memory })` (AGENTS.md Startup-Kontext, kein Chat-Verlauf)
- `checkpointer` → LangGraph Thread-Persistenz (wie bei `Agent`)

## Chain vs JevToolCaller vs Agent vs DeepAgent

| | `Chain` | `JevToolCaller` | `Agent` | `DeepAgent` |
|---|---|---|---|---|
| Runtime | prompt pipe / RAG | eine Tool-Wahl + optionale bounded Parameter-Wahl | `createReactAgent` | `createDeepAgent` |
| Tools | nein | exakt eins pro Invoke | ja | ja + built-in fs/planning/subagents |
| Thread-State | nein | optional via `checkpointer` | optional via `checkpointer` | optional via `checkpointer` |
| Argumente | — | nur Originalwerte aus `runtimeParams()` | generiert aus Tool-Schema | generiert aus Tool-Schema |
| ReAct / Planning | nein | nein | ReAct | ja |
| Stream | ja (Text) | nein | ja (Text) | ja (Text) |

`JevToolCaller.contextSchema` typisiert und validiert lokalen Execution-Context für
`runtimeParams()` und `func()`. Dieser Context darf Auth, Session-IDs oder Secrets
enthalten und wird deshalb nie an JEV gesendet oder in Checkpoints/Debug-Metadaten gespeichert.
`func()` erhält genau `{ context, state, thread_id, args }`. Runtime-Keys bleiben
unverändert; ausgewählte Originalelemente stehen unter `args[key]`. Ohne
`runtimeParams()` wird das gewählte Tool direkt mit `args: {}` ausgeführt.
Die aktuelle Anfrage ist der neueste `user`-Eintrag in `state.message_history`.
`mcpServer` lädt zusätzlich präfixierte `<server>__<tool>`-Tools; optionale
Candidate-Provider stehen unter `mcpServer.runtimeParams[unprefixedToolName]`.

## Tool-Registry

**`ToolRegistry`** wandelt einfache `{ name, description, schema, func }`-Definitionen in typisierte `DynamicStructuredTool`s um.

`createRAGTool()` gibt direkt ein `DynamicStructuredTool` zurück — kein manuelles Wrapping nötig.
Remote-Tools werden über `mcpServer` an `Agent`, `JevToolCaller` oder `DeepAgent` angebunden.

## Defaults

- Provider: `openrouter`
- Model: `openai/gpt-5.6-luna`
- Classifier: OpenRouter `~typesafe/jev-latest`
- Zod: `zod/v4`
- Embeddings (RAG): Ollama `nomic-embed-text` als rückwärtskompatibler Default; für Produktion über `embeddings` injizieren

## Wichtige Env-Vars

- `OPENROUTER_API_KEY` — LLM + Modalities
- `CHATGROQ_API_KEY` — optional für `from: "chatgroq"`
- `TAVILY_API_KEY` — `TavilySearch` / `tavilySearchTool`
- Supabase — `createSupabaseVectoreStore` / `SupabaseCheckpointSaver`

## Coding-Konventionen im Package

- 4 Spaces Indentation
- Minimale Comments
- `console.error` nur bei echten Fehlern
- Einfachste Lösung bevorzugen, keine Over-Abstraction
- Neue Public API immer über `src/index.ts` exportieren

## Beim Dokumentieren

README und dieser Guide müssen synchron bleiben. Nicht dokumentieren, was nicht exportiert wird.
