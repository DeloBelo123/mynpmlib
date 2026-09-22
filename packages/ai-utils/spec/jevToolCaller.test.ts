import assert from "node:assert/strict"
import test from "node:test"
import { z } from "zod/v4"
import { MemorySaver, MultiServerMCPClient } from "../src/imports"
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
        assert.equal(output.kind, "return")
        if (output.kind !== "return" || output.rejected) {
            throw new Error("expected successful return")
        }
        assert.deepEqual(output.value, {
            product: selectedProduct,
            tenantId: "tenant-acme",
        })
        assert.deepEqual(output.tool, { name: "find_product", confidence: 0.99 })
        assert.deepEqual(output.params, {
            product: { value: selectedProduct, confidence: 0.98 },
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
            tool: { name: "ping", confidence: 1 },
            params: {},
            kind: "return",
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

        assert.equal(output.kind, "return")
        if (output.kind !== "return" || output.rejected) {
            throw new Error("expected successful return")
        }
        assert.equal(output.value, "write")
        assert.deepEqual(output.tool, { name: "take_action", confidence: 1 })
        assert.deepEqual(output.params, {
            permission: { value: "write", confidence: 1 },
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

test("confidenceGate blocks low tool confidence and reports below", async () => {
    const originalFetch = globalThis.fetch
    const originalApiKey = process.env.OPENROUTER_API_KEY
    process.env.OPENROUTER_API_KEY = "test-key"
    let funcCalled = false
    globalThis.fetch = async () => new Response(JSON.stringify({
        answers: {
            tool: {
                type: "choice",
                choice: "ping",
                confidence: 0.4,
                probabilities: { ping: 0.4 },
            },
        },
        model: "jev-test",
        usage: { input_tokens: 4, output_tokens: 1 },
    }), { status: 200 })
    try {
        const caller = new JevToolCaller({
            tools: [{
                name: "ping",
                description: "Returns pong.",
                func: async () => {
                    funcCalled = true
                    return "pong"
                },
            }],
            confidenceGate: { minConfidence: 0.9 },
        })
        const result = await caller.invoke({ request: "ping" })
        assert.equal(result.kind, "gated")
        if (result.kind !== "gated") throw new Error("expected gated")
        assert.deepEqual(result.below, [{ scope: "tool", confidence: 0.4, required: 0.9 }])
        assert.equal(funcCalled, false)
    } finally {
        globalThis.fetch = originalFetch
        if (originalApiKey === undefined) delete process.env.OPENROUTER_API_KEY
        else process.env.OPENROUTER_API_KEY = originalApiKey
    }
})

test("confidenceGate blocks low param confidence but minConfidence 0 executes", async () => {
    const originalFetch = globalThis.fetch
    const originalApiKey = process.env.OPENROUTER_API_KEY
    process.env.OPENROUTER_API_KEY = "test-key"
    let calls = 0
    const jevFetch = (toolConf: number, paramConf: number) => async () => {
        calls++
        const response = calls === 1
            ? {
                  answers: {
                      tool: {
                          type: "choice",
                          choice: "take_action",
                          confidence: toolConf,
                          probabilities: { take_action: toolConf },
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
                          confidence: paramConf,
                          probabilities: { option_0: 0.8, option_1: paramConf },
                      },
                  },
                  model: "jev-test",
                  usage: { input_tokens: 3, output_tokens: 1 },
              }
        return new Response(JSON.stringify(response), { status: 200 })
    }
    try {
        let funcCalled = false
        const makeCaller = (confidenceGate: { minConfidence: number }) => new JevToolCaller({
            tools: [{
                name: "take_action",
                description: "Takes an action.",
                params: { permission: ["read", "write"] },
                func: async ({ params }) => {
                    funcCalled = true
                    return params.permission
                },
            }],
            confidenceGate,
        })
        calls = 0
        funcCalled = false
        globalThis.fetch = jevFetch(0.99, 0.2)
        const gated = await makeCaller({ minConfidence: 0.5 }).invoke({ request: "Write." })
        assert.equal(gated.kind, "gated")
        if (gated.kind !== "gated") throw new Error("expected gated")
        assert.deepEqual(gated.below, [{ scope: "params.permission", confidence: 0.2, required: 0.5 }])
        assert.equal(funcCalled, false)

        calls = 0
        funcCalled = false
        globalThis.fetch = jevFetch(0.1, 0.1)
        const executed = await makeCaller({ minConfidence: 0 }).invoke({ request: "Write." })
        assert.equal(executed.kind, "return")
        if (executed.kind !== "return" || executed.rejected) throw new Error("expected return")
        assert.equal(executed.value, "write")
        assert.equal(funcCalled, true)
    } finally {
        globalThis.fetch = originalFetch
        if (originalApiKey === undefined) delete process.env.OPENROUTER_API_KEY
        else process.env.OPENROUTER_API_KEY = originalApiKey
    }
})

test("HITL approve resumes via a new caller instance and clears pending", async () => {
    const originalFetch = globalThis.fetch
    const originalApiKey = process.env.OPENROUTER_API_KEY
    process.env.OPENROUTER_API_KEY = "test-key"
    globalThis.fetch = async () => new Response(JSON.stringify({
        answers: {
            tool: { type: "choice", choice: "danger", confidence: 1, probabilities: { danger: 1 } },
        },
        model: "jev-test",
        usage: { input_tokens: 4, output_tokens: 1 },
    }), { status: 200 })
    try {
        const checkpointer = new MemorySaver()
        const tools = [{
            name: "danger",
            description: "Dangerous action.",
            func: async () => "done",
        }] as const
        const interruptOn = { danger: "Allow?" } as const
        const proposer = new JevToolCaller({ tools, checkpointer, interruptOn })
        const proposed = await proposer.invoke({ request: "do it", thread_id: "hitl-approve" })
        assert.equal(proposed.kind, "interrupt")
        const resumer = new JevToolCaller({ tools, checkpointer, interruptOn })
        const approved = await resumer.invoke({ thread_id: "hitl-approve", decision: "approve" })
        assert.equal(approved.kind, "return")
        if (approved.kind !== "return" || approved.rejected) throw new Error("expected approve")
        assert.equal(approved.value, "done")
        await assert.rejects(
            resumer.invoke({ thread_id: "hitl-approve", decision: "approve" }),
            /No pending interrupt/,
        )
    } finally {
        globalThis.fetch = originalFetch
        if (originalApiKey === undefined) delete process.env.OPENROUTER_API_KEY
        else process.env.OPENROUTER_API_KEY = originalApiKey
    }
})

test("HITL reject works without resolving the pending tool", async () => {
    const originalFetch = globalThis.fetch
    const originalApiKey = process.env.OPENROUTER_API_KEY
    process.env.OPENROUTER_API_KEY = "test-key"
    let dangerCalls = 0
    globalThis.fetch = async () => new Response(JSON.stringify({
        answers: {
            tool: { type: "choice", choice: "danger", confidence: 1, probabilities: { danger: 1 } },
        },
        model: "jev-test",
        usage: { input_tokens: 4, output_tokens: 1 },
    }), { status: 200 })
    try {
        const checkpointer = new MemorySaver()
        const proposer = new JevToolCaller({
            tools: [{
                name: "danger",
                description: "Dangerous action.",
                func: async () => {
                    dangerCalls++
                    return "must-not-run"
                },
            }],
            checkpointer,
            interruptOn: { danger: "Allow?" },
        })
        const proposed = await proposer.invoke({ request: "do it", thread_id: "hitl-reject" })
        assert.equal(proposed.kind, "interrupt")
        globalThis.fetch = async () => {
            throw new Error("reject must not call JEV")
        }
        const resumer = new JevToolCaller({
            tools: [{
                name: "other",
                description: "Unrelated tool.",
                func: async () => "other",
            }],
            checkpointer,
            interruptOn: { danger: "Allow?" },
        })
        const rejected = await resumer.invoke({ thread_id: "hitl-reject", decision: "reject" })
        assert.equal(rejected.kind, "return")
        if (rejected.kind !== "return" || !rejected.rejected) throw new Error("expected reject")
        assert.equal(rejected.value, null)
        assert.equal(dangerCalls, 0)
        await assert.rejects(
            resumer.invoke({ thread_id: "hitl-reject", decision: "reject" }),
            /No pending interrupt/,
        )
    } finally {
        globalThis.fetch = originalFetch
        if (originalApiKey === undefined) delete process.env.OPENROUTER_API_KEY
        else process.env.OPENROUTER_API_KEY = originalApiKey
    }
})

test("callTool validates bounded params including structurally equal objects", async () => {
    const filterA = { tag: "a", nested: { ids: [1, 2] } }
    const filterB = { tag: "b", nested: { ids: [3] } }
    const caller = new JevToolCaller({
        tools: [{
            name: "search",
            description: "Searches with a filter.",
            params: { filter: [filterA, filterB] },
            func: async ({ params }) => params.filter,
        }],
        checkpointer: new MemorySaver(),
        confidenceGate: { minConfidence: 1 },
        interruptOn: { search: "Allow?" },
    })
    const ok = await caller.callTool({
        request: "manual",
        thread_id: "calltool-bounded",
        tool: "search",
        params: { filter: { tag: "a", nested: { ids: [1, 2] } } },
    })
    assert.equal(ok.kind, "return")
    if (ok.kind !== "return" || ok.rejected) throw new Error("expected return")
    assert.deepEqual(ok.value, filterA)
    assert.deepEqual(ok.tool, { name: "search", confidence: 1 })
    await assert.rejects(
        caller.callTool({
            request: "manual",
            thread_id: "calltool-bounded",
            tool: "search",
            params: { filter: { tag: "zzz", nested: { ids: [] } } },
        }),
        /not one of its candidates/,
    )
    await assert.rejects(
        caller.callTool({ request: "manual", thread_id: "calltool-bounded", tool: "search", params: {} }),
        /Missing parameter/,
    )
    await assert.rejects(
        caller.callTool({
            request: "manual",
            thread_id: "calltool-bounded",
            tool: "search",
            params: { filter: filterA, extra: 1 } as any,
        }),
        /Unknown parameter/,
    )
})

test("MCP approve keeps the client open until after func; reject needs no MCP", async () => {
    const originalFetch = globalThis.fetch
    const originalApiKey = process.env.OPENROUTER_API_KEY
    process.env.OPENROUTER_API_KEY = "test-key"
    globalThis.fetch = async () => new Response(JSON.stringify({
        answers: {
            tool: {
                type: "choice",
                choice: "srv__remote",
                confidence: 1,
                probabilities: { srv__remote: 1 },
            },
        },
        model: "jev-test",
        usage: { input_tokens: 4, output_tokens: 1 },
    }), { status: 200 })
    const proto = MultiServerMCPClient.prototype as unknown as {
        getTools: (...args: unknown[]) => Promise<unknown[]>
        close: (...args: unknown[]) => Promise<void>
    }
    const originalGetTools = proto.getTools
    const originalClose = proto.close
    const events: string[] = []
    const fakeRemoteTool = {
        name: "srv__remote",
        description: "Remote tool.",
        invoke: async (args: unknown) => {
            events.push("invoke")
            return { echo: args }
        },
    }
    proto.getTools = async function () {
        events.push("getTools")
        return [fakeRemoteTool]
    }
    proto.close = async function () {
        events.push("close")
    }
    try {
        const checkpointer = new MemorySaver()
        const mcpServer = { name: "srv", url: "https://example.com/mcp", description: "S." } as const
        const proposer = new JevToolCaller({
            tools: [],
            mcpServer,
            checkpointer,
            interruptOn: { srv__remote: "Allow remote?" },
        })
        const proposed = await proposer.invoke({ request: "go", thread_id: "mcp-hitl" })
        assert.equal(proposed.kind, "interrupt")
        events.length = 0
        const resumer = new JevToolCaller({
            tools: [],
            mcpServer,
            checkpointer,
            interruptOn: { srv__remote: "Allow remote?" },
        })
        const approved = await resumer.invoke({ thread_id: "mcp-hitl", decision: "approve" })
        assert.equal(approved.kind, "return")
        if (approved.kind !== "return" || approved.rejected) throw new Error("expected approve")
        assert.deepEqual(approved.value, { echo: {} })
        assert.deepEqual(events, ["getTools", "invoke", "close"])

        const proposedOffline = await proposer.invoke({ request: "go", thread_id: "mcp-offline" })
        assert.equal(proposedOffline.kind, "interrupt")
        events.length = 0
        proto.getTools = async function () {
            events.push("getTools")
            throw new Error("mcp offline")
        }
        await assert.rejects(
            resumer.invoke({ thread_id: "mcp-offline", decision: "approve" }),
            /mcp offline/,
        )
        assert.deepEqual(events, ["getTools", "close"])
        proto.getTools = async function () {
            events.push("getTools")
            return [fakeRemoteTool]
        }

        const proposedReject = await proposer.invoke({ request: "go", thread_id: "mcp-reject" })
        assert.equal(proposedReject.kind, "interrupt")
        events.length = 0
        proto.getTools = async function () {
            events.push("getTools-fail")
            throw new Error("mcp offline")
        }
        const rejected = await resumer.invoke({ thread_id: "mcp-reject", decision: "reject" })
        assert.equal(rejected.kind, "return")
        if (rejected.kind !== "return" || !rejected.rejected) throw new Error("expected reject")
        assert.deepEqual(events, [])
    } finally {
        proto.getTools = originalGetTools
        proto.close = originalClose
        globalThis.fetch = originalFetch
        if (originalApiKey === undefined) delete process.env.OPENROUTER_API_KEY
        else process.env.OPENROUTER_API_KEY = originalApiKey
    }
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
