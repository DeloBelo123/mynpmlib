import {
  BaseChatModel,
  type BaseChatModelParams,
  type BaseChatModelCallOptions,
  type BindToolsInput,
  type BaseLanguageModelInput,
  convertToOpenAITool,
  Runnable,
  BaseMessage,
  AIMessage,
  AIMessageChunk,
  ChatGenerationChunk,
  type ChatResult,
  type CallbackManagerForLLMRun,
} from "../imports"
import type { AutoComplete } from "./llms"
import { spawn } from "child_process"
import { createInterface } from "readline"
import { tmpdir } from "os"
import { mkdtempSync } from "fs"
import { join } from "path"

/**
 * CLI_LLM — nutzt die headless CLIs der Provider (z.B. `claude -p`, `codex exec`)
 * wie ein ganz normales LangChain-`BaseChatModel`.
 *
 * Idee: statt die HTTP-API aufzurufen, wird pro `.invoke()`/`.stream()` ein
 * Subprozess der jeweiligen CLI gestartet. Vorteil: es greift die eingeloggte
 * Abo-Auth (kein API-Key/keine Per-Token-Kosten). Die Klasse verhält sich nach
 * außen wie jedes andere `BaseChatModel` und ist damit drop-in für `Agent`/`Chain`.
 *
 * WICHTIG (bewusste Grenzen):
 * - Tools: die internen Tools der CLI werden deaktiviert/eingeschränkt → reines LLM.
 *   `.bindTools()` / das LangChain-Tool-Calling funktioniert hier NICHT wie bei
 *   `ChatOpenAI` (die CLI führt eigene Tools intern aus, gibt keine `tool_calls` zurück).
 * - Memory/Kontext: läuft per Default in einem neutralen Verzeichnis (kein Projekt-CLAUDE.md).
 * - Multi-Turn: die Konversation wird ins Prompt eingebettet (stateless pro Aufruf).
 */

let _neutralCwd: string | undefined
/** Einmaliges, leeres Temp-Verzeichnis → kein Projekt-CLAUDE.md / keine Coder-Kontamination. */
function neutralCwd(): string {
  if (!_neutralCwd) _neutralCwd = mkdtempSync(join(tmpdir(), "cli-llm-"))
  return _neutralCwd
}

/** Liest die Rolle einer Message robust aus (`.type` ist die moderne API, `.getType()` Fallback). */
function messageRole(message: BaseMessage): string {
  const anyMsg = message as unknown as { type?: string; getType?: () => string }
  return anyMsg.type ?? (typeof anyMsg.getType === "function" ? anyMsg.getType() : "human")
}

/** Flacht `content` (string oder Content-Blocks) auf reinen Text ab (Bilder werden v1 ignoriert). */
function contentToText(content: unknown): string {
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part
        if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") {
          return (part as { text: string }).text
        }
        return ""
      })
      .join("")
  }
  return content == null ? "" : String(content)
}

// ──────────────────────────────────────────────────────────────────────────
// Fehler-Typen
// ──────────────────────────────────────────────────────────────────────────

export interface CLIErrorOptions {
  provider: string
  /** Exit-Code des Subprozesses (falls vorhanden). */
  exitCode?: number | null
  /** HTTP-Status, den die CLI gemeldet hat (z.B. 429). */
  status?: number
  /** Roh-Ausgabe/JSON, das den Fehler ausgelöst hat. */
  raw?: unknown
}

/** Basis-Fehler für jeden Fehlschlag eines CLI-Aufrufs (`claude`, `codex`). */
export class CLIError extends Error {
  readonly provider: string
  readonly exitCode?: number | null
  readonly status?: number
  readonly raw?: unknown

  constructor(message: string, opts: CLIErrorOptions) {
    super(message)
    this.name = "CLIError"
    this.provider = opts.provider
    this.exitCode = opts.exitCode
    this.status = opts.status
    this.raw = opts.raw
    // instanceof bleibt auch nach Transpilation/Bundling korrekt:
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/**
 * Wird geworfen, wenn die CLI ein Usage-/Rate-Limit gemeldet hat (Abo-Limit,
 * HTTP 429, Token-Quota oder Billing). So kann man im try/catch gezielt prüfen,
 * WARUM der Aufruf fehlschlug:
 *
 * ```ts
 * try { await llm.invoke(msgs) }
 * catch (e) {
 *   if (e instanceof CLIUsageLimitError) {
 *     console.log(`Limit erreicht (${e.limitType}); reset:`, e.resetsAt)
 *   }
 * }
 * ```
 */
export class CLIUsageLimitError extends CLIError {
  /** Art des Limits, z.B. "five_hour" | "weekly" | "rate_limit" | "quota" | "billing" | "usage_limit". */
  readonly limitType?: string
  /** Zeitpunkt, zu dem das Limit laut CLI zurückgesetzt wird (falls bekannt). */
  readonly resetsAt?: Date

  constructor(message: string, opts: CLIErrorOptions & { limitType?: string; resetsAt?: Date }) {
    super(message, opts)
    this.name = "CLIUsageLimitError"
    this.limitType = opts.limitType
    this.resetsAt = opts.resetsAt
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/**
 * Muster, die ein Usage-/Rate-/Quota-/Billing-Limit anzeigen.
 * Bewusst NICHT der transiente 529-Overload ("overloaded") — der ist kein Limit,
 * sondern vorübergehende Serverlast und wird von der CLI ohnehin automatisch retried.
 */
const USAGE_LIMIT_RE =
  /\b(usage limit|rate[\s_-]?limit|quota|insufficient[\s_]?(?:quota|credits?)|credit balance|too many requests|limit (?:reached|exceeded)|hit your usage|429)\b/i

/** Heuristik für die Limit-Art aus einer Fehlermeldung. */
function extractLimitType(message: string): string | undefined {
  if (/seven[\s_-]?day|weekly|per[\s-]?week|\bweek\b/i.test(message)) return "weekly"
  if (/five[\s_-]?hour|5[\s-]?hour/i.test(message)) return "five_hour"
  if (/insufficient[\s_]?quota|\bquota\b/i.test(message)) return "quota"
  if (/credit|billing/i.test(message)) return "billing"
  if (/rate[\s_-]?limit|429|too many requests/i.test(message)) return "rate_limit"
  if (/usage limit|hit your usage/i.test(message)) return "usage_limit"
  return undefined
}

/** Liest – wenn möglich – einen Reset-Zeitpunkt aus ("resets at …", "try again at …", "|<epoch>"). */
function extractResetsAt(message: string): Date | undefined {
  const phrase = message.match(/(?:try again at|resets? at|resets?)\s+([0-9A-Za-z:+\-.\s,]{6,40})/i)
  if (phrase) {
    const candidate = phrase[1].trim().replace(/[.,;]+$/, "")
    const parsed = new Date(candidate)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  // Claude meldet das Abo-Reset teils als Unix-Epoch (Sekunden) hinter einem Pipe-Zeichen.
  const epoch = message.match(/\|\s*(\d{10})\b/)
  if (epoch) return new Date(Number(epoch[1]) * 1000)
  return undefined
}

/**
 * Baut den passenden Fehler: `CLIUsageLimitError`, wenn Meldung/Status/Limit-Typ
 * auf ein Usage-/Rate-Limit hindeuten — sonst ein generischer `CLIError`.
 */
function buildCliError(
  provider: string,
  message: string,
  opts: { exitCode?: number | null; status?: number; raw?: unknown; limitType?: string; resetsAt?: Date } = {}
): CLIError {
  const isUsageLimit = opts.status === 429 || opts.limitType != null || USAGE_LIMIT_RE.test(message)
  if (isUsageLimit) {
    return new CLIUsageLimitError(message, {
      provider,
      exitCode: opts.exitCode,
      status: opts.status,
      raw: opts.raw,
      limitType: opts.limitType ?? extractLimitType(message),
      resetsAt: opts.resetsAt ?? extractResetsAt(message),
    })
  }
  return new CLIError(message, { provider, exitCode: opts.exitCode, status: opts.status, raw: opts.raw })
}

// ──────────────────────────────────────────────────────────────────────────
// Tool-Calling (prompt-basiert)
//
// Die CLIs geben über `-p` keine nativen `tool_calls` zurück. Damit ein CLI_LLM
// trotzdem in einem LangGraph-React-Agent (`createReactAgent` → `bindTools`)
// funktioniert, wird Tool-Calling über das Prompt emuliert: das Model wird
// angewiesen, GENAU EIN JSON-Objekt auszugeben — entweder einen Tool-Aufruf
// oder die finale Antwort. Das parsen wir und bauen daraus eine `AIMessage` mit
// `tool_calls`, die LangGraph dann ganz normal ausführt.
// ──────────────────────────────────────────────────────────────────────────

/** Normalisierte Tool-Definition (Name + Beschreibung + JSON-Schema der Argumente). */
export interface CLIToolSpec {
  name: string
  description: string
  parameters: Record<string, unknown>
}

/** Call-Optionen inkl. der via `bindTools` gebundenen Tools. */
export interface CLILLMCallOptions extends BaseChatModelCallOptions {
  tools?: CLIToolSpec[]
}

interface ToolCallLike {
  name: string
  args: Record<string, unknown>
  id: string
  type: "tool_call"
}

let _toolCallCounter = 0
function nextToolCallId(name: string): string {
  _toolCallCounter += 1
  return `call_${name}_${_toolCallCounter}`
}

function toToolSpec(tool: BindToolsInput): CLIToolSpec {
  const oai = convertToOpenAITool(tool as never) as { function?: { name?: string; description?: string; parameters?: Record<string, unknown> } }
  const fn = oai?.function ?? (tool as { name?: string; description?: string; parameters?: Record<string, unknown> })
  return {
    name: String(fn?.name ?? "tool"),
    description: String(fn?.description ?? ""),
    parameters: (fn?.parameters as Record<string, unknown>) ?? { type: "object", properties: {} },
  }
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return undefined
  }
}

/** Extrahiert das erste JSON-Objekt aus einem Text (toleriert Markdown-Fences und Begleittext). */
function extractJsonObject(text: string): unknown {
  if (!text) return undefined
  let s = text.trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  const direct = safeJson(s)
  if (direct !== undefined) return direct
  const start = s.indexOf("{")
  if (start === -1) return undefined
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < s.length; i++) {
    const ch = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === "\\") esc = true
      else if (ch === '"') inStr = false
    } else if (ch === '"') inStr = true
    else if (ch === "{") depth++
    else if (ch === "}") {
      depth--
      if (depth === 0) return safeJson(s.slice(start, i + 1))
    }
  }
  return undefined
}

type ToolDecision = { kind: "tool_call"; calls: ToolCallLike[] } | { kind: "final"; text: string }

/** Interpretiert die Model-Ausgabe als Tool-Aufruf oder finale Antwort. */
function parseToolDecision(text: string): ToolDecision {
  const obj = extractJsonObject(text)
  if (obj && typeof obj === "object") {
    const tc = (obj as { tool_call?: { name?: unknown; arguments?: unknown } }).tool_call
    if (tc && typeof tc.name === "string") {
      const rawArgs = tc.arguments
      const args =
        typeof rawArgs === "string"
          ? ((safeJson(rawArgs) as Record<string, unknown>) ?? {})
          : ((rawArgs as Record<string, unknown>) ?? {})
      return { kind: "tool_call", calls: [{ name: tc.name, args, id: nextToolCallId(tc.name), type: "tool_call" }] }
    }
    const final = (obj as { final?: unknown }).final
    if (typeof final === "string") return { kind: "final", text: final }
  }
  // Kein gültiges Protokoll-JSON → die gesamte Ausgabe als finale Antwort behandeln.
  return { kind: "final", text }
}

export interface CliUsage {
  input_tokens: number
  output_tokens: number
  total_tokens: number
}

/** Ergebnis von `parseFinal` (non-streaming, ein kompletter stdout). */
export interface ParsedCliFinal {
  text: string
  usage?: CliUsage
  responseMetadata?: Record<string, unknown>
  raw?: unknown
}

/** Ergebnis von `parseStreamLine` (eine NDJSON-Zeile). */
export interface ParsedCliStreamLine {
  text?: string
  usage?: CliUsage
  responseMetadata?: Record<string, unknown>
  done?: boolean
  /**
   * Fehlersignal (z.B. Claude `result` mit `is_error`, Codex `turn.failed`).
   * Der Generator baut daraus via `buildCliError` den passenden (ggf. Usage-Limit-)Fehler und wirft ihn.
   */
  error?: { message: string; status?: number; limitType?: string; resetsAt?: Date }
  /**
   * Rate-Limit-Metadaten (z.B. Claude `rate_limit_event` / `api_retry`) zur Anreicherung
   * eines späteren Fehlers — kein Fehler an sich.
   */
  rateLimit?: { limitType?: string; resetsAt?: Date }
}

/** Provider-spezifische Defaults, die die Subklasse an `super()` reicht. */
interface CLIDefaults {
  model: string
  cliPath: string
  provider: string
}

export interface CLILLMParams extends BaseChatModelParams {
  /** Model-Name, der per `--model`/`-m` an die CLI gereicht wird. */
  model?: string
  /** System-Prompt. Default `""` → ersetzt den Default-(Coding-)Systemprompt der CLI. */
  systemPrompt?: string
  /** Arbeitsverzeichnis des Subprozesses. Default: neutrales Temp-Verzeichnis. */
  cwd?: string
  /** Pfad/Name des CLI-Binaries (Default je Subklasse). */
  cliPath?: string
  /** Zusätzliche CLI-Flags (Escape-Hatch). */
  extraArgs?: string[]
  /** Timeout in ms; danach wird der Subprozess gekillt. */
  timeoutMs?: number
  /** Zusätzliche Env-Variablen für den Subprozess. */
  env?: Record<string, string>
}

/**
 * Abstrakte Basisklasse. Subklassen (`ClaudeCLI_LLM`, `OpenAICLI_LLM`) definieren
 * nur das CLI-spezifische: Binary, Args, und das Parsen von Output/Stream.
 */
export abstract class CLI_LLM extends BaseChatModel<CLILLMCallOptions> {
  model: string
  systemPrompt: string
  cwd: string
  cliPath: string
  extraArgs: string[]
  timeoutMs?: number
  env?: Record<string, string>

  /** Provider-Tag, analog zu `getLLM()`-Rückgaben (`"claude-cli"`, `"openai-cli"`). */
  provider: string

  /** Baut die CLI-Argumente. `systemPrompt` ist der effektive (ggf. aus Messages stammende). */
  protected abstract buildArgs(stream: boolean, systemPrompt: string): string[]
  /** Parst den kompletten stdout eines non-streaming Laufs. */
  protected abstract parseFinal(stdout: string): ParsedCliFinal
  /** Parst eine einzelne NDJSON-Zeile eines Streams (undefined = ignorieren). */
  protected abstract parseStreamLine(line: string): ParsedCliStreamLine | undefined

  /**
   * Wie der Prompt an stdin übergeben wird. Default: nur der User-Prompt.
   * Codex hat z.B. kein `--system-prompt`-Flag → überschreibt das, um den
   * System-Prompt als Präambel voranzustellen.
   */
  protected composeStdin(_systemPrompt: string, userPrompt: string): string {
    return userPrompt
  }

  constructor(fields: CLILLMParams, defaults: CLIDefaults) {
    super(fields)
    this.provider = defaults.provider
    this.model = fields.model ?? defaults.model
    this.systemPrompt = fields.systemPrompt ?? ""
    this.cwd = fields.cwd ?? neutralCwd()
    this.cliPath = fields.cliPath ?? defaults.cliPath
    this.extraArgs = fields.extraArgs ?? []
    this.timeoutMs = fields.timeoutMs
    this.env = fields.env
  }

  _llmType(): string {
    return this.provider
  }

  /**
   * Macht das Model in LangGraph-React-Agents nutzbar. Da die CLI keine nativen
   * `tool_calls` liefert, werden die Tools als Spezifikationen gebunden und in
   * `_generate` per Prompt-Protokoll emuliert (siehe `parseToolDecision`).
   */
  bindTools(
    tools: BindToolsInput[],
    kwargs?: Partial<CLILLMCallOptions>
  ): Runnable<BaseLanguageModelInput, AIMessageChunk, CLILLMCallOptions> {
    const specs = tools.map(toToolSpec)
    return this.bind({ tools: specs, ...kwargs } as Partial<CLILLMCallOptions>) as unknown as Runnable<
      BaseLanguageModelInput,
      AIMessageChunk,
      CLILLMCallOptions
    >
  }

  /** Baut die Tool-Anweisung, die dem System-Prompt angehängt wird. */
  protected buildToolInstruction(tools: CLIToolSpec[]): string {
    const list = tools
      .map((t) => `- ${t.name}: ${t.description}\n  Argumente (JSON-Schema): ${JSON.stringify(t.parameters)}`)
      .join("\n")
    return [
      "Du hast Zugriff auf folgende Tools:",
      list,
      "",
      "Wenn ein Tool die Anfrage beantworten hilft, rufe es auf. Beziehe dich bei Bedarf auf frühere Tool-Ergebnisse im Verlauf.",
      "Antworte AUSSCHLIESSLICH mit GENAU EINEM JSON-Objekt — kein weiterer Text, keine Markdown-Codeblöcke:",
      '- Tool aufrufen: {"tool_call": {"name": "<toolname>", "arguments": { ... }}}',
      '- Endgültige Antwort an den Nutzer: {"final": "<deine Antwort>"}',
    ].join("\n")
  }

  /** Messages → `{ systemPrompt, userPrompt }`. SystemMessages überschreiben `this.systemPrompt`. */
  protected messagesToCliInput(messages: BaseMessage[]): { systemPrompt: string; userPrompt: string } {
    const systemParts: string[] = []
    const turns: string[] = []
    const nonSystem: BaseMessage[] = []

    for (const message of messages) {
      const role = messageRole(message)
      const text = contentToText(message.content)
      if (role === "system") {
        systemParts.push(text)
        continue
      }
      nonSystem.push(message)
      if (role === "tool") {
        // Ergebnis eines Tool-Aufrufs (LangGraph `ToolMessage`).
        const name = (message as { name?: string }).name ?? "tool"
        turns.push(`Tool-Ergebnis [${name}]: ${text}`)
      } else if (role === "ai") {
        const toolCalls = (message as { tool_calls?: Array<{ name: string; args?: unknown }> }).tool_calls
        if (toolCalls && toolCalls.length > 0) {
          const calls = toolCalls.map((tc) => `${tc.name}(${JSON.stringify(tc.args ?? {})})`).join(", ")
          turns.push(`Assistant (Tool-Aufruf): ${calls}`)
        } else {
          turns.push(`Assistant: ${text}`)
        }
      } else {
        turns.push(`Human: ${text}`)
      }
    }

    const systemPrompt = systemParts.length > 0 ? systemParts.join("\n\n") : this.systemPrompt
    // Einzelner reiner User-Turn → nur dessen Inhalt; sonst ein lesbares Transkript.
    const userPrompt =
      nonSystem.length === 1 && messageRole(nonSystem[0]) === "human"
        ? contentToText(nonSystem[0].content)
        : turns.join("\n\n")

    return { systemPrompt, userPrompt }
  }

  async _generate(
    messages: BaseMessage[],
    options: this["ParsedCallOptions"],
    _runManager?: CallbackManagerForLLMRun
  ): Promise<ChatResult> {
    const { systemPrompt, userPrompt } = this.messagesToCliInput(messages)
    const tools = options?.tools

    // Tool-Modus: System-Prompt um das Tool-Protokoll ergänzen und die Antwort als Tool-Aufruf/Final interpretieren.
    const effectiveSystem =
      tools && tools.length > 0
        ? [systemPrompt, this.buildToolInstruction(tools)].filter((s) => s && s.trim()).join("\n\n")
        : systemPrompt

    const args = this.buildArgs(false, effectiveSystem)
    const stdin = this.composeStdin(effectiveSystem, userPrompt)

    const stdout = await this.runCli(args, stdin, options?.signal)
    const parsed = this.parseFinal(stdout)
    const responseMetadata = { ...parsed.responseMetadata, model: this.model, provider: this.provider }

    if (tools && tools.length > 0) {
      const decision = parseToolDecision(parsed.text)
      if (decision.kind === "tool_call") {
        const message = new AIMessage({
          content: "",
          tool_calls: decision.calls,
          usage_metadata: parsed.usage,
          response_metadata: responseMetadata,
        })
        return { generations: [{ text: "", message }], llmOutput: { tokenUsage: parsed.usage } }
      }
      const message = new AIMessage({
        content: decision.text,
        usage_metadata: parsed.usage,
        response_metadata: responseMetadata,
      })
      return { generations: [{ text: decision.text, message }], llmOutput: { tokenUsage: parsed.usage } }
    }

    const message = new AIMessage({
      content: parsed.text,
      usage_metadata: parsed.usage,
      response_metadata: responseMetadata,
    })

    return {
      generations: [{ text: parsed.text, message }],
      llmOutput: { ...parsed.responseMetadata, tokenUsage: parsed.usage },
    }
  }

  async *_streamResponseChunks(
    messages: BaseMessage[],
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun
  ): AsyncGenerator<ChatGenerationChunk> {
    // Tool-Modus lässt sich nicht token-weise streamen (wir brauchen das ganze JSON
    // zum Parsen). → einmal `_generate` ausführen und als ein Chunk samt tool_calls liefern.
    if (options?.tools && options.tools.length > 0) {
      const result = await this._generate(messages, options, runManager)
      const gen = result.generations[0]
      const aiMsg = gen.message as AIMessage
      const toolCalls = (aiMsg.tool_calls ?? []) as Array<{ name: string; args?: unknown; id?: string }>
      yield new ChatGenerationChunk({
        text: gen.text,
        message: new AIMessageChunk({
          content: aiMsg.content as string,
          tool_call_chunks: toolCalls.map((tc, i) => ({
            name: tc.name,
            args: JSON.stringify(tc.args ?? {}),
            id: tc.id,
            index: i,
            type: "tool_call_chunk" as const,
          })),
          usage_metadata: (aiMsg as { usage_metadata?: CliUsage }).usage_metadata,
          response_metadata: aiMsg.response_metadata,
        }),
      })
      return
    }

    const { systemPrompt, userPrompt } = this.messagesToCliInput(messages)
    const args = this.buildArgs(true, systemPrompt)
    const stdin = this.composeStdin(systemPrompt, userPrompt)

    let finalUsage: CliUsage | undefined
    let finalMeta: Record<string, unknown> = {}
    let lastRateLimit: { limitType?: string; resetsAt?: Date } | undefined

    for await (const line of this.runCliStreaming(args, stdin, options?.signal)) {
      const parsed = this.parseStreamLine(line)
      if (!parsed) continue

      if (parsed.rateLimit) lastRateLimit = parsed.rateLimit
      if (parsed.error) {
        // Mit zuvor gesehenen Rate-Limit-Infos anreichern (resetsAt/limitType aus `rate_limit_event`).
        throw buildCliError(this.provider, parsed.error.message, {
          status: parsed.error.status,
          raw: line,
          limitType: parsed.error.limitType ?? lastRateLimit?.limitType,
          resetsAt: parsed.error.resetsAt ?? lastRateLimit?.resetsAt,
        })
      }

      if (parsed.text) {
        await runManager?.handleLLMNewToken(parsed.text)
        yield new ChatGenerationChunk({
          text: parsed.text,
          message: new AIMessageChunk({ content: parsed.text }),
        })
      }
      if (parsed.usage) finalUsage = parsed.usage
      if (parsed.responseMetadata) finalMeta = { ...finalMeta, ...parsed.responseMetadata }
    }

    // Abschluss-Chunk trägt Usage/Metadaten (analog zu nativen Chat-Models).
    if (finalUsage || Object.keys(finalMeta).length > 0) {
      yield new ChatGenerationChunk({
        text: "",
        message: new AIMessageChunk({
          content: "",
          usage_metadata: finalUsage,
          response_metadata: { ...finalMeta, model: this.model, provider: this.provider },
        }),
      })
    }
  }

  /** Startet die CLI, schreibt stdin, sammelt stdout. Wirft bei Exit≠0, Timeout oder Abort. */
  protected runCli(args: string[], stdin: string, signal?: AbortSignal): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const allowedEnvKeys = ["PATH", "HOME", "USER", "SHELL", "TERM", "LANG", "LC_ALL"]
      const minimalEnv: Record<string, string> = {}
      for (const key of allowedEnvKeys) {
        if (process.env[key]) minimalEnv[key] = process.env[key]!
      }
      const child = spawn(this.cliPath, args, {
        cwd: this.cwd,
        env: { ...minimalEnv, ...this.env },
        stdio: ["pipe", "pipe", "pipe"],
      })

      let stdout = ""
      let stderr = ""
      let timedOut = false
      let killTimer: NodeJS.Timeout | undefined

      const timer = this.timeoutMs
        ? setTimeout(() => {
            timedOut = true
            child.kill("SIGTERM")
            killTimer = setTimeout(() => {
              child.kill("SIGKILL")
            }, 5000)
          }, this.timeoutMs)
        : undefined

      const onAbort = () => child.kill("SIGTERM")
      if (signal) {
        if (signal.aborted) child.kill("SIGTERM")
        else signal.addEventListener("abort", onAbort, { once: true })
      }

      const cleanup = () => {
        if (timer) clearTimeout(timer)
        if (killTimer) clearTimeout(killTimer)
        if (signal) signal.removeEventListener("abort", onAbort)
      }

      child.stdout!.on("data", (d) => (stdout += d.toString()))
      child.stderr!.on("data", (d) => (stderr += d.toString()))

      child.on("error", (err) => {
        cleanup()
        reject(
          new CLIError(
            `Konnte '${this.cliPath}' nicht starten: ${err.message}. Ist die CLI installiert und im PATH?`,
            { provider: this.provider }
          )
        )
      })

      child.on("close", (code) => {
        cleanup()
        if (timedOut) return reject(new CLIError(`${this.provider} CLI Timeout nach ${this.timeoutMs}ms`, { provider: this.provider, exitCode: code }))
        if (signal?.aborted) return reject(new CLIError(`${this.provider} CLI abgebrochen`, { provider: this.provider, exitCode: code }))
        if (code === 0) return resolve(stdout)
        // Exit≠0: viele CLIs liefern einen strukturierten Fehler auf stdout (z.B. claude `is_error`).
        // Den an parseFinal durchreichen, damit eine klare (ggf. Usage-Limit-)Fehlermeldung entsteht.
        if (stdout.trim().length > 0) {
          try {
            this.parseFinal(stdout)
            // parseFinal hat keinen Fehler geworfen → strukturierter Fehler wurde nicht erkannt → reject
            reject(buildCliError(this.provider, stderr.trim() || `CLI Exit-Code ${code}`, { exitCode: code }))
          } catch (err) {
            // parseFinal hat einen strukturierten Fehler erkannt und geworfen → durchreichen
            reject(err)
          }
          return
        }
        // Sonst aus stderr klassifizieren (z.B. ein Limit-Hinweis dort).
        reject(buildCliError(this.provider, stderr.trim() || `CLI Exit-Code ${code}`, { exitCode: code }))
      })

      if (stdin) child.stdin!.write(stdin)
      child.stdin!.end()
    })
  }

  /** Wie `runCli`, liefert stdout aber zeilenweise als Async-Iterator (für Streaming). */
  protected async *runCliStreaming(
    args: string[],
    stdin: string,
    signal?: AbortSignal
  ): AsyncGenerator<string> {
    const allowedEnvKeys = ["PATH", "HOME", "USER", "SHELL", "TERM", "LANG", "LC_ALL"]
    const minimalEnv: Record<string, string> = {}
    for (const key of allowedEnvKeys) {
      if (process.env[key]) minimalEnv[key] = process.env[key]!
    }
    const child = spawn(this.cliPath, args, {
      cwd: this.cwd,
      env: { ...minimalEnv, ...this.env },
      stdio: ["pipe", "pipe", "pipe"],
    })

    let stderr = ""
    let spawnError: Error | undefined
    let timedOut = false
    let killTimer: NodeJS.Timeout | undefined

    child.stderr!.on("data", (d) => (stderr += d.toString()))
    child.on("error", (err) => {
      spawnError = new CLIError(
        `Konnte '${this.cliPath}' nicht starten: ${err.message}. Ist die CLI installiert und im PATH?`,
        { provider: this.provider }
      )
    })

    const closed = new Promise<number | null>((resolve) => child.on("close", resolve))

    const onAbort = () => child.kill("SIGTERM")
    if (signal) {
      if (signal.aborted) child.kill("SIGTERM")
      else signal.addEventListener("abort", onAbort, { once: true })
    }
    const timer = this.timeoutMs
      ? setTimeout(() => {
          timedOut = true
          child.kill("SIGTERM")
          killTimer = setTimeout(() => {
            child.kill("SIGKILL")
          }, 5000)
        }, this.timeoutMs)
      : undefined

    if (stdin) child.stdin!.write(stdin)
    child.stdin!.end()

    const rl = createInterface({ input: child.stdout!, crlfDelay: Infinity })
    let outputFinished = false
    try {
      for await (const line of rl) {
        if (line.trim().length > 0) yield line
      }
      outputFinished = true
    } finally {
      rl.close()
      if (timer) clearTimeout(timer)
      if (killTimer) clearTimeout(killTimer)
      if (signal) signal.removeEventListener("abort", onAbort)
      if (!outputFinished && child.exitCode === null) {
        child.kill("SIGTERM")
      }
    }

    const code = await closed
    if (spawnError) throw spawnError
    if (timedOut) throw new CLIError(`${this.provider} CLI Timeout nach ${this.timeoutMs}ms`, { provider: this.provider, exitCode: code })
    if (signal?.aborted) throw new CLIError(`${this.provider} CLI abgebrochen`, { provider: this.provider, exitCode: code })
    if (code !== 0 && code !== null) {
      // Falls der Stream selbst kein Fehler-Event lieferte: aus stderr klassifizieren.
      throw buildCliError(this.provider, stderr.trim() || `CLI Exit-Code ${code}`, { exitCode: code })
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Claude CLI (`claude -p`)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Volle, versionierte Model-IDs, die `claude --model` akzeptiert (aktuelle Modelle, Stand 2026-06).
 * Aliasse wie "opus"/"sonnet"/"haiku"/"fable" funktionieren via `AutoComplete` ebenfalls,
 * zeigen aber immer auf das jeweils neueste Modell — daher hier bewusst die genauen IDs.
 */
export type ClaudeCLIModel = AutoComplete<
  | "claude-fable-5"
  | "claude-opus-4-8"
  | "claude-opus-4-7"
  | "claude-opus-4-6"
  | "claude-opus-4-5"
  | "claude-sonnet-4-6"
  | "claude-haiku-4-5"
>

export interface ClaudeCLILLMParams extends CLILLMParams {
  model?: ClaudeCLIModel
}

export class ClaudeCLI_LLM extends CLI_LLM {
  static lc_name(): string {
    return "ClaudeCLI_LLM"
  }

  constructor(fields: ClaudeCLILLMParams = {}) {
    super(fields, { model: "claude-opus-4-8", cliPath: "claude", provider: "claude-cli" })
  }

  protected buildArgs(stream: boolean, systemPrompt: string): string[] {
    const base = [
      "-p",
      "--model", this.model,
      "--system-prompt", systemPrompt, // "" ersetzt den Default-Coding-Prompt
      "--tools", "", // alle Built-in-Tools aus → reines LLM
      "--strict-mcp-config", // keine fremden MCP-Server (saubere Umgebung)
    ]
    const output = stream
      ? ["--output-format", "stream-json", "--verbose", "--include-partial-messages"]
      : ["--output-format", "json"]
    return [...base, ...output, ...this.extraArgs]
  }

  protected parseFinal(stdout: string): ParsedCliFinal {
    const obj = JSON.parse(stdout.trim()) as Record<string, any>
    if (obj.is_error) {
      const message =
        typeof obj.result === "string" && obj.result.trim() ? obj.result : (obj.subtype ?? "unbekannter Fehler")
      throw buildCliError(this.provider, message, {
        status: typeof obj.api_error_status === "number" ? obj.api_error_status : undefined,
        raw: obj,
      })
    }
    const usage = obj.usage ?? {}
    const input = Number(usage.input_tokens ?? 0)
    const output = Number(usage.output_tokens ?? 0)
    return {
      text: typeof obj.result === "string" ? obj.result : "",
      usage: { input_tokens: input, output_tokens: output, total_tokens: input + output },
      responseMetadata: {
        session_id: obj.session_id,
        total_cost_usd: obj.total_cost_usd,
        stop_reason: obj.stop_reason,
      },
      raw: obj,
    }
  }

  protected parseStreamLine(line: string): ParsedCliStreamLine | undefined {
    let obj: Record<string, any>
    try {
      obj = JSON.parse(line)
    } catch {
      return undefined
    }
    // Rate-Limit-Snapshot (kein Fehler) → als Hinweis (resetsAt/Bucket) für einen evtl. späteren Fehler.
    if (obj.type === "rate_limit_event" && obj.rate_limit_info) {
      const info = obj.rate_limit_info
      return {
        rateLimit: {
          limitType: typeof info.rateLimitType === "string" ? info.rateLimitType : undefined,
          resetsAt: typeof info.resetsAt === "number" ? new Date(info.resetsAt * 1000) : undefined,
        },
      }
    }
    // Retry-Grund (rate_limit / billing_error) als Limit-Hinweis.
    if (obj.type === "system" && obj.subtype === "api_retry" && (obj.error === "rate_limit" || obj.error === "billing_error")) {
      return { rateLimit: { limitType: obj.error === "billing_error" ? "billing" : "rate_limit" } }
    }
    // Token-Deltas: { type:"stream_event", event:{ delta:{ type:"text_delta", text } } }
    if (obj.type === "stream_event" && obj.event?.delta?.type === "text_delta") {
      return { text: obj.event.delta.text }
    }
    // Abschluss-Event: Fehler oder Usage/Kosten.
    if (obj.type === "result") {
      if (obj.is_error) {
        const message =
          typeof obj.result === "string" && obj.result.trim() ? obj.result : (obj.subtype ?? "unbekannter Fehler")
        return {
          error: { message, status: typeof obj.api_error_status === "number" ? obj.api_error_status : undefined },
          done: true,
        }
      }
      const usage = obj.usage ?? {}
      const input = Number(usage.input_tokens ?? 0)
      const output = Number(usage.output_tokens ?? 0)
      return {
        usage: { input_tokens: input, output_tokens: output, total_tokens: input + output },
        responseMetadata: {
          session_id: obj.session_id,
          total_cost_usd: obj.total_cost_usd,
          stop_reason: obj.stop_reason,
        },
        done: true,
      }
    }
    return undefined
  }
}

// ──────────────────────────────────────────────────────────────────────────
// OpenAI Codex CLI (`codex exec`)
//
// Hinweis: setzt eine installierte + eingeloggte Codex-CLI voraus
// (`npm i -g @openai/codex`, `codex login`) — wird hier NICHT installiert.
// ──────────────────────────────────────────────────────────────────────────

/** Von `codex -m/--model` akzeptiert (siehe developers.openai.com/codex/models). */
export type OpenAICLIModel = AutoComplete<
  | "gpt-5.5"
  | "gpt-5.4"
  | "gpt-5.4-mini"
  | "gpt-5.3-codex-spark"
>

export interface OpenAICLILLMParams extends CLILLMParams {
  model?: OpenAICLIModel
}

export class OpenAICLI_LLM extends CLI_LLM {
  static lc_name(): string {
    return "OpenAICLI_LLM"
  }

  constructor(fields: OpenAICLILLMParams = {}) {
    super(fields, { model: "gpt-5.5", cliPath: "codex", provider: "openai-cli" })
  }

  protected buildArgs(_stream: boolean, _systemPrompt: string): string[] {
    // codex exec gibt mit --json in beiden Fällen NDJSON aus.
    return [
      "exec",
      "--json",
      "--sandbox", "read-only", // keine Datei-Schreibzugriffe
      "--ask-for-approval", "never", // headless: nie nach Erlaubnis fragen
      "--skip-git-repo-check", // läuft auch im neutralen (Nicht-Git-)cwd
      "-m", this.model,
      ...this.extraArgs,
      "-", // Prompt komplett aus stdin lesen
    ]
  }

  /** Codex hat kein `--system-prompt` → als Präambel voranstellen. */
  protected composeStdin(systemPrompt: string, userPrompt: string): string {
    if (systemPrompt && systemPrompt.trim().length > 0) {
      return `System:\n${systemPrompt}\n\n${userPrompt}`
    }
    return userPrompt
  }

  protected parseFinal(stdout: string): ParsedCliFinal {
    let text = ""
    let usage: CliUsage | undefined
    const meta: Record<string, unknown> = {}

    for (const line of stdout.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed) continue
      let obj: Record<string, any>
      try {
        obj = JSON.parse(trimmed)
      } catch {
        continue
      }
      if (obj.type === "thread.started" && obj.thread_id) meta.thread_id = obj.thread_id
      if (obj.type === "item.completed" && obj.item?.type === "agent_message" && typeof obj.item.text === "string") {
        text = obj.item.text
      }
      if (obj.type === "turn.completed" && obj.usage) {
        const input = Number(obj.usage.input_tokens ?? 0)
        const output = Number(obj.usage.output_tokens ?? 0)
        usage = { input_tokens: input, output_tokens: output, total_tokens: input + output }
      }
      if (obj.type === "turn.failed" || obj.type === "error") {
        const errObj = obj.error ?? obj
        const detail = typeof errObj?.message === "string" ? errObj.message : JSON.stringify(errObj)
        throw buildCliError(this.provider, `codex: ${detail}`, { raw: obj })
      }
    }

    return { text, usage, responseMetadata: meta }
  }

  protected parseStreamLine(line: string): ParsedCliStreamLine | undefined {
    let obj: Record<string, any>
    try {
      obj = JSON.parse(line)
    } catch {
      return undefined
    }
    // Codex liefert keine Token-Deltas → die finale agent_message kommt als ein Chunk.
    if (obj.type === "item.completed" && obj.item?.type === "agent_message" && typeof obj.item.text === "string") {
      return { text: obj.item.text }
    }
    if (obj.type === "turn.completed" && obj.usage) {
      const input = Number(obj.usage.input_tokens ?? 0)
      const output = Number(obj.usage.output_tokens ?? 0)
      return {
        usage: { input_tokens: input, output_tokens: output, total_tokens: input + output },
        done: true,
      }
    }
    if (obj.type === "turn.failed" || obj.type === "error") {
      const errObj = obj.error ?? obj
      const detail = typeof errObj?.message === "string" ? errObj.message : JSON.stringify(errObj)
      return { error: { message: `codex: ${detail}` }, done: true }
    }
    return undefined
  }
}
