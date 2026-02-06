import type { NextRequest } from "next/server"
import { SupabaseTable } from "@delofarag/supabase-utils"
import { z } from "zod"

// Product Types
export interface Product {
    priceId: string
    description: string
    name:string
}

export type Products = Record<string, Product>

//schemas for backend
export const checkoutSchema = z.object({
    mode: z.enum(["subscription", "payment", "setup"]),
    productQuantity: z.number().optional().default(1),
    productKey: z.string(),
})

export const billingPortalSchema = z.object({
    returnUrl: z.string()
})

// class Types
export type status = "active" | "canceled" | "past_due" | "trialing"

export interface StripeProps<T extends Record<string,any>> {
    products: Record<string,Product>,
    secret_key?: string,
    webhook_key?: string,
    dataTable: SupabaseTable<T>,
    webhookEventTable?: SupabaseTable<{event_id:string}>, //Optional: Tabelle mit Spalte event_id (UNIQUE). Wenn gesetzt, wird jedes Event nur einmal verarbeitet (Idempotenz). 
}

export type CreateCheckoutSessionProps = {
    userId: string,
    mode: "subscription" | "payment" | "setup",
    productQuantity?: number,
    productKey: string,
    successUrl: string,
    cancelUrl: string,
}

export type CreateBillingPortalProps = {
    userId: string,
    returnUrl: string,
}

export type CreateCustomerProps = {
    userId: string,
}

export interface StripeSubscription {
    priceId?:string,
    status?:status,
    startDate?:string,
    trial_end?:string 
    selected_plan?:string
}

export interface StripeTable {
    id:string, // unique supabase user id von der auth-tabelle, mach sql code das die mit deiner tabelle geknüpft ist
    email:string,
    stripe_id:string | null,
    stripe_subscriptions:StripeSubscription[]
}

// webhook Types
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

export interface WebhookEventTable {
    event_id:string
}