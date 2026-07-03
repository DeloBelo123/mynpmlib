import { ChatGroq, ChatOpenAI } from "../../imports";
import { ClaudeCLI_LLM, OpenAICLI_LLM } from "./cli-llms";
import {
  FreeOpenRouterLLM,
  getFreeOpenRouterLLM,
  OPENROUTER_BASE_URL,
  OPENROUTER_EU_BASE_URL,
  OPENROUTER_DATA_SAFE_KWARGS,
} from "./free-llm";
import type {
  LLMConfig,
  GroqLLMConfig,
  OpenRouterLLMConfig,
  OpenRouterFreeLLMConfig,
  LocalLLMConfig,
  ClaudeCLILLMConfig,
  OpenAICLILLMConfig,
  GroqLLM,
  OpenRouterLLM,
  LocalLLM,
} from "./types";

export * from "./types";
export { FreeOpenRouterLLM, fetchBestFreeModel, FreeLimitError, toFreeLimitError } from "./free-llm";

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
 * default llm for chatgroq: "llama-3.3-70b-versatile"
 *
 * default llm for openrouter: "openai/gpt-5.4-mini"
 *
 * default llm for local: "nvidia/nemotron-3-nano-4b"
 *
 * provider "claude-cli": nutzt die eingeloggte `claude -p` CLI als reines LLM (Default-Model "claude-opus-4-8")
 *
 * provider "openai-cli": nutzt `codex exec` als reines LLM (Default-Model "gpt-5.5"; CLI muss installiert sein)
 */
export function getLLM(
  config: GroqLLMConfig | OpenRouterLLMConfig | LocalLLMConfig | ClaudeCLILLMConfig | OpenAICLILLMConfig
): GroqLLM | OpenRouterLLM | LocalLLM | ClaudeCLI_LLM | OpenAICLI_LLM
export function getLLM(config: LLMConfig) {
  switch (config.provider) {
    case "chatgroq": {
      const llm: GroqLLM = new ChatGroq({
        apiKey: config.apikey ?? process.env.CHATGROQ_API_KEY,
        model: config.model ?? "llama-3.3-70b-versatile",
      });
      llm.provider = "chatgroq"
      return llm
    }

    case "openrouter": {
      if (config.free) {
        return getFreeOpenRouterLLM(config)
      }
      const llm: OpenRouterLLM = new ChatOpenAI({
        apiKey: config.apikey ?? process.env.OPENROUTER_API_KEY,
        configuration: {
          baseURL: config.dataSafe ? OPENROUTER_EU_BASE_URL : OPENROUTER_BASE_URL,
        },
        model: config.model ?? "openai/gpt-5.4-mini",
        ...(config.dataSafe ? { modelKwargs: OPENROUTER_DATA_SAFE_KWARGS } : {}),
      })
      llm.provider = "openrouter"
      return llm
    }

    case "local": {
      const llm: LocalLLM = new ChatOpenAI({
        model: config.model ?? "nvidia/nemotron-3-nano-4b",
        apiKey: "lm-studio",
        configuration: { baseURL: "http://localhost:1234/v1" },
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
      })
    }

    case "openai-cli": {
      // nutzt die `codex exec`-CLI (muss installiert + eingeloggt sein: `npm i -g @openai/codex`).
      return new OpenAICLI_LLM({
        model: config.model,
        systemPrompt: config.systemPrompt,
        cwd: config.cwd,
        cliPath: config.cliPath,
        extraArgs: config.extraArgs,
        timeoutMs: config.timeoutMs,
      })
    }

    default:
      throw new Error("Unknown LLM provider");
  }
}
