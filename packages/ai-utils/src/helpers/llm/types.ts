import type { ChatGroq, ChatOpenAI } from "../../imports"
import type { ClaudeCLIModel, OpenAICLIModel } from "./cli-llms"

export type Prettify<T> = {
  [K in keyof T]: T[K]
} & {};

export type AutoComplete<T extends string> = T | (string & {})

// ────────────────────────────────────────────────────────────────────────────
// Model-Unions
// ────────────────────────────────────────────────────────────────────────────

/** Groq Cloud Chat-Completions (https://console.groq.com/docs/models): Production, Compound, Preview. */
export type ChatGroqModel = AutoComplete<
  | "groq/compound"
  | "groq/compound-mini"
  | "llama-3.1-8b-instant"
  | "llama-3.3-70b-versatile"
  | "meta-llama/llama-4-scout-17b-16e-instruct"
  | "openai/gpt-oss-120b"
  | "openai/gpt-oss-20b"
  | "openai/gpt-oss-safeguard-20b"
  | "qwen/qwen3-32b"
>

/**
 * OpenRouter öffentliche /api/v1/models (2026-07). Ohne `:free`-Varianten —
 * für kostenlose Modelle gibt es `free: true`, das dynamisch das beste wählt.
 */
export type OpenRouterModel = AutoComplete<
  | "anthropic/claude-haiku-4.5"
  | "anthropic/claude-opus-4"
  | "anthropic/claude-opus-4.1"
  | "anthropic/claude-opus-4.5"
  | "anthropic/claude-opus-4.6"
  | "anthropic/claude-opus-4.6-fast"
  | "anthropic/claude-opus-4.7"
  | "anthropic/claude-sonnet-4"
  | "anthropic/claude-sonnet-4.5"
  | "anthropic/claude-sonnet-4.6"
  | "arcee-ai/trinity-large-thinking"
  | "arcee-ai/trinity-mini"
  | "bytedance-seed/seed-2.0-lite"
  | "bytedance-seed/seed-2.0-mini"
  | "deepseek/deepseek-r1"
  | "deepseek/deepseek-r1-0528"
  | "deepseek/deepseek-r1-distill-llama-70b"
  | "deepseek/deepseek-r1-distill-qwen-32b"
  | "deepseek/deepseek-v3.1-terminus"
  | "deepseek/deepseek-v3.2"
  | "deepseek/deepseek-v3.2-exp"
  | "deepseek/deepseek-v3.2-speciale"
  | "google/gemini-2.5-flash"
  | "google/gemini-2.5-flash-image"
  | "google/gemini-2.5-flash-lite"
  | "google/gemini-2.5-flash-lite-preview-09-2025"
  | "google/gemini-2.5-pro"
  | "google/gemini-2.5-pro-preview"
  | "google/gemini-2.5-pro-preview-05-06"
  | "google/gemini-3-flash-preview"
  | "google/gemini-3-pro-image-preview"
  | "google/gemini-3.1-flash-image-preview"
  | "google/gemini-3.1-flash-lite-preview"
  | "google/gemini-3.1-pro-preview"
  | "google/gemini-3.1-pro-preview-customtools"
  | "google/gemma-4-26b-a4b-it"
  | "google/gemma-4-31b-it"
  | "inception/mercury-2"
  | "liquid/lfm-2-24b-a2b"
  | "meta-llama/llama-3.3-70b-instruct"
  | "meta-llama/llama-4-maverick"
  | "meta-llama/llama-4-scout"
  | "meta-llama/llama-guard-4-12b"
  | "minimax/minimax-m2"
  | "minimax/minimax-m2-her"
  | "minimax/minimax-m2.1"
  | "minimax/minimax-m2.5"
  | "minimax/minimax-m2.7"
  | "mistralai/devstral-2512"
  | "mistralai/devstral-medium"
  | "mistralai/devstral-small"
  | "mistralai/mistral-large-2512"
  | "mistralai/mistral-small-2603"
  | "moonshotai/kimi-k2"
  | "moonshotai/kimi-k2-0905"
  | "moonshotai/kimi-k2-thinking"
  | "moonshotai/kimi-k2.5"
  | "nvidia/nemotron-3-nano-30b-a3b"
  | "nvidia/nemotron-3-super-120b-a12b"
  | "openai/gpt-4.1"
  | "openai/gpt-4.1-mini"
  | "openai/gpt-4.1-nano"
  | "openai/gpt-5"
  | "openai/gpt-5-chat"
  | "openai/gpt-5-codex"
  | "openai/gpt-5-image"
  | "openai/gpt-5-image-mini"
  | "openai/gpt-5-mini"
  | "openai/gpt-5-nano"
  | "openai/gpt-5-pro"
  | "openai/gpt-5.1"
  | "openai/gpt-5.1-chat"
  | "openai/gpt-5.1-codex"
  | "openai/gpt-5.1-codex-max"
  | "openai/gpt-5.1-codex-mini"
  | "openai/gpt-5.2"
  | "openai/gpt-5.2-chat"
  | "openai/gpt-5.2-codex"
  | "openai/gpt-5.2-pro"
  | "openai/gpt-5.3-chat"
  | "openai/gpt-5.3-codex"
  | "openai/gpt-5.4"
  | "openai/gpt-5.4-mini"
  | "openai/gpt-5.4-nano"
  | "openai/gpt-5.4-pro"
  | "openai/gpt-oss-120b"
  | "openai/gpt-oss-20b"
  | "openai/gpt-oss-safeguard-20b"
  | "qwen/qwen3-coder"
  | "qwen/qwen3-coder-30b-a3b-instruct"
  | "qwen/qwen3-coder-flash"
  | "qwen/qwen3-coder-next"
  | "qwen/qwen3-coder-plus"
  | "qwen/qwen3-max"
  | "qwen/qwen3-max-thinking"
  | "qwen/qwen3.5-122b-a10b"
  | "qwen/qwen3.5-27b"
  | "qwen/qwen3.5-35b-a3b"
  | "qwen/qwen3.5-397b-a17b"
  | "qwen/qwen3.5-9b"
  | "qwen/qwen3.5-flash-02-23"
  | "qwen/qwen3.5-plus-02-15"
  | "qwen/qwen3.6-plus"
  | "rekaai/reka-edge"
  | "xiaomi/mimo-v2-flash"
  | "xiaomi/mimo-v2-omni"
  | "xiaomi/mimo-v2-pro"
  | "z-ai/glm-5"
  | "z-ai/glm-5-turbo"
  | "z-ai/glm-5.1"
  | "z-ai/glm-5.2"
  | "z-ai/glm-5v-turbo"
>

/** LM Studio Model-IDs (kurze Hub-Bezeichner, siehe GET /v1/models). */
export type LocalModel = AutoComplete<
  | "google/gemma-4-12b-qat"
  | "nvidia/nemotron-3-nano-4b"
  | "google/gemma-4-e4b"
  | "igorls/gemma-4-12b-it-qat-unquantized-heretic"
>

// ────────────────────────────────────────────────────────────────────────────
// getLLM-Configs (eine pro Provider)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Laufzeit-Parameter, die 1:1 an das darunterliegende Chat-Model
 * (`ChatOpenAI` / `ChatGroq`) durchgereicht werden.
 */
/**
 * Reasoning-Aufwand eines Models — 1:1 die von OpenRouter/OpenAI akzeptierten
 * `effort`-Stufen (aufsteigend). `"none"` = kein Reasoning. Nicht jedes Model
 * unterstützt jede Stufe; nicht unterstützte Stufen ignoriert OpenRouter.
 */
export type ReasoningLevel = "none" | "minimal" | "low" | "medium" | "high" | "xhigh"

export type LLMRuntimeConfig = {
  /** Sampling-Temperatur (analog zum `ChatOpenAI`-Config). */
  temperature?: number
  /**
   * Nur `openrouter`: Reasoning-Aufwand des Models. Default `"none"` = kein
   * Reasoning (kein Overhead, wie früher `reasoning: false`). Jede andere Stufe
   * schaltet Reasoning ein (`reasoning: { effort }` im Request-Body +
   * `__includeRawResponse`, damit die Tokens auslesbar werden) — Voraussetzung
   * dafür, dass `.stream({ showReasoning: true })` überhaupt Reasoning-Events
   * liefert. `showReasoning` allein ist nur der Leser.
   */
  reasoning?: ReasoningLevel
}

export type GroqLLMConfig = {
  provider: "chatgroq"
  model?: ChatGroqModel
  apikey?: string
  config?: LLMRuntimeConfig
}

type OpenRouterConfigBase = {
  provider: "openrouter"
  apikey?: string
  /**
   * Strengeres OpenRouter-Routing + EU-Endpunkt (`eu.openrouter.ai`) mit
   * `data_collection: "deny"`, `zdr: true` und ohne Fallbacks.
   */
  dataSafe?: boolean
  config?: LLMRuntimeConfig
}

export type OpenRouterLLMConfig = OpenRouterConfigBase & {
  model?: OpenRouterModel
  free?: false
}

export type OpenRouterFreeLLMConfig = OpenRouterConfigBase & {
  /**
   * `free: true` wählt dynamisch das beste aktuell kostenlose Model (`:free`)
   * mit Tool-Support — getLLM wird dadurch async. Das gewählte Model steht auf
   * `.model`; stirbt es, heilt sich die Instanz selbst (siehe free-llm.ts).
   */
  free: true
  model?: never
}

export type LocalLLMConfig = {
  provider: "local"
  model?: LocalModel
  config?: LLMRuntimeConfig
}

/**
 * Headless-CLI-Provider: nutzen die eingeloggte CLI (`claude -p` / `codex exec`)
 * als reines LangChain-Chat-Model (Abo-Auth, kein API-Key). Siehe `cli-llms.ts`.
 */
type CLILLMConfigBase = {
  /** System-Prompt; Default `""` (ersetzt den Coder-Default der CLI). */
  systemPrompt?: string
  /** Arbeitsverzeichnis des Subprozesses; Default: neutrales Temp-Verzeichnis. */
  cwd?: string
  /** Pfad/Name des CLI-Binaries (Default je Provider). */
  cliPath?: string
  /** Zusätzliche CLI-Flags (Escape-Hatch). */
  extraArgs?: string[]
  /** Timeout in ms. */
  timeoutMs?: number
}

export type ClaudeCLILLMConfig = CLILLMConfigBase & { provider: "claude-cli"; model?: ClaudeCLIModel }
export type OpenAICLILLMConfig = CLILLMConfigBase & { provider: "openai-cli"; model?: OpenAICLIModel }

export type LLMConfig =
  | GroqLLMConfig
  | OpenRouterLLMConfig
  | OpenRouterFreeLLMConfig
  | LocalLLMConfig
  | ClaudeCLILLMConfig
  | OpenAICLILLMConfig

// ────────────────────────────────────────────────────────────────────────────
// getLLM-Rückgabetypen
// ────────────────────────────────────────────────────────────────────────────

// getLLM stempelt `.provider` auf die Instanz; `.model` bringen die Klassen selbst mit.
export type GroqLLM = ChatGroq & { provider?: "chatgroq" }
export type OpenRouterLLM = ChatOpenAI & { provider?: "openrouter" }
export type LocalLLM = ChatOpenAI & { provider?: "local" }
