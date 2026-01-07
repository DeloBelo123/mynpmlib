"use client"
import { useState } from "react";
export default function useToggle(wert:boolean):[boolean,()=>void]{
    const [toggled,isToggled] = useState(wert)
    function Toggler(){
        isToggled(toggled => !toggled)
    }
    return[toggled,Toggler]
}