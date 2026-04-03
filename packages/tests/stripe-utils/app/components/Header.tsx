"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion } from "framer-motion"

export default function Header() {
    const pathname = usePathname()
    const nav = [
        { href: "/", label: "Home" },
        { href: "/features", label: "Features" },
        { href: "/pricing", label: "Pricing" },
        { href: "/about", label: "About" },
    ]

    return (
        <motion.header
            className="fixed top-0 left-0 right-0 z-50 px-6 py-5 flex justify-center bg-amber-50/80 backdrop-blur-sm border-b border-slate-200/30"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
        >
            <div className="w-full max-w-6xl flex justify-between items-center">
                <Link href="/" className="text-xl font-semibold text-slate-800" style={{ fontFamily: "'Outfit', sans-serif" }}>
                    QualifyAI
                </Link>
                <nav className="flex gap-8 text-sm text-slate-600" style={{ fontFamily: "'Nunito', sans-serif" }}>
                    {nav.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`hover:text-slate-900 transition-colors ${pathname === item.href ? "font-semibold text-slate-900" : ""}`}
                        >
                            {item.label}
                        </Link>
                    ))}
                    <Link
                        href="/login"
                        className="bg-amber-500 text-white px-5 py-2 rounded-full font-medium hover:bg-amber-600 transition-all hover:scale-105"
                        style={{ fontFamily: "'Outfit', sans-serif" }}
                    >
                        Login
                    </Link>
                </nav>
            </div>
        </motion.header>
    )
}
