"use client";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const queryClient = new QueryClient();
export default function QueryContext({ children }) {
    return (React.createElement(QueryClientProvider, { client: queryClient }, children));
}
//# sourceMappingURL=QueryContext.js.map