"use client"
import LoginForm from "./components/LoginForm"
import CheckoutButton from "./components/CheckoutButton"
import BillingPortal from "./components/BillingPortal"
import { useEffect } from "react"
import { getUser } from "@delofarag/supabase-utils/client"

export default function Main() {
  useEffect(()=>{
    getUser().then((user)=>{
      console.log("user: ", user.id)
    })
  })
  return (
    <div className="p-6 flex flex-col gap-6">
      <LoginForm />
      <CheckoutButton productKey="lifetime" />
      <BillingPortal />
    </div>
  )
}
