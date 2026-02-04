import Stripe from "stripe"
import { SupabaseTable } from "@delofarag/supabase-utils"
import { getUser, ServerRequestLike } from "@delofarag/supabase-utils/server"
import { NextRequest, NextResponse } from "next/server"
import {
    type CreateCheckoutSessionProps, 
    type CreateBillingPortalProps,
    type StripeSupabase,
    type WebhookConfig,
    type StripeProps,
    type Product,
} from "../types"

export class StripeHandler<T extends StripeSupabase = StripeSupabase> { 
    public products:Record<string,Product>
    public dataTable:SupabaseTable<T>
    private webhook_key:string
    private webhookEventTable?: SupabaseTable<{ event_id: string }>
    private stripe:Stripe

    constructor({
        products,
        dataTable,
        webhookEventTable,
        secret_key = process.env.STRIPE_SECRET_KEY,
        webhook_key = process.env.STRIPE_WEBHOOK_KEY,
    }:StripeProps<T>) {
        if(!secret_key) throw new Error("No secret key provided, check your .env file or give in a value")
        if(!webhook_key) throw new Error("No webhook key provided, check your .env file or give in a value")
        this.products = products
        this.webhook_key = webhook_key
        this.dataTable = dataTable
        this.webhookEventTable = webhookEventTable
        this.stripe = new Stripe(secret_key,{
            apiVersion: "2023-10-16",
            typescript: true
        })

    }

    /**
     * diese function erstellt eine checkout-session für das gegebene produkt, returned dem frontend die session
     * für die url des checkouts damit der user das produkt kaufen kann
     * @param mode default = "subscription", der mode der checkout-session
     * @param productQuantity default = 1, die menge des produkts, die der user kaufen will
     * @param productKey der produktKey, welches ein alias für die price-id ist
     * @param successUrl die url, zu der der user weitergeleitet wird, wenn die session erfolgreich ist
     * @param cancelUrl die url, zu der der user weitergeleitet wird, wenn die session abgebrochen wird
     * @param req die request, die die session erstellt (http req vom front-end welches cookies enthält)
     * @return das checkout-session object
     */
    public async createCheckoutSession({mode = "subscription",productQuantity = 1,productKey,successUrl,cancelUrl,req}:CreateCheckoutSessionProps) {
        try{        
            const productPrice = this.products[productKey]?.priceId
            if (!productPrice) throw new Error(`Unknown productKey: ${productKey}`)

            //getting the user
            const userInSession = await getUser({req})
            let user = await this.dataTable.getRow({ id: userInSession.id } as Partial<T>)
            if(!user.stripe_id){
                user = await this.createCustomer({req})
            }   

            const session = await this.stripe.checkout.sessions.create({
                client_reference_id: userInSession.id,
                customer: user.stripe_id ?? undefined,
                customer_email: user.stripe_id ? undefined : (user.email ?? undefined),

                mode: mode,
                line_items: [{price: productPrice, quantity: productQuantity}],
                success_url: successUrl,
                cancel_url: cancelUrl,
                locale: 'de',
                metadata: { price_id: productPrice },
            })
            return session
        }catch(error){
            console.log("Error creating checkout session:", error)
            throw error
        }
    }

    /**
     * diese function erstellt einen stripe customer für den user, wenn er noch keinen hat.
     * das bedeutet das wenn der user keine stripe_id besitzt, das er jetzt eine bekommt und ein "customer" wird
     * @param req die request, die die customer erstellt (http req vom front-end welches cookies enthält)
     * @return den user (die row in der tablle)
     */
    public async createCustomer({req}:{req:ServerRequestLike}):Promise<T>{
        try{
            const userInSession = await getUser({req})

            //check if user is already a customer
            const user = await this.dataTable.getRow({ id: userInSession.id } as Partial<T>)
            if(user.stripe_id){
                return user
            }

            //create customer
            const customer = await this.stripe.customers.create({
                email: userInSession.email!,
                metadata: { supabaseId: String(userInSession.id) }
            })
            await this.dataTable.update({
                where:[{column:"id", is:userInSession.id}],
                update:{stripe_id:customer.id} as T
            })
            return await this.dataTable.getRow({ id: userInSession.id } as Partial<T>)
        }catch(error){
            console.log("Error creating customer:", error)
            throw error
        }
    }
    /**
     * diese function erstellt eine billing-portal-session für den user, damit er seine subscription verwalten kann
     * @param returnUrl die url, zu der der user weitergeleitet wird, wenn die session abgebrochen wird
     * @param req die request, die die session erstellt (http req vom front-end welches cookies enthält)
     * @return das billing-portal-session object
     */
    public async createBillingPortal({returnUrl,req}:CreateBillingPortalProps): Promise<Stripe.Response<Stripe.BillingPortal.Session> | undefined>{
        try{
            const userInSession = await getUser({req})
            const user = await this.dataTable.getRow({ id: userInSession.id } as Partial<T>)
            if(!user.stripe_id){
                console.error("No stripe id found for user with the id: " + userInSession.id)
                return
            }
            const portal = await this.stripe.billingPortal.sessions.create({
                customer: user.stripe_id!,
                return_url: returnUrl
            })
            return portal
        } catch(error){
            console.error("Error creating billing portal:", error)
            throw error
        }
    }

    /**
     * diese function handelt die webhooks von stripe. WICHTIG: handle hier auch die verschiedenen props von 'StripeSupabase' guck in die types.ts file
     * @param req die request, die die webhook erstellt (http req vom front-end welches cookies enthält)
     * @param webhookConfig die webhook config, die die webhooks handelt
     * @return eine next response mit dem success status und einer message
     */
    public async handleWebhook({req,webhookConfig}:{req:NextRequest,webhookConfig:WebhookConfig}){
        const sig = req.headers.get("stripe-signature")
        if (!sig) throw new Error("No stripe-signature in headers from stripes webhook call!!!")
        const body = await req.text()
        const webhookSecret = this.webhook_key; if (!webhookSecret) throw new Error("No webhook_key")

        let event: Stripe.Event
        try {
            event = this.stripe.webhooks.constructEvent(body, sig, webhookSecret)
        } catch (err) {
            console.log(`⚠️  Webhook signature verification failed.`, err)
            return NextResponse.json({
                success: false,
                message: "Webhook signature verification failed",
                error: err instanceof Error ? err.message : err
            }, { status: 500 })
        }

        if (this.webhookEventTable) {
            try {
                await this.webhookEventTable.insert([{ event_id: event.id }])
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                const isDuplicate = msg.includes("duplicate") && msg.includes("unique")
                if (isDuplicate) {
                    return NextResponse.json({ success: true, message: "Event already processed" }, { status: 200 })
                }
                throw err
            }
        }

        switch(event.type){
            case "checkout.session.completed":{
                try {
                    console.log("Checkout session completed")
                    const session = event.data.object as Stripe.Checkout.Session
                    const id = session.client_reference_id
                    const priceId = session.metadata?.price_id ?? await this.getPriceID(session.id, 'session')

                    if (id && priceId) {
                        if(webhookConfig["checkout.session.completed"]){
                            await webhookConfig["checkout.session.completed"](id, priceId)
                        } 
                    }
                } catch (error) {
                    console.error("Error handling checkout.session.completed:", error)
                }
                break;
            }

            case "customer.subscription.created":{
                try {
                    console.log("Subscription created")
                    const subscription = event.data.object as Stripe.Subscription
                    const customer_id = subscription.customer as string
                    const supabaseUserId = await this.getSupabaseUserIdByStripeCustomerId(customer_id)
                    const priceId = await this.getPriceID(subscription.id, 'subscription')

                    if (supabaseUserId && priceId) {
                        if(webhookConfig["customer.subscription.created"]){
                            await webhookConfig["customer.subscription.created"](supabaseUserId, priceId)
                        } 
                    }
                } catch (error) {
                    console.error("Error handling customer.subscription.created:", error)
                }
                break;
            }

            case "customer.subscription.updated":{
                try {
                    console.log("Subscription updated")
                    const subscription = event.data.object as Stripe.Subscription
                    const customer_id = subscription.customer as string
                    const supabaseUserId = await this.getSupabaseUserIdByStripeCustomerId(customer_id)
                    const priceId = await this.getPriceID(subscription.id, 'subscription')

                    if (supabaseUserId && priceId) {
                        const status = subscription.status === 'active' ? 'active' : 
                                      subscription.status === 'canceled' ? 'canceled' : 
                                      subscription.status === 'past_due' ? 'past_due' : 'canceled'
                        if(webhookConfig["customer.subscription.updated"]){
                            await webhookConfig["customer.subscription.updated"](supabaseUserId, priceId, status)
                        }
                    }
                } catch (error) {
                    console.error("Error handling customer.subscription.updated:", error)
                }
                break;
            }
                
            case "invoice.payment_action_required":{
                try {
                    console.log("Payment action required")
                    const invoice = event.data.object as Stripe.Invoice
                    const customer_id = invoice.customer as string
                    const supabaseUserId = await this.getSupabaseUserIdByStripeCustomerId(customer_id)
                    const priceId = await this.getPriceID(invoice.id, 'invoice')
                    // email logik
                    if (supabaseUserId && priceId) {
                        if(webhookConfig["invoice.payment_action_required"]){
                            await webhookConfig["invoice.payment_action_required"](supabaseUserId, priceId)
                        } 
                    }
                } catch (error) {
                    console.error("Error handling invoice.payment_action_required:", error)
                }
                break;
            }
                
            case "invoice.paid":{
                try {
                    console.log("Invoice paid")
                    const c2_invoice = event.data.object as Stripe.Invoice
                    const c2_customer_id = c2_invoice.customer as string
                    const supabaseUserId = await this.getSupabaseUserIdByStripeCustomerId(c2_customer_id)
                    const priceId = await this.getPriceID(c2_invoice.id, 'invoice')

                    if (supabaseUserId && priceId) {
                        if(webhookConfig["invoice.paid"]){
                            await webhookConfig["invoice.paid"](supabaseUserId, priceId)
                        } 
                    }
                } catch (error) {
                    console.error("Error handling invoice.paid:", error)
                }
                break;
            }
            case "invoice.payment_failed":{
                try {
                    console.log("Invoice payment failed")
                    const invoice = event.data.object as Stripe.Invoice
                    const customer_id = invoice.customer as string
                    const supabaseUserId = await this.getSupabaseUserIdByStripeCustomerId(customer_id)
                    const priceId = await this.getPriceID(invoice.id, 'invoice')

                    if (supabaseUserId && priceId) {
                        if(webhookConfig["invoice.payment_failed"]){
                            await webhookConfig["invoice.payment_failed"](supabaseUserId, priceId)
                        } 
                    }
                } catch (error) {
                    console.error("Error handling invoice.payment_failed:", error)
                }
                break;
            }
            case "customer.subscription.deleted":{
                try {
                    console.log("Subscription canceled")
                    const subscription = event.data.object as Stripe.Subscription
                    const customer_id = subscription.customer as string
                    const supabaseUserId = await this.getSupabaseUserIdByStripeCustomerId(customer_id)
                    const priceId = await this.getPriceID(subscription.id, 'subscription')

                    if (supabaseUserId && priceId) {
                        if(webhookConfig["customer.subscription.deleted"]){
                            await webhookConfig["customer.subscription.deleted"](supabaseUserId, priceId)
                        }
                    }
                } catch (error) {
                    console.error("Error handling customer.subscription.deleted:", error)
                }
                break;
            }
            
            default:
                console.warn(`Unknown event type: ${event.type}`)
                break;
            }
        
        return NextResponse.json({
            success: true,
            message: "Webhook received successfully",
            event: event.type
        }, { status: 200 })
    }

    private async getSupabaseUserIdByStripeCustomerId(stripeCustomerId: string): Promise<string | null> {
        try {
            const users = await this.dataTable.select({
                columns: ["id" as keyof T],
                where: [{column: "stripe_id" as keyof T, is: stripeCustomerId}]
            })
            if (users && users.length > 0) {
                return (users[0] as any).id as string
            }
            console.warn(`⚠️ No Supabase user found for Stripe customer ID: ${stripeCustomerId}`)
            return null
        } catch (error) {
            console.error("Error finding Supabase user by Stripe customer ID:", error)
            return null
        }
    }

    private async getPriceID(identifier: string, type: 'session' | 'subscription' | 'invoice'): Promise<string | undefined> {
        try {
            if (type === 'session') {
                // Von Session ID
                const session = await this.stripe.checkout.sessions.listLineItems(identifier);
                return session.data[0].price?.id || undefined;
            } else if (type === 'subscription') {
                // Von Subscription ID
                const subscription = await this.stripe.subscriptions.retrieve(identifier);
                return subscription.items.data[0]?.price?.id || undefined;
            } else if (type === 'invoice') {
                // Von Invoice ID
                const invoice = await this.stripe.invoices.retrieve(identifier);
                return (invoice.lines.data[0] as any)?.price?.id || undefined;
            }
        } catch (error) {
            console.error(`Error getting price ID for ${type} ${identifier}:`, error);
        }
        return undefined;
    }
}

/**
 * erstellt einen StripeHandler:
 * @example CONSTRUCTOR:
 *  public products:Record<string,Product>
    public dataTable:SupabaseTable<T>
    private webhook_key:string
    private webhookEventTable?: SupabaseTable<{ event_id: string }>
    private stripe:Stripe

    constructor({
        products,
        dataTable,
        webhookEventTable,
        secret_key = process.env.STRIPE_SECRET_KEY,
        webhook_key = process.env.STRIPE_WEBHOOK_KEY,
    }:StripeProps<T>) {
        if(!secret_key) throw new Error("No secret key provided, check your .env file or give in a value")
        if(!webhook_key) throw new Error("No webhook key provided, check your .env file or give in a value")
        this.products = products
        this.webhook_key = webhook_key
        this.dataTable = dataTable
        this.webhookEventTable = webhookEventTable
        this.stripe = new Stripe(secret_key,{
            apiVersion: "2023-10-16",
            typescript: true
        })
    // an usecase as an example how to initialize the stripe handler:
 * @example export const products = {
    starter: {
        priceId: "price_1234567890",
        name: "Starter",
        description: "Basic plan"
    },
    pro: {
        priceId: "price_1234567890",
        name: "Pro",
        description: "Pro plan"
    },
    enterprise: {
        priceId: "price_1234567890",
        name: "Enterprise",
        description: "Enterprise plan"
    }
}

export const sh = createStripeHandler({
    products: products,
    dataTable: new SupabaseTable<StripeSupabase>("stripe_supabase"),
    webhookEventTable: new SupabaseTable<{ event_id: string }>("stripe_webhook_events")
})
 */
export function createStripeHandler<T extends StripeSupabase>(config: Omit<StripeProps<T>, 'dataTable'> & { dataTable: SupabaseTable<T> }): StripeHandler<T> {
    return new StripeHandler(config)
}




