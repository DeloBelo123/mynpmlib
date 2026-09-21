import assert from "node:assert/strict"
import { performance } from "node:perf_hooks"
import test from "node:test"
import { z } from "zod/v4"
import { JevToolCaller } from "../src/heart/jevToolCaller"

test(
    "real JEV selects the intended tool and runtime value",
    { skip: !process.env.OPENROUTER_API_KEY },
    async () => {
        const originalFetch = globalThis.fetch
        const requestDurationsMs: number[] = []
        const requestBodies: string[] = []
        const secret = "integration-secret-that-must-stay-local"
        const redProduct = { sku: "RED-11", title: "Red product" }
        const blueProduct = { sku: "BLUE-42", title: "Blue product" }
        let unusedParamsCalled = false
        let receivedProduct: unknown

        globalThis.fetch = async (input, init) => {
            const startedAt = performance.now()
            requestBodies.push(String(init?.body ?? ""))
            try {
                return await originalFetch(input, init)
            } finally {
                requestDurationsMs.push(performance.now() - startedAt)
            }
        }

        try {
            const contextSchema = z.object({
                tenantId: z.string(),
                secret: z.string(),
            })
            const caller = new JevToolCaller({
                prompt: "Select the one tool that directly fulfills the user's explicit request.",
                contextSchema,
                tools: [
                    {
                        name: "find_product",
                        description: "Finds and returns a product by its requested SKU.",
                        params: async ({ context }) => {
                            assert.equal(context.tenantId, "tenant-acme")
                            return { product: [redProduct, blueProduct] }
                        },
                        func: async ({ params, context }) => {
                            const { product } = params
                            receivedProduct = product
                            return {
                                selectedSku: product.sku,
                                tenantId: context.tenantId,
                                authorized: context.secret === secret,
                            }
                        },
                    },
                    {
                        name: "get_weather",
                        description: "Returns the current weather for a requested city.",
                        params: async () => {
                            unusedParamsCalled = true
                            return { location: ["Berlin", "Hamburg"] }
                        },
                        func: async ({ params }) => params.location,
                    },
                ],
            })

            const totalStartedAt = performance.now()
            const output = await caller.invoke({
                request: "Find and return the product whose SKU is exactly BLUE-42.",
                context: { tenantId: "tenant-acme", secret },
                debug: true,
            })
            const totalDurationMs = performance.now() - totalStartedAt

            assert.equal(output.metadata.selected_tool.name, "find_product")
            assert.equal(output.metadata.selected_params.product.choice, "option_1")
            assert.equal(receivedProduct, blueProduct)
            assert.deepEqual(output.result, {
                selectedSku: "BLUE-42",
                tenantId: "tenant-acme",
                authorized: true,
            })
            assert.equal(unusedParamsCalled, false)
            assert.equal(requestBodies.length, 2)
            assert.equal(requestBodies.some(body => body.includes(secret)), false)

            console.log(
                JSON.stringify({
                    requestDurationsMs: requestDurationsMs.map(value => Math.round(value)),
                    totalDurationMs: Math.round(totalDurationMs),
                    usage: output.metadata.usage,
                }),
            )
        } finally {
            globalThis.fetch = originalFetch
        }
    },
)
