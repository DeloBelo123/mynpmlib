import { SupabaseTable } from "@delofarag/supabase-utils";
import { z } from "zod";
export interface StripeProps<T extends Record<string, any>> {
    products: Record<string, Product>;
    secret_key: string;
    webhook_key: string;
    dataTable: SupabaseTable<T>;
}
export declare const CreateCheckoutSessionSchema: z.ZodObject<{
    mode: z.ZodDefault<z.ZodEnum<["subscription", "payment", "setup"]>>;
    successUrl: z.ZodString;
    cancelUrl: z.ZodString;
    customerEmail: z.ZodOptional<z.ZodString>;
    supabaseId: z.ZodString;
    customerId: z.ZodOptional<z.ZodString>;
    productKey: z.ZodString;
}, "strip", z.ZodTypeAny, {
    mode: "subscription" | "payment" | "setup";
    successUrl: string;
    cancelUrl: string;
    supabaseId: string;
    productKey: string;
    customerEmail?: string | undefined;
    customerId?: string | undefined;
}, {
    successUrl: string;
    cancelUrl: string;
    supabaseId: string;
    productKey: string;
    mode?: "subscription" | "payment" | "setup" | undefined;
    customerEmail?: string | undefined;
    customerId?: string | undefined;
}>;
export declare const CreateUserSchema: z.ZodObject<{
    email: z.ZodString;
    supabaseId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    supabaseId: string;
    email: string;
}, {
    supabaseId: string;
    email: string;
}>;
export declare const CreateBillingPortalSchema: z.ZodObject<{
    supabaseId: z.ZodString;
    returnUrl: z.ZodString;
}, "strip", z.ZodTypeAny, {
    supabaseId: string;
    returnUrl: string;
}, {
    supabaseId: string;
    returnUrl: string;
}>;
export type CreateCheckoutSessionProps = z.infer<typeof CreateCheckoutSessionSchema>;
export type CreateUserProps = z.infer<typeof CreateUserSchema>;
export type CreateBillingPortalProps = z.infer<typeof CreateBillingPortalSchema>;
export interface StripeSubscription {
    priceId?: string;
    status?: status;
    startDate?: string;
    trial_end?: string;
    selected_plan?: Tier;
}
export interface StripeSupabase {
    user_id: string;
    user_email: string;
    stripe_id: string | null;
    stripe_subscription: StripeSubscription;
}
export interface Product {
    priceId: string;
    name: string;
    description: string;
}
export interface WebhookConfig {
    customerSubscriptionCreated?: (supabaseID: string, priceId: string | null | undefined) => Promise<void>;
    customerSubscriptionUpdated?: (supabaseID: string, priceId: string | null | undefined, status: status | undefined) => Promise<void>;
    invoicePaymentActionRequired?: (supabaseID: string, priceId: string | null | undefined) => Promise<void>;
    invoicePaid?: (supabaseID: string, priceId: string | null | undefined) => Promise<void>;
    invoicePaymentFailed?: (supabaseID: string, priceId: string | null | undefined) => Promise<void>;
    customerSubscriptionDeleted?: (supabaseID: string, priceId: string | null | undefined) => Promise<void>;
    checkoutSessionCompleted?: (supabaseID: string, priceId: string | null | undefined) => Promise<void>;
}
export type Tier = "small" | "starter" | "advanced" | "premium" | "small_trial" | "starter_trial" | "advanced_trial" | "premium_trial";
export type status = "active" | "canceled" | "past_due" | "trialing";
//# sourceMappingURL=stripe_types.d.ts.map