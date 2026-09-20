import { z } from "zod/v4"
import { JevToolCaller } from "../src/heart/jevToolCaller"

const contextSchema = z.object({
    sessionId: z.string(),
    auth: z.object({ token: z.string() }),
})
const caller = new JevToolCaller({
    prompt: "Choose a tool.",
    contextSchema,
    tools: [
        {
            name: "lookup",
            description: "Looks up a value.",
            runtimeParams: async ({ context }) => {
                const sessionId: string = context.sessionId
                const token: string = context.auth.token
                return { id: [sessionId, token] }
            },
            func: async ({ args, context }) => {
                const { id } = args
                const sessionId: string = context.sessionId
                return `${sessionId}:${String(id)}`
            },
        },
        {
            name: "get_user",
            description: "Returns a user.",
            runtimeParams: async () => ({
                user: [{ name: "Jeff", age: 12 }],
            }),
            func: async ({ args }) => {
                const { user } = args
                return `${user.name}:${user.age}`
            },
        },
    ],
})

caller.invoke({
    request: "lookup",
    context: { sessionId: "s1", auth: { token: "secret" } },
})

const mcpCaller = new JevToolCaller({
    prompt: "Choose an MCP tool.",
    contextSchema,
    tools: [],
    mcpServer: {
        name: "hubspot",
        url: "https://example.com/mcp",
        runtimeParams: {
            get_candidate: async ({ context, state, thread_id, server }) => {
                const sessionId: string = context.sessionId
                const serverName: string = server.name
                void state
                void thread_id
                return {
                    candidate: [{ id: sessionId, source: serverName }],
                }
            },
        },
    },
})

const mcpResult: Promise<unknown> = mcpCaller.invoke({
    request: "lookup",
    context: { sessionId: "s1", auth: { token: "secret" } },
})
void mcpResult

// @ts-expect-error Context is required when contextSchema is configured.
caller.invoke({ request: "lookup" })

caller.invoke({
    request: "lookup",
    // @ts-expect-error Context must match contextSchema.
    context: { sessionId: 1, auth: { token: "secret" } },
})

const callerWithoutContext = new JevToolCaller({
    prompt: "Choose a tool.",
    tools: [
        {
            name: "ping",
            description: "Returns pong.",
            func: async ({ args, context, state, thread_id }) => {
                const noContext: undefined = context
                void args
                void state
                void thread_id
                return "pong" as const
            },
        },
    ],
})

const pingResult: Promise<"pong"> = callerWithoutContext.invoke({ request: "ping" })
void pingResult

// @ts-expect-error Context cannot be supplied without contextSchema.
callerWithoutContext.invoke({ request: "ping", context: {} })
