import { HumanMessage } from "../../imports"
import { getLLM, type AutoComplete } from "../../helpers/llm/llms"
import { LLMInstance, getOpenRouterRuntime } from "../openrouter"
import { extractImageUrls, ImageConfig, ImageGenModalities } from "./helpers"

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

const DEFAULT_IMAGE_GEN_MODEL: OpenRouterImageGenModel = "google/gemini-3.1-flash-image-preview"

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
 * it creates one with `getLLM({ provider: "openrouter", model: "google/gemini-3.1-flash-image-preview" })` and
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
 *     llm = getLLM({ provider: "openrouter", model: "google/gemini-3.1-flash-image-preview" }),
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
    llm = getLLM({ provider: "openrouter", model: DEFAULT_IMAGE_GEN_MODEL }),
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

