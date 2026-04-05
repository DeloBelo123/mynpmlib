import { CRM } from "../../CRM"

const HUBSPOT_API = "https://api.hubapi.com"

/**
 * Kleiner HTTP-Wrapper für HubSpot:
 * - setzt `Authorization: Bearer <token>`
 * - JSON encoden/decoden
 * - wirft bei non-2xx einen Error mit Response-Text
 *
 * frontend && server (aber: accessToken ist ein Secret → in der Praxis meistens server-only)
 */
async function hubspotFetchJson(
    path: string,
    options: { accessToken: string; method?: string; body?: unknown },
): Promise<unknown> {
    const method = options.method ?? "GET"
    const headers: Record<string, string> = {
        Authorization: `Bearer ${options.accessToken}`,
        Accept: "application/json",
    }
    let body: string | undefined
    if (options.body !== undefined) {
        headers["Content-Type"] = "application/json"
        body = JSON.stringify(options.body)
    }
    const r = await fetch(`${HUBSPOT_API}${path}`, { method, headers, body })
    const text = await r.text()
    if (!r.ok) {
        throw new Error(`HubSpot API ${method} ${path}: ${r.status} ${text}`)
    }
    return text ? JSON.parse(text) : null
}

export class Hubspot extends CRM {
    readonly provider = "hubspot" as const
    constructor() {
        super()
    }

    /**
     * Holt eine Seite von HubSpot Contacts.
     *
     * - `limit`: wie viele Contacts du pro Request willst (Pagination Page Size)
     * - `after`: Cursor für die nächste Seite (kommt typischerweise aus `paging.next.after`)
     *
     * Typical use: UI-Liste anzeigen oder initial Candidates laden.
     *
     * server-only (weil `accessToken` ein Secret ist)
     */
    public async getContacts(options: {
        accessToken: string
        limit?: number
        after?: string
    }): Promise<unknown> {
        const limit = options.limit ?? 10
        const params = new URLSearchParams({ limit: String(limit) })
        if (options.after) {
            params.set("after", options.after)
        }
        return hubspotFetchJson(`/crm/v3/objects/contacts?${params.toString()}`, {
            accessToken: options.accessToken,
        })
    }

    /**
     * Holt eine Seite von HubSpot Companies.
     *
     * - `limit`: wie viele Companies pro Request
     * - `after`: Cursor für die nächste Seite
     *
     * server-only (weil `accessToken` ein Secret ist)
     */
    public async getCompanies(options: {
        accessToken: string
        limit?: number
        after?: string
    }): Promise<unknown> {
        const limit = options.limit ?? 10
        const params = new URLSearchParams({ limit: String(limit) })
        if (options.after) {
            params.set("after", options.after)
        }
        return hubspotFetchJson(`/crm/v3/objects/companies?${params.toString()}`, {
            accessToken: options.accessToken,
        })
    }

    /**
     * Erstellt einen neuen Contact.
     *
     * `properties` sind HubSpot-Property-Namen → Values. Beispiel: `{ email: \"a@b.com\", firstname: \"Max\" }`.
     *
     * server-only (weil `accessToken` ein Secret ist)
     */
    public async createContact(options: {
        accessToken: string
        properties: Record<string, string | number | boolean | null>
    }): Promise<unknown> {
        return hubspotFetchJson("/crm/v3/objects/contacts", {
            accessToken: options.accessToken,
            method: "POST",
            body: { properties: options.properties },
        })
    }

    /**
     * Updated einen bestehenden Contact (PATCH).
     *
     * - `id`: HubSpot Contact ID
     * - `properties`: Partial Update (nur die Felder, die du ändern willst)
     *
     * Typical use: nach AI-Screening `status`, `ai_score`, `ai_summary` etc. zurückschreiben.
     *
     * server-only (weil `accessToken` ein Secret ist)
     */
    public async updateContact(options: {
        accessToken: string
        id: string
        properties: Record<string, string | number | boolean | null>
    }): Promise<unknown> {
        return hubspotFetchJson(`/crm/v3/objects/contacts/${encodeURIComponent(options.id)}`, {
            accessToken: options.accessToken,
            method: "PATCH",
            body: { properties: options.properties },
        })
    }

    /**
     * Erstellt eine Note (Timeline/History Eintrag) und hängt sie an ein Objekt (Contact/Company/Deal).
     *
     * Notes sind super, um Ergebnisse „auditierbar“ abzulegen (was hat die AI gemacht / was kam beim Call raus),
     * ohne dass du zig neue Custom Properties brauchst.
     *
     * - `body`: Text/HTML Inhalt der Note (HubSpot Property: `hs_note_body`)
     * - `associateToObjectType`: z.B. `contact`, `company`, `deal`
     * - `associateToId`: ID des Ziel-Objekts in HubSpot
     *
     * server-only (weil `accessToken` ein Secret ist)
     */
    public async createNote(options: {
        accessToken: string
        body: string
        associateToObjectType: string
        associateToId: string
    }): Promise<unknown> {
        return hubspotFetchJson("/crm/v3/objects/notes", {
            accessToken: options.accessToken,
            method: "POST",
            body: {
                properties: { hs_note_body: options.body },
                associations: [
                    {
                        to: { id: options.associateToId },
                        types: [
                            {
                                associationCategory: "HUBSPOT_DEFINED",
                                associationTypeId: noteAssociationTypeId(options.associateToObjectType),
                            },
                        ],
                    },
                ],
            },
        })
    }

    /**
     * Generische Suche über HubSpot-Objekte (contacts/companies/deals/custom objects).
     *
     * Im Gegensatz zu `getContacts()` (nur Listen) kannst du hier **Filter** angeben.
     *
     * - `objectType`: z.B. `contacts`, `companies`, `deals`
     * - `filterGroups`: HubSpot Search-Filter (Raw-Shape; du gibst das HubSpot-Format direkt rein)
     * - `properties`: welche Properties du zurückhaben willst
     * - `limit`/`after`: Pagination
     *
     * Typical use: „gib mir alle Kandidaten mit status = X“ ohne alles zu laden.
     *
     * server-only (weil `accessToken` ein Secret ist)
     */
    public async searchRecords(options: {
        accessToken: string
        objectType: string
        filterGroups?: unknown[]
        properties?: string[]
        limit?: number
        after?: string
    }): Promise<unknown> {
        const limit = options.limit ?? 10
        const body: Record<string, unknown> = { limit }
        if (options.filterGroups) {
            body.filterGroups = options.filterGroups
        }
        if (options.properties) {
            body.properties = options.properties
        }
        if (options.after) {
            body.after = options.after
        }
        return hubspotFetchJson(
            `/crm/v3/objects/${encodeURIComponent(options.objectType)}/search`,
            {
                accessToken: options.accessToken,
                method: "POST",
                body,
            },
        )
    }
}

/**
 * HubSpot association type ids (HUBSPOT_DEFINED) — notes to common objects.
 * @see https://developers.hubspot.com/docs/api/crm/associations
 */
function noteAssociationTypeId(associateToObjectType: string): number {
    const t = associateToObjectType.toLowerCase()
    if (t === "contacts" || t === "contact") {
        return 202
    }
    if (t === "companies" || t === "company") {
        return 190
    }
    if (t === "deals" || t === "deal") {
        return 214
    }
    throw new Error(`HubSpot: unsupported note association object type: ${associateToObjectType}`)
}
