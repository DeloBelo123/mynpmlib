"use client"

import { motion } from "framer-motion"

export default function Preview2Brutalist() {
    return (
        <div className="min-h-screen bg-black text-white font-mono">
            <link href="https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700&display=swap" rel="stylesheet" />
            <header className="px-6 py-5 flex justify-between items-center border-b-2 border-white">
                <span className="text-lg font-bold tracking-tighter" style={{ fontFamily: "'Space Mono', monospace" }}>QUALIFY.AI</span>
                <nav className="flex gap-6 text-xs uppercase tracking-widest">
                    <a href="#" className="hover:underline">Features</a>
                    <a href="#" className="hover:underline">Pricing</a>
                    <a href="#" className="border-2 border-white px-4 py-2 hover:bg-white hover:text-black transition-colors">START</a>
                </nav>
            </header>

            <motion.section
                className="px-6 py-20"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4 }}
            >
                <div className="max-w-2xl">
                    <p className="text-xs text-white/60 mb-4">RECRUITING AGENCIES</p>
                    <h1 className="text-4xl md:text-5xl font-bold leading-none mb-6" style={{ fontFamily: "'Space Mono', monospace" }}>
                        CANDIDATES.<br />
                        PRE-QUALIFIED.<br />
                        AUTOMATED.
                    </h1>
                    <p className="text-sm text-white/70 max-w-md mb-8">
                        AI screent Bewerber vor. Du platzierst. Keine Zeit verschwenden.
                    </p>
                    <button className="bg-white text-black px-6 py-3 text-xs font-bold uppercase tracking-widest hover:bg-white/90 transition-colors">
                        Request Access
                    </button>
                </div>
            </motion.section>

            <motion.section
                className="px-6 py-12 border-t-2 border-white"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
            >
                <div className="grid grid-cols-3 gap-8 max-w-2xl">
                    <div className="border-l-2 border-white pl-4">
                        <span className="text-2xl font-bold" style={{ fontFamily: "'Space Mono', monospace" }}>73%</span>
                        <p className="text-xs text-white/60 mt-1">LESS SCREENING</p>
                    </div>
                    <div className="border-l-2 border-white pl-4">
                        <span className="text-2xl font-bold" style={{ fontFamily: "'Space Mono', monospace" }}>3X</span>
                        <p className="text-xs text-white/60 mt-1">FASTER SHORTLISTS</p>
                    </div>
                    <div className="border-l-2 border-white pl-4">
                        <span className="text-2xl font-bold" style={{ fontFamily: "'Space Mono', monospace" }}>500+</span>
                        <p className="text-xs text-white/60 mt-1">AGENCIES</p>
                    </div>
                </div>
            </motion.section>
        </div>
    )
}
