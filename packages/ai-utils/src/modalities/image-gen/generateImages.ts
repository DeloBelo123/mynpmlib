import { HumanMessage } from "../../imports"
import { getLLM, OpenRouterImageGenModel } from "../../helpers/llms"
import { LLMInstance, getOpenRouterRuntime } from "../openrouter"
import { extractImageUrls, ImageConfig, ImageGenModalities } from "./helpers"

type ImageGenOptions = {
    llm?: LLMInstance
    prompt: string
    modalities?: ImageGenModalities
    imageConfig?: ImageConfig
    model?: OpenRouterImageGenModel
}

/**
 * Generates images from a text prompt using OpenRouter image-generation models.
 *
 * Internally this function calls OpenRouter through the chat-completions-compatible
 * interface with `modalities` and optional `image_config`. If no `llm` is provided,
 * it creates one with `getLLM({ provider: "openrouter", type: "image-gen" })` and
 * reads `process.env.OPENROUTER_API_KEY`.
 *
 * Make sure `OPENROUTER_API_KEY` is set in your `.env`.
 *
 * @param params.llm Optional LLM instance from `getLLM(...)`.
 * @param params.prompt Image generation prompt (for example: "create a cat in watercolor style").
 * @param params.modalities Output modalities for the model call.
 * @param params.imageConfig Optional image generation settings (for example aspect ratio/size).
 * @param params.model Optional model override for this call.
 * @returns Promise containing extracted image URLs/data URLs, optional text, and raw response.
 *
 * @example
 * CONFIG:
 * ```ts
 * generateImages({
 *     llm = getLLM({ provider: "openrouter", type: "image-gen" }),
 *     modalities = ["image", "text"],
 *     imageConfig = { aspect_ratio: "1:1", image_size: "2K" },
 *     model,
 *     prompt
 * })
 * ```
 *
 * @example
 * ```ts
 * const result = await generateImages({
 *     prompt: "Generate a cozy cat illustration",
 *     imageConfig: { aspect_ratio: "1:1", image_size: "2K" }
 * });
 *
 * console.log(result.images[0]);
 * ```
 */
export async function generateImages({
    llm = getLLM({ provider: "openrouter", type: "image-gen" }),
    modalities = ["image", "text"],
    imageConfig = { aspect_ratio: "1:1", image_size: "2K" },
    model,
    prompt
}: ImageGenOptions): Promise<{ images: string[]; text?: string; raw: unknown }> {
    const runtime = getOpenRouterRuntime(llm)
    const runtimeLLM =
        model && model !== runtime.model
            ? getLLM({
                  provider: "openrouter",
                  type: "image-gen",
                  model,
                  apikey: runtime.apiKey
              })
            : llm

    const response = await runtimeLLM.invoke([new HumanMessage(prompt)], {
        modalities,
        image_config: imageConfig
    } as any)

    const images = extractImageUrls(response)
    const text = typeof response.content === "string" ? response.content : undefined

    return {
        images,
        text,
        raw: response
    }
}

