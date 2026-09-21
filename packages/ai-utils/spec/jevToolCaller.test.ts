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
    let unusedParamsCalled = false
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
                    params: async runtimeContext => {
                        runtimeContextReference = runtimeContext
                        assert.equal(runtimeContext.context.tenantId, "tenant-acme")
                        return { product: [otherProduct, selectedProduct] }
                    },
                    func: async input => {
                        const { product } = input.params
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
                    params: async () => {
                        unusedParamsCalled = true
                        return { location: ["Berlin"] }
                    },
                    func: async ({ params }) => params.location,
                },
            ],
        })

        const output = await caller.invoke({
            request: "Find the product with SKU BLUE-42.",
            context: { tenantId: "tenant-acme", secret },
            debug: true,
        })

        assert.equal(requestBodies.length, 2)
        assert.equal(unusedParamsCalled, false)
        assert.equal(receivedProduct, selectedProduct)
        assert.equal(
            (runtimeContextReference as { state: unknown }).state,
            (funcContextReference as { state: unknown }).state,
        )
        assert.deepEqual(output.value, {
            product: selectedProduct,
            tenantId: "tenant-acme",
        })
        assert.deepEqual(output.confidence, {
            toolChoice: 0.99,
            paramsChoice: { product: 0.98 },
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

test("executes a tool without params directly with an empty function params object", async () => {
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

        assert.deepEqual(result, {
            value: "pong:s1",
            confidence: { toolChoice: 1 },
        })
        assert.equal(calls, 1)
        assert.deepEqual(toolInput?.params, {})
        assert.equal(toolInput?.thread_id, undefined)
        assert.equal(
            toolInput?.state.system_prompt,
            "Treat the latest user message as the current request and earlier messages only as context. Select the available tool that best fulfills the request.",
        )
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

test("selects an argument from a static params object", async () => {
    const originalFetch = globalThis.fetch
    const originalApiKey = process.env.OPENROUTER_API_KEY
    process.env.OPENROUTER_API_KEY = "test-key"
    let calls = 0

    globalThis.fetch = async () => {
        calls++
        const response = calls === 1
            ? {
                  answers: {
                      tool: {
                          type: "choice",
                          choice: "take_action",
                          confidence: 1,
                          probabilities: { take_action: 1 },
                      },
                  },
                  model: "jev-test",
                  usage: { input_tokens: 4, output_tokens: 1 },
              }
            : {
                  answers: {
                      permission: {
                          type: "choice",
                          choice: "option_1",
                          confidence: 1,
                          probabilities: { option_0: 0, option_1: 1 },
                      },
                  },
                  model: "jev-test",
                  usage: { input_tokens: 3, output_tokens: 1 },
              }
        return new Response(JSON.stringify(response), { status: 200 })
    }

    try {
        const caller = new JevToolCaller({
            prompt: "Choose an action.",
            tools: [{
                name: "take_action",
                description: "Takes an action with the selected permission.",
                params: { permission: ["read", "write"] },
                func: async ({ params }) => params.permission,
            }],
        })

        const output = await caller.invoke({
            request: "Write the update.",
        })

        assert.equal(output.value, "write")
        assert.deepEqual(output.confidence, {
            toolChoice: 1,
            paramsChoice: { permission: 1 },
        })
        assert.equal(calls, 2)
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
                params: { candidate: [] },
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
                params: { candidate: "not-an-array" } as any,
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

test("adapts prefixed MCP tools and applies params from their server", async () => {
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
            params: {
                get_candidate: async ({ context, server }) => {
                    assert.equal(context.tenantId, "tenant-acme")
                    receivedServerName = server.name
                    return { candidate: [candidate] }
                },
                list_candidates: { limit: [{ value: 25 }] },
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
    const fakeStaticMcpTool = {
        name: "hubspot__list_candidates",
        description: "Lists candidates.",
        invoke: async (args: unknown) => args,
    }
    const adapter = caller as unknown as {
        adaptMcpTools(tools: readonly unknown[]): Array<{
            name: string
            description: string
            params?:
                | Record<string, readonly unknown[]>
                | ((context: any) => Promise<Record<string, readonly unknown[]>>)
            func(input: any): Promise<unknown>
        }>
    }
    const [tool, staticTool] = adapter.adaptMcpTools([fakeMcpTool, fakeStaticMcpTool])
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
    assert.equal(typeof tool.params, "function")
    if (typeof tool.params !== "function") throw new TypeError("Expected dynamic params")
    assert.deepEqual(await tool.params(runtimeContext), { candidate: [candidate] })
    assert.equal(receivedServerName, "hubspot")
    assert.deepEqual(await tool.func({ ...runtimeContext, params: { candidate } }), { ok: true })
    assert.deepEqual(invokedArgs, { candidate })
    assert.deepEqual(staticTool.params, { limit: [{ value: 25 }] })
    assert.deepEqual(
        await staticTool.func({ ...runtimeContext, params: { limit: { value: 25 } } }),
        { limit: { value: 25 } },
    )
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
