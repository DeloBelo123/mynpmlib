import { os, ORPCError } from "@orpc/server"
import type { StripeHandler } from "../server"
import { z } from "zod"
import { getUser } from "@delofarag/supabase-utils/server"

const base = os.$context<{ stripeHandler: StripeHandler }>()

const UNAUTHORIZED_MSG = "Nicht eingeloggt. Bitte zuerst anmelden."

function toORPCError(err: unknown): never {
    if (err instanceof ORPCError) throw err
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes("Unknown productKey") || msg.includes("productKey")) {
        throw new ORPCError("BAD_REQUEST", { message: msg })
    }
    throw new ORPCError("INTERNAL_SERVER_ERROR", { message: msg })
}

async function getUserId(): Promise<string> {
    try {
        const user = await getUser()
        if (!user?.id) throw new ORPCError("UNAUTHORIZED", { message: UNAUTHORIZED_MSG })
        return user.id
    } catch (err) {
        if (err instanceof ORPCError) throw err
        throw new ORPCError("UNAUTHORIZED", { message: UNAUTHORIZED_MSG })
    }
}

const createCheckoutSession = base
    .input(z.object({
        productKey: z.string(),
        productQuantity: z.number(),
        mode: z.enum(["subscription", "payment", "setup"]),
        successUrl: z.string(),
        cancelUrl: z.string()
    }))
    .output(z.object({ id: z.string() }).passthrough())
    .handler(async ({ context: { stripeHandler }, input }) => {
        const userId = await getUserId()
        try {
            const session = await stripeHandler.createCheckoutSession({ userId, ...input })
            return session as unknown as { id: string } & Record<string, unknown>
        } catch (err) {
            throw toORPCError(err)
        }
    })

const createBillingPortal = base
    .input(z.object({
        returnUrl: z.string()
    }))
    .output(z.object({ url: z.string() }).passthrough())
    .handler(async ({ context: { stripeHandler }, input: { returnUrl } }) => {
        const userId = await getUserId()
        try {
            const portal = await stripeHandler.createBillingPortal({ userId, returnUrl })
            return portal as unknown as { url: string } & Record<string, unknown>
        } catch (err) {
            throw toORPCError(err)
        }
    })

export const routes = { createCheckoutSession, createBillingPortal }