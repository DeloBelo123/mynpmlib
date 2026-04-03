"use client"

import { motion } from "framer-motion"

const features = [
    {
        title: "AI Pre-Screening",
        desc: "Unsere KI analysiert Bewerbungen automatisch und filtert nach Relevanz. Du siehst nur Kandidaten, die wirklich passen.",
        icon: "✓",
    },
    {
        title: "Shortlists in Minuten",
        desc: "Statt stundenlang CVs zu sichten: AI erstellt dir priorisierte Shortlists. Schneller zu den richtigen Gesprächen.",
        icon: "⚡",
    },
    {
        title: "Integration in deinen Workflow",
        desc: "Einfache Anbindung an ATS und E-Mail. Kein kompletter Neustart – QualifyAI ergänzt deine bestehenden Tools.",
        icon: "🔗",
    },
]

const container = { hidden: {}, show: { transition: { staggerChildren: 0.1 } } }
const item = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } }

export default function FeaturesPage() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50/50 to-rose-50">
            <section className="py-20 px-6">
                <motion.div
                    className="max-w-4xl mx-auto text-center"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                >
                    <h1 className="text-4xl md:text-5xl font-bold text-slate-800 mb-6" style={{ fontFamily: "'Outfit', sans-serif" }}>
                        Features, die Recruiting vereinfachen
                    </h1>
                    <p className="text-lg text-slate-600 max-w-2xl mx-auto" style={{ fontFamily: "'Nunito', sans-serif" }}>
                        Weniger manuelles Screening, mehr Fokus auf das, was zählt: die richtigen Kandidaten finden und platzieren.
                    </p>
                </motion.div>
            </section>

            <section className="py-12 px-6 pb-24">
                <motion.div
                    className="max-w-4xl mx-auto space-y-12"
                    variants={container}
                    initial="hidden"
                    whileInView="show"
                    viewport={{ once: true, margin: "-50px" }}
                >
                    {features.map((f, i) => (
                        <motion.div
                            key={f.title}
                            variants={item}
                            className="bg-white/70 rounded-3xl p-8 shadow-sm border border-slate-100"
                            whileHover={{ scale: 1.02, boxShadow: "0 20px 40px -15px rgba(0,0,0,0.08)" }}
                            transition={{ type: "spring", stiffness: 300 }}
                        >
                            <div className="flex gap-6 items-start">
                                <motion.span
                                    className="w-14 h-14 rounded-2xl bg-amber-200/60 flex items-center justify-center text-2xl flex-shrink-0"
                                    initial={{ scale: 0 }}
                                    whileInView={{ scale: 1 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: 0.2 + i * 0.1 }}
                                >
                                    {f.icon}
                                </motion.span>
                                <div>
                                    <h2 className="text-xl font-bold text-slate-800 mb-2" style={{ fontFamily: "'Outfit', sans-serif" }}>
                                        {f.title}
                                    </h2>
                                    <p className="text-slate-600 leading-relaxed" style={{ fontFamily: "'Nunito', sans-serif" }}>
                                        {f.desc}
                                    </p>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </motion.div>
            </section>
        </div>
    )
}
