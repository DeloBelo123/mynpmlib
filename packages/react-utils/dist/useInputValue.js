"use client";
import { useState } from "react";
export default function useInputValue(initialValue = undefined) {
    const [inputValue, setInputValue] = useState(initialValue);
    function handleChange(e) {
        setInputValue(e.target.value);
    }
    return [inputValue, handleChange];
}
//# sourceMappingURL=useInputValue.js.map