"use client"
//sehr simple komponente, die aber für 90% der anwendungen reicht 

/* WICHTIG!: listenTo und intervall sind extra als parameter vertausch weil man viel öfter einen speziellen
Intervall nutzen wollen würde, als einen anderen wert als den default von listenTo */

import {  useScroll } from "framer-motion"
import { useTransform } from "framer-motion"

type scrollMation = [number,number]

export default function useScrollmation(intervall:scrollMation = [0,100],listenTo:scrollMation = [0,1]) {
    const { scrollYProgress } = useScroll()
    const value = useTransform(scrollYProgress, listenTo, intervall)
    return value
}
