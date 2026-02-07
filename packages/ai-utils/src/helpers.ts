import { BaseChatModel, BaseOutputParser, ChatGroq, ChatOllama, ChatOpenAI, ChatPromptTemplate, StringOutputParser, StructuredOutputParser } from "./imports";
import { TavilySearch } from "./heart/tools/Tavily";
import { z } from "zod/v3";

export type Prettify<T> = {
  [K in keyof T]: T[K]
} & {};

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

export async function *stream(text:string | Array<any>,wait_in_between:number = 100){
  for (const chunk of text){
    yield chunk + " "
    await wait(wait_in_between)
  }
}

type LLMConfig = 
  | { type: "groq"; model?: string; apikey: string }
  | { type: "openrouter"; model?: string; apikey: string }
  | { type: "localOllama"; model?: string }

export function getLLM(config: LLMConfig) {
  switch (config.type) {
    case "groq":
      return new ChatGroq({
        apiKey: config.apikey,
        model: config.model ?? "llama-3.3-70b-versatile"
      });

    case "openrouter":
      return new ChatOpenAI({
        apiKey: config.apikey,
        configuration: {
            baseURL: "https://openrouter.ai/api/v1",
        },
        model: config.model ?? "openai/gpt-4o-mini"
      });

    case "localOllama":
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
