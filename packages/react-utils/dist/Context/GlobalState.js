"use client";
/*
    META-MODULE: ändere den generic type deines createContext zu dem was du brauchst!!! von projekt zu projekt anders!!!
 */
import React, { createContext, useContext, useState } from "react";
export const SharedState = createContext(undefined); // ÄNDERE DAS PRO PROJEKT!!! von 'any' zu dem was du brauchst!!!
export function GlobalState({ children, initial }) {
    const [sharedState, setSharedState] = useState(initial);
    return (React.createElement(SharedState.Provider, { value: { sharedState, setSharedState } }, children));
}
export function useSharedState() {
    const context = useContext(SharedState);
    if (!context)
        throw new Error("ContextError! Du kannst shared state nur innerhalb eines global providers nutzen!!!");
    return context;
}
//# sourceMappingURL=GlobalState.js.map