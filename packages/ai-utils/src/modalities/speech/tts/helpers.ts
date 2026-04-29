import { AutoComplete } from "../../../helpers/llms"

export type TTSResponseFormat = "mp3" | "pcm"
export type OpenRouterTTSVoice = AutoComplete<
    | "alloy"
    | "ash"
    | "ballad"
    | "cedar"
    | "coral"
    | "echo"
    | "fable"
    | "marin"
    | "nova"
    | "onyx"
    | "sage"
    | "shimmer"
    | "verse"
>

export type TTSPayload = {
    model: string
    input: string
    voice: OpenRouterTTSVoice
    response_format?: TTSResponseFormat
    speed?: number
}

export function createTTSPayload(payload: TTSPayload): TTSPayload {
    return {
        model: payload.model,
        input: payload.input,
        voice: payload.voice,
        response_format: payload.response_format ?? "mp3",
        speed: payload.speed
    }
}

