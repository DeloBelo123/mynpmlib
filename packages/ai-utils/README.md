# @delofarag/ai-utils

Ein praktisches Utility-Package für LLM-Apps mit LangChain:

- `Chain`, `JevToolCaller`, `Agent`, `DeepAgent` (Filesystem, HITL, Sandboxes, Subagents)
- `classify()` als schneller, typisierter JEV-Classifier über OpenRouter (Noul, Choice, Score)
- Memory via Checkpoint-Saver (`MemorySaver`, `SmartCheckpointSaver`, `SupabaseCheckpointSaver`)
- RAG-Helper (FAISS, Supabase, In-Memory)
- Tooling (`ToolRegistry`, `createRAGTool`, `tavilySearchTool`, MCP-Server)
- Magic-Funcs für Extraktion, Strukturierung, Umschreiben und Zusammenfassen
- Modalities (Vision, Image Generation)

---

## Standard-Default (wichtig)

Im Package gilt als Standard-LLM-Default für die allgemeine Nutzung:

- **Provider:** `openrouter`
- **Model:** `openai/gpt-5.6-luna`

Wenn du nichts explizit setzt, orientiere dich an diesem Default in deinen Aufrufen.

Für kostenlose Modelle gibt es bei `from: "openrouter"` die Option `free: true` —
sie wählt dynamisch das beste aktuell kostenlose `:free`-Model (siehe Schnellstart).

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
- `CHATGROQ_API_KEY`: wenn du `from: "chatgroq"` nutzt
- `TAVILY_API_KEY`: `TavilySearch` / `tavilySearchTool`
- Supabase-Variablen: für `createSupabaseVectoreStore()`, `getSupabaseVectorStore()` und `SupabaseCheckpointSaver`

---

## Schnellstart: `getLLM()`

```ts
import { getLLM } from "@delofarag/ai-utils"

const llm = getLLM({ from: "openrouter", model: "openai/gpt-5.6-luna" })
```

Beispiele:

```ts
const llmOpenRouter = getLLM({ from: "openrouter", model: "openai/gpt-5.6-luna" })
const llmGroq = getLLM({ from: "chatgroq", model: "llama-3.3-70b-versatile" })
const llmOpenAI = getLLM({ from: "openai", model: "gpt-5.6-luna" })
const llmLocal = getLLM({ from: "local", model: "llama3.2:3b" })

// Nutzt die lokal eingeloggten CLIs statt eines API-Keys:
const llmClaudeCLI = getLLM({ from: "claude-cli", model: "claude-opus-4-8" })
const llmCodexCLI = getLLM({ from: "codex-cli", model: "gpt-5.5" })
```

Providerübergreifende Laufzeitoptionen:

```ts
const llm = getLLM({
    from: "openrouter",
    model: "openai/gpt-5.6-luna",
    config: {
        temperature: 0.2,
        reasoning: "high",
    },
})
```

`reasoning` wird an OpenRouter, OpenAI, lokale OpenAI-kompatible Modelle und die
CLI-Provider passend übersetzt. ChatGroq ignoriert diese Option. Die CLI-Provider
ignorieren `temperature`.

EU-Datenrouting (OpenRouter):

```ts
getLLM({ from: "openrouter", dataSafe: true })
```

---

## `classify()`: schneller, typisierter JEV-Classifier

`classify()` ist für Klassifikation und Entscheidungen gedacht:
Routing, Moderation, Relevanzprüfung, Priorisierung oder das Bewerten einer geordneten
Skala. Anders als ein Chatmodell generiert JEV keinen freien Text. Du gibst einen
`state` und benannte Fragen vor; zurück kommen ausschließlich typisierte Entscheidungen
und Wahrscheinlichkeiten.

Intern nutzt `classify()` das JEV-Modell über OpenRouters
[Decisions API](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-questions-and-answers-request)
und standardmäßig [`~typesafe/jev-latest`](https://openrouter.ai/~typesafe/jev-latest).
Der API-Key und die OpenRouter-Verbindung kommen intern aus `getLLM()` beziehungsweise
aus `OPENROUTER_API_KEY`. Das Modell wird direkt über `model` gewählt.

### Die drei Classifier-Typen

| Typ | Aufgabe | Wichtigste Ausgabe |
|---|---|---|
| `choice` | Eine Klasse aus deinen erlaubten Labels wählen | `choice`, `probabilities`, `confidence` |
| `noul` | Binäre Aussage bewerten | `noul` als Ja-Wahrscheinlichkeit von `0` bis `1` |
| `score` | Auf einer geordneten Skala klassifizieren | `score`, `probabilities`, `confidence`, `legend` |

`score` ist ein Erwartungswert und kann zwischen zwei Stufen liegen, zum Beispiel
`1.7`. `noul` hat kein separates `confidence`-Feld: Die Wahrscheinlichkeit selbst
ist das Ergebnis.

Weiterführende TypeSafe-Dokumentation:

- [JEV Introduction](https://docs.typesafe.ai/introduction)
- [System One Models](https://docs.typesafe.ai/concepts/system-one)
- [Choice, Noul und Score](https://docs.typesafe.ai/primitives)
- [Classification using confidence](https://docs.typesafe.ai/cookbooks/classification_using_confidence)

### Klassifikationsbeispiel

```ts
import { classify } from "@delofarag/ai-utils"

const result = await classify({
    state: {
        message: "I was charged twice. Please refund one charge urgently.",
        customerTier: "business",
    },
    questions: {
        category: {
            type: "choice",
            instructions: "Which team should handle `message`?",
            criteria: {
                billing: "Payments, invoices, charges, or refunds",
                technical: "Bugs, outages, or integrations",
                sales: "Pricing, upgrades, or new accounts",
                other: null,
            },
        },
        refundRequested: {
            type: "noul",
            instructions: "Does `message` explicitly request a refund?",
        },
        urgency: {
            type: "score",
            instructions: "How urgent is the request in `message`?",
            criteria: ["Can wait", "Time-sensitive", "Immediately blocking"],
        },
    },
})

result.answers.category.choice
// "billing" | "technical" | "sales" | "other"

result.answers.category.probabilities.billing // number
result.answers.refundRequested.noul            // 0..1
result.answers.urgency.score                    // z.B. 1.7
result.model                                    // tatsächlich verwendete Modellversion
result.usage.cost                               // OpenRouter-Kosten, falls geliefert
```

Die Typen werden direkt aus `questions` abgeleitet. Ein nicht definiertes Label wie
`result.answers.category.probabilities.legal` erzeugt deshalb bereits beim
TypeScript-Check einen Fehler.

### Eigenes Modell, Abbruch und Fehler

Ein anderes TypeSafe-JEV-Modell kann direkt übergeben werden:

```ts
import { classify } from "@delofarag/ai-utils"

await classify({
    model: "~typesafe/jev-latest",
    state: "...",
    questions: { /* ... */ },
})
```

`signal` ist optional und dient ausschließlich zum Abbrechen des HTTP-Requests,
zum Beispiel nach zehn Sekunden:

```ts
await classify({
    state,
    questions,
    signal: AbortSignal.timeout(10_000),
})
```

Ohne Timeout oder manuelles Canceln lässt du `signal` einfach weg. Nicht erfolgreiche
OpenRouter-Antworten werden als `JevAPIError` mit `status` und `body` geworfen:

```ts
import { classify, JevAPIError } from "@delofarag/ai-utils"

try {
    await classify({ state, questions })
} catch (error) {
    if (error instanceof JevAPIError) {
        console.error(error.status, error.body)
    }
}
```

### Gute Classifier-Fragen

- Formuliere pro Frage genau eine schnelle Entscheidung.
- Sende unabhängige Fragen über denselben `state` gemeinsam; JEV wertet sie parallel aus.
- Verweise bei strukturiertem State explizit auf Felder wie `` `message` ``.
- Ergänze bei `choice` ein `other`/`unknown`, wenn die Klassen nicht vollständig sind.
- Lege produktive Schwellenwerte mit gelabelten Beispielen fest, statt blind `0.5` zu verwenden.

---

## Core Classes

> **DeepAgent-Dokumentation:** Abschnitt [3) DeepAgent](#3-deepagent) — Feature-Übersicht, Backend, HITL, Stream-Chunks, CLI-Testing.

## `JevToolCaller`: bounded Tool Calling mit JEV

`JevToolCaller` wählt pro `invoke()` genau ein lokales oder per MCP geladenes Tool
und führt es genau einmal aus. Das ist kein generatives Tool Calling: Es gibt kein
ReAct, kein Planning und keine vom Modell frei erzeugten Argumente. Falls ein Tool
Parameter benötigt, definiert `params` den vollständigen erlaubten
Wertebereich und JEV wählt daraus ausschließlich vorhandene Originalwerte.

### Constructor-Props

| Prop | Pflicht | Bedeutung |
|---|---:|---|
| `prompt` | nein | Optionaler domänenspezifischer System-Prompt; ohne ihn gilt nur der eingebaute Default, andernfalls wird der Default angehängt |
| `tools` | ja | Lokale Tools; darf bei konfiguriertem MCP ein leeres Array sein |
| `model` | nein | TypeSafe-JEV-Modell, Default: `~typesafe/jev-latest` |
| `contextSchema` | nein | Zod-Objektschema für lokalen Invoke-Context |
| `checkpointer` | nein | Persistiert Message-History pro `thread_id` |
| `interruptOn` | nein | Human-in-the-Loop: Frage pro Tool-Name (String oder Function); pausiert vor `func()`, braucht `checkpointer` |
| `confidenceGate` | nein | Qualitäts-Gate: `{ minConfidence?, tools?: { [name]: number } }`; immer aktiv, Default-Threshold `0.5` |
| `mcpServer` | nein | Ein Remote-MCP-Server oder ein Array von Servern |

### Vollständiges Beispiel

```ts
import { JevToolCaller, MemorySaver } from "@delofarag/ai-utils"
import { z } from "zod/v4"

type Candidate = {
    id: string
    name: string
    birthDate: string
}

const contextSchema = z.object({
    tenantId: z.string(),
    apiToken: z.string(),
})

const caller = new JevToolCaller({
    prompt: "Select the tool that best fulfills the user's request.",
    contextSchema,
    tools: [
        {
            name: "get_candidate",
            description: "Returns a candidate from the recruiting system.",
            params: async ({ context }) => ({
                candidate: await loadCandidates(context.tenantId, context.apiToken),
            }),
            func: async ({ params, context, state, thread_id }) => {
                const { candidate } = params
                return getCandidate(candidate.id, context.apiToken)
            },
        },
        {
            name: "healthcheck",
            description: "Checks whether the recruiting system is reachable.",
            // Kein params nötig: Das Tool braucht keine ausgewählten Argumente.
            func: async ({ params, context }) => {
                // params ist hier {}
                return checkHealth(context.apiToken)
            },
        },
    ],
    checkpointer: new MemorySaver(),
})

const output = await caller.invoke({
    Frage: "Welcher Max Müller wurde 2002 geboren?",
    thread_id: "u1",
    context: {
        tenantId: "tenant-acme",
        apiToken: process.env.RECRUITING_API_TOKEN!,
    },
})

if (output.kind === "return" && !output.rejected) {
    console.log(output.value, output.tool)
}
```

`output.value` ist hier ein Candidate; das ist nur ein Beispiel.
Tool-Namen, Parameter-Keys, Candidate-Werte und
Rückgabetypen sind generisch und enthalten keine domänenspezifische Logik.

### Tool-Definition

Ein Tool besteht aus:

| Feld | Pflicht | Bedeutung |
|---|---:|---|
| `name` | ja | Eindeutiger Name, den JEV auswählt |
| `description` | ja | Klare Beschreibung, wann dieses Tool richtig ist |
| `params` | nein | Statisches Candidate-Objekt oder Funktion, die erlaubte Werte pro Argument liefert |
| `func` | ja | Wird nach der Auswahl genau einmal ausgeführt |

`func()` erhält immer genau ein Objekt:

```ts
func: async ({
    context,   // durch contextSchema validierte lokale Daten
    state,     // system_prompt + vollständige message_history
    thread_id, // optionaler Thread-Identifier
    params,    // durch die Tool-params/JEV ausgewählte Werte oder {}
}) => {
    // Tool ausführen
}
```

`params` ist optional. Benötigt das Tool außer `context`, `state` und
`thread_id` keine weiteren Werte, wird es nach der Tool-Auswahl sofort mit
`params: {}` ausgeführt. Es findet dann kein Parameter-Auswahl-Call an JEV statt.

### Wie Tool-`params` zu `func() params` werden

`params` wird erst ausgewertet, nachdem JEV ein Tool ausgewählt hat. Für feste
Auswahlmöglichkeiten kann direkt ein Objekt angegeben werden:

```ts
params: {
    permission: ["read", "write"],
}
```

Für Werte, die von `context`, `state` oder `thread_id` abhängen, oder allgemein nach bestimmten Operationen
ermittelt werden, wird stattdessen eine synchrone oder asynchrone Funktion verwendet:

```ts
params: async ({ context }) => ({
    candidate: await loadCandidates(context.tenantId),
})
```

Beide Formen liefern dasselbe Candidate-Objekt: Seine Keys beschreiben die
Parameter des Tools und seine Werte sind Arrays mit den erlaubten Werten. JEV
generiert keine Argumente, sondern entscheidet für jeden mehrdeutigen Parameter,
welches vorhandene Array-Element am besten zur Anfrage passt. Bei einem Array mit
genau einem Element wird dieses Element direkt übernommen.

Anschließend baut `JevToolCaller` das Argument-Objekt für `func()` auf. Die Keys
aus `params` bleiben erhalten, aber jedes Candidate-Array wird durch das
ausgewählte Originalelement ersetzt:

```ts
// Von params bereitgestellte Candidates
{
    candidate: [candidateA, candidateB],
    permission: ["read", "write"],
}

// Nach der JEV-Auswahl: input.params in func()
{
    candidate: candidateB,
    permission: "read",
}
```

Alle mehrdeutigen Parameter werden gemeinsam in einem zweiten JEV-Call ausgewählt.
Arrays mit genau einem Element übernimmt `JevToolCaller` deterministisch. Sind
alle Arrays eindeutig oder ergibt `params` `{}`, entfällt der zweite
JEV-Call ebenfalls. Leere Arrays sind ungültig.

Die ausgewählten Werte werden unter unveränderten Keys in `func().params` abgelegt
und sind dieselben Objektinstanzen, die die Tool-`params` bereitgestellt haben.
`func().params` bleibt bewusst dynamisch typisiert; zwischen dem Ergebnistyp der
Tool-`params` und `func().params` gibt es keine automatische TypeScript-Inferenz.

### Context und State

`context` wird aus `contextSchema` inferiert und vor jedem Invoke mit Zod validiert.
Er steht in der funktionalen `params`-Form sowie im einzigen Objektparameter von `func()` zur Verfügung,
wird aber weder an JEV gesendet noch im Checkpoint oder in Debug-Metadaten gespeichert.
Damit eignet er sich für Auth-Daten, Session-IDs, Secrets und lokale Konfiguration.

Der an JEV und Tools übergebene `state` besitzt diese Form:

```ts
{
    system_prompt: string,
    message_history: Array<{
        role: "user" | "assistant" | "system",
        content: JevEntry,
    }>,
}
```

Die aktuelle Anfrage wird vor der Auswahl als neuester `user`-Eintrag an
`message_history` angehängt. Bei einem Checkpointer enthält die History zusätzlich
die vorherigen Requests und Tool-Ergebnisse des Threads. Es gibt keinen separaten
`user_request`-State, sodass JEV nur eine chronologische Nachrichtenquelle auswertet.

### Ablauf und Anzahl der JEV-Calls

```text
invoke({...request})
→ aktuelle Anfrage wird an message_history angehängt
→ JEV-Call 1 wählt genau ein Tool
→ params nur dieses Tools auflösen
→ liefert pro Parameter ein Array erlaubter Runtime-Werte
→ optionaler JEV-Call 2 wählt für alle mehrdeutigen Parameter parallel je ein Element
→ JevToolCaller baut params = { parameterKey: ausgewähltes Originalelement }
→ func({ context, state, thread_id, params }) wird einmal ausgeführt
→ invoke() gibt { kind: "return", value: funcReturn, tool, params } zurück
```

Der erste JEV-Call findet immer statt. Der zweite findet nur statt, wenn das
gewählte Tool mindestens einen Runtime-Parameter mit mehr als einem Candidate hat.

### `invoke()`, Confidence und Debug-Metadaten

Alle Felder außer `context`, `thread_id`, `debug` und `signal` bilden gemeinsam die
aktuelle User-Anfrage. Sie müssen JSON-serialisierbar sein:

```ts
const result = await caller.invoke({
    question: "Welcher Kandidat wurde 2002 geboren?",
    locale: "de-DE",
    context: { tenantId: "acme", apiToken: "..." },
    thread_id: "u1",
    signal: AbortSignal.timeout(10_000),
})

if (result.kind === "return" && !result.rejected) {
    result.value
    result.tool // { name, confidence }
    result.params // { [name]: { value, confidence } }
}
```

Jeder `invoke()`-Return trägt `kind` (`"return"`, `"gated"` oder `"interrupt"`).
Bei `"return"` gilt immer dieselbe Basisform:

```ts
{
    kind: "return",
    value: ToolReturn, // null + rejected: true bei Reject (func() lief nie)
    tool: { name: string, confidence: number },
    params: Record<string, { value: JevEntry, confidence: number }>,
}
```

`tool.confidence` stammt aus dem ohnehin ausgeführten Tool-Auswahl-Call.
`params[name].confidence` stammt aus dem ohnehin erforderlichen
Parameter-Auswahl-Call — oder ist `1`, wenn der Wert deterministisch war
(Single-Candidate, kein JEV-Call nötig). Für diese Werte wird kein
zusätzlicher JEV-Call ausgeführt.

Mit `debug: true` kommen zusätzlich die ausführlichen Metadaten hinzu:

```ts
const output = await caller.invoke({
    question: "Welcher Kandidat wurde 2002 geboren?",
    context,
    debug: true,
})

if (output.kind === "return" && !output.rejected) {
    output.value
    output.tool
    output.params
    output.metadata.selected_tool
    output.metadata.selected_params
    output.metadata.arguments
    output.metadata.usage // summiert über alle JEV-Calls
    output.metadata.state
}
```

`context` erscheint absichtlich weder im JEV-State noch in Debug-Metadaten oder
Checkpoints. `signal` bricht die JEV-Requests ab.

### Memory mit Checkpointer

Mit `checkpointer` ist `thread_id` verpflichtend. Nach erfolgreicher Ausführung
werden die aktuelle User-Anfrage sowie Toolname, gewählte Argumente und Tool-Return
gespeichert. Beim nächsten Invoke desselben Threads stehen sie in
`state.message_history` zur Verfügung:

```ts
const caller = new JevToolCaller({
    prompt: "Choose the best tool.",
    tools,
    checkpointer: new MemorySaver(),
})

await caller.invoke({ request: "...", thread_id: "customer-42" })
```

### Human-in-the-Loop (approve/reject)

Mit `interruptOn` pausiert `JevToolCaller` **vor** der `func()`-Ausführung und
gibt statt des Ergebnisses einen Interrupt zurück. Die Keys sind Tool-Namen
(bei MCP: `<server>__<tool>`), der Value ist die Freigabe-Frage als String oder
als Function mit `{ tool, params, state, thread_id, context }`. Tools ohne
Eintrag laufen ohne Pause direkt durch. Es gibt nur `approve`/`reject`;
bei Reject läuft `func()` nie:

```ts
const caller = new JevToolCaller({
    tools,
    checkpointer: new MemorySaver(),
    interruptOn: {
        delete_customer: "Kunde wirklich löschen?",
        send_refund: ({ params }) => `Refund über ${params.amount} freigeben?`,
    },
})

const res = await caller.invoke({ request: "...", thread_id: "customer-42" })
if (res.kind === "interrupt") {
    // res.question, res.tool, res.params in der UI anzeigen, dann:
    const out = await caller.invoke({ thread_id: "customer-42", decision: "approve" })
    // out = { kind: "return", value, tool, params } oder bei Reject
    // { kind: "return", value: null, rejected: true, tool, params }
}
```

Der Vorschlag wird im Checkpointer unter `thread_id` geparkt — zwischen
Propose und Resume darf der Prozess enden. `context` wird nie persistiert und
muss beim Resume erneut übergeben werden. `decision` und Anfrage-Felder
gleichzeitig sind ein Fehler; ein neuer Propose-Call überschreibt ein noch
offenes Pending. Konfigurierte Keys, die kein lokales oder geladenes MCP-Tool
treffen, geben einen `console.warn` aus (Tippfehler-Falle bei freien Strings).

### Qualitäts-Gate (Confidence)

Der Gate ist immer aktiv — auch ohne Config. Effektiver Threshold pro Tool:
`confidenceGate.tools[name] ?? confidenceGate.minConfidence ?? 0.5`.
Unterschreitet die Tool- oder eine Param-Confidence den Threshold, wird `func()`
nicht ausgeführt und `invoke()` gibt den Vorschlag zur Klärung zurück:

```ts
const res = await caller.invoke({ request: "...", thread_id: "customer-42" })
if (res.kind === "gated") {
    // res.tool, res.params, res.below: [{ scope: "tool" | "params.<name>", confidence, required }]
    // → gezielt nachfragen und erneut invoken, oder bewusst übersteuern:
    const out = await caller.callTool({
        request: "...",
        thread_id: "customer-42",
        context,
        tool: res.tool.name,
        params: Object.fromEntries(Object.entries(res.params).map(([k, v]) => [k, v.value])),
    })
}
```

`minConfidence: 0` schaltet den Gate faktisch ab. Der Gate läuft vor
`interruptOn`: Was automatisch abgelehnt wird, wird keinem Menschen vorgelegt.
Deterministische Single-Candidate-Params tragen Confidence `1`
(keine Alternative vorhanden, kein JEV-Call).

### Manueller Aufruf mit `callTool()`

`callTool({ request..., thread_id, context, tool, params })` führt ein Tool
ohne JEV-Auswahl aus — mit identischer State-/History-Semantik wie `invoke()`.
`params` werden gegen die Tool-Candidates validiert (bounded): unbekannte Keys,
fehlende Keys oder Werte außerhalb der Candidates werfen einen `TypeError`.
Gate und `interruptOn` werden bewusst umgangen (Override-Semantik).
Der Tool-Name ist als Union der lokalen Namen typisiert; MCP-Tools gehen per
präfixiertem `<server>__<tool>`-Namen.

### MCP-Tools

`mcpServer` akzeptiert dieselbe Basis-Konfiguration wie `Agent` und `DeepAgent`:
einen Server oder ein Array aus `{ name, url, auth?, headers?, description? }`.
Der LangChain-`MultiServerMCPClient` wird pro `invoke()` erstellt, seine Tools
werden geladen und die Verbindung wird anschließend auch bei Fehlern geschlossen.
Die Namen werden immer als `<server>__<tool>` präfixiert, zum Beispiel
`hubspot__get_candidate`.

Ein MCP-Tool ohne konfigurierte Parameter wird direkt mit `params: {}` aufgerufen.
Benötigt es Argumente, werden statische Choices oder dynamische Candidate-Provider
am jeweiligen Server unter dem **unpräfixierten** MCP-Toolnamen eingetragen:

```ts
const caller = new JevToolCaller({
    prompt: "Select the CRM operation that fulfills the latest user message.",
    tools: [],
    contextSchema,
    mcpServer: {
        name: "hubspot",
        url: process.env.HUBSPOT_MCP_URL!,
        headers: {
            Authorization: `Bearer ${process.env.HUBSPOT_MCP_TOKEN}`,
        },
        description: "CRM for candidates, contacts, companies, and deals.",
        params: {
            // Statische Choices für hubspot__take_action.
            take_action: {
                permission: ["read", "write"],
            },
            // MCP-Name vor dem Prefix; geladen wird hubspot__get_candidate.
            get_candidate: async ({ context, state, thread_id, server }) => ({
                candidate: await loadCandidates(context.tenantId),
            }),
        },
    },
})

const result = await caller.invoke({
    request: "Hole den 2002 geborenen Max Müller.",
    context,
})
```

Die dynamische Form erhält zusätzlich `server`, also die zugehörige
MCP-Serverkonfiguration. `auth`, Header und `context` bleiben lokal; an JEV gehen
nur State, Toolbeschreibungen und die ausdrücklich zurückgegebenen Candidate-Werte.
Die `description` des Servers wird der Beschreibung seiner MCP-Tools vorangestellt,
damit JEV den fachlichen Zweck des Servers bei der Tool-Auswahl berücksichtigen kann.

Da MCP-Tools dynamisch geladen werden, ist `output.value` nach Narrowing auf einen
erfolgreichen Return bei aktivem `mcpServer` als `unknown` typisiert. `output.tool`
und `output.params` bleiben vollständig typisiert. Lokale Tool-Werte werden ohne
MCP aus den jeweiligen `func()`-Returns inferiert.

Weitere Details zum zugrunde liegenden Client:

- [LangChain MCP](https://docs.langchain.com/oss/javascript/langchain/mcp)
- [LangChain.js MCP Adapters](https://github.com/langchain-ai/langchainjs/tree/main/libs/langchain-mcp-adapters)

### Validierung und typische Fehler

- Mindestens ein lokales oder per MCP verfügbares Tool ist erforderlich.
- Toolnamen und MCP-Servernamen müssen eindeutig und nicht leer sein.
- `description` darf bei lokalen Tools nicht leer sein.
- `params` muss ein Objekt aus Candidate-Arrays sein oder zu einem solchen auflösen.
- `context` darf nur gesetzt werden, wenn `contextSchema` konfiguriert ist.
- Mit `checkpointer` muss `thread_id` gesetzt sein.
- Tools ohne Tool-`params` erhalten in `func()` immer `params: {}` und erzeugen keinen zweiten JEV-Call.

Ein leeres Candidate-Array ist ein erwartbarer fachlicher Ausgang, beispielsweise
wenn eine Suche keine Kandidaten findet. Da das Tool ohne gültigen Wert nicht
ausgeführt werden kann, wirft `invoke()` dafür einen `JevNoParamOptionsError`:

```ts
import { JevNoParamOptionsError } from "@delofarag/ai-utils"

try {
    await caller.invoke({ request: "Finde Max Müller" })
} catch (error) {
    if (error instanceof JevNoParamOptionsError) {
        showEmptyState(error.toolName, error.parameterName)
    }
}
```

Der stabile Code `JEV_NO_PARAM_OPTIONS` kann alternativ an API-Grenzen für das
Frontend verwendet werden. Ungültige `params`-Ergebnisse, etwa ein Wert,
der kein Array ist, bleiben `TypeError`, da sie Implementierungsfehler sind.

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
    llm: getLLM({ from: "openrouter", model: "openai/gpt-5.6-luna" }),
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
    llm: getLLM({ from: "openrouter", model: "openai/gpt-5.6-luna" }),
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
    llm: getLLM({ from: "openrouter" }),
    maxTokens: 24_000,
    keepLastMessages: 4
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

### MCP-Tools

`Agent` und `DeepAgent` können einen oder mehrere Remote-MCP-Server deklarativ
anbinden. Die Verbindung wird pro `invoke()`/`stream()` geöffnet und anschließend
automatisch geschlossen. Tool-Namen werden als `<server>__<tool>` präfixiert.

```ts
const agent = new Agent({
    tools: [],
    mcpServer: {
        name: "crm",
        url: process.env.CRM_MCP_URL!,
        headers: { Authorization: `Bearer ${process.env.CRM_MCP_TOKEN}` },
        description: "CRM-Daten für Kontakte, Firmen und Deals.",
    },
})
```

`description` am MCP-Server wird als Nutzungshinweis in den System-Prompt eingefügt.
Die separate Agent-Prop `describe` ist dagegen nur beschreibende Metadaten für externe
Tools und verändert den Agent-Prompt nicht.

### Streaming

```ts
for await (const chunk of agent.stream({ input: "Erkläre mir das.", thread_id: "u1" })) {
    process.stdout.write(chunk)
}
```

Mit `showReasoning: true` kann der Stream zusätzlich
`{ kind: "reasoning", text }` liefern. Dafür muss Reasoning bereits am LLM aktiviert
sein, zum Beispiel über `getLLM({ ..., config: { reasoning: "high" } })`.

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
| **`showReasoning`** | Streamt Reasoning-Deltas, wenn das LLM Reasoning aktiviert hat |
| **`showSubagents`** | Streamt Text-Deltas laufender Subagents |
| **`mcpServer`** | Lädt Remote-MCP-Tools pro Aufruf und schließt die Verbindung automatisch |
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
    llm,              // BaseChatModel (Default: OpenRouter gpt-5.6-luna)
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
    mcpServer,        // MCPServerConfig | MCPServerConfig[]
    describe,         // Metadaten für externe Tools; kein Prompt-Inhalt
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
    llm: getLLM({ from: "openrouter", model: "openai/gpt-5.6-luna" }),
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

### `stream()` — Text, Interrupts, Tools, Reasoning und Subagents

Gleiche Input-API wie `invoke()` — plus optionale Event-Typen:

```ts
for await (const chunk of agent.stream({
    input: "Baue eine Website",
    thread_id: "u1",
    showToolCalls: true,
    showReasoning: true,
    showSubagents: true,
})) {
    if (typeof chunk === "string") {
        process.stdout.write(chunk)
    } else if (chunk.kind === "interrupt") {
        console.log("Interrupt:", chunk.question)
        console.log("Decisions:", chunk.decisions)
    } else if (chunk.kind === "tool") {
        console.log(`[tool:${chunk.phase}]`, chunk.toolName)
    } else if (chunk.kind === "reasoning") {
        console.log("Reasoning:", chunk.text)
    } else if (chunk.kind === "subagent") {
        console.log("Subagent:", chunk.namespace, chunk.text)
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
| `DeepAgentReasoningEvent` | Mit `showReasoning: true` | `{ kind: "reasoning", text }` |
| `DeepAgentSubagentEvent` | Mit `showSubagents: true` | `{ kind: "subagent", text, namespace? }` |

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
import {
    isInterrupt,
    isToolEvent,
    isReasoningEvent,
    isSubagentEvent,
} from "@delofarag/ai-utils/client"
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

### MCP-Server

Die gleiche `mcpServer`-Konfiguration wie beim normalen `Agent` funktioniert auch
mit `DeepAgent`:

```ts
const agent = new DeepAgent({
    tools: [],
    mcpServer: [
        {
            name: "docs",
            url: process.env.DOCS_MCP_URL!,
            description: "Interne Produkt- und API-Dokumentation.",
        },
        {
            name: "crm",
            url: process.env.CRM_MCP_URL!,
            headers: { Authorization: `Bearer ${process.env.CRM_MCP_TOKEN}` },
            description: "Kontakte, Firmen und Deals.",
        },
    ],
})
```

Bei aktivem MCP wird der interne Agent pro Aufruf neu gebaut, weil die zugehörigen
MCP-Clients nach jedem Run geschlossen werden.

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
    llm: getLLM({ from: "openrouter", model: "openai/gpt-5.6-luna" }),
    maxTokens: 24_000,
    keepLastMessages: 4
})
```

### `SmartCheckpointSaver`

- konsolidiert alte Verläufe in EINE rollierende Zusammenfassung (System-Message)
- agentic-tauglich: Tool-Calls + Tool-Results werden mitgezählt, mitsummarized und nie auseinandergerissen (keine orphaned ToolMessages)
- die letzten `keepLastMessages` User/AI-Messages bleiben wörtlich erhalten
- Fail-Open: schlägt der Summarizer-LLM fehl, wird der Checkpoint unverändert gespeichert
- summarized nur am Ende eines abgeschlossenen Turns (nie mitten im Tool-Loop)

Optionen:

- `maxTokens` (default `24000`) — primärer Trigger: approx. Token-Budget über alle Messages inkl. Tool-Results
- `messagesBeforeSummary` (default `12`) — sekundärer Trigger: User/AI-Messages seit der letzten Zusammenfassung
- `keepLastMessages` (default `4`) — Verbatim-Tail, wird auf Tool-Unit-Grenzen ausgerichtet
- `maxSummaryWords` (default `300`)
- `maxToolResultChars` (default `3000`) — Tool-Results werden im Summarizer-Input auf diese Länge gekürzt
- `llm` (default OpenRouter `gpt-5.6-luna`, wird lazy erst beim ersten Summarize erzeugt)
- `debug` — loggt Token-Stand, Trigger und erstellte Summaries

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
- `createSupabaseVectoreStore(data, config?)` — akzeptiert Strings, LangChain-`Document`s und `{ pageContent, metadata }`; `config.embeddings` überschreibt den Ollama-Default
- `getSupabaseVectorStore(config?)` — öffnet einen bestehenden Store mit optionalen `embeddings`, `filter` und `upsertBatchSize`
- `createFaissStore(data, config?)`
- `loadFaissStore({ path })`
- `turn_to_docs(data)`

Mandantensichere Supabase-Ingestion mit eigenen Embeddings und erhaltenen Metadaten:

```ts
import { OpenAIEmbeddings } from "@langchain/openai"
import { createSupabaseVectoreStore } from "@delofarag/ai-utils"

const embeddings = new OpenAIEmbeddings({
    apiKey: process.env.OPENROUTER_API_KEY,
    model: "openai/text-embedding-3-small",
    configuration: { baseURL: "https://openrouter.ai/api/v1" },
})

await createSupabaseVectoreStore([
    {
        pageContent: "Die Frühschicht beginnt um 6 Uhr.",
        metadata: { company_id: "company-1", job_id: "job-1" },
    },
], {
    embeddings,
    table_name: "mira_knowledge_chunks",
    RPC_function: "match_mira_knowledge",
})
```

### RAG Chain

- `createRAGChain({ vectorStore, llm, prompt?, num_of_results_from_vdb? })`

### RAG Tool

- `createRAGTool({ vectorStore, name, description, k?, filter? })`

```ts
import { createRAGTool, createFaissStore } from "@delofarag/ai-utils"

const vectorStore = await createFaissStore(["FAQ 1", "FAQ 2"])
const ragTool = createRAGTool({
    vectorStore,
    name: "search_faq",
    description: "Sucht in FAQ-Dokumenten",
    k: 6,
    filter: { company_id: "company-1", job_id: "job-1" },
})
```

`filter` wird unverändert als drittes Argument an `vectorStore.similaritySearch()` gereicht.
Bei `SupabaseVectorStore` landet das Objekt im `filter`-Parameter der konfigurierten RPC.

---

## Magic-Funcs

Die aktuelle Magic-Func-API besteht aus vier kleinen Parser-/Transformationshelfern:

- `extract({ data, schema, goal?, llm? })`
- `structure({ data, into, retries?, llm? })`
- `rewrite({ data, instruction, retries?, llm? })`
- `summarize({ data, fokuss?, maxWords?, llm? })`

Beispiel:

```ts
import { extract, rewrite, summarize } from "@delofarag/ai-utils"
import { z } from "zod/v4"

const person = await extract({
    data: "Max ist 30 und lebt in Berlin.",
    schema: z.object({
        name: z.string(),
        age: z.number(),
        city: z.string()
    })
})

const professional = await rewrite({
    data: "hey, schick mal die rechnung",
    instruction: "Formuliere als kurze professionelle E-Mail."
})

const short = await summarize({
    data: "Sehr langer Text...",
    maxWords: 50
})
```

Für Klassifikation ist jetzt `classify()` die spezialisierte, typisierte API; für
klassische LLM-Extraktion und Texttransformation bleiben diese Magic-Funcs gedacht.

---

## Modalities

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
- Core (`Agent`, `Chain`, `DeepAgent`, `classify`, `JevAPIError` und alle `Jev*`-Types)
- DeepAgent (`createWorkspaceBackend`, `createLocalShellBackend`, `createDenoSandbox`, `workspacePermissions`, `interruptOn`-Helper, alle `DeepAgent*`-Types)
- Memory (`MemorySaver`, `SmartCheckpointSaver`, `SupabaseCheckpointSaver`, `chatSummarizer`)
- Tools (`ToolRegistry`, `createRAGTool`, `TavilySearch`, `tavilySearchTool`, MCP-Helper)
- Magic-Funcs (`extract`, `structure`, `rewrite`, `summarize`)
- Modalities (`vision`, `generateImages`)

Client-Subpath (`@delofarag/ai-utils/client`) — ohne LangChain-Bundle, für Frontend:

- Types: `DeepAgentInterrupt`, `DeepAgentToolEvent`, `DeepAgentStreamChunk`, ...
- Guards: `isInterrupt()`, `isToolEvent()`, `isReasoningEvent()`, `isSubagentEvent()`

---

## Empfehlungen

- Für strukturierte Outputs immer `zod/v4` verwenden.
- Für Produktion API-Keys als ENV setzen, nicht hardcoden.
- `classify()` für schnelle Klassifikation und probabilistische Entscheidungen; Chatmodelle für freie Textgenerierung.
- Bei langen Chats `SmartCheckpointSaver` am `Agent` verwenden.
- RAG als Tool im `Agent` ist in der Praxis oft robuster als RAG-only Prompting.
- `Chain` für stateless Tasks, `Agent` für Tools und Conversation Memory, `DeepAgent` für autonome Coding-/Research-Agents.
- DeepAgent: `rootDir` + `route` klar trennen — Agent sieht nur den virtuellen Pfad.
- DeepAgent HITL: immer `checkpointer` + `thread_id`; `interruptOn` pro Tool konfigurieren.
- DeepAgent Shell: `createLocalShellBackend` nur lokal/Dev — `execute` läuft auf dem Host.
- DeepAgent testen: `session({ streamable: agent, isDeepAgent: true })`.
