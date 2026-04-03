"use client"

import { motion } from "framer-motion"

export default function Preview4Industrial() {
    return (
        <div className="min-h-screen bg-slate-950 text-slate-100">
            <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
            <header className="px-8 py-5 flex justify-between items-center border-b border-slate-700/50">
                <span className="text-sm font-mono text-cyan-400 tracking-wider">QUALIFY_AI</span>
                <nav className="flex gap-8 text-sm text-slate-400">
                    <a href="#" className="hover:text-slate-200">Features</a>
                    <a href="#" className="hover:text-slate-200">Pricing</a>
                    <a href="#" className="text-cyan-400 font-mono">login()</a>
                    <button className="bg-cyan-500/20 text-cyan-400 px-4 py-2 rounded border border-cyan-500/50 font-mono text-xs hover:bg-cyan-500/30 transition-colors">init_demo()</button>
                </nav>
            </header>

            <motion.section
                className="px-8 py-20 relative overflow-hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
            >
                <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,rgba(34,211,238,0.03)_50%,transparent_100%)] pointer-events-none" />
                <div className="max-w-3xl relative">
                    <p className="text-xs text-cyan-400/80 font-mono mb-4">{"// AI Pre-Qualification Engine"}</p>
                    <h1 className="text-4xl md:text-5xl font-semibold text-slate-100 mb-5" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        Candidates → Filtered.<br />
                        Recruiting → Optimized.
                    </h1>
                    <p className="text-slate-400 max-w-lg mb-8 text-sm leading-relaxed">
                        Für Recruiting Agencies. AI analysiert Bewerber, liefert Shortlists. Weniger manuelles Screening, mehr Platzierungen.
                    </p>
                    <button className="bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 px-5 py-2.5 rounded font-mono text-sm hover:bg-cyan-500/30 transition-colors">
                        request_demo()
                    </button>
                </div>
            </motion.section>

            <motion.section
                className="px-8 py-12 border-t border-slate-700/50"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
            >
                <div className="grid grid-cols-3 gap-6 max-w-2xl">
                    <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/30">
                        <span className="text-2xl font-mono text-cyan-400" style={{ fontFamily: "'JetBrains Mono', monospace" }}>0.73</span>
                        <p className="text-xs text-slate-500 mt-1 font-mono">screening_time_reduction</p>
                    </div>
                    <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/30">
                        <span className="text-2xl font-mono text-cyan-400" style={{ fontFamily: "'JetBrains Mono', monospace" }}>3x</span>
                        <p className="text-xs text-slate-500 mt-1 font-mono">shortlist_speed</p>
                    </div>
                    <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/30">
                        <span className="text-2xl font-mono text-cyan-400" style={{ fontFamily: "'JetBrains Mono', monospace" }}>500+</span>
                        <p className="text-xs text-slate-500 mt-1 font-mono">active_agencies</p>
                    </div>
                </div>
            </motion.section>
        </div>
    )
}
