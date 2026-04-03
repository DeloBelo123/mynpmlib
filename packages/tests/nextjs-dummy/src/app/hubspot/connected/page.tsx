import { cookies } from "next/headers"
import Link from "next/link"

type PreviewPayload = {
    portalId: string | undefined
    fetchedAt: string
    sampleJson: string
}

export default async function HubspotConnectedPage({
    searchParams,
}: {
    searchParams: Promise<{ error?: string }>
}) {
    const q = await searchParams
    const jar = await cookies()
    const raw = jar.get("hubspot_oauth_preview")?.value

    let preview: PreviewPayload | null = null
    if (raw) {
        try {
            preview = JSON.parse(raw) as PreviewPayload
        } catch {
            preview = null
        }
    }

    return (
        <div className="mx-auto max-w-3xl space-y-4 p-6">
            <h1 className="text-xl font-semibold">HubSpot — OAuth Ergebnis</h1>

            {q.error ? (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    {q.error}
                </p>
            ) : null}

            {!q.error && !preview ? (
                <p className="text-sm text-neutral-600">
                    Noch kein Daten-Cookie (z. B. Seite direkt geöffnet). Zuerst von der Startseite verbinden.
                </p>
            ) : null}

            {preview ? (
                <div className="space-y-2 rounded-md border border-neutral-200 bg-neutral-50 p-4 text-sm">
                    <p>
                        <span className="font-medium">Portal-ID:</span>{" "}
                        {preview.portalId ?? "—"}
                    </p>
                    <p className="text-neutral-500">Abgefragt: {preview.fetchedAt}</p>
                    <p className="font-medium text-neutral-800">Kontakte (Auszug, Roh-JSON)</p>
                    <pre className="max-h-[50vh] overflow-auto rounded border border-neutral-200 bg-white p-3 text-xs">
                        {preview.sampleJson}
                    </pre>
                    <p className="text-xs text-neutral-500">
                        Nur Demo: kurz im Cookie zwischengespeichert — kein Access-Token hier.
                    </p>
                </div>
            ) : null}

            <Link
                className="inline-block rounded border border-neutral-300 bg-white px-3 py-2 text-sm hover:bg-neutral-50"
                href="/"
            >
                Zurück zur Startseite
            </Link>
        </div>
    )
}
