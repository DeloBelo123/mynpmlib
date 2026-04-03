"use client"

import { motion } from "framer-motion"

const itemVariants = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }
const values = [
    { title: "Einfachheit", desc: "Komplexe AI – simple Nutzung. Keine Schulungen nötig." },
    { title: "Transparenz", desc: "Klare Preise, klare Prozesse. Keine versteckten Kosten." },
    { title: "Recruiting first", desc: "Gebaut von Recruitern für Recruiter." },
]

export default function AboutPage() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50/50 to-rose-50">
            <section className="py-20 px-6">
                <motion.div
                    className="max-w-3xl mx-auto text-center"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                >
                    <h1 className="text-4xl md:text-5xl font-bold text-slate-800 mb-6" style={{ fontFamily: "'Outfit', sans-serif" }}>
                        Über QualifyAI
                    </h1>
                    <p className="text-lg text-slate-600 leading-relaxed" style={{ fontFamily: "'Nunito', sans-serif" }}>
                        Wir entwickeln AI-Tools, die Recruiting Agencies dabei helfen, Kandidaten schneller und besser zu bewerten.
                        QualifyAI entstand aus der Erfahrung: Zu viel Zeit geht für manuelles Screening drauf – Zeit,
                        die du besser mit echten Gesprächen verbringst.
                    </p>
                </motion.div>
            </section>

            <section className="py-12 px-6 pb-24">
                <motion.div
                    className="max-w-4xl mx-auto grid md:grid-cols-3 gap-8"
                    initial="hidden"
                    whileInView="show"
                    viewport={{ once: true }}
                    variants={{ show: { transition: { staggerChildren: 0.15 } } }}
                >
                    {values.map((v) => (
                        <motion.div
                            key={v.title}
                            variants={itemVariants}
                            className="bg-white/70 rounded-2xl p-6 text-center border border-slate-100"
                            whileHover={{ y: -6 }}
                            transition={{ type: "spring", stiffness: 300 }}
                        >
                            <h2 className="text-xl font-bold text-slate-800 mb-2" style={{ fontFamily: "'Outfit', sans-serif" }}>
                                {v.title}
                            </h2>
                            <p className="text-slate-600" style={{ fontFamily: "'Nunito', sans-serif" }}>
                                {v.desc}
                            </p>
                        </motion.div>
                    ))}
                </motion.div>
            </section>
        </div>
    )
}
