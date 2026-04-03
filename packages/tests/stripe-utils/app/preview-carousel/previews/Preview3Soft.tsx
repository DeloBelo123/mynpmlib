"use client"

import { motion } from "framer-motion"

const container = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } }
const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }

export default function Preview3Soft() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50/50 to-rose-50 text-slate-800">
            <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Nunito:wght@400;600&display=swap" rel="stylesheet" />
            <header className="px-8 py-5 flex justify-between items-center">
                <span className="text-xl font-semibold text-slate-800" style={{ fontFamily: "'Outfit', sans-serif" }}>QualifyAI</span>
                <nav className="flex gap-6 text-sm text-slate-600" style={{ fontFamily: "'Nunito', sans-serif" }}>
                    <a href="#" className="hover:text-slate-900">Features</a>
                    <a href="#" className="hover:text-slate-900">Pricing</a>
                    <a href="#" className="bg-amber-500 text-white px-5 py-2 rounded-full font-medium hover:bg-amber-600 transition-colors" style={{ fontFamily: "'Outfit', sans-serif" }}>Start free</a>
                </nav>
            </header>

            <motion.section className="px-8 py-20" variants={container} initial="hidden" animate="show">
                <motion.div variants={item} className="inline-block px-4 py-1.5 bg-amber-200/60 rounded-full text-sm text-amber-900 mb-6" style={{ fontFamily: "'Nunito', sans-serif" }}>
                    Für Recruiting Agencies
                </motion.div>
                <motion.h1 variants={item} className="text-4xl md:text-5xl font-bold text-slate-800 leading-tight mb-5 max-w-2xl" style={{ fontFamily: "'Outfit', sans-serif" }}>
                    Kandidaten vorqualifizieren – entspannt & effizient
                </motion.h1>
                <motion.p variants={item} className="text-lg text-slate-600 max-w-lg mb-8" style={{ fontFamily: "'Nunito', sans-serif" }}>
                    AI übernimmt das erste Screening. Du bekommst nur relevante Kandidaten. Mehr Zeit für Menschen, weniger für Mails.
                </motion.p>
                <motion.button variants={item} className="bg-amber-500 text-white px-7 py-3 rounded-full font-medium hover:bg-amber-600 transition-colors shadow-lg shadow-amber-500/25" style={{ fontFamily: "'Outfit', sans-serif" }}>
                    Kostenlos testen
                </motion.button>
            </motion.section>

            <motion.section className="px-8 py-14" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
                <div className="flex flex-wrap gap-12 max-w-3xl">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-amber-200/50 flex items-center justify-center text-xl font-bold text-amber-800" style={{ fontFamily: "'Outfit', sans-serif" }}>73%</div>
                        <div>
                            <p className="font-medium text-slate-800" style={{ fontFamily: "'Outfit', sans-serif" }}>Weniger Screening</p>
                            <p className="text-sm text-slate-500" style={{ fontFamily: "'Nunito', sans-serif" }}>Zeitersparnis</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-rose-200/50 flex items-center justify-center text-xl font-bold text-rose-800" style={{ fontFamily: "'Outfit', sans-serif" }}>3×</div>
                        <div>
                            <p className="font-medium text-slate-800" style={{ fontFamily: "'Outfit', sans-serif" }}>Schnellere Shortlists</p>
                            <p className="text-sm text-slate-500" style={{ fontFamily: "'Nunito', sans-serif" }}>Höherer Output</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-orange-200/50 flex items-center justify-center text-xl font-bold text-orange-800" style={{ fontFamily: "'Outfit', sans-serif" }}>500+</div>
                        <div>
                            <p className="font-medium text-slate-800" style={{ fontFamily: "'Outfit', sans-serif" }}>Vertrauende Agencies</p>
                            <p className="text-sm text-slate-500" style={{ fontFamily: "'Nunito', sans-serif" }}>Branchenweit</p>
                        </div>
                    </div>
                </div>
            </motion.section>
        </div>
    )
}
