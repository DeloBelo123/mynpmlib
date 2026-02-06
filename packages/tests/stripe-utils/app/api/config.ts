import { SupabaseTable } from "@delofarag/supabase-utils"
import { StripeTable,WebhookEventTable,Products } from "@delofarag/stripe-utils"
import { createStripeHandler } from "@delofarag/stripe-utils/server"

export const userTable = new SupabaseTable<StripeTable & { name: string }>("users")
export const webhookEventTable = new SupabaseTable<WebhookEventTable>("webhook-events")

export const products: Products = {
    sub:{
        name: "Subscription",
        description: "Subscription to the service",
        priceId: "price_1Sx8Pu7GRBvALSDAjahAwk6I",
    },
    lifetime:{
        name: "Lifetime",
        description: "Lifetime access to the service",
        priceId: "price_1Sx8RG7GRBvALSDAjfKcwn3Q",
    }
}

export const stripeHandler = createStripeHandler({
    dataTable: userTable,
    webhookEventTable: webhookEventTable,
    products: products,
})
