"use client"

import Link from "next/link"
import { motion } from "framer-motion"

const container = { hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } } }
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.5 } } }

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50/50 to-rose-50 text-slate-800">
            <section className="min-h-[calc(100vh-5rem)] flex flex-col items-center justify-center px-6 py-20">
                <motion.div
                    className="max-w-3xl mx-auto text-center"
                    variants={container}
                    initial="hidden"
                    animate="show"
                >
                    <motion.div variants={item} className="inline-block px-4 py-1.5 bg-amber-200/60 rounded-full text-sm text-amber-900 mb-6" style={{ fontFamily: "'Nunito', sans-serif" }}>
                        Für Recruiting Agencies
                    </motion.div>
                    <motion.h1 variants={item} className="text-4xl md:text-6xl font-bold text-slate-800 leading-tight mb-6" style={{ fontFamily: "'Outfit', sans-serif" }}>
                        Kandidaten vorqualifizieren – entspannt & effizient
                    </motion.h1>
                    <motion.p variants={item} className="text-lg md:text-xl text-slate-600 max-w-2xl mx-auto mb-10" style={{ fontFamily: "'Nunito', sans-serif" }}>
                        AI übernimmt das erste Screening. Du bekommst nur relevante Kandidaten. Mehr Zeit für Menschen, weniger für Mails.
                    </motion.p>
                    <motion.div variants={item} className="flex flex-col sm:flex-row gap-4 justify-center">
                        <Link href="/login">
                            <motion.button
                                className="bg-amber-500 text-white px-8 py-3 rounded-full font-medium shadow-lg shadow-amber-500/25 w-full sm:w-auto"
                                style={{ fontFamily: "'Outfit', sans-serif" }}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.98 }}
                            >
                                Kostenlos testen
                            </motion.button>
                        </Link>
                        <Link href="/features">
                            <motion.button
                                className="bg-white/80 text-slate-700 px-8 py-3 rounded-full font-medium border border-slate-200 w-full sm:w-auto"
                                style={{ fontFamily: "'Outfit', sans-serif" }}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                            >
                                Mehr erfahren
                            </motion.button>
                        </Link>
                    </motion.div>
                </motion.div>
            </section>

            <motion.section
                className="py-20 px-6"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.6 }}
            >
                <div className="max-w-4xl mx-auto flex flex-wrap justify-center gap-12 md:gap-16">
                    {[
                        { value: "73%", label: "Weniger Screening", sub: "Zeitersparnis", color: "bg-amber-200/50 text-amber-800" },
                        { value: "3×", label: "Schnellere Shortlists", sub: "Höherer Output", color: "bg-rose-200/50 text-rose-800" },
                        { value: "500+", label: "Vertrauende Agencies", sub: "Branchenweit", color: "bg-orange-200/50 text-orange-800" },
                    ].map((stat, i) => (
                        <motion.div
                            key={stat.label}
                            className="flex items-center gap-4"
                            initial={{ opacity: 0, scale: 0.9 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.1, duration: 0.4 }}
                            whileHover={{ scale: 1.05 }}
                        >
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold ${stat.color}`} style={{ fontFamily: "'Outfit', sans-serif" }}>
                                {stat.value}
                            </div>
                            <div>
                                <p className="font-medium text-slate-800" style={{ fontFamily: "'Outfit', sans-serif" }}>{stat.label}</p>
                                <p className="text-sm text-slate-500" style={{ fontFamily: "'Nunito', sans-serif" }}>{stat.sub}</p>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </motion.section>

            <motion.section
                className="py-24 px-6 bg-white/40"
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
            >
                <div className="max-w-3xl mx-auto text-center">
                    <h2 className="text-2xl md:text-3xl font-bold text-slate-800 mb-4" style={{ fontFamily: "'Outfit', sans-serif" }}>
                        Bereit durchzustarten?
                    </h2>
                    <p className="text-slate-600 mb-8" style={{ fontFamily: "'Nunito', sans-serif" }}>
                        Starte jetzt mit der kostenlosen Testversion – keine Kreditkarte nötig.
                    </p>
                    <Link href="/login">
                        <motion.button
                            className="bg-amber-500 text-white px-8 py-3 rounded-full font-medium shadow-lg shadow-amber-500/25"
                            style={{ fontFamily: "'Outfit', sans-serif" }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.98 }}
                        >
                            Jetzt starten
                        </motion.button>
                    </Link>
                </div>
            </motion.section>
        </div>
    )
}
