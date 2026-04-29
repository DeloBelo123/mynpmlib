import { getLLM } from "../helpers/llms"

export type LLMInstance = ReturnType<typeof getLLM>

type OpenRouterRuntime = {
    apiKey: string
    baseURL: string
    model: string
}

function readMaybeString(value: unknown): string | undefined {
    return typeof value === "string" && value.length > 0 ? value : undefined
}

export function isOpenRouterLLM(llm: LLMInstance): boolean {
    const maybeLLM = llm as any
    const baseURL =
        readMaybeString(maybeLLM?.clientConfig?.baseURL) ??
        readMaybeString(maybeLLM?.configuration?.baseURL) ??
        readMaybeString(maybeLLM?.fields?.configuration?.baseURL)

    if (!baseURL) {
        return false
    }

    return baseURL.includes("openrouter.ai/api/v1")
}

export function getOpenRouterRuntime(llm: LLMInstance): OpenRouterRuntime {
    const maybeLLM = llm as any

    const baseURL =
        readMaybeString(maybeLLM?.clientConfig?.baseURL) ??
        readMaybeString(maybeLLM?.configuration?.baseURL) ??
        readMaybeString(maybeLLM?.fields?.configuration?.baseURL) ??
        "https://openrouter.ai/api/v1"

    const apiKey =
        readMaybeString(maybeLLM?.apiKey) ??
        readMaybeString(maybeLLM?.clientConfig?.apiKey) ??
        readMaybeString(maybeLLM?.fields?.apiKey) ??
        process.env.OPENROUTER_API_KEY

    const model =
        readMaybeString(maybeLLM?.model) ??
        readMaybeString(maybeLLM?.modelName) ??
        "openrouter/auto"

    if (!baseURL.includes("openrouter.ai/api/v1")) {
        throw new Error("Provided llm is not configured for OpenRouter baseURL")
    }

    if (!apiKey) {
        throw new Error("OpenRouter apiKey is missing on llm instance and env")
    }

    return {
        apiKey,
        baseURL,
        model
    }
}

