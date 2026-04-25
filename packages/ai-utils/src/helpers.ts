import { BaseChatModel, BaseOutputParser, ChatGroq, ChatOllama, ChatOpenAI, ChatPromptTemplate, StringOutputParser, StructuredOutputParser } from "./imports";
import { z } from "zod/v3";

export type Prettify<T> = {
  [K in keyof T]: T[K]
} & {};

export type AutoComplete<T extends string> = T | (string & {})

export function logChunk(chunk: string) {
  const flushed = process.stdout.write(chunk)
  if (!flushed) {
    process.stdout.once('drain', () => {})
  } else {
    // Explizit flushen, damit Output sofort sichtbar ist
    process.stdout.write('', () => {})
  }
}

export function createSimpleChain(prompt: ChatPromptTemplate, llm: BaseChatModel, parser: BaseOutputParser | null = null) {
  return parser ? prompt.pipe(llm).pipe(parser) : prompt.pipe(llm)
}

export async function wait(ms:number){
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function *stream(text:string | Array<any>,wait_in_between:number = 100){
  for (const chunk of text){
    yield chunk + " "
    await wait(wait_in_between)
  }
}

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

export type LocalModel = AutoComplete<
  | "llama3.2:3b"
>

export type LLMConfig =
  | { type: "groq"; model?: ChatGroqModel; apikey?: string }
  | { type: "openrouter"; model?: OpenRouterModel; apikey?: string }
  | { type: "local"; model?: string }

  /**
   * openrouter: process.env.OPENROUTER_API_KEY
   * groq: process.env.CHATGROQ_API_KEY
   */
export function getLLM(config: LLMConfig) {
  switch (config.type) {
    case "groq":
      return new ChatGroq({
        apiKey: config.apikey ?? process.env.CHATGROQ_API_KEY,
        model: config.model ?? "llama-3.3-70b-versatile"
      });

    case "openrouter":
      return new ChatOpenAI({
        apiKey: config.apikey ?? process.env.OPENROUTER_API_KEY,
        configuration: {
            baseURL: "https://openrouter.ai/api/v1",
        },
        model: config.model ?? "openai/gpt-5.4-mini"
      });

    case "local":
      return new ChatOllama({
        model: config.model ?? "llama3.2:3b"
      });

    default:
      throw new Error("Unknown LLM kind");
  }
}

/**
 * Create a structured output parser and prompt for a given Zod schema
 * @example
 * const schema = outputschema(z.object({
 *   name: z.string(),
 *   age: z.number(),
 * }));
 * const prompt = `du bist ein informations-filterer, suche den namen und den alter der person im text aus in dieser struktur: ${schema.prompt}`
 * const chain = createSimpleChain(prompt, llm, schema.parser)
 * const result = await chain.invoke({ input: "John is 30 years old" })
 * console.log(result)
 * @param zodschema - The Zod schema to parse the output
 * @returns An object containing the prompt and parser
 */
export function outputschema(zodschema: z.ZodObject<any>): {
  prompt: string
  parser: StructuredOutputParser<any>
} {
  const parser = StructuredOutputParser.fromZodSchema(zodschema)
  const prompt = `You MUST respond ONLY with valid JSON matching this exact schema:\n${parser.getFormatInstructions()}\n\nIMPORTANT: \n- Output ONLY valid JSON, no markdown code blocks\n- No backslashes or line breaks in strings\n- All strings must be on single lines\n- Do NOT wrap in \`\`\`json\`\`\` blocks\n- Return the JSON object DIRECTLY`
  return { prompt,parser }
}
