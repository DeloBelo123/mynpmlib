"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Preview1Editorial from "./previews/Preview1Editorial"
import Preview2Brutalist from "./previews/Preview2Brutalist"
import Preview3Soft from "./previews/Preview3Soft"
import Preview4Industrial from "./previews/Preview4Industrial"

const PREVIEWS = [
    { id: 1, name: "Editorial", component: Preview1Editorial },
    { id: 2, name: "Brutalist", component: Preview2Brutalist },
    { id: 3, name: "Soft", component: Preview3Soft },
    { id: 4, name: "Industrial", component: Preview4Industrial },
]

export default function PreviewCarouselPage() {
    const [active, setActive] = useState(0)
    const Component = PREVIEWS[active].component

    return (
        <div className="relative">
            <AnimatePresence mode="wait">
                <motion.div
                    key={active}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                >
                    <Component />
                </motion.div>
            </AnimatePresence>

            <div className="fixed bottom-6 right-6 flex gap-2 z-50">
                {PREVIEWS.map((p, i) => (
                    <button
                        key={p.id}
                        onClick={() => setActive(i)}
                        className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                            active === i
                                ? "bg-slate-900 text-white scale-110 shadow-lg"
                                : "bg-white/80 text-slate-600 hover:bg-white hover:scale-105 shadow"
                        }`}
                        aria-label={`Preview ${i + 1}: ${p.name}`}
                        title={p.name}
                    >
                        {i + 1}
                    </button>
                ))}
            </div>

            <div className="fixed bottom-6 left-6 text-xs text-slate-500 z-50 bg-white/70 px-2 py-1 rounded">
                {PREVIEWS[active].name} • Preview {active + 1}/{PREVIEWS.length}
            </div>
        </div>
    )
}
