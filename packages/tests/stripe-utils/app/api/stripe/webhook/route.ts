import { NextRequest } from "next/server"
import { stripeHandler as sh } from "../../config"

export async function POST(req: NextRequest){
    return await sh.handleWebhook({ req, webhookConfig:{
        "invoice.paid": async(userId,priceId) => {
            console.log("--------------------------------")
            console.log(`invoice.paid: user id ${userId} paid for price ${priceId}`)
            console.log("--------------------------------")
        },
        "invoice.payment_failed": async(userId,priceId) => {
            console.log("--------------------------------")
            console.log(`invoice.payment_failed: user id ${userId} failed to pay for price ${priceId}`)
            console.log("--------------------------------")
        },
        "invoice.payment_action_required": async(userId,priceId) => {
            console.log("--------------------------------")
            console.log(`invoice.payment_action_required: user id ${userId} needs to take action for price ${priceId}`)
            console.log("--------------------------------")
        },
        "checkout.session.completed": async(userId,priceId) => {
            console.log("--------------------------------")
            console.log(`checkout.session.completed: user id ${userId} completed checkout for price ${priceId}`)
            console.log("--------------------------------")
        },
        "customer.subscription.created": async(userId,priceId) => {
            console.log("--------------------------------")
            console.log(`customer.subscription.created: user id ${userId} created subscription for price ${priceId}`)
            console.log("--------------------------------")
        },
        "customer.subscription.updated": async(userId,priceId) => {
            console.log("--------------------------------")
            console.log(`customer.subscription.updated: user id ${userId} updated subscription for price ${priceId}`)
            console.log("--------------------------------")
        },
        "customer.subscription.deleted": async(userId,priceId) => {
            console.log("--------------------------------")
            console.log(`customer.subscription.deleted: user id ${userId} deleted subscription for price ${priceId}`)
            console.log("--------------------------------")
        }
    }})
}