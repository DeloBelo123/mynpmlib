"use client"

import { motion } from "framer-motion"

const container = { hidden: {}, show: { transition: { staggerChildren: 0.1 } } }
const fadeUp = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 0.5 } } }

export default function Preview1Editorial() {
    return (
        <div className="min-h-screen bg-[#faf8f5] text-[#1a1915] font-['DM_Sans',sans-serif]">
            <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=Playfair+Display:ital,wght@0,400;0,600;0,700&display=swap" rel="stylesheet" />
            <header className="px-8 py-6 flex justify-between items-center border-b border-[#1a1915]/10">
                <span className="text-xl font-semibold tracking-tight" style={{ fontFamily: "'Playfair Display', serif" }}>QualifyAI</span>
                <nav className="flex gap-8 text-sm font-medium text-[#1a1915]/70">
                    <a href="#">Features</a>
                    <a href="#">Pricing</a>
                    <a href="#">Login</a>
                    <button className="bg-[#1a1915] text-[#faf8f5] px-5 py-2 rounded-sm">Get Started</button>
                </nav>
            </header>

            <motion.section className="px-8 py-24 max-w-4xl" initial="hidden" animate="show" variants={container}>
                <motion.p variants={fadeUp} className="text-sm uppercase tracking-[0.2em] text-[#1a1915]/60 mb-4">AI-Powered Pre-Qualification</motion.p>
                <motion.h1 variants={fadeUp} className="text-5xl md:text-6xl leading-[1.1] mb-6" style={{ fontFamily: "'Playfair Display', serif" }}>
                    Candidates, pre-qualified.<br />Recruiting, reimagined.
                </motion.h1>
                <motion.p variants={fadeUp} className="text-lg text-[#1a1915]/70 max-w-xl mb-10">
                    Für Recruiting Agencies: AI sortiert Kandidaten nach Relevanz. Weniger Screening, mehr Platzierungen.
                </motion.p>
                <motion.button variants={fadeUp} className="bg-[#1a1915] text-[#faf8f5] px-8 py-3 text-sm font-medium rounded-sm hover:bg-[#2d2a24] transition-colors">
                    Demo anfragen
                </motion.button>
            </motion.section>

            <motion.section className="px-8 py-16 border-t border-[#1a1915]/10" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
                <div className="flex gap-16 max-w-4xl">
                    <div>
                        <span className="text-3xl font-semibold" style={{ fontFamily: "'Playfair Display', serif" }}>73%</span>
                        <p className="text-sm text-[#1a1915]/60 mt-1">weniger Screening-Zeit</p>
                    </div>
                    <div>
                        <span className="text-3xl font-semibold" style={{ fontFamily: "'Playfair Display', serif" }}>3x</span>
                        <p className="text-sm text-[#1a1915]/60 mt-1">schnellere Shortlists</p>
                    </div>
                    <div>
                        <span className="text-3xl font-semibold" style={{ fontFamily: "'Playfair Display', serif" }}>500+</span>
                        <p className="text-sm text-[#1a1915]/60 mt-1">Agencies nutzen QualifyAI</p>
                    </div>
                </div>
            </motion.section>
        </div>
    )
}
