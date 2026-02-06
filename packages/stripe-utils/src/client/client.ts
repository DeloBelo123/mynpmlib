import { loadStripe } from "@stripe/stripe-js"
import { stripeClient as sc } from "../server/orpc/orpc-client"

/**
 * eine function die dein produkt/Abo an das korrekte backend schickt und den 
 * user direkt in die stripe-checkout-session schickt
 * backend-partner: sh.createCheckoutSession()
 * @param stripePublicKey - der Stripe Public Key (per default aus der .env ("NEXT_PUBLIC_STRIPE_PUBLIC_KEY"))
 * @param successUrl - die url, zu der der user weitergeleitet wird, wenn die session erfolgreich ist
 * @param cancelUrl - die url, zu der der user weitergeleitet wird, wenn die session abgebrochen wird
 * @param productKey der produktKey, welches ein alias für die price-id ist
 * @param mode der mode der checkout-session
 * @param productQuantity die menge des produkts, die der user kaufen will
 */
export async function handleCheckoutSession({
    stripePublicKey = process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY!, 
    successEndpoint, 
    cancelEndpoint,
    productKey,  
    productQuantity = 1,
    mode = "subscription",
}: {
    stripePublicKey?: string,
    successEndpoint: `/${string}`,
    cancelEndpoint: `/${string}`,
    productKey: string,
    mode: "subscription" | "payment" | "setup",
    productQuantity?: number
}):Promise<void> {
    try{
        const stripe = await loadStripe(stripePublicKey)
        if(!stripe) throw new Error("Error loading stripe (check .env vars")
        if(!process.env.NEXT_PUBLIC_APP_URL) throw new Error("Error loading app url (check .env vars, NEXT_PUBLIC_APP_URL is required)")

        const respo = await sc.createCheckoutSession({
            productKey:productKey,
            mode:mode,
            productQuantity:productQuantity,
            successUrl:process.env.NEXT_PUBLIC_APP_URL + successEndpoint,
            cancelUrl:process.env.NEXT_PUBLIC_APP_URL + cancelEndpoint,
        })
        const sessionId = respo.id
        if (!sessionId) throw new Error("Backend returned no object with session id, or session, or whatever just look at your backend response and what is expected here")
        const { error } = await stripe.redirectToCheckout({ sessionId })
        if (error) throw new Error("Error redirecting to checkout: " + error)
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error("Checkout-Fehler:", message, error)
        throw new Error(message || "Checkout fehlgeschlagen.")
    }
}

/** 
 * diese function erstellt eine billing-portal-session für den user.
 * backend-partner: sh.createBillingPortal()
 * @param returnUrl - die url, zu der der user weitergeleitet wird, wenn die session abgebrochen wird
 * @returns nichst, es bringt dich zur billing-portal-url oder returned undefined
 */
export async function handleBillingPortal({returnEndpoint}:{returnEndpoint:`/${string}`}){
    try{
        if(!process.env.NEXT_PUBLIC_APP_URL) throw new Error("Error loading app url (check .env vars, NEXT_PUBLIC_APP_URL is required)")
        const respo = await sc.createBillingPortal({ returnUrl:process.env.NEXT_PUBLIC_APP_URL + returnEndpoint })
        if(!respo?.url) return
        window.location.href = respo.url
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error("Billing-Portal-Fehler:", message, error)
        throw new Error(message || "Billing-Portal fehlgeschlagen.")
    }
}   

/**
 * diese function redirectet den user zu einem von dir im Stripe Dashboard erstellten Payment Link.
 * @param link der Payment Link, den du im Stripe Dashboard erstellt hast
 * @returns nichts, es redirectet den user zu dem Payment Link
 */
export async function redirectToPaymentLink(link:`https://buy.stripe.com/${string}`){
    window.location.href = link
}


