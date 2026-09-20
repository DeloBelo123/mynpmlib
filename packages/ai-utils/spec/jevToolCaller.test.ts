import assert from "node:assert/strict"
import test from "node:test"
import { z } from "zod/v4"
import { MemorySaver } from "../src/imports"
import {
    JevNoParamOptionsError,
    JevToolCaller,
} from "../src/heart/jevToolCaller"

test("selects the correct tool and original runtime value without exposing context", async () => {
    const originalFetch = globalThis.fetch
    const originalApiKey = process.env.OPENROUTER_API_KEY
    process.env.OPENROUTER_API_KEY = "test-key"
    const requestBodies: Array<Record<string, any>> = []
    const selectedProduct = { sku: "BLUE-42", title: "Blue product" }
    const otherProduct = { sku: "RED-11", title: "Red product" }
    const secret = "local-secret-that-must-not-reach-jev"
    let unusedRuntimeParamsCalled = false
    let runtimeContextReference: unknown
    let funcContextReference: unknown
    let receivedProduct: unknown

    globalThis.fetch = async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as Record<string, any>
        requestBodies.push(body)
        const selectsTool = Object.hasOwn(body.questions, "tool")
        const response = selectsTool
            ? {
                  answers: {
                      tool: {
                          type: "choice",
                          choice: "find_product",
                          confidence: 0.99,
                          probabilities: { find_product: 0.99, get_weather: 0.01 },
                      },
                  },
                  model: "jev-test",
                  usage: { input_tokens: 10, output_tokens: 2 },
              }
            : {
                  answers: {
                      product: {
                          type: "choice",
                          choice: "option_1",
                          confidence: 0.98,
                          probabilities: { option_0: 0.02, option_1: 0.98 },
                      },
                  },
                  model: "jev-test",
                  usage: { input_tokens: 8, output_tokens: 2 },
              }

        return new Response(JSON.stringify(response), { status: 200 })
    }

    try {
        const contextSchema = z.object({
            tenantId: z.string(),
            secret: z.string(),
        })
        const caller = new JevToolCaller({
            prompt: "Select the tool that exactly fulfills the request.",
            contextSchema,
            tools: [
                {
                    name: "find_product",
                    description: "Finds and returns a product by its requested SKU.",
                    runtimeParams: async runtimeContext => {
                        runtimeContextReference = runtimeContext
                        assert.equal(runtimeContext.context.tenantId, "tenant-acme")
                        return { product: [otherProduct, selectedProduct] }
                    },
                    func: async input => {
                        const { product } = input.args
                        funcContextReference = input
                        receivedProduct = product
                        return {
                            product,
                            tenantId: input.context.tenantId,
                        }
                    },
                },
                {
                    name: "get_weather",
                    description: "Returns weather information for a city.",
                    runtimeParams: async () => {
                        unusedRuntimeParamsCalled = true
                        return { location: ["Berlin"] }
                    },
                    func: async ({ args }) => args.location,
                },
            ],
        })

        const output = await caller.invoke({
            request: "Find the product with SKU BLUE-42.",
            context: { tenantId: "tenant-acme", secret },
            debug: true,
        })

        assert.equal(requestBodies.length, 2)
        assert.equal(unusedRuntimeParamsCalled, false)
        assert.equal(receivedProduct, selectedProduct)
        assert.equal(
            (runtimeContextReference as { state: unknown }).state,
            (funcContextReference as { state: unknown }).state,
        )
        assert.deepEqual(output.result, {
            product: selectedProduct,
            tenantId: "tenant-acme",
        })
        assert.equal(output.metadata.selected_tool.name, "find_product")
        assert.equal(output.metadata.selected_params.product.choice, "option_1")
        assert.equal(output.metadata.arguments.product, selectedProduct)
        assert.equal(
            requestBodies[0].state.system_prompt,
            "Select the tool that exactly fulfills the request.\n\nTreat the latest user message as the current request and earlier messages only as context. Select the available tool that best fulfills the request.",
        )
        assert.deepEqual(requestBodies[0].state.message_history.at(-1), {
            role: "user",
            content: { request: "Find the product with SKU BLUE-42." },
        })
        assert.equal(Object.hasOwn(requestBodies[0].state, "user_request"), false)
        assert.equal(JSON.stringify(requestBodies).includes(secret), false)
        assert.equal(JSON.stringify(output.metadata).includes(secret), false)
    } finally {
        globalThis.fetch = originalFetch
        if (originalApiKey === undefined) {
            delete process.env.OPENROUTER_API_KEY
        } else {
            process.env.OPENROUTER_API_KEY = originalApiKey
        }
    }
})

test("executes a tool without runtimeParams directly with an empty args object", async () => {
    const originalFetch = globalThis.fetch
    const originalApiKey = process.env.OPENROUTER_API_KEY
    process.env.OPENROUTER_API_KEY = "test-key"
    let calls = 0
    let toolInput: Record<string, any> | undefined

    globalThis.fetch = async () => {
        calls++
        return new Response(JSON.stringify({
            answers: {
                tool: {
                    type: "choice",
                    choice: "ping",
                    confidence: 1,
                    probabilities: { ping: 1 },
                },
            },
            model: "jev-test",
            usage: { input_tokens: 4, output_tokens: 1 },
        }), { status: 200 })
    }

    try {
        const contextSchema = z.object({ sessionId: z.string() })
        const caller = new JevToolCaller({
            prompt: "Choose a tool.",
            contextSchema,
            tools: [{
                name: "ping",
                description: "Returns pong.",
                func: async input => {
                    toolInput = input
                    return `pong:${input.context.sessionId}`
                },
            }],
        })

        const result = await caller.invoke({
            request: "ping",
            context: { sessionId: "s1" },
        })

        assert.equal(result, "pong:s1")
        assert.equal(calls, 1)
        assert.deepEqual(toolInput?.args, {})
        assert.equal(toolInput?.thread_id, undefined)
        assert.deepEqual(toolInput?.state.message_history.at(-1), {
            role: "user",
            content: { request: "ping" },
        })
    } finally {
        globalThis.fetch = originalFetch
        if (originalApiKey === undefined) {
            delete process.env.OPENROUTER_API_KEY
        } else {
            process.env.OPENROUTER_API_KEY = originalApiKey
        }
    }
})

test("throws JevNoParamOptionsError before parameter selection, tool execution, or checkpointing", async () => {
    const originalFetch = globalThis.fetch
    const originalApiKey = process.env.OPENROUTER_API_KEY
    process.env.OPENROUTER_API_KEY = "test-key"
    const checkpointer = new MemorySaver()
    const threadId = "empty-candidates"
    let calls = 0
    let funcCalled = false

    globalThis.fetch = async () => {
        calls++
        return new Response(JSON.stringify({
            answers: {
                tool: {
                    type: "choice",
                    choice: "find_candidate",
                    confidence: 1,
                    probabilities: { find_candidate: 1 },
                },
            },
            model: "jev-test",
            usage: { input_tokens: 4, output_tokens: 1 },
        }), { status: 200 })
    }

    try {
        const caller = new JevToolCaller({
            prompt: "Find candidates.",
            checkpointer,
            tools: [{
                name: "find_candidate",
                description: "Finds a candidate.",
                runtimeParams: async () => ({ candidate: [] }),
                func: async () => {
                    funcCalled = true
                    return { found: true }
                },
            }],
        })

        await assert.rejects(
            caller.invoke({ request: "Find Max.", thread_id: threadId }),
            (error: unknown) => {
                assert.ok(error instanceof JevNoParamOptionsError)
                assert.equal(error.name, "JevNoParamOptionsError")
                assert.equal(error.code, "JEV_NO_PARAM_OPTIONS")
                assert.equal(error.toolName, "find_candidate")
                assert.equal(error.parameterName, "candidate")
                assert.equal(
                    error.message,
                    'Runtime parameter "candidate" for tool "find_candidate" has no candidates',
                )
                return true
            },
        )

        assert.equal(calls, 1)
        assert.equal(funcCalled, false)
        assert.equal(
            await checkpointer.get({ configurable: { thread_id: threadId } }),
            undefined,
        )
    } finally {
        globalThis.fetch = originalFetch
        if (originalApiKey === undefined) {
            delete process.env.OPENROUTER_API_KEY
        } else {
            process.env.OPENROUTER_API_KEY = originalApiKey
        }
    }
})

test("keeps malformed runtime parameter values as TypeError", async () => {
    const originalFetch = globalThis.fetch
    const originalApiKey = process.env.OPENROUTER_API_KEY
    process.env.OPENROUTER_API_KEY = "test-key"

    globalThis.fetch = async () => new Response(JSON.stringify({
        answers: {
            tool: {
                type: "choice",
                choice: "find_candidate",
                confidence: 1,
                probabilities: { find_candidate: 1 },
            },
        },
        model: "jev-test",
        usage: { input_tokens: 4, output_tokens: 1 },
    }), { status: 200 })

    try {
        const caller = new JevToolCaller({
            prompt: "Find candidates.",
            tools: [{
                name: "find_candidate",
                description: "Finds a candidate.",
                runtimeParams: (async () => ({ candidate: "not-an-array" })) as any,
                func: async () => ({ found: true }),
            }],
        })

        await assert.rejects(
            caller.invoke({ request: "Find Max." }),
            (error: unknown) => {
                assert.ok(error instanceof TypeError)
                assert.equal(error instanceof JevNoParamOptionsError, false)
                assert.equal(
                    error.message,
                    'Runtime parameter "candidate" for tool "find_candidate" must be an array',
                )
                return true
            },
        )
    } finally {
        globalThis.fetch = originalFetch
        if (originalApiKey === undefined) {
            delete process.env.OPENROUTER_API_KEY
        } else {
            process.env.OPENROUTER_API_KEY = originalApiKey
        }
    }
})

test("adapts prefixed MCP tools and applies runtimeParams from their server", async () => {
    const candidate = { id: "candidate-1", name: "Max" }
    let receivedServerName: string | undefined
    let invokedArgs: unknown
    const contextSchema = z.object({ tenantId: z.string() })
    const caller = new JevToolCaller({
        prompt: "Choose a tool.",
        contextSchema,
        tools: [],
        mcpServer: {
            name: "hubspot",
            url: "https://example.com/mcp",
            description: "CRM server.",
            runtimeParams: {
                get_candidate: async ({ context, server }) => {
                    assert.equal(context.tenantId, "tenant-acme")
                    receivedServerName = server.name
                    return { candidate: [candidate] }
                },
            },
        },
    })
    const fakeMcpTool = {
        name: "hubspot__get_candidate",
        description: "Gets one candidate.",
        invoke: async (args: unknown) => {
            invokedArgs = args
            return { ok: true }
        },
    }
    const adapter = caller as unknown as {
        adaptMcpTools(tools: readonly unknown[]): Array<{
            name: string
            description: string
            runtimeParams?: (context: any) => Promise<Record<string, readonly unknown[]>>
            func(input: any): Promise<unknown>
        }>
    }
    const [tool] = adapter.adaptMcpTools([fakeMcpTool])
    const state = {
        system_prompt: "Choose a tool.",
        message_history: [{ role: "user" as const, content: { request: "Max" } }],
    }
    const runtimeContext = {
        state,
        thread_id: "thread-1",
        context: { tenantId: "tenant-acme" },
    }

    assert.equal(tool.name, "hubspot__get_candidate")
    assert.equal(tool.description, "CRM server.\nGets one candidate.")
    assert.deepEqual(await tool.runtimeParams?.(runtimeContext), { candidate: [candidate] })
    assert.equal(receivedServerName, "hubspot")
    assert.deepEqual(await tool.func({ ...runtimeContext, args: { candidate } }), { ok: true })
    assert.deepEqual(invokedArgs, { candidate })
})

test("rejects invalid context before making a JEV request", async () => {
    let fetchCalled = false
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => {
        fetchCalled = true
        throw new Error("fetch must not be called")
    }

    try {
        const caller = new JevToolCaller({
            prompt: "Choose a tool.",
            contextSchema: z.object({ sessionId: z.string() }),
            tools: [
                {
                    name: "ping",
                    description: "Returns pong.",
                    func: async ({ context }) => `pong:${context.sessionId}`,
                },
            ],
        })

        await assert.rejects(
            caller.invoke({
                request: "ping",
                context: { sessionId: 123 } as unknown as { sessionId: string },
            }),
            z.ZodError,
        )
        assert.equal(fetchCalled, false)
    } finally {
        globalThis.fetch = originalFetch
    }
})
