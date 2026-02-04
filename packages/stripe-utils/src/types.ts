import { ServerRequestLike } from "@delofarag/supabase-utils/server"
import { SupabaseTable } from "@delofarag/supabase-utils"

export type status = "active" | "canceled" | "past_due" | "trialing"

export interface Product {
    priceId: string
    description: string
    name:string
}

export interface StripeProps<T extends Record<string,any>> {
    products: Record<string,Product>,
    secret_key?: string,
    webhook_key?: string,
    dataTable: SupabaseTable<T>,
    webhookEventTable?: SupabaseTable<{event_id:string}>, //Optional: Tabelle mit Spalte event_id (UNIQUE). Wenn gesetzt, wird jedes Event nur einmal verarbeitet (Idempotenz). 
}

export type CreateCheckoutSessionProps = {
    mode?: "subscription" | "payment" | "setup",
    productQuantity?: number,
    productKey: string,
    successUrl: string,
    cancelUrl: string,
    req: ServerRequestLike
}
export type CreateBillingPortalProps = {
    returnUrl: string,
    req: ServerRequestLike
}

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
