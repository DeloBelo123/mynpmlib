"use client";
import { useEffect, useState } from "react";
export default function useOnlineStatus() {
    const [isOnline, setIsOnline] = useState(true);
    useEffect(() => {
        function updateOnlineStatus() {
            setIsOnline(navigator.onLine);
        }
        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);
        return () => {
            window.removeEventListener('online', updateOnlineStatus);
            window.removeEventListener('offline', updateOnlineStatus);
        };
    }, []);
    return isOnline;
}
//# sourceMappingURL=useOnlineStatus.js.map