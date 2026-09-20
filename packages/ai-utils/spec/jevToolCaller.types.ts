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
            func: async ({ id }, { context }) => {
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
            func: async ({ user }) => {
                return `${user.name}:${user.age}`
            },
        },
    ],
})

caller.invoke({
    request: "lookup",
    context: { sessionId: "s1", auth: { token: "secret" } },
})

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
            func: async () => "pong" as const,
        },
    ],
})

// @ts-expect-error Context cannot be supplied without contextSchema.
callerWithoutContext.invoke({ request: "ping", context: {} })
