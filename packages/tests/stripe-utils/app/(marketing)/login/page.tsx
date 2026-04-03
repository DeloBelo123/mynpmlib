"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { useState } from "react"

export default function LoginPage() {
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")

    return (
        <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50/50 to-rose-50 flex items-center justify-center px-6 py-20">
            <motion.div
                className="w-full max-w-md"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
            >
                <div className="bg-white/80 rounded-3xl p-8 shadow-lg border border-slate-100">
                    <h1 className="text-2xl font-bold text-slate-800 mb-2 text-center" style={{ fontFamily: "'Outfit', sans-serif" }}>
                        Willkommen zurück
                    </h1>
                    <p className="text-slate-600 text-center mb-8" style={{ fontFamily: "'Nunito', sans-serif" }}>
                        Melde dich an, um fortzufahren
                    </p>

                    <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
                        <motion.div
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.1 }}
                        >
                            <label className="block text-sm font-medium text-slate-700 mb-2" style={{ fontFamily: "'Outfit', sans-serif" }}>
                                E-Mail
                            </label>
                            <input
                                type="email"
                                placeholder="deine@email.de"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white/80 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all"
                            />
                        </motion.div>
                        <motion.div
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.2 }}
                        >
                            <label className="block text-sm font-medium text-slate-700 mb-2" style={{ fontFamily: "'Outfit', sans-serif" }}>
                                Passwort
                            </label>
                            <input
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white/80 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all"
                            />
                        </motion.div>

                        <motion.button
                            type="submit"
                            className="w-full bg-amber-500 text-white py-3 rounded-full font-medium mt-6"
                            style={{ fontFamily: "'Outfit', sans-serif" }}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                        >
                            Anmelden
                        </motion.button>
                    </form>

                    <p className="text-center text-sm text-slate-500 mt-6" style={{ fontFamily: "'Nunito', sans-serif" }}>
                        Noch kein Konto?{" "}
                        <Link href="#" className="text-amber-600 font-medium hover:text-amber-700">
                            Registrieren
                        </Link>
                    </p>
                </div>
            </motion.div>
        </div>
    )
}
