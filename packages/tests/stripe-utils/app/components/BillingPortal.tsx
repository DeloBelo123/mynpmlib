"use client"
import { handleBillingPortal } from "@delofarag/stripe-utils/client"

export default function BillingPortal() {
    async function func(){
        await handleBillingPortal({ returnEndpoint:"/success" })
    }
    return (
        <button className="bg-blue-500 text-white p-2 rounded-md" onClick={func}>
            Billing Portal
        </button>
    )
}