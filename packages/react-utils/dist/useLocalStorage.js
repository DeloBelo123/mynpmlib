import { useState, useEffect } from "react";
export function useLocalStorage(key, initialValue) {
    // State für aktuellen Wert
    const [value, setValue] = useState(() => {
        // SSR-Check: window existiert nicht auf dem Server
        if (typeof window === "undefined")
            return initialValue;
        try {
            const item = window.localStorage.getItem(key);
            return item ? JSON.parse(item) : initialValue;
        }
        catch {
            return initialValue;
        }
    });
    // Schreibe Änderungen in localStorage
    useEffect(() => {
        if (typeof window === "undefined")
            return;
        try {
            window.localStorage.setItem(key, JSON.stringify(value));
        }
        catch (err) {
            console.warn("useLocalStorage: Error writing to localStorage", err);
        }
    }, [key, value]);
    return [value, setValue];
}
//# sourceMappingURL=useLocalStorage.js.map