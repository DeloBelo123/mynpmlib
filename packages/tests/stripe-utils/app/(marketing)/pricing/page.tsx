"use client"

import Link from "next/link"
import { motion } from "framer-motion"

const cardVariants = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } }
const plans = [
    {
        name: "Starter",
        price: "49",
        period: "Monat",
        desc: "Für kleine Agencies und Teams",
        features: ["Bis 100 Kandidaten/Monat", "AI Pre-Screening", "E-Mail Support"],
        cta: "Starten",
        highlight: false,
    },
    {
        name: "Pro",
        price: "149",
        period: "Monat",
        desc: "Für wachsende Recruiting-Teams",
        features: ["Bis 500 Kandidaten/Monat", "AI Pre-Screening", "ATS-Integration", "Prioritäts-Support"],
        cta: "Kostenlos testen",
        highlight: true,
    },
    {
        name: "Enterprise",
        price: "Individuell",
        period: "",
        desc: "Für große Organisationen",
        features: ["Unbegrenzte Kandidaten", "Custom Integration", "Dedizierter Account Manager", "SLA"],
        cta: "Kontakt",
        highlight: false,
    },
]

export default function PricingPage() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50/50 to-rose-50">
            <section className="py-20 px-6">
                <motion.div
                    className="max-w-4xl mx-auto text-center mb-16"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                >
                    <h1 className="text-4xl md:text-5xl font-bold text-slate-800 mb-6" style={{ fontFamily: "'Outfit', sans-serif" }}>
                        Transparente Preise
                    </h1>
                    <p className="text-lg text-slate-600 max-w-2xl mx-auto" style={{ fontFamily: "'Nunito', sans-serif" }}>
                        Wähle den Plan, der zu deiner Agency passt. Jederzeit kündbar.
                    </p>
                </motion.div>

                <motion.div
                    className="max-w-5xl mx-auto grid md:grid-cols-3 gap-6"
                    initial="hidden"
                    animate="show"
                    variants={{ show: { transition: { staggerChildren: 0.15 } } }}
                >
                    {plans.map((plan) => (
                        <motion.div
                            key={plan.name}
                            variants={cardVariants}
                            className={plan.highlight
                                ? "rounded-3xl p-8 bg-amber-500 text-white shadow-xl shadow-amber-500/30 md:scale-105"
                                : "rounded-3xl p-8 bg-white/80 border border-slate-100 shadow-sm"}
                            whileHover={{ y: -4, transition: { duration: 0.2 } }}
                        >
                            <h2 className="text-xl font-bold mb-2" style={{ fontFamily: "'Outfit', sans-serif" }}>
                                {plan.name}
                            </h2>
                            <p className={`text-sm mb-6 ${plan.highlight ? "text-amber-100" : "text-slate-500"}`} style={{ fontFamily: "'Nunito', sans-serif" }}>
                                {plan.desc}
                            </p>
                            <div className="mb-6">
                                <span className="text-3xl font-bold" style={{ fontFamily: "'Outfit', sans-serif" }}>
                                    {plan.price}
                                </span>
                                {plan.period && (
                                    <span className={plan.highlight ? "text-amber-100" : "text-slate-500"} style={{ fontFamily: "'Nunito', sans-serif" }}>
                                        {" "}/ {plan.period}
                                    </span>
                                )}
                            </div>
                            <ul className="space-y-3 mb-8" style={{ fontFamily: "'Nunito', sans-serif" }}>
                                {plan.features.map((f) => (
                                    <li key={f} className="flex gap-2">
                                        <span>✓</span>
                                        <span className={plan.highlight ? "text-amber-50" : "text-slate-600"}>{f}</span>
                                    </li>
                                ))}
                            </ul>
                            <Link href="/login">
                                <motion.button
                                    className={`w-full py-3 rounded-full font-medium ${
                                        plan.highlight
                                            ? "bg-white text-amber-600"
                                            : "bg-amber-500 text-white"
                                    }`}
                                    style={{ fontFamily: "'Outfit', sans-serif" }}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                >
                                    {plan.cta}
                                </motion.button>
                            </Link>
                        </motion.div>
                    ))}
                </motion.div>
            </section>
        </div>
    )
}
