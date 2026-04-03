import Header from "../components/Header";
import Footer from "../components/Footer";
import type { ReactNode } from "react";

export default function MarketingLayout({ children }: { children: ReactNode }) {
    return (
        <>
            <Header />
            <main className="flex-1 pt-20">{children}</main>
            <Footer />
        </>
    );
}
