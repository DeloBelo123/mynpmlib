import type { SubAgent, DynamicStructuredTool } from "../../imports"
import type { BaseChatModel } from "../../imports"
import type { AgentMiddleware } from "../../imports"
import type { FilesystemPermission } from "../../imports"
import type { CreateDeepAgentParams } from "../../imports"

type InterruptOn = NonNullable<CreateDeepAgentParams["interruptOn"]>

export interface CreateSubAgentInput {
    name: string
    description: string
    prompt?: string
    systemPrompt?: string
    tools?: DynamicStructuredTool[]
    model?: BaseChatModel | string
    skills?: string[]
    permissions?: FilesystemPermission[]
    interruptOn?: InterruptOn
    responseFormat?: CreateDeepAgentParams["responseFormat"]
    middleware?: readonly AgentMiddleware[]
}

export function createSubAgent({
    name,
    description,
    prompt,
    systemPrompt,
    tools,
    model,
    skills,
    permissions,
    interruptOn,
    responseFormat,
    middleware,
}: CreateSubAgentInput): SubAgent {
    const resolvedPrompt = systemPrompt ?? prompt
    if (!resolvedPrompt) {
        throw new Error("createSubAgent requires prompt or systemPrompt")
    }

    return {
        name,
        description,
        systemPrompt: resolvedPrompt,
        tools,
        model,
        skills,
        permissions,
        interruptOn,
        responseFormat,
        middleware,
    }
}
