"use client"
import React from "react"
import { QueryClient,QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";

const queryClient = new QueryClient()

export default function QueryContext({children}:{children:ReactNode}){
    return(
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    )
}