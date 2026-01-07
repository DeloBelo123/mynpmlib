"use client"
import { useState } from "react";
export default function useInputValue(initialValue:string | undefined = undefined):[string | undefined,(e:React.ChangeEvent<HTMLInputElement>)=>void]{ // ich mache hier motto ein tuplet wo ich sagen was genau die types vom returnten array sind
    const [inputValue,setInputValue] = useState(initialValue)

    function handleChange(e:React.ChangeEvent<HTMLInputElement>){
        setInputValue(e.target.value)
    }

    return[inputValue,handleChange]
}