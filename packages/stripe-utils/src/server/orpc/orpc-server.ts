import { RPCHandler } from '@orpc/server/fetch'
import type { StripeHandler } from '../server'
import { routes } from './orpc-routes'

const PREFIX = '/api/stripe/orpc'

export const handler = new RPCHandler(routes)

/**
 * Erstellt den Request-Handler mit deinem StripeHandler (aus z.B. createStripeHandler).
 * In der Route unter `/api/stripe/orpc/[[...rest]]/route.ts`:
 *
 * @example
 * import { createStripeRequestHandler } from "@delofarag/stripe-utils/server"
 * import { stripeHandler } from "../../../config"
 *
 * const stripeRequestHandler = createStripeRequestHandler(stripeHandler)
 * export const GET = stripeRequestHandler
 * export const POST = stripeRequestHandler
 * export const PUT = stripeRequestHandler
 * export const PATCH = stripeRequestHandler
 * export const DELETE = stripeRequestHandler
 * export const OPTIONS = stripeRequestHandler
 * export const HEAD = stripeRequestHandler
 */
export function createStripeRequestHandler(stripeHandler: StripeHandler) {
    return async function stripeRequestHandler(req: Request) {
        const { response } = await handler.handle(req, { prefix: PREFIX, context: { stripeHandler } })
        return response ?? new Response("Stripe oRPC handler not matched.", { status: 404 })
    }
}