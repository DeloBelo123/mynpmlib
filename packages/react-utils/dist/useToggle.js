"use client";
import { useState } from "react";
export default function useToggle(wert) {
    const [toggled, isToggled] = useState(wert);
    function Toggler() {
        isToggled(toggled => !toggled);
    }
    return [toggled, Toggler];
}
//# sourceMappingURL=useToggle.js.map