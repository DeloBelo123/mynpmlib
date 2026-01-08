import { BaseChatModel, BaseOutputParser, ChatGroq, ChatOllama, ChatOpenAI, ChatPromptTemplate, StringOutputParser, StructuredOutputParser } from "./imports";
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

export function createChain(prompt: ChatPromptTemplate, llm: BaseChatModel, parser: BaseOutputParser | null = null) {
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

export async function structure<T extends z.ZodObject<any, any>>({
    data,
    into,
    llm,
    retries = 2
}:{
    data: any,
    into: T,
    llm: BaseChatModel,
    retries?: number
}): Promise<z.infer<T>> {
    const inputString = typeof data === "string" ? data : JSON.stringify(data, null, 2)
    const jsonParser = StructuredOutputParser.fromZodSchema(into)
    const prompt = await ChatPromptTemplate.fromMessages([
        ["system", `Du bist ein JSON-Formatierer. 
            REGELN:
            - Gib NUR valides JSON zurück, KEIN anderer Text
            - Keine Markdown Code-Blöcke (\`\`\`json)
            - Halte dich EXAKT an das Schema

            Schema:
            {format_instructions}`],
        ["human", "{input}"]
    ]).partial({ format_instructions: jsonParser.getFormatInstructions() })
    const chain = createChain(prompt, llm, jsonParser)
    let lastError: Error | null = null
    for (let i = 0; i <= retries; i++) {
        try {
            const result = await chain.invoke({ input: inputString })
            return into.parse(result)
        } catch (error) {
            lastError = error as Error
            if (i < retries) {
                console.warn(`structure() Versuch ${i + 1} fehlgeschlagen, retry...`)
            }
        }
    }
    throw new Error(`structure() failed after ${retries + 1} attempts, Error: ${lastError?.message}`)
}

export async function summarize({
  llm,
  data,
  fokuss,
  maxWords = 150
}:{
  llm:BaseChatModel,
  data:any,
  fokuss?:string,
  maxWords?:number
}):Promise<string>{
    const inputString = typeof data === "string" ? data : JSON.stringify(data, null, 2)
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", `
        Du bist ein analytischer Summarizer.
        
        Deine Aufgabe:
        - Fasse den gegebenen Input präzise, sachlich und faktengetreu zusammen.
        - Entferne Wiederholungen, irrelevante Details und Ausschmückungen.
        - Behalte ausschließlich die inhaltlich wichtigsten Punkte.
        
        Priorisierungsregeln (zwingend):
        1. Zentrale Aussagen, Probleme oder Ergebnisse
        2. Wichtige Entscheidungen, Risiken oder Konsequenzen
        3. Relevanter Kontext (nur wenn nötig zum Verständnis)
        4. Alles andere weglassen
        
        Regeln:
        - Erfinde keine Informationen
        - Triff keine Annahmen über fehlende Daten
        - Nutze nur Informationen aus dem Input
        - Keine Meta-Kommentare („der Text beschreibt…“)
        
        Längenbegrenzung:
        - Maximal ${maxWords} Wörter
        - Wenn nötig, kürze aggressiv
        
        ${fokuss ? `
        Fokus (höchste Priorität):
        - ${fokuss}
        Informationen außerhalb dieses Fokus nur erwähnen, wenn sie essenziell sind.
        ` : ""}
        
        Gib nur die Zusammenfassung aus. Kein zusätzlicher Text.
        `],
        ["human","{input}"]
    ])
    const chain = createChain(prompt,llm,new StringOutputParser())
    const result = await chain.invoke({ input:inputString })
    return typeof result === "string" ? result : String(result)
}

const decideSchema = z.object({
  decision: z.enum(["yes", "no", "unclear"])
    .describe("Ergebnis der Entscheidung basierend auf dem Kriterium"),
  reason: z.string()
    .describe("Sachliche Begründung, die sich ausschließlich auf das gegebene Material bezieht"),
  confidence: z.number()
    .min(0)
    .max(100)
    .describe(
      "Sicherheit der Entscheidung. Regeln: " +
      "decision='unclear' → confidence=0. " +
      "decision='yes' oder 'no' → confidence > 0"
    )
})

export async function decide({
  llm,
  material,
  kriteria_to_decide
}: {
  llm: BaseChatModel
  material: any
  kriteria_to_decide: string
}): Promise<z.infer<typeof decideSchema>> {

  const inputString =
    typeof material === "string"
      ? material
      : JSON.stringify(material, null, 2)

  const jsonParser = StructuredOutputParser.fromZodSchema(decideSchema)
  const prompt = await ChatPromptTemplate.fromMessages([
    ["system", `
      Analytischer Entscheidungsagent.
      
      Entscheide anhand des Materials und des Kriteriums:
      - Ergebnis: "yes" | "no" | "unclear"
      - "unclear", wenn keine klare Entscheidung möglich ist
      - Begründung nur aus dem Material
      
      Regeln:
      - Keine Annahmen oder erfundenen Infos
      - decision="unclear" → confidence<10
      - decision≠"unclear" → confidence>10
      - Nur JSON gemäß Schema
      
      Kriterium:
      ${kriteria_to_decide}
      
      Schema:
      {format_instructions}
      `],      
    ["human", "{input}"]
  ]).partial({
    format_instructions: jsonParser.getFormatInstructions()
  })
  const chain = createChain(prompt, llm, jsonParser)
  const result = await chain.invoke({ input: inputString })
  return decideSchema.parse(result)
}

export async function extract<T extends z.ZodObject<any>>({
  llm,
  data,
  goal,
  schema
}: {
  llm: BaseChatModel
  data: any
  goal?: string
  schema: T
}): Promise<z.infer<T>> {

  const inputString = typeof data === "string"
    ? data
    : JSON.stringify(data, null, 2)

  const parser = StructuredOutputParser.fromZodSchema(schema)
  const prompt = await ChatPromptTemplate.fromMessages([
    ["system", `
      Du bist ein präziser Informationsextraktor.

      
        ${goal ? `
      Ziel:
      Extrahiere ausschließlich die Informationen, die für folgendes Ziel relevant sind: 
      - "${goal}"` 
      :
       "- Extrahiere ALLE Informationen aus dem Input, die zum angegebenen Schema passen."}

      Regeln:
      - Keine Interpretation
      - Keine Ergänzungen
      - Nur Informationen, die explizit im Input enthalten sind
      - Antworte ausschließlich im JSON-Schema

      Schema:
      {format_instructions}
          `],
    ["human", "{input}"]
  ]).partial({ format_instructions: parser.getFormatInstructions() })
  const chain = createChain(prompt, llm, parser)
  const result = await chain.invoke({ input: inputString })
  return schema.parse(result)
}

function createClassificationSchema<T extends readonly [string, ...string[]]>(classes: T) {
  return z.object({
    class: z.enum(classes),
    confidence: z.number()
      .min(0)
      .max(100)
      .describe("Sicherheit der Klassifikation"),
    reasoning: z.string()
      .describe("Kurze Begründung basierend auf dem Input")
  })
}

export async function classify<T extends readonly [string, ...string[]]>({
  llm,
  data,
  classes
}: {
  llm: BaseChatModel
  data: any
  classes: T
}): Promise<z.infer<ReturnType<typeof createClassificationSchema<T>>>> {

  const inputString =
    typeof data === "string"
      ? data
      : JSON.stringify(data, null, 2)

  const schema = createClassificationSchema(classes)
  const parser = StructuredOutputParser.fromZodSchema(schema)

  const prompt = await ChatPromptTemplate.fromMessages([
    ["system", `
      Du bist ein präziser Klassifizierungsagent.

      Aufgabe:
      - Ordne den gegebenen Input exakt EINER der folgenden Klassen zu:
      ${classes.map(c => `- ${c}`).join("\n")}

      Regeln:
      - Wähle genau eine Klasse
      - Nutze nur Informationen aus dem Input
      - Keine Annahmen oder erfundene Inhalte
      - Wenn die Zuordnung unsicher ist, wähle die wahrscheinlichste Klasse und setze eine niedrige Confidence

      Confidence:
      - 0 = reine Vermutung
      - 100 = absolut sicher

      Antwort:
      - Ausschließlich valides JSON gemäß Schema
      - Kein zusätzlicher Text

      Schema:
      {format_instructions}
      `],
    ["human", "{input}"]
  ]).partial({
    format_instructions: parser.getFormatInstructions()
  })

  const chain = createChain(prompt, llm, parser)
  const result = await chain.invoke({ input: inputString })

  return schema.parse(result)
}



