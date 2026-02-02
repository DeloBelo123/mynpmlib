import Stripe from "stripe"
import { SupabaseTable } from "@delofarag/supabase-utils"
import { NextRequest, NextResponse } from "next/server"
import {
    type CreateCheckoutSessionProps, 
    type CreateBillingPortalProps,
    type CreateUserProps,
    type StripeSupabase,
    type WebhookConfig,
    type StripeProps,
    type Product,
    type status,
} from "./stripe_types"

export class StripeHandler<T extends StripeSupabase = StripeSupabase> { 
    public products:Record<string,Product>
    public dataTable:SupabaseTable<T>
    private webhook_key:string
    private stripe:Stripe

    constructor({products,secret_key = process.env.STRIPE_SECRET_KEY,webhook_key = process.env.STRIPE_WEBHOOK_KEY,dataTable}:StripeProps<T>) {
        if(!secret_key) throw new Error("No secret key provided, check your .env file or give in a value")
        if(!webhook_key) throw new Error("No webhook key provided, check your .env file or give in a value")
        this.products = products
        this.webhook_key = webhook_key
        this.dataTable = dataTable
        this.stripe = new Stripe(secret_key,{
            apiVersion: "2023-10-16",
            typescript: true
        })

    }
    public async createCheckoutSession({mode = "subscription",productKey,successUrl,cancelUrl,supabaseId}:CreateCheckoutSessionProps) {
        try{
            const productPrice = this.products[productKey]?.priceId

            const user = await this.dataTable.select({
                columns: ["email","stripe_id"],
                where: [{column: "id", is: supabaseId}],
                first:true
            })

            if (!user) throw new Error("No user found with the id: " + supabaseId)
            if (!user.stripe_id) throw new Error("No stripe id found for user with the id: " + supabaseId)
            if (!user.email) throw new Error("No email found for user with the id: " + supabaseId)

            const session = await this.stripe.checkout.sessions.create({
                client_reference_id: supabaseId,
                customer_email: user.email ?? undefined,
                customer: user.stripe_id ?? undefined,

                mode: mode,
                line_items: [{price: productPrice, quantity: 1}],
                success_url: successUrl,
                cancel_url: cancelUrl,
                locale: 'de',

            } as any)
            return session
        }catch(error){
            console.log("Error creating checkout session:", error)
            throw error
        }
    }

    public async createCustomer({email,supabaseId}:CreateUserProps): Promise<{data:any,message:string}|{error:any}> {
        try{
            //check up ob der customer bereits existiert und wenn ja, freu dich
            const existingCustomer_obj = await this.dataTable.select({
                columns: ["stripe_id"],
                where: [{column: "id", is: supabaseId}],
                first:true
            })
            if (existingCustomer_obj?.stripe_id) {
                return {
                    message: "Customer already exists",
                    data: existingCustomer_obj.stripe_id
                }
            }

            //jetzt erstellen wir den customer falls er nicht exestiert
            const customer = await this.stripe.customers.create({
                email: email,
                metadata: { supabaseId: String(supabaseId) }
            })
            await this.dataTable.update({
                where:[{column:"id", is:supabaseId}],
                update:{stripe_id:customer.id} as T
            })
            return {
                message: "Customer created successfully",
                data: customer
            }
        }catch(error){
            console.log("Error creating customer:", error)
            return { error }
        }
    }

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
                error: err instanceof Error ? err.message : "Unknown error"
            }, { status: 500 })
        }

        /* diclaimer: der präfix 'c' steht für 'case' und die numer dahinter welcher case, andere variablen namen wären zu lang */
        switch(event.type){
            case "checkout.session.completed":
                try {
                    console.log("Checkout session completed")
                    const c1_session = event.data.object as Stripe.Checkout.Session
                    const c1_user_id = c1_session.client_reference_id
                    const priceId = await this.getPriceID(c1_session.id, 'session')

                    if (c1_user_id && priceId) {
                        if(webhookConfig["checkout.session.completed"]){
                            await webhookConfig["checkout.session.completed"](c1_user_id, priceId)
                        } else {
                            await this.updateUserAbo(c1_user_id, "active")
                        }
                    }
                } catch (error) {
                    console.error("Error handling checkout.session.completed:", error)
                }
                break;

            case "customer.subscription.created":
                try {
                    console.log("Subscription created")
                    const c5_subscription = event.data.object as Stripe.Subscription
                    const c5_customer_id = c5_subscription.customer as string
                    const supabaseUserId = await this.getSupabaseUserIdByStripeCustomerId(c5_customer_id)
                    const priceId = await this.getPriceID(c5_subscription.id, 'subscription')

                    if (supabaseUserId && priceId) {
                        if(webhookConfig["customer.subscription.created"]){
                            await webhookConfig["customer.subscription.created"](supabaseUserId, priceId)
                        } else {
                            await this.updateUserAbo(supabaseUserId, "active")
                        }
                    }
                } catch (error) {
                    console.error("Error handling customer.subscription.created:", error)
                }
                break;

            case "customer.subscription.updated":
                try {
                    console.log("Subscription updated")
                    const c6_subscription = event.data.object as Stripe.Subscription
                    const c6_customer_id = c6_subscription.customer as string
                    const supabaseUserId = await this.getSupabaseUserIdByStripeCustomerId(c6_customer_id)
                    const priceId = await this.getPriceID(c6_subscription.id, 'subscription')

                    if (supabaseUserId && priceId) {
                        const status = c6_subscription.status === 'active' ? 'active' : 
                                      c6_subscription.status === 'canceled' ? 'canceled' : 
                                      c6_subscription.status === 'past_due' ? 'past_due' : 'canceled'
                        if(webhookConfig["customer.subscription.updated"]){
                            await webhookConfig["customer.subscription.updated"](supabaseUserId, priceId, status)
                        } else {
                            await this.updateUserAbo(supabaseUserId, status)
                        }
                    }
                } catch (error) {
                    console.error("Error handling customer.subscription.updated:", error)
                }
                break;
                
            case "invoice.payment_action_required":
                try {
                    console.log("Payment action required")
                    const c7_invoice = event.data.object as Stripe.Invoice
                    const c7_customer_id = c7_invoice.customer as string
                    const supabaseUserId = await this.getSupabaseUserIdByStripeCustomerId(c7_customer_id)
                    const priceId = await this.getPriceID(c7_invoice.id, 'invoice')
                    // email logik
                    if (supabaseUserId && priceId) {
                        if(webhookConfig["invoice.payment_action_required"]){
                            await webhookConfig["invoice.payment_action_required"](supabaseUserId, priceId)
                        } else {
                            await this.updateUserAbo(supabaseUserId, "past_due")
                        }
                    }
                } catch (error) {
                    console.error("Error handling invoice.payment_action_required:", error)
                }
                break;
                
            case "invoice.paid":
                try {
                    console.log("Invoice paid")
                    const c2_invoice = event.data.object as Stripe.Invoice
                    const c2_customer_id = c2_invoice.customer as string
                    const supabaseUserId = await this.getSupabaseUserIdByStripeCustomerId(c2_customer_id)
                    const priceId = await this.getPriceID(c2_invoice.id, 'invoice')

                    if (supabaseUserId && priceId) {
                        if(webhookConfig["invoice.paid"]){
                            await webhookConfig["invoice.paid"](supabaseUserId, priceId)
                        } else {
                            await this.updateUserAbo(supabaseUserId, "active")
                        }
                    }
                } catch (error) {
                    console.error("Error handling invoice.paid:", error)
                }
                break;
                
            case "invoice.payment_failed":
                try {
                    console.log("Invoice payment failed")
                    const c3_invoice = event.data.object as Stripe.Invoice
                    const c3_customer_id = c3_invoice.customer as string
                    const supabaseUserId = await this.getSupabaseUserIdByStripeCustomerId(c3_customer_id)
                    const priceId = await this.getPriceID(c3_invoice.id, 'invoice')

                    if (supabaseUserId && priceId) {
                        if(webhookConfig["invoice.payment_failed"]){
                            await webhookConfig["invoice.payment_failed"](supabaseUserId, priceId)
                        } else {
                            await this.updateUserAbo(supabaseUserId, "past_due")
                        }
                    }
                } catch (error) {
                    console.error("Error handling invoice.payment_failed:", error)
                }
                break;
                
            case "customer.subscription.deleted":
                try {
                    console.log("Subscription canceled")
                    const c4_subscription = event.data.object as Stripe.Subscription
                    const c4_customer_id = c4_subscription.customer as string
                    const supabaseUserId = await this.getSupabaseUserIdByStripeCustomerId(c4_customer_id)
                    const priceId = await this.getPriceID(c4_subscription.id, 'subscription')

                    if (supabaseUserId && priceId) {
                        if(webhookConfig["customer.subscription.deleted"]){
                            await webhookConfig["customer.subscription.deleted"](supabaseUserId, priceId)
                        } else {
                            await this.updateUserAbo(supabaseUserId, "canceled")
                        }
                    }
                } catch (error) {
                    console.error("Error handling customer.subscription.deleted:", error)
                }
                break;
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

    public async createBillingPortal({supabaseId,returnUrl}:CreateBillingPortalProps){
        try{
            const stripeId_obj = await this.dataTable.select({
                columns:["stripe_id"],
                where: [{column: "id", is: supabaseId}],
                first:true
            })
            if (!stripeId_obj) throw new Error("No stripe id found for user")
            const portal = await this.stripe.billingPortal.sessions.create({
                customer: stripeId_obj.stripe_id,
                return_url: returnUrl
            })
            return portal
        } catch(error){
            console.error("Error creating billing portal:", error)
            throw error
        }
    }

    async updateUserAbo(userId: string, newStatus: status) {
        try {
            await this.dataTable.update({
                where: [{column: "id", is: userId}],
                update: {stripe_subscription: {status: newStatus}} as T
            })
            console.log(`✅ User ${userId} subscription status updated to: ${newStatus}`)
        } catch (error) {
            console.error(`❌ Error updating user ${userId} subscription status:`, error)
            throw error
        }
    }

    private async getSupabaseUserIdByStripeCustomerId(stripeCustomerId: string): Promise<string | null> {
        try {
            const users = await this.dataTable.select({
                columns: ["id" as keyof T],
                where: [{column: "stripe_id" as keyof T, is: stripeCustomerId}]
            })
            if (users && users.length > 0) {
                return (users[0] as any).user_id as string
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

// Factory-Funktion die den Type automatisch aus der SupabaseTable ableitet
export function createStripeHandler<T extends StripeSupabase>(config: Omit<StripeProps<T>, 'dataTable'> & { dataTable: SupabaseTable<T> }): StripeHandler<T> {
    return new StripeHandler(config)
}

