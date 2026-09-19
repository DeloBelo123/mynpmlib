import { getLLM } from "../helpers/llm/llms"
import { getOpenRouterRuntime, type LLMInstance } from "../modalities/openrouter"

/** A JSON-compatible value accepted inside JEV state, instructions, and criteria. */
export type JevJsonValue =
    | string
    | number
    | boolean
    | null
    | JevJsonValue[]
    | { [key: string]: JevJsonValue }

/**
 * A top-level JEV input. JEV evaluates text or structured JSON; it does not
 * accept image, audio, or video input.
 */
export type JevEntry = string | { [key: string]: JevJsonValue } | JevJsonValue[] | null

/** A yes/no question. The result's `noul` value is the probability of "yes". */
export interface JevNoulQuestion {
    type: "noul"
    instructions?: JevEntry
    criteria?: {
        true?: JevEntry
        false?: JevEntry
    } | null
}

/** Labels mapped to descriptions; `null` leaves a label undescribed. */
export type JevChoiceCriteria = Record<string, JevEntry>

/** Selects exactly one key from `criteria`. */
export interface JevChoiceQuestion<T extends JevChoiceCriteria = JevChoiceCriteria> {
    type: "choice"
    instructions?: JevEntry
    criteria: T
}

/** At least two ordered rubric descriptions, indexed from zero. */
export type JevScoreCriteria = readonly [JevEntry, JevEntry, ...JevEntry[]]

/** Rates the state against an ordered rubric. */
export interface JevScoreQuestion<T extends JevScoreCriteria = JevScoreCriteria> {
    type: "score"
    instructions?: JevEntry
    criteria: T
}

export type JevQuestion =
    | JevNoulQuestion
    | JevChoiceQuestion
    | JevScoreQuestion

/** Named questions evaluated independently against the same state. */
export type JevQuestions = Record<string, JevQuestion>

export interface JevNoulAnswer {
    readonly type: "noul"
    /** Probability of "yes", from zero to one. */
    readonly noul: number
}

export interface JevChoiceAnswer<T extends JevChoiceCriteria = JevChoiceCriteria> {
    readonly type: "choice"
    readonly choice: keyof T & string
    readonly confidence: number
    readonly probabilities: { readonly [K in keyof T]: number }
}

type JevScoreIndex<T extends JevScoreCriteria> = number extends T["length"]
    ? number
    : Extract<keyof T, `${number}`>

export interface JevScoreAnswer<T extends JevScoreCriteria = JevScoreCriteria> {
    readonly type: "score"
    /** Expected rubric position; it can be fractional, for example `1.7`. */
    readonly score: number
    readonly confidence: number
    readonly legend: { readonly [K in JevScoreIndex<T>]: T[K] }
    readonly probabilities: { readonly [K in JevScoreIndex<T>]: number }
}

/** The answer shape inferred from one question. */
export type JevAnswerFor<T extends JevQuestion> = T extends JevNoulQuestion
    ? JevNoulAnswer
    : T extends JevScoreQuestion<infer S>
      ? JevScoreAnswer<S>
      : T extends JevChoiceQuestion<infer C>
        ? JevChoiceAnswer<C>
        : never

export interface JevUsage {
    readonly input_tokens: number
    readonly output_tokens: number
    /** OpenRouter's request cost in USD, when returned by the endpoint. */
    readonly cost?: number
}

/** A JEV result whose answer keys and values are inferred from `questions`. */
export type JevResult<Q extends JevQuestions> = {
    readonly answers: { readonly [K in keyof Q]: JevAnswerFor<Q[K]> }
    /** Versioned model ID that actually answered the request. */
    readonly model: string
    readonly usage: JevUsage
    /** OpenRouter generation ID. */
    readonly id?: string
    /** Provider selected by OpenRouter. */
    readonly provider?: string
}

export type JevOptions<Q extends JevQuestions> = {
    state: JevEntry
    questions: Q
    /**
     * OpenRouter LLM created by `getLLM()`. Its API key, base URL, and model are
     * reused for the Decisions request. Defaults to `~typesafe/jev-latest`.
     */
    llm?: LLMInstance
    /** Cancels the underlying HTTP request. */
    signal?: AbortSignal
}

/** Error returned for a non-2xx OpenRouter Decisions response. */
export class JevAPIError extends Error {
    readonly status: number
    readonly body: unknown

    constructor(status: number, body: unknown) {
        const detail = readErrorMessage(body)
        super(`OpenRouter JEV request failed (${status})${detail ? `: ${detail}` : ""}`)
        this.name = "JevAPIError"
        this.status = status
        this.body = body
    }
}

function readErrorMessage(value: unknown): string | undefined {
    if (!value || typeof value !== "object") return undefined

    const error = (value as { error?: unknown }).error
    if (error && typeof error === "object") {
        const message = (error as { message?: unknown }).message
        if (typeof message === "string") return message
    }

    const message = (value as { message?: unknown }).message
    return typeof message === "string" ? message : undefined
}

function parseResponseBody(text: string): unknown {
    if (!text) return undefined
    try {
        return JSON.parse(text)
    } catch {
        return text
    }
}

function assertValidQuestions(questions: JevQuestions): void {
    if (Object.keys(questions).length === 0) {
        throw new TypeError("JEV requires at least one question")
    }

    for (const [name, question] of Object.entries(questions)) {
        if (question.type === "score" && question.criteria.length < 2) {
            throw new TypeError(`JEV score question "${name}" requires at least two criteria`)
        }
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value)
}

function assertValidResult<Q extends JevQuestions>(
    value: unknown,
    questions: Q,
): asserts value is JevResult<Q> {
    if (!isRecord(value) || !isRecord(value.answers) || typeof value.model !== "string") {
        throw new TypeError("OpenRouter returned an invalid JEV response")
    }
    if (
        !isRecord(value.usage) ||
        typeof value.usage.input_tokens !== "number" ||
        typeof value.usage.output_tokens !== "number"
    ) {
        throw new TypeError("OpenRouter returned invalid JEV usage data")
    }

    for (const [name, question] of Object.entries(questions)) {
        const answer = value.answers[name]
        if (!isRecord(answer) || answer.type !== question.type) {
            throw new TypeError(`OpenRouter returned an invalid answer for JEV question "${name}"`)
        }
        if (question.type === "noul" && typeof answer.noul !== "number") {
            throw new TypeError(`OpenRouter returned an invalid noul answer for "${name}"`)
        }
        if (
            question.type === "choice" &&
            (typeof answer.choice !== "string" ||
                !Object.hasOwn(question.criteria, answer.choice) ||
                typeof answer.confidence !== "number" ||
                !isRecord(answer.probabilities))
        ) {
            throw new TypeError(`OpenRouter returned an invalid choice answer for "${name}"`)
        }
        if (
            question.type === "score" &&
            (typeof answer.score !== "number" ||
                typeof answer.confidence !== "number" ||
                !isRecord(answer.legend) ||
                !isRecord(answer.probabilities))
        ) {
            throw new TypeError(`OpenRouter returned an invalid score answer for "${name}"`)
        }
    }
}

/**
 * Evaluates structured state with TypeSafe JEV through OpenRouter's Decisions API.
 *
 * Use JEV for fast, focused decisions such as routing, classification, ranking,
 * verification, or rubric scoring. It does not generate prose. Put every
 * independent question about the same `state` into one call: JEV evaluates them
 * in parallel, and the return type preserves every question name and Choice key.
 *
 * Question types:
 * - `noul`: yes/no probability in `answer.noul` (there is no separate confidence)
 * - `choice`: selected criteria key plus its complete probability distribution
 * - `score`: expected position on an ordered, zero-based rubric; may be fractional
 *
 * For structured state, reference exact paths such as `ticket.message` in the
 * instructions. Add an `other`/`unknown` Choice when the listed options are not
 * exhaustive. Tune probability thresholds on labeled examples before automating
 * consequential actions.
 *
 * @param options.state Text, JSON object/array, or `null` to evaluate.
 * @param options.questions Named questions whose keys become `result.answers` keys.
 * @param options.llm OpenRouter LLM from `getLLM()`; defaults to JEV Latest.
 * @param options.signal Optional cancellation signal for the HTTP request.
 * @returns Typed answers plus the resolved model, token usage, cost, and request metadata.
 * @throws {JevAPIError} OpenRouter responds with a non-2xx status.
 * @throws {TypeError} Questions are invalid or OpenRouter returns an invalid result shape.
 *
 * @example
 * ```ts
 * const result = await classify({
 *     state: { message: "I was charged twice. Please refund one charge." },
 *     questions: {
 *         route: {
 *             type: "choice",
 *             instructions: "Which team should handle `message`?",
 *             criteria: {
 *                 billing: "Charges, invoices, or refunds",
 *                 technical: "Bugs or integrations",
 *                 other: null,
 *             },
 *         },
 *         asksForRefund: {
 *             type: "noul",
 *             instructions: "Does `message` explicitly ask for a refund?",
 *         },
 *         urgency: {
 *             type: "score",
 *             instructions: "How urgent is `message`?",
 *             criteria: ["Can wait", "Time-sensitive", "Blocking"] as const,
 *         },
 *     },
 * })
 *
 * result.answers.route.choice // "billing" | "technical" | "other"
 * result.answers.asksForRefund.noul // number from 0 to 1
 * result.answers.urgency.score // number, e.g. 1.7
 * ```
 */
export async function classify<const Q extends JevQuestions>({
    state,
    questions,
    llm,
    signal,
}: JevOptions<Q>): Promise<JevResult<Q>> {
    assertValidQuestions(questions)

    const openRouterLLM =
        llm ??
        getLLM({
            from: "openrouter",
            model: "~typesafe/jev-latest",
        })
    const runtime = getOpenRouterRuntime(openRouterLLM)
    const endpoint = new URL("/api/alpha/decisions", runtime.baseURL)

    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${runtime.apiKey}`,
            Accept: "application/json",
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: runtime.model,
            state,
            questions,
        }),
        signal,
    })
    const body = parseResponseBody(await response.text())

    if (!response.ok) {
        throw new JevAPIError(response.status, body)
    }

    assertValidResult(body, questions)
    return body
}
