"use client"
import { handleCheckoutSession } from "@delofarag/stripe-utils/client"
export default function CheckoutButton({productKey}: {productKey: string}) {
    async function func(){
        await handleCheckoutSession({ mode:productKey === "lifetime" ? "payment" : "subscription", productKey:productKey,successEndpoint:"/success",cancelEndpoint:"/cancel"})
    }
    return (
        <button className="bg-blue-500 text-white p-2 rounded-md" onClick={func}>
            Checkout
        </button>
    )
}