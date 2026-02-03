import { SupabaseClient, SupabaseTable } from "@delofarag/supabase-utils"
import { z } from "zod"

export type status = "active" | "canceled" | "past_due" | "trialing"

export interface Product {
    priceId: string
    name: string
    description: string
}

export interface StripeProps<T extends Record<string,any>> {
    products: Record<string,Product>,
    secret_key?: string,
    webhook_key?: string,
    dataTable: SupabaseTable<T>,
    serverSupabase?: SupabaseClient
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
    selected_plan?:string
}

export interface StripeSupabase {
    id:string, // unique supabase user id von der auth-tabelle, mach sql code das die mit deiner tabelle geknüpft ist
    email:string,
    stripe_id:string | null,
    stripe_subscription:StripeSubscription
}

type webhookFn = (supabaseID:string,priceId:string | null | undefined) => Promise<void>

export interface WebhookConfig {
    "customer.subscription.created"?: webhookFn,
    "customer.subscription.updated"?: (supabaseID:string, priceId:string | null | undefined,status:status | undefined) => Promise<void>,
    "customer.subscription.deleted"?: webhookFn,
    "invoice.payment_action_required"?: webhookFn,
    "invoice.paid"?: webhookFn,
    "invoice.payment_failed"?: webhookFn,
    "checkout.session.completed"?: webhookFn,
}
