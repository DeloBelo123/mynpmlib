import assert from "node:assert/strict"
import test from "node:test"
import { z } from "zod/v4"
import { JevToolCaller } from "../src/heart/jevToolCaller"

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
                    func: async ({ product }, runtimeContext) => {
                        funcContextReference = runtimeContext
                        receivedProduct = product
                        return {
                            product,
                            tenantId: runtimeContext.context.tenantId,
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
                    func: async ({ location }) => location,
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
        assert.equal(runtimeContextReference, funcContextReference)
        assert.deepEqual(output.result, {
            product: selectedProduct,
            tenantId: "tenant-acme",
        })
        assert.equal(output.metadata.selected_tool.name, "find_product")
        assert.equal(output.metadata.selected_params.product.choice, "option_1")
        assert.equal(output.metadata.arguments.product, selectedProduct)
        assert.deepEqual(requestBodies[0].state.user_request, {
            request: "Find the product with SKU BLUE-42.",
        })
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
                    func: async (_args, { context }) => `pong:${context.sessionId}`,
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
