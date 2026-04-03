import { HubspotConnectButton } from "./hubspot/start-button"

export default function Main() {
    return (
        <div className="mx-auto max-w-lg space-y-4 p-6">
            <h1 className="text-xl font-semibold">crm-utils — HubSpot smoke test</h1>
            <p className="text-sm text-neutral-600">
                HubSpot-App anlegen, Redirect-URL{" "}
                <code className="rounded bg-neutral-100 px-1">
                    …/api/hubspot/callback
                </code>
                , dann <code className="rounded bg-neutral-100 px-1">.env.local</code>{" "}
                setzen.
            </p>
            <p className="text-sm text-neutral-600">
                Button startet OAuth. Danach siehst du Portal-ID und eine kleine Kontakt-Vorschau
                unter <code className="rounded bg-neutral-100 px-1">/hubspot/connected</code>{" "}
                (Demo-Daten im Cookie, ohne Access-Token).
            </p>
            <HubspotConnectButton />
        </div>
    )
}
