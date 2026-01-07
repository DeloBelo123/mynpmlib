"use client"
/*
    META-MODULE: ändere den generic type deines createContext zu dem was du brauchst!!! von projekt zu projekt anders!!!
 */
import React, { createContext,ReactNode,useContext,useState } from "react"
import { type Dispatch,SetStateAction } from "react"
interface sharedStateType<T>{
    sharedState:T
    setSharedState:Dispatch<SetStateAction<T>>
}
export const SharedState = createContext<sharedStateType<any> | undefined>(undefined) // ÄNDERE DAS PRO PROJEKT!!! von 'any' zu dem was du brauchst!!!

export function GlobalState({children,initial}:{children:ReactNode,initial?:any}){
    const [sharedState, setSharedState] = useState(initial)
    return(
        <SharedState.Provider value={{sharedState,setSharedState}}>
            {children}
        </SharedState.Provider>
    )
}
export function useSharedState(){
    const context = useContext(SharedState) 
    if(!context) 
        throw new Error("ContextError! Du kannst shared state nur innerhalb eines global providers nutzen!!!")
    return context
}
