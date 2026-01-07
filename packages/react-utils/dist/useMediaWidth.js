"use client";
import { useState, useEffect } from "react";
export default function useMediaWidth() {
    const [width, setWidth] = useState(0);
    useEffect(() => {
        function sizehandler() {
            setWidth(window.innerWidth);
        }
        window.addEventListener("resize", sizehandler);
        sizehandler();
        return () => {
            window.removeEventListener("resize", sizehandler);
        };
    }, []);
    return width;
}
//# sourceMappingURL=useMediaWidth.js.map