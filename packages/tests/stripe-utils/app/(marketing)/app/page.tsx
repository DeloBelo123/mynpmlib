"use client"

import LoginForm from "../../components/LoginForm"
import CheckoutButton from "../../components/CheckoutButton"
import BillingPortal from "../../components/BillingPortal"

export default function AppPage() {
    return (
        <div className="min-h-screen bg-slate-50 p-6 flex flex-col gap-6 max-w-2xl mx-auto">
            <h1 className="text-xl font-semibold">Stripe / Supabase Test</h1>
            <LoginForm />
            <CheckoutButton productKey="lifetime" />
            <BillingPortal />
        </div>
    )
}
