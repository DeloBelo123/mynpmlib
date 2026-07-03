import { HumanMessage } from "../../imports"
import { getLLM, type OpenRouterModel } from "../../helpers/llm/llms"
import { LLMInstance, getOpenRouterRuntime } from "../openrouter"
import { normalizeVisionImage, VisionImageInput } from "./helpers"

/** Viele OpenRouter Chat-Modelle sind vision-fähig; deshalb bewusst auf die Chat-Union vereinfacht. */
export type OpenRouterVisionModel = OpenRouterModel

type VisionOptions = {
    llm?: LLMInstance
    prompt: string
    images: VisionImageInput[]
    detail?: "auto" | "low" | "high"
    model?: OpenRouterVisionModel
}

/**
 * Analyzes one or more images with a vision-capable OpenRouter model.
 *
 * Internally this function sends `image_url` content parts through OpenRouter's
 * chat-completions-compatible interface. If no `llm` is provided, it builds one
 * with `getLLM({ provider: "openrouter" })` and reads
 * `process.env.OPENROUTER_API_KEY`.
 *
 * Make sure `OPENROUTER_API_KEY` is set in your `.env`.
 *
 * @param params.llm Optional LLM instance from `getLLM(...)`.
 * @param params.prompt Instruction/question for the model about the provided images.
 * @param params.images Array of image URLs, data URLs, or base64 strings.
 * @param params.detail Vision detail level (`auto`, `low`, `high`).
 * @param params.model Optional model override for this call.
 * @returns Promise with normalized `text` and full provider response in `raw`.
 *
 * @example
 * CONFIG:
 * ```ts
 * vision({
 *     llm = getLLM({ provider: "openrouter" }),
 *     prompt = "Describe the image in detail.",
 *     detail = "auto",
 *     images,
 *     model
 * })
 * ```
 *
 * @example
 * ```ts
 * const result = await vision({
 *     prompt: "What objects do you see?",
 *     images: ["https://example.com/cat.jpg"]
 * });
 *
 * console.log(result.text);
 * ```
 */
export async function vision({
    llm = getLLM({ provider: "openrouter" }),
    prompt = "Describe the image in detail.",
    detail = "auto",
    images,
    model
}: VisionOptions): Promise<{ text: string; raw: unknown }> {
    const runtime = getOpenRouterRuntime(llm)

    const content = [
        { type: "text" as const, text: prompt },
        ...images.map((image) => ({
            type: "image_url" as const,
            image_url: {
                url: normalizeVisionImage(image),
                detail
            }
        }))
    ]

    const runtimeLLM =
        model && model !== runtime.model
            ? getLLM({
                  provider: "openrouter",
                  model,
                  apikey: runtime.apiKey
              })
            : llm

    const response = await runtimeLLM.invoke([new HumanMessage({ content })])
    const text = typeof response.content === "string" ? response.content : JSON.stringify(response.content)

    return {
        text,
        raw: response
    }
}

