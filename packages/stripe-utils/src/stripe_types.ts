import { SupabaseTable } from "@delofarag/supabase-utils"
import { z } from "zod"

export interface StripeProps<T extends Record<string,any>> {
    products: Record<string,Product>,
    secret_key: string,
    webhook_key: string,
    dataTable: SupabaseTable<T>
}

export const CreateCheckoutSessionSchema = z.object({
    mode: z.enum(["subscription", "payment", "setup"]).default("subscription"),
    successUrl: z.string().url(),
    cancelUrl: z.string().url(),
    customerEmail: z.string().email().optional(),
    supabaseId: z.string(), // ich so weil ich die sb-session dahin schicke mit der handleSession func
    customerId: z.string().optional(),
    productKey: z.string(),
})

export const CreateUserSchema = z.object({
    email: z.string().email(),
    supabaseId: z.string()
})

export const CreateBillingPortalSchema = z.object({
    supabaseId: z.string(),
    returnUrl: z.string().url()
})

export type CreateCheckoutSessionProps = z.infer<typeof CreateCheckoutSessionSchema>
export type CreateUserProps = z.infer<typeof CreateUserSchema>
export type CreateBillingPortalProps = z.infer<typeof CreateBillingPortalSchema>

export interface StripeSubscription {
    priceId?:string,
    status?:status,
    startDate?:string,
    trial_end?:string 
    selected_plan?:Tier
}

export interface StripeSupabase {
    user_id:string, // supabase user id
    user_email:string,
    stripe_id:string | null,
    stripe_subscription:StripeSubscription
}

export interface Product {
    priceId: string
    name: string
    description: string
}

export interface WebhookConfig {
    customerSubscriptionCreated?:(supabaseID:string,priceId:string | null | undefined) => Promise<void>,
    customerSubscriptionUpdated?:(supabaseID:string, priceId:string | null | undefined,status:status | undefined) => Promise<void>,
    invoicePaymentActionRequired?:(supabaseID:string,priceId:string | null | undefined) => Promise<void>,
    invoicePaid?:(supabaseID:string,priceId:string | null | undefined) => Promise<void>,
    invoicePaymentFailed?:(supabaseID:string,priceId:string | null | undefined) => Promise<void>,
    customerSubscriptionDeleted?:(supabaseID:string,priceId:string | null | undefined) => Promise<void>,
    checkoutSessionCompleted?:(supabaseID:string,priceId:string | null | undefined) => Promise<void>,
}

export type Tier = "small"| "starter" | "advanced" | "premium" | "small_trial" | "starter_trial" | "advanced_trial" | "premium_trial"
export type status = "active" | "canceled" | "past_due" | "trialing"