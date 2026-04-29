import { AutoComplete } from "../../helpers/llms"

export type ImageGenModalities = ["image"] | ["image", "text"] | ["text", "image"]

export type ImageAspectRatio = AutoComplete<
    | "1:1"
    | "2:3"
    | "3:2"
    | "3:4"
    | "4:3"
    | "4:5"
    | "5:4"
    | "9:16"
    | "16:9"
    | "21:9"
    | "1:4"
    | "4:1"
    | "1:8"
    | "8:1"
>

export type ImageSize = AutoComplete<"0.5K" | "1K" | "2K" | "4K">

export type ImageConfig = {
    aspect_ratio?: ImageAspectRatio
    image_size?: ImageSize
    font_inputs?: { font_url: string; text: string }[]
    super_resolution_references?: string[]
}

export function extractImageUrls(raw: unknown): string[] {
    const maybeRaw = raw as any
    const images = maybeRaw?.additional_kwargs?.images ?? maybeRaw?.response_metadata?.images ?? maybeRaw?.images

    if (Array.isArray(images)) {
        return images
            .map((entry: any) => entry?.image_url?.url)
            .filter((url: unknown): url is string => typeof url === "string")
    }

    const content = maybeRaw?.content
    if (Array.isArray(content)) {
        return content
            .map((entry: any) => entry?.image_url?.url)
            .filter((url: unknown): url is string => typeof url === "string")
    }

    return []
}

