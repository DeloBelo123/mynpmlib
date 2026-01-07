"use client"
import { useEffect, useState } from "react";

export default function useOnlineStatus(){
    const [isOnline, setIsOnline] = useState<boolean>(true) 
    useEffect(() => {
        function updateOnlineStatus(){
            setIsOnline(navigator.onLine);
        }
        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);

        return () => {
            window.removeEventListener('online', updateOnlineStatus);
            window.removeEventListener('offline', updateOnlineStatus);
        };
    }, []);
    return isOnline
}