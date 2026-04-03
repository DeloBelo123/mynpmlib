"use client"

import Link from "next/link"
import { motion } from "framer-motion"

export default function Footer() {
    return (
        <motion.footer
            className="border-t border-slate-200/60 py-12"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
        >
            <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
                <span className="text-slate-700 font-semibold" style={{ fontFamily: "'Outfit', sans-serif" }}>QualifyAI</span>
                <div className="flex gap-8 text-sm text-slate-500" style={{ fontFamily: "'Nunito', sans-serif" }}>
                    <Link href="/features" className="hover:text-slate-800 transition-colors">Features</Link>
                    <Link href="/pricing" className="hover:text-slate-800 transition-colors">Pricing</Link>
                    <Link href="/about" className="hover:text-slate-800 transition-colors">About</Link>
                    <Link href="/login" className="hover:text-slate-800 transition-colors">Login</Link>
                </div>
            </div>
        </motion.footer>
    )
}
