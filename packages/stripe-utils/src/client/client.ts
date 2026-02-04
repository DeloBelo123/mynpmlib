import { loadStripe } from "@stripe/stripe-js"
import axios from "axios"

/**
 * eine function die dein produkt/Abo an das korrekte backend schickt und den 
 * user direkt in die stripe-checkout-session schickt
 * backend-partner: sh.createCheckoutSession()
 * @param stripePublicKey - der Stripe Public Key (per default aus der .env ("NEXT_PUBLIC_STRIPE_PUBLIC_KEY"))
 * @param backend  das backend wohin du dein produkt key schicken willst
 * @param productKey der produktKey, welches ein alias für die price-id ist
 * @param mode der mode der checkout-session
 * @param productQuantity die menge des produkts, die der user kaufen will
 */
export async function handleCheckoutSession({
    stripePublicKey = process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY!, 
    backend, 
    productKey,  
    productQuantity = 1,
    mode = "subscription",
}: {
    stripePublicKey?: string,
    backend: string,
    productKey: string,
    mode?: "subscription" | "payment" | "setup",
    productQuantity?: number
}):Promise<void> {
    try{
        const stripe = await loadStripe(stripePublicKey)
        if(!stripe) throw new Error("Error loading stripe")

        const respo = await axios.post(backend,{
            mode,
            productKey,
            productQuantity,
        }, { withCredentials: true })
        const sessionId = respo.data.id
        const { error } = await stripe.redirectToCheckout({ sessionId })
        if (error) throw new Error("Error redirecting to checkout: " + error)
    } catch(error){
        console.error("Error handling session:", error)
        throw error
    }
}

/** 
 * diese function erstellt eine billing-portal-session für den user.
 * backend-partner: sh.createBillingPortal()
 * @param backend das backend wohin die billing-portal-session geschickt wird
 * @returns nichst, es bringt dich zur billing-portal-url oder returned undefined
 */
export async function handleBillingPortal({backend}:{backend:string}){
    const respo = await axios.post(backend,{}, { withCredentials: true })
    if(!respo.data) return
    window.location.href = respo.data.url
}

/**
 * diese function redirectet den user zu einem von dir im Stripe Dashboard erstellten Payment Link.
 * @param link der Payment Link, den du im Stripe Dashboard erstellt hast
 * @returns nichts, es redirectet den user zu dem Payment Link
 */
export async function redirectToPaymentLink(link:`https://buy.stripe.com/${string}`){
    window.location.href = link
}


