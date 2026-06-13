import { ChatGroq, ChatOpenAI } from "../imports";

export type Prettify<T> = {
  [K in keyof T]: T[K]
} & {};

type ExtraGroq = ChatGroq & { provider?: "chatgroq" }
type ExtraLocal = ChatOpenAI & { provider?: "local" }
type ExtraOpenAI = ChatOpenAI & { provider?: "openrouter" }

export type AutoComplete<T extends string> = T | (string & {})

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

/** Groq Vision docs: https://console.groq.com/docs/vision */
export type ChatGroqVisionModel = AutoComplete<
  | "meta-llama/llama-4-scout-17b-16e-instruct"
  | "meta-llama/llama-4-maverick-17b-128e-instruct"
>

/** Groq TTS docs: https://console.groq.com/docs/text-to-speech */
export type ChatGroqTTSModel = AutoComplete<
  | "canopylabs/orpheus-v1-english"
  | "canopylabs/orpheus-arabic-saudi"
>

/** Groq STT docs: https://console.groq.com/docs/speech-to-text */
export type ChatGroqSTTModel = AutoComplete<
  | "whisper-large-v3"
  | "whisper-large-v3-turbo"
>

/** OpenRouter öffentliche /api/v1/models (2026-04): GPT ≥4.1, Claude 4.x, Gemini ≥2.5, gängige Open-Weight-IDs. */
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
  | "arcee-ai/trinity-large-preview:free"
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
  | "google/gemma-4-26b-a4b-it:free"
  | "google/gemma-4-31b-it"
  | "google/gemma-4-31b-it:free"
  | "inception/mercury-2"
  | "liquid/lfm-2-24b-a2b"
  | "liquid/lfm-2.5-1.2b-instruct:free"
  | "liquid/lfm-2.5-1.2b-thinking:free"
  | "meta-llama/llama-3.3-70b-instruct"
  | "meta-llama/llama-3.3-70b-instruct:free"
  | "meta-llama/llama-4-maverick"
  | "meta-llama/llama-4-scout"
  | "meta-llama/llama-guard-4-12b"
  | "minimax/minimax-m2"
  | "minimax/minimax-m2-her"
  | "minimax/minimax-m2.1"
  | "minimax/minimax-m2.5"
  | "minimax/minimax-m2.5:free"
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
  | "nvidia/nemotron-3-nano-30b-a3b:free"
  | "nvidia/nemotron-3-super-120b-a12b"
  | "nvidia/nemotron-3-super-120b-a12b:free"
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
  | "openai/gpt-oss-120b:free"
  | "openai/gpt-oss-20b"
  | "openai/gpt-oss-20b:free"
  | "openai/gpt-oss-safeguard-20b"
  | "qwen/qwen3-coder"
  | "qwen/qwen3-coder-30b-a3b-instruct"
  | "qwen/qwen3-coder-flash"
  | "qwen/qwen3-coder-next"
  | "qwen/qwen3-coder-plus"
  | "qwen/qwen3-coder:free"
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
  | "z-ai/glm-5v-turbo"
>

/** Viele OpenRouter Chat-Modelle sind vision-fähig; deshalb bewusst auf bestehende Chat-Union vereinfacht. */
export type OpenRouterVisionModel = OpenRouterModel

/** OpenRouter TTS models via `output_modalities=speech` (2026-04). */
export type OpenRouterTTSModel = AutoComplete<
  | "canopylabs/orpheus-3b-0.1-ft"
  | "google/gemini-3.1-flash-tts-preview"
  | "hexgrad/kokoro-82m"
  | "mistralai/voxtral-mini-tts-2603"
  | "openai/gpt-4o-mini-tts-2025-12-15"
  | "sesame/csm-1b"
  | "zyphra/zonos-v0.1-hybrid"
  | "zyphra/zonos-v0.1-transformer"
>

/** OpenRouter audio-input models for transcription/STT flows (2026-04). */
export type OpenRouterSTTModel = AutoComplete<
  | "google/gemini-2.0-flash-001"
  | "google/gemini-2.0-flash-lite-001"
  | "google/gemini-2.5-flash"
  | "google/gemini-2.5-flash-lite"
  | "google/gemini-2.5-flash-lite-preview-09-2025"
  | "google/gemini-2.5-pro"
  | "google/gemini-2.5-pro-preview"
  | "google/gemini-2.5-pro-preview-05-06"
  | "google/gemini-3-flash-preview"
  | "google/gemini-3.1-flash-lite-preview"
  | "google/gemini-3.1-pro-preview"
  | "google/gemini-3.1-pro-preview-customtools"
  | "mistralai/voxtral-small-24b-2507"
  | "openai/gpt-4o-audio-preview"
  | "openai/gpt-audio"
  | "openai/gpt-audio-mini"
  | "openrouter/auto"
  | "xiaomi/mimo-v2-omni"
  | "xiaomi/mimo-v2.5"
>

/** OpenRouter image-generation models via `output_modalities=image` (2026-04). */
export type OpenRouterImageGenModel = AutoComplete<
  | "black-forest-labs/flux.2-flex"
  | "black-forest-labs/flux.2-klein-4b"
  | "black-forest-labs/flux.2-max"
  | "black-forest-labs/flux.2-pro"
  | "bytedance-seed/seedream-4.5"
  | "google/gemini-2.5-flash-image"
  | "google/gemini-3-pro-image-preview"
  | "google/gemini-3.1-flash-image-preview"
  | "openai/gpt-5-image"
  | "openai/gpt-5-image-mini"
  | "openai/gpt-5.4-image-2"
  | "openrouter/auto"
  | "sourceful/riverflow-v2-fast"
  | "sourceful/riverflow-v2-fast-preview"
  | "sourceful/riverflow-v2-max-preview"
  | "sourceful/riverflow-v2-pro"
  | "sourceful/riverflow-v2-standard-preview"
>

/** LM Studio Model-IDs (kurze Hub-Bezeichner, siehe GET /v1/models). */
export type LocalModel = AutoComplete<
  | "google/gemma-4-12b-qat"
  | "nvidia/nemotron-3-nano-4b"
  | "google/gemma-4-e4b"
  | "igorls/gemma-4-12b-it-qat-unquantized-heretic"
>

export type LLMModelSpecification = "vision" | "image-gen" | "stt" | "tts"

type GroqLLMConfig =
  | { provider: "chatgroq"; type?: undefined; model?: ChatGroqModel; apikey?: string }
  | { provider: "chatgroq"; type: "vision"; model?: ChatGroqVisionModel; apikey?: string }
  | { provider: "chatgroq"; type: "stt"; model?: ChatGroqSTTModel; apikey?: string }
  | { provider: "chatgroq"; type: "tts"; model?: ChatGroqTTSModel; apikey?: string }

type OpenRouterLLMConfigBase = {
  provider: "openrouter"
  apikey?: string
  /**
   * Strengeres OpenRouter-Routing + EU-Endpunkt: `eu.openrouter.ai`, und im
   * Request-Body `provider` wie in der OpenRouter-Doku (`data_collection`,
   * `zdr` innerhalb von `provider` — nicht als Top-Level-Feld neben
   * `provider`). LangChain `ChatOpenAI` reicht `modelKwargs` unverändert an
   * die Chat-Completions-API durch (siehe `invocationParams` in
   * `@langchain/openai`).
   */
  dataSafe?: boolean
}

type OpenRouterLLMConfig =
  | (OpenRouterLLMConfigBase & { type?: undefined; model?: OpenRouterModel })
  | (OpenRouterLLMConfigBase & { type: "vision"; model?: OpenRouterVisionModel })
  | (OpenRouterLLMConfigBase & { type: "stt"; model?: OpenRouterSTTModel })
  | (OpenRouterLLMConfigBase & { type: "tts"; model?: OpenRouterTTSModel })
  | (OpenRouterLLMConfigBase & { type: "image-gen"; model?: OpenRouterImageGenModel })

type LocalLLMConfig =
  | { provider: "local"; type?: undefined; model?: LocalModel }

export type LLMConfig = GroqLLMConfig | OpenRouterLLMConfig | LocalLLMConfig

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
   */
export function getLLM(config: LLMConfig) {
  const type = config.type

  switch (config.provider) {
    case "chatgroq": {
      const llm: ExtraGroq = new ChatGroq({
        apiKey: config.apikey ?? process.env.CHATGROQ_API_KEY,
        model: config.model ?? (
          type === "vision"
            ? "meta-llama/llama-4-scout-17b-16e-instruct"
            : type === "stt"
              ? "whisper-large-v3-turbo"
              : type === "tts"
                ? "canopylabs/orpheus-v1-english"
                : "llama-3.3-70b-versatile"
        )
      });
      llm.provider = "chatgroq"
      return llm
    }
    case "openrouter": {
      const llm: ExtraOpenAI = new ChatOpenAI({
        apiKey: config.apikey ?? process.env.OPENROUTER_API_KEY,
        configuration: {
          baseURL: config.dataSafe
            ? "https://eu.openrouter.ai/api/v1"
            : "https://openrouter.ai/api/v1",
        },
        model: config.model ?? (
          type === "image-gen"
            ? "google/gemini-3.1-flash-image-preview"
            : type === "stt"
              ? "google/gemini-2.5-flash"
              : type === "tts"
                ? "openai/gpt-4o-mini-tts-2025-12-15"
                : "openai/gpt-5.4-mini"
        ),
        ...(config.dataSafe
          ? {
              modelKwargs: {
                provider: {
                  data_collection: "deny",
                  zdr: true,
                  allow_fallbacks: false,
                },
              },
            }
          : {}),
      })
      llm.provider = "openrouter"
      return llm
    }
      

    case "local": {
      const llm: ExtraLocal = new ChatOpenAI({
        model: config.model ?? "nvidia/nemotron-3-nano-4b",
        apiKey: "lm-studio",
        configuration: { baseURL: "http://localhost:1234/v1" },
      });
      llm.provider = "local"
      return llm
    }

    default:
      throw new Error("Unknown LLM provider");
  }
}