import { z } from "zod/v4"
import {
    JevToolCaller,
    type JevToolCallerResult,
} from "../src/heart/jevToolCaller"
import type { JevGatedResult, JevInterrupt } from "../src/helpers/jev"

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
            params: async ({ context }) => {
                const sessionId: string = context.sessionId
                const token: string = context.auth.token
                return { id: [sessionId, token] }
            },
            func: async input => {
                const { params, context } = input
                // @ts-expect-error Tool functions expose selected values as params, not args.
                void input.args
                const { id } = params
                const sessionId: string = context.sessionId
                return `${sessionId}:${String(id)}`
            },
        },
        {
            name: "get_user",
            description: "Returns a user.",
            params: {
                user: [{ name: "Jeff", age: 12 }],
            },
            func: async ({ params }) => {
                const { user } = params
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
        params: {
            list_candidates: {
                limit: [{ value: 10 }, { value: 25 }, { value: 50 }],
            },
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

const mcpResult: Promise<JevToolCallerResult<unknown> | JevGatedResult | JevInterrupt> = mcpCaller.invoke({
    request: "lookup",
    context: { sessionId: "s1", auth: { token: "secret" } },
})
void mcpResult

// @ts-expect-error MCP tools are dynamic, so their result must remain unknown.
const invalidMcpResult: Promise<string> = mcpCaller.invoke({
    request: "lookup",
    context: { sessionId: "s1", auth: { token: "secret" } },
})
void invalidMcpResult

// @ts-expect-error Context is required when contextSchema is configured.
caller.invoke({ request: "lookup" })

caller.invoke({
    request: "lookup",
    // @ts-expect-error Context must match contextSchema.
    context: { sessionId: 1, auth: { token: "secret" } },
})

const callerWithoutContext = new JevToolCaller({
    tools: [
        {
            name: "ping",
            description: "Returns pong.",
            func: async ({ params, context, state, thread_id }) => {
                const noContext: undefined = context
                void params
                void state
                void thread_id
                return "pong" as const
            },
        },
    ],
})

const pingResult: Promise<JevToolCallerResult<"pong"> | JevGatedResult | JevInterrupt> = callerWithoutContext.invoke({
    request: "ping",
})
void pingResult

// @ts-expect-error Context cannot be supplied without contextSchema.
callerWithoutContext.invoke({ request: "ping", context: {} })
