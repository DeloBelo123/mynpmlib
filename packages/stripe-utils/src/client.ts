import { loadStripe } from "@stripe/stripe-js"
import axios from "axios"
import { StripeSupabase } from "./stripe_types"
import { SupabaseTable, SupabaseClient } from "@delofarag/supabase-utils"
import { createClient } from "@supabase/supabase-js"

/**
 * eine function die dein produkt/Abo an das korrekte backend schickt und den 
 * user direkt in die stripe-checkout-session schickt
 * backend-partner: sh.createCheckoutSession()
 * @param stripePublicKey - der Stripe Public Key
 * @param supabase - der Supabase Client
 * @param backend  das backend wohin du dein produkt key schicken willst
 * @param productKey der produktKey, welches ein alias für die price-id ist
 */
export async function handleSession({
    stripePublicKey = process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY!, 
    supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!),
    backend, 
    productKey, 
    successUrl, 
    cancelUrl, 
    mode = "subscription"
}: {
    stripePublicKey?: string,
    supabase?: SupabaseClient,
    backend: string,
    productKey: string,
    successUrl: string,
    cancelUrl: string,
    mode?: "subscription" | "payment" | "setup"
}):Promise<void> {
    try{
        const stripe = await loadStripe(stripePublicKey)
        if(!stripe) throw new Error("Error loading stripe")

        const { data: { user }, error:supabaseError } = await supabase.auth.getUser() 
        if(supabaseError) throw new Error("Error beim user kriegen in der 'handleSession' function, Error: " + supabaseError)

        if(!user) throw new Error("No user found")
            
        const SupabaseUserId = user?.id
        const respo = await axios.post(backend,{
            mode,
            productKey,
            successUrl,
            cancelUrl,
            supabaseId: SupabaseUserId,
        })
        const sessionId = respo.data.id
        const { error } = await stripe.redirectToCheckout({ sessionId })
        if (error) throw new Error("Error redirecting to checkout: " + error)
    } catch(error){
        console.error("Error handling session:", error)
        throw error
    }
}

/** 
 * diese function erstellt eine billing-portal-session für den user
 * backend-partner: sh.createBillingPortal()
 * @param supabase - der Supabase Client
 * @param backend das backend wohin die billing-portal-session geschickt wird
 * @param returnUrl die url zu der der user nach der billing-portal-session zurückgeleitet wird
 * @returns nichst, es bringt dich zur billing-portal-url
 */
export async function handleBillingPortal({supabase, backend,returnUrl}:{supabase: SupabaseClient, backend:string,returnUrl:string}){
    const { data: { user }, error:supabaseError } = await supabase.auth.getUser() 
    if(supabaseError) throw new Error("Error beim user kriegen in der 'handleBillingPortal' function, Error: " + supabaseError)
    if(!user) throw new Error("No user found")
    const SupabaseUserId = user?.id
    const respo = await axios.post(backend,{
        supabaseId: SupabaseUserId,
        returnUrl: returnUrl
    })
    window.location.href = respo.data.url
}

/**
 * diese function macht den user zu einem stripe-kunden wenn er noch keiner ist
 * backend-partner: sh.createCustomer()
 * @param supabase - der Supabase Client
 * @param table die supabase table wo die stripe-id zum dazugehörigen user gespeichert wird
 * @param backend das backend wohin die user-data geschickt wird um ihn zu einem stripe-kunden zu machen: nutze die createCustomer() methode vom stripe-handler
 * @returns None
 */
export async function addStripeID<T extends StripeSupabase>({supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!) , table, backend}:{supabase?: SupabaseClient, table:SupabaseTable<T>,backend:string}){
    try{
        if(!supabase) throw new Error("No supabase client provided, check your .env file (NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY) or give in a instance yourself")
            const { data:{ user }, error:getUserError } = await supabase.auth.getUser()
            if(getUserError) throw new Error("Error beim user kriegen in der 'addStripeID' function, Error: " + getUserError)
        
            const SupabaseUserId = user?.id
            if (!SupabaseUserId) throw new Error("No user ID found")
            
            const stripeID_obj = await table.select({
                columns:["stripe_id" as keyof T],
                where:[{column:"user_id" as keyof T, is:SupabaseUserId}],
                first:true
            })
            if(stripeID_obj?.stripe_id){
                console.log(`User:${SupabaseUserId} hat bereits eine stripeID`)
                return
            }
            //So, wenn der code weiter läuft dann ist der user kein stripe-kunde, das fixxen wir jetzt
            const email_obj = await table.select({
                columns:["email"],
                where:[{column:"user_id", is: SupabaseUserId}],
                first:true
            })
            if(!email_obj) throw new Error("user mit der id: " + SupabaseUserId + " hat keine Mail!")
            
            const email = email_obj?.email
            if (!email) throw new Error("No email found for user")
            
            const respo = await axios.post(backend,{
                supabaseId:SupabaseUserId,
                email:email
            })
            if(!respo.data.success){
                throw new Error("Error beim erstellen der stripeID, Error: " + respo.data.message)
            }
            return respo.data.data
    }catch(error){
        console.error("Error adding stripe ID:", error)
        throw error
    }
}
