export type VisionImageInput = string

export function normalizeVisionImage(input: VisionImageInput): string {
    if (input.startsWith("http://") || input.startsWith("https://") || input.startsWith("data:image/")) {
        return input
    }

    return `data:image/jpeg;base64,${input}`
}

