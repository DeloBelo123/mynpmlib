import {
  ChatOpenAI,
  BaseMessage,
  ChatGenerationChunk,
  type ChatResult,
  type CallbackManagerForLLMRun,
} from "../../imports"

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
export const OPENROUTER_EU_BASE_URL = "https://eu.openrouter.ai/api/v1"

/**
 * dataSafe-Routing im Request-Body (`provider` wie in der OpenRouter-Doku:
 * `data_collection`/`zdr` INNERHALB von `provider`). LangChain `ChatOpenAI`
 * reicht `modelKwargs` unverändert an die Chat-Completions-API durch.
 */
export const OPENROUTER_DATA_SAFE_KWARGS = {
  provider: {
    data_collection: "deny",
    zdr: true,
    allow_fallbacks: false,
  },
} as const

/**
 * Schaltet OpenRouters einheitlichen Reasoning-Modus ein (`reasoning: { enabled: true }`
 * im Request-Body). ChatOpenAI reicht `modelKwargs` unverändert durch. Damit die
 * so zurückkommenden `delta.reasoning`-Tokens auch auslesbar sind, muss die Instanz
 * ZUSÄTZLICH mit `__includeRawResponse: true` gebaut werden (siehe getLLM/getFreeOpenRouterLLM).
 */
export const OPENROUTER_REASONING_KWARGS = {
  reasoning: { enabled: true },
} as const

/**
 * Models, die zur Laufzeit mit einem "gibt es nicht mehr / nicht mehr gratis"-Error
 * gescheitert sind. Werden bei der Neuauswahl übersprungen (Lebensdauer: Prozess).
 */
const excludedFreeModels = new Set<string>()

/** Ein Ranking der :free-Models mit Tool-Support, sortiert nach `sort`. */
async function fetchFreeRanking(baseURL: string, sort: string): Promise<string[]> {
  const res = await fetch(`${baseURL}/models?max_price=0&supported_parameters=tools&sort=${sort}`)
  if (!res.ok) {
    throw new Error(`OpenRouter models request failed: ${res.status} ${res.statusText}`)
  }

  const body = (await res.json()) as { data?: Array<{ id?: string }> }
  // Client-seitig aufs :free-Suffix gefiltert, weil max_price=0 vereinzelt
  // auch Promo-Modelle ohne Suffix listet.
  return (body.data ?? [])
    .map((model) => model.id ?? "")
    .filter((id) => id.endsWith(":free"))
}

/**
 * Holt das beste kostenlose Model von OpenRouter — reines Intelligenz-Ranking.
 *
 * Eine Query (`max_price=0` + `supported_parameters=tools`,
 * `sort=intelligence-high-to-low`); es gewinnt das intelligenteste :free-Model.
 * Kein Test-Request — tote Kandidaten fängt das Self-Healing der Instanz ab.
 */
export async function fetchBestFreeModel(
  baseURL: string = OPENROUTER_BASE_URL,
  /** Zusätzlich zu überspringende Model-ids (z.B. temporär, für transiente Heals). */
  extraExcluded?: Set<string>,
): Promise<string> {
  const byIntelligence = await fetchFreeRanking(baseURL, "intelligence-high-to-low")

  // Sind alle Kandidaten ausgeschlossen, lieber den besten erneut versuchen als hart failen.
  const pick =
    byIntelligence.find((id) => !excludedFreeModels.has(id) && !extraExcluded?.has(id)) ??
    byIntelligence.find((id) => !excludedFreeModels.has(id)) ??
    byIntelligence[0]
  if (!pick) {
    throw new Error("No :free model with tool support available on OpenRouter right now")
  }
  return pick
}

/**
 * OpenRouter-Limits für :free-Models (Stand 2026-07, docs/api/reference/limits):
 * 20 Requests/Minute; 50 Requests/Tag (unter 10 lifetime gekauften Credits)
 * bzw. 1000 Requests/Tag (ab 10 Credits). Beide Limits gelten ACCOUNT-WEIT über
 * alle :free-Models hinweg — ein Model-Wechsel hilft also nicht, deshalb wird
 * bei diesem Fehler bewusst NICHT geheilt, sondern gezielt filterbar geworfen:
 *
 * ```ts
 * try { await llm.invoke(msgs) }
 * catch (e) {
 *   if (e instanceof FreeLimitError && e.scope === "day") {
 *     show("Sie haben Ihre Free-Requests für heute verbraucht.")
 *   }
 * }
 * ```
 */
export class FreeLimitError extends Error {
  /** Stabil filterbar — überlebt im Gegensatz zu instanceof auch JSON-Serialisierung Richtung Frontend. */
  readonly code = "FREE_LIMIT_EXCEEDED"
  /** "day" = Tageskontingent verbraucht, "minute" = 20-Requests/min-Limit, "unknown" = 429 ohne klare Zuordnung. */
  readonly scope: "day" | "minute" | "unknown"
  /** Sekunden bis zum Retry (aus dem Retry-After-Header, falls der Server ihn mitschickt). */
  readonly retryAfterSeconds?: number
  /** Das :free-Model, mit dem der Request lief. */
  readonly model: string

  constructor(message: string, opts: { scope: "day" | "minute" | "unknown"; model: string; retryAfterSeconds?: number }) {
    super(message)
    this.name = "FreeLimitError"
    this.scope = opts.scope
    this.model = opts.model
    this.retryAfterSeconds = opts.retryAfterSeconds
    // instanceof bleibt auch nach Transpilation/Bundling korrekt:
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/**
 * Übersetzt ein 429-Rate-Limit von OpenRouter in einen FreeLimitError; alles
 * andere → null. Die scope-Erkennung hängt an OpenRouters Fehlertext
 * ("free-models-per-day" / "free-models-per-min") und fällt sonst auf
 * "unknown" zurück. Exportiert, damit man auch anderweitig gefangene
 * Roh-Fehler nachklassifizieren kann.
 */
export function toFreeLimitError(error: unknown, model: string): FreeLimitError | null {
  const err = error as {
    status?: number
    code?: number
    message?: unknown
    error?: { message?: unknown }
    headers?: { get?: (name: string) => string | null } & Record<string, unknown>
  } | undefined

  const status = err?.status ?? err?.code
  if (status !== 429) return null

  const message = String(err?.error?.message ?? err?.message ?? "Rate limit exceeded")
  const scope = /per.?day|daily/i.test(message)
    ? "day" as const
    : /per.?min|minute/i.test(message)
      ? "minute" as const
      : "unknown" as const

  // OpenAI-SDK-Errors tragen die Response-Header mal als Headers-Objekt, mal als Record.
  const rawRetryAfter =
    typeof err?.headers?.get === "function"
      ? err.headers.get("retry-after")
      : (err?.headers as Record<string, unknown> | undefined)?.["retry-after"]
  const parsedRetryAfter = Number(rawRetryAfter)
  const retryAfterSeconds =
    Number.isFinite(parsedRetryAfter) && parsedRetryAfter > 0 ? parsedRetryAfter : undefined

  return new FreeLimitError(message, { scope, model, retryAfterSeconds })
}

/**
 * Erkennt "Model ist weg oder nicht mehr gratis"-Errors (400 invalid model id,
 * 402 credits nötig, 403/404 kein Zugriff/keine Endpoints). Bewusst NICHT dabei:
 * 429 Rate-Limit (→ FreeLimitError, Model-Wechsel hilft da nicht) und Auth-Fehler.
 */
function isModelGoneError(error: unknown): boolean {
  const err = error as { status?: number; code?: number; message?: unknown } | undefined
  const status = err?.status ?? err?.code
  const message = String(err?.message ?? "")

  if (status === 402 || status === 404) return true
  if ((status === 400 || status === 403) && /model/i.test(message)) return true
  return /not a valid model id|no endpoints found/i.test(message)
}

/**
 * Erkennt TRANSIENTE Upstream-/Kapazitätsfehler eines konkreten :free-Providers
 * (z.B. Nvidia "ResourceExhausted: Worker local total request limit reached (32/32)",
 * OpenRouter "temporarily rate-limited upstream", 502/503/504 vom Provider,
 * Netzwerk-Timeouts). Kurzlebig — ein Retry auf einem anderen Free-Model (=anderer
 * Provider) klappt i.d.R. sofort. Bewusst NICHT: echte Account-429 (free-per-day/min),
 * Auth- oder Model-weg-Fehler.
 */
function isTransientUpstreamError(error: unknown): boolean {
  const err = error as
    | { status?: number; code?: number | string; message?: unknown; error?: { message?: unknown } }
    | undefined
  const status = typeof err?.status === "number" ? err.status : typeof err?.code === "number" ? err.code : undefined

  if (status === 500 || status === 502 || status === 503 || status === 504 || status === 529) return true

  // Fehlertext kann je nach LangChain/OpenRouter/SDK unterschiedlich verschachtelt sein
  // (message, error.message, error.metadata.raw, cause.message …) — alles einsammeln.
  const e = err as Record<string, any> | undefined
  const haystack = [
    e?.message,
    e?.error?.message,
    e?.error?.metadata?.raw,
    e?.metadata?.raw,
    e?.cause?.message,
    (() => {
      try {
        return JSON.stringify(error)
      } catch {
        return ""
      }
    })(),
  ]
    .filter((s) => typeof s === "string")
    .join(" ")

  return /ResourceExhausted|Worker local total request limit|resource[_ ]?exhausted|no instances? available|temporarily (rate.?limited|unavailable)|overloaded|at capacity|Upstream error|ECONNRESET|ETIMEDOUT|ECONNREFUSED|network error|fetch failed|socket hang ?up/i.test(
    haystack,
  )
}

/** Hat ein Stream-Chunk sichtbaren Textinhalt? (leere Rollen-/Start-Chunks → false) */
function chunkHasText(chunk: ChatGenerationChunk): boolean {
  const text = (chunk as { text?: unknown })?.text
  if (typeof text === "string" && text.trim().length > 0) return true
  const content = (chunk as unknown as { message?: { content?: unknown } })?.message?.content
  if (typeof content === "string" && content.trim().length > 0) return true
  if (Array.isArray(content)) {
    return content.some((p) => typeof (p as { text?: unknown })?.text === "string" && (p as { text: string }).text.trim().length > 0)
  }
  return false
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const MAX_HEALS_PER_CALL = 3
const MAX_TRANSIENT_HEALS_PER_CALL = 3
const TRANSIENT_RETRY_BASE_MS = 400

/**
 * ChatOpenAI gegen OpenRouter, festgenagelt auf das beste :free-Model.
 *
 * Self-Healing: Verschwindet das Model oder ist es nicht mehr gratis, wird es
 * ausgeschlossen, das nächstbeste :free-Model geholt, `this.model` getauscht
 * und der Request transparent wiederholt (max. 3-mal, dann fliegt der Error).
 * Das aktive Model ist jederzeit über `.model` ablesbar.
 */
export class FreeOpenRouterLLM extends ChatOpenAI {
  provider: "openrouter" = "openrouter"
  private readonly freeBaseURL: string

  constructor(fields: {
    model: string
    apiKey?: string
    baseURL: string
    modelKwargs?: Record<string, unknown>
    /** `true` ⇒ ChatOpenAI legt die Roh-Response in `additional_kwargs.__raw_response` ab (nötig fürs Reasoning-Auslesen). */
    includeRawResponse?: boolean
    temperature?: number
  }) {
    super({
      model: fields.model,
      apiKey: fields.apiKey,
      configuration: { baseURL: fields.baseURL },
      ...(fields.modelKwargs ? { modelKwargs: fields.modelKwargs } : {}),
      ...(fields.includeRawResponse ? { __includeRawResponse: true } : {}),
      ...(fields.temperature !== undefined ? { temperature: fields.temperature } : {}),
    })
    this.freeBaseURL = fields.baseURL
  }

  /** Permanent: Model ist weg/nicht mehr gratis → dauerhaft ausschließen und nächstbestes holen. */
  private async heal(): Promise<void> {
    excludedFreeModels.add(this.model)
    this.model = await fetchBestFreeModel(this.freeBaseURL)
  }

  /**
   * Transient: Provider gerade überlastet → NUR für diesen Call auf ein anderes
   * Free-Model (anderer Provider) wechseln, ohne das gute Model dauerhaft
   * auszuschließen. Das beste Model wird nach dem Call wiederhergestellt.
   */
  private async healTransient(localExcluded: Set<string>): Promise<void> {
    localExcluded.add(this.model)
    this.model = await fetchBestFreeModel(this.freeBaseURL, localExcluded)
  }

  async _generate(
    messages: BaseMessage[],
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun
  ): Promise<ChatResult> {
    let heals = 0
    let transientHeals = 0
    const originalModel = this.model
    const localExcluded = new Set<string>()
    try {
      while (true) {
        try {
          return await super._generate(messages, options, runManager)
        } catch (error) {
          // Transient zuerst: kann als 429 ODER 5xx kommen — kurz warten, Provider wechseln, erneut.
          if (isTransientUpstreamError(error) && transientHeals < MAX_TRANSIENT_HEALS_PER_CALL) {
            transientHeals++
            await delay(TRANSIENT_RETRY_BASE_MS * transientHeals)
            await this.healTransient(localExcluded)
            continue
          }
          const limitError = toFreeLimitError(error, this.model)
          if (limitError) throw limitError
          if (!isModelGoneError(error) || heals >= MAX_HEALS_PER_CALL) throw error
          heals++
          await this.heal()
        }
      }
    } finally {
      this.restoreModel(originalModel)
    }
  }

  async *_streamResponseChunks(
    messages: BaseMessage[],
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun
  ): AsyncGenerator<ChatGenerationChunk> {
    let heals = 0
    let transientHeals = 0
    const originalModel = this.model
    const localExcluded = new Set<string>()
    try {
      while (true) {
        // Nur heilen, solange noch kein SICHTBARER Text beim Aufrufer ist. Provider
        // schicken oft leere Rollen-/Start-Chunks, bevor der Upstream-Fehler kommt —
        // die dürfen das Heilen NICHT blockieren (sonst rutscht der Fehler durch).
        // Ein Neustart nach nur leeren Chunks dupliziert keinen sichtbaren Output.
        let emittedText = false
        try {
          for await (const chunk of super._streamResponseChunks(messages, options, runManager)) {
            if (!emittedText && chunkHasText(chunk)) emittedText = true
            yield chunk
          }
          return
        } catch (error) {
          if (!emittedText && isTransientUpstreamError(error) && transientHeals < MAX_TRANSIENT_HEALS_PER_CALL) {
            transientHeals++
            await delay(TRANSIENT_RETRY_BASE_MS * transientHeals)
            await this.healTransient(localExcluded)
            continue
          }
          const limitError = toFreeLimitError(error, this.model)
          if (limitError) throw limitError
          if (emittedText || !isModelGoneError(error) || heals >= MAX_HEALS_PER_CALL) throw error
          heals++
          await this.heal()
        }
      }
    } finally {
      this.restoreModel(originalModel)
    }
  }

  /** Nach transientem Temp-Wechsel das ursprüngliche (beste) Model wiederherstellen — außer es wurde dauerhaft ausgeschlossen. */
  private restoreModel(originalModel: string): void {
    if (this.model !== originalModel && !excludedFreeModels.has(originalModel)) {
      this.model = originalModel
    }
  }
}

/** Async-Pfad von `getLLM({ provider: "openrouter", free: true })`. */
export async function getFreeOpenRouterLLM(config: {
  apikey?: string
  dataSafe?: boolean
  config?: { temperature?: number; reasoning?: boolean }
}): Promise<FreeOpenRouterLLM> {
  const baseURL = config.dataSafe ? OPENROUTER_EU_BASE_URL : OPENROUTER_BASE_URL
  const model = await fetchBestFreeModel(baseURL)

  // dataSafe (`provider`) und reasoning (`reasoning`) belegen disjunkte Body-Keys → flach mergebar.
  const modelKwargs = {
    ...(config.dataSafe ? OPENROUTER_DATA_SAFE_KWARGS : {}),
    ...(config.config?.reasoning ? OPENROUTER_REASONING_KWARGS : {}),
  }

  return new FreeOpenRouterLLM({
    model,
    apiKey: config.apikey ?? process.env.OPENROUTER_API_KEY,
    baseURL,
    ...(Object.keys(modelKwargs).length > 0 ? { modelKwargs } : {}),
    ...(config.config?.reasoning ? { includeRawResponse: true } : {}),
    ...(config.config?.temperature !== undefined ? { temperature: config.config.temperature } : {}),
  })
}
