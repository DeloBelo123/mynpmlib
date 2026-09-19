import { ChatGroq, ChatOpenAI } from "../../imports";
import { ClaudeCLI_LLM, CodexCLI_LLM, toCLIEffort } from "./cli-llms";
import {
  FreeOpenRouterLLM,
  getFreeOpenRouterLLM,
  OPENROUTER_BASE_URL,
  OPENROUTER_EU_BASE_URL,
  OPENROUTER_DATA_SAFE_KWARGS,
  openRouterReasoningEnabled,
  openRouterReasoningKwargs,
} from "./free-llm";
import type {
  LLMConfig,
  GroqLLMConfig,
  OpenAILLMConfig,
  OpenRouterLLMConfig,
  OpenRouterFreeLLMConfig,
  LocalLLMConfig,
  ClaudeCLILLMConfig,
  CodexCLILLMConfig,
  ReasoningLevel,
  GroqLLM,
  OpenAILLM,
  OpenRouterLLM,
  LocalLLM,
} from "./types";

export * from "./types";
export { FreeOpenRouterLLM, fetchBestFreeModel, FreeLimitError, toFreeLimitError } from "./free-llm";

/**
 * `reasoning` → `reasoning_effort` für die OpenAI-kompatiblen Provider
 * (`openai`, `local`). `"none"`/undefined → gar kein Parameter (Provider-Default).
 *
 * Das Konstruktor-Feld heißt `reasoning: { effort }` (`reasoningEffort` ist bei
 * `ChatOpenAI` nur eine deprecated Call-Option und würde hier verpuffen);
 * daraus baut LangChain das `reasoning_effort` im Request-Body.
 * OpenRouter braucht ein anderes Body-Format → `openRouterReasoningKwargs`.
 */
function reasoningEffortKwargs(level?: ReasoningLevel): { reasoning?: { effort: ReasoningLevel } } {
  if (!level || level === "none") return {}
  return { reasoning: { effort: level } }
}

/**
 * Dasselbe für `local` (LM Studio), aber als `modelKwargs`: das typisierte
 * `reasoning`-Feld filtert ChatOpenAI über `isReasoningModel()` (nur `o*`/`gpt-5*`),
 * lokale Model-IDs würden also stumm durchfallen. `modelKwargs` landet 1:1 im Body.
 */
function localReasoningKwargs(level?: ReasoningLevel): { modelKwargs?: { reasoning_effort: ReasoningLevel } } {
  if (!level || level === "none") return {}
  return { modelKwargs: { reasoning_effort: level } }
}

/**
 * `free: true` (nur openrouter): holt live das beste kostenlose `:free`-Model
 * mit Tool-Support (Doppel-Ranking: Intelligenz + Latenz) und gibt deshalb ein
 * Promise zurück — `await getLLM(...)`. Das gewählte Model ist über `.model` ablesbar.
 */
export function getLLM(config: OpenRouterFreeLLMConfig): Promise<FreeOpenRouterLLM>
/**
 * env-var for openrouter: process.env.OPENROUTER_API_KEY
 *
 * env-var for chatgroq: process.env.CHATGROQ_API_KEY
 *
 * env-var for openai: process.env.OPENAI_API_KEY
 *
 * default llm for chatgroq: "llama-3.3-70b-versatile"
 *
 * default llm for openrouter: "openai/gpt-5.6-luna"
 *
 * default llm for openai: "gpt-5.6-luna"
 *
 * default llm for local: "nvidia/nemotron-3-nano-4b"
 *
 * `from: "claude-cli"`: nutzt die eingeloggte `claude -p` CLI als reines LLM (Default-Model "claude-opus-4-8")
 *
 * `from: "codex-cli"`: nutzt `codex exec` als reines LLM (Default-Model "gpt-5.5"; CLI muss installiert sein)
 *
 * `config: { temperature, reasoning }` gibt es bei JEDEM Provider (auch bei `free: true`
 * und den CLIs). `temperature` ignorieren die CLIs, `reasoning` ignoriert chatgroq —
 * das provider-spezifische Mapping steht bei `LLMRuntimeConfig`.
 */
export function getLLM(
  config:
    | GroqLLMConfig
    | OpenAILLMConfig
    | OpenRouterLLMConfig
    | LocalLLMConfig
    | ClaudeCLILLMConfig
    | CodexCLILLMConfig
): GroqLLM | OpenAILLM | OpenRouterLLM | LocalLLM | ClaudeCLI_LLM | CodexCLI_LLM
export function getLLM(config: LLMConfig) {
  switch (config.from) {
    case "chatgroq": {
      const llm: GroqLLM = new ChatGroq({
        apiKey: config.apikey ?? process.env.CHATGROQ_API_KEY,
        model: config.model ?? "llama-3.3-70b-versatile",
        ...(config.config?.temperature !== undefined ? { temperature: config.config.temperature } : {}),
      });
      llm.provider = "chatgroq"
      return llm
    }

    case "openai": {
      const llm: OpenAILLM = new ChatOpenAI({
        apiKey: config.apikey ?? process.env.OPENAI_API_KEY,
        model: config.model ?? "gpt-5.6-luna",
        ...reasoningEffortKwargs(config.config?.reasoning),
        ...(config.config?.temperature !== undefined ? { temperature: config.config.temperature } : {}),
      });
      llm.provider = "openai"
      return llm
    }

    case "openrouter": {
      if (config.free) {
        return getFreeOpenRouterLLM(config)
      }
      // dataSafe (`provider`) und reasoning (`reasoning`) belegen disjunkte Body-Keys → flach mergebar.
      const reasoningKwargs = openRouterReasoningKwargs(config.config?.reasoning)
      const modelKwargs = {
        ...(config.dataSafe ? OPENROUTER_DATA_SAFE_KWARGS : {}),
        ...(reasoningKwargs ?? {}),
      }
      const llm: OpenRouterLLM = new ChatOpenAI({
        apiKey: config.apikey ?? process.env.OPENROUTER_API_KEY,
        configuration: {
          baseURL: config.dataSafe ? OPENROUTER_EU_BASE_URL : OPENROUTER_BASE_URL,
        },
        model: config.model ?? "openai/gpt-5.6-luna",
        ...(Object.keys(modelKwargs).length > 0 ? { modelKwargs } : {}),
        // Reasoning-Tokens landen bei OpenRouter in der Roh-Response → nur mit diesem Flag lesbar.
        ...(openRouterReasoningEnabled(config.config?.reasoning)
          ? { __includeRawResponse: true }
          : {}),
        ...(config.config?.temperature !== undefined ? { temperature: config.config.temperature } : {}),
      })
      llm.provider = "openrouter"
      return llm
    }

    case "local": {
      const llm: LocalLLM = new ChatOpenAI({
        model: config.model ?? "nvidia/nemotron-3-nano-4b",
        apiKey: "lm-studio",
        configuration: { baseURL: "http://localhost:1234/v1" },
        // Nicht das `reasoning`-Feld: ChatOpenAI schickt `reasoning_effort` nur für
        // Modelle, die es selbst als Reasoning-Model erkennt (`o*`/`gpt-5*`) — lokale
        // IDs wie "nvidia/nemotron-…" fielen sonst stumm raus. modelKwargs geht direkt in den Body.
        ...(localReasoningKwargs(config.config?.reasoning)),
        ...(config.config?.temperature !== undefined ? { temperature: config.config.temperature } : {}),
      });
      llm.provider = "local"
      return llm
    }

    case "claude-cli": {
      // nutzt die eingeloggte `claude`-CLI (Abo-Auth, kein API-Key). `.provider` setzt die Klasse selbst.
      return new ClaudeCLI_LLM({
        model: config.model,
        systemPrompt: config.systemPrompt,
        cwd: config.cwd,
        cliPath: config.cliPath,
        extraArgs: config.extraArgs,
        timeoutMs: config.timeoutMs,
        // Die CLIs kennen keine Temperature — nur `reasoning` (→ `effort`) wirkt hier.
        effort: toCLIEffort(config.config?.reasoning),
      })
    }

    case "codex-cli": {
      // nutzt die `codex exec`-CLI (muss installiert + eingeloggt sein: `npm i -g @openai/codex`).
      return new CodexCLI_LLM({
        model: config.model,
        systemPrompt: config.systemPrompt,
        cwd: config.cwd,
        cliPath: config.cliPath,
        extraArgs: config.extraArgs,
        timeoutMs: config.timeoutMs,
        // Die CLIs kennen keine Temperature — nur `reasoning` (→ `effort`) wirkt hier.
        effort: toCLIEffort(config.config?.reasoning),
      })
    }

    default:
      throw new Error("Unknown LLM provider");
  }
}




