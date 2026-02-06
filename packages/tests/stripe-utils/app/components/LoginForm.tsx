"use client"

import { createBrowserClient } from "@supabase/ssr"
import { useState } from "react"

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function LoginForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null)

  async function handleSignUp() {
    setMessage(null)
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) {
      setMessage({ type: "error", text: error.message })
      return
    }
    setMessage({ type: "ok", text: "Account erstellt. Prüfe deine E-Mails (Bestätigung)." })
  }

  async function handleSignIn() {
    setMessage(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setMessage({ type: "error", text: error.message })
      return
    }
    setMessage({ type: "ok", text: "Eingeloggt." })
  }

  return (
    <div className="flex flex-col gap-3 w-80">
      <input
        type="email"
        placeholder="E-Mail"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded border px-3 py-2"
      />
      <input
        type="password"
        placeholder="Passwort"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="rounded border px-3 py-2"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSignIn}
          className="rounded border px-4 py-2 bg-black text-white"
        >
          Anmelden
        </button>
        <button
          type="button"
          onClick={handleSignUp}
          className="rounded border px-4 py-2"
        >
          Registrieren
        </button>
      </div>
      {message && (
        <p className={message.type === "error" ? "text-red-600 text-sm" : "text-green-600 text-sm"}>
          {message.text}
        </p>
      )}
    </div>
  )
}
