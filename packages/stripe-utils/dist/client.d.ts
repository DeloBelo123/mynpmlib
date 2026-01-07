import { StripeSupabase } from "./stripe_types";
import { SupabaseTable, SupabaseClient } from "@delofarag/supabase-utils";
/**
 * eine function die dein produkt/Abo an das korrekte backend schickt und den
 * user direkt in die stripe-checkout-session schickt
 * backend-partner: sh.createCheckoutSession()
 * @param stripePublicKey - der Stripe Public Key
 * @param supabase - der Supabase Client
 * @param backend  das backend wohin du dein produkt key schicken willst
 * @param productKey der produktKey, welches ein alias für die price-id ist
 */
export declare function handleSession({ stripePublicKey, supabase, backend, productKey, successUrl, cancelUrl, mode }: {
    stripePublicKey: string;
    supabase: SupabaseClient;
    backend: string;
    productKey: string;
    successUrl: string;
    cancelUrl: string;
    mode?: "subscription" | "payment" | "setup";
}): Promise<void>;
/**
 * diese function erstellt eine billing-portal-session für den user
 * backend-partner: sh.createBillingPortal()
 * @param supabase - der Supabase Client
 * @param backend das backend wohin die billing-portal-session geschickt wird
 * @param returnUrl die url zu der der user nach der billing-portal-session zurückgeleitet wird
 * @returns nichst, es bringt dich zur billing-portal-url
 */
export declare function handleBillingPortal({ supabase, backend, returnUrl }: {
    supabase: SupabaseClient;
    backend: string;
    returnUrl: string;
}): Promise<void>;
/**
 * diese function macht den user zu einem stripe-kunden wenn er noch keiner ist
 * backend-partner: sh.createCustomer()
 * @param supabase - der Supabase Client
 * @param table die supabase table wo die stripe-id zum dazugehörigen user gespeichert wird
 * @param backend das backend wohin die user-data geschickt wird um ihn zu einem stripe-kunden zu machen: nutze die createCustomer() methode vom stripe-handler
 * @returns None
 */
export declare function addStripeID<T extends StripeSupabase>({ supabase, table, backend }: {
    supabase: SupabaseClient;
    table: SupabaseTable<T>;
    backend: string;
}): Promise<any>;
//# sourceMappingURL=client.d.ts.map