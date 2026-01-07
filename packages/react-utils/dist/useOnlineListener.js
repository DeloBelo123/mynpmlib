"use client";
import { useEffect } from "react";
export default function useOnlineListener({ onOnline, onOffline }) {
    useEffect(() => {
        const handleOnline = () => {
            console.log("🌐 User came ONLINE (internet restored)");
            onOnline();
        };
        const handleOffline = () => {
            console.log("📴 User went OFFLINE (internet lost)");
            onOffline();
        };
        const handleFocus = () => {
            console.log("👁️ User focused tab (came back to website)");
            onOnline();
        };
        const handleVisibilityChange = () => {
            if (!document.hidden) {
                console.log("👁️ Tab became visible (user returned)");
                onOnline();
            }
            else {
                console.log("👁️ Tab became hidden (user switched away)");
                onOffline();
            }
        };
        const handleBeforeUnload = (event) => {
            console.log("🚪 User leaving website (tab/browser closing)");
            // Synchron call für beforeunload - async wird ignoriert!
            try {
                onOffline();
            }
            catch (error) {
                console.error("Error in beforeunload:", error);
            }
        };
        // Internet status listeners
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        // Tab focus listeners (user returns to website)
        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        // User leaving website
        window.addEventListener('beforeunload', handleBeforeUnload);
        // Initial status check
        if (navigator.onLine) {
            console.log("🟢 Initial status: ONLINE");
            onOnline();
        }
        else {
            console.log("🔴 Initial status: OFFLINE");
            onOffline();
        }
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('focus', handleFocus);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [onOnline, onOffline]);
}
//# sourceMappingURL=useOnlineListener.js.map