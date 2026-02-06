import { createStripeRequestHandler } from "@delofarag/stripe-utils/server"
import { stripeHandler } from "../../../config"

const stripeRequestHandler = createStripeRequestHandler(stripeHandler)

export const GET = stripeRequestHandler
export const POST = stripeRequestHandler
export const PUT = stripeRequestHandler
export const PATCH = stripeRequestHandler
export const DELETE = stripeRequestHandler
export const OPTIONS = stripeRequestHandler
export const HEAD = stripeRequestHandler
