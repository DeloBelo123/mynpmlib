import { HubspotConnectButton } from "./hubspot/start-button"

export default function Main() {
    return (
        <div className="mx-auto max-w-lg space-y-4 p-6">
            <h1 className="text-xl font-semibold">crm-utils — HubSpot smoke test</h1>
            <p className="text-sm text-neutral-600">
                <code className="rounded bg-neutral-100 px-1">HUBSPOT_ACCESS_TOKEN</code> in{" "}
                <code className="rounded bg-neutral-100 px-1">.env.local</code> setzen (Token
                beschaffst du in HubSpot — crm-utils enthält kein OAuth mehr).
            </p>
            <p className="text-sm text-neutral-600">
                Button ruft <code className="rounded bg-neutral-100 px-1">getCRM(&quot;hubspot&quot;, {})</code>{" "}
                und <code className="rounded bg-neutral-100 px-1">getContacts</code> auf und gibt JSON
                zurück.
            </p>
            <HubspotConnectButton />
        </div>
    )
}
