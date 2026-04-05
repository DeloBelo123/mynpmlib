"use client"

export function HubspotConnectButton() {
    return (
        <form action="/api/hubspot/sample" method="get">
            <button
                type="submit"
                className="rounded-lg border border-neutral-400 bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white shadow hover:bg-neutral-800"
            >
                Kontakte testen (CRM-API)
            </button>
        </form>
    )
}
