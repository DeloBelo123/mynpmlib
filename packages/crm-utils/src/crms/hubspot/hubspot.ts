import CRM from "../../CRM"
import CrmConnection from "../../CrmConnection"
import { buildQueryString, postFormUrlEncoded, randomState, toExpiresAt } from "../../oauth-helpers"
import { HubspotAccessTokenMetadataSchema, HubspotTokenResponseSchema, HubspotInit } from "./types"
import type { HubspotAccessTokenMetadata, HubspotTokenResponse } from "./types"
import type { TokenStore } from "../../types"

const HUBSPOT_AUTHORIZE = "https://app.hubspot.com/oauth/authorize"
const HUBSPOT_TOKEN = "https://api.hubapi.com/oauth/v1/token"
const HUBSPOT_API = "https://api.hubapi.com"

export class HubspotConnection extends CrmConnection {
    readonly provider = "hubspot" as const
    private clientId: string
    private redirectUri: string

    constructor(args: HubspotInit ) {
        super()
        this.clientId = args.clientId
        this.redirectUri = args.redirectUri
    }

    /**
     * OAuth-Start: Authorize-URL + state.
     *
      * frontend && server
     */
    public async buildAuthUrl(args: {
        scopes: string[]
        supabase_id?: string
    }) {
        const state = randomState()
        const qs = buildQueryString({
            client_id: this.clientId,
            redirect_uri: this.redirectUri,
            scope: args.scopes.join(" "),
            state,
        })
        const authorizeUrl = `${HUBSPOT_AUTHORIZE}?${qs}`

        if (args.supabase_id){
            const tokenStore: TokenStore = {
                state,
                provider: this.provider,
                id: args.supabase_id,
                token_last_refreshed_at: new Date(),
            }
            return { authorizeUrl, tokenStore, state }
        }
        return { authorizeUrl, state }
    }

    /**
     * Callback: code → Tokens.
     *
      * server-only
     */
    public async codeToTokens(clientSecret: string, args: {
        code: string
        supabase_id?: string
    }) {
        const res = await postFormUrlEncoded(HUBSPOT_TOKEN, {
            grant_type: "authorization_code",
            client_id: this.clientId,
            client_secret: clientSecret,
            redirect_uri: this.redirectUri,
            code: args.code,
        })
        const text = await res.text()
        if (!res.ok) {
            throw new Error(`HubSpot token exchange failed: ${res.status} ${text}`)
        }
        const parsedRaw = HubspotTokenResponseSchema.safeParse(JSON.parse(text))
        if (!parsedRaw.success) {
            throw new Error(`HubSpot token exchange returned unexpected JSON: ${parsedRaw.error.message}`)
        }
        const raw = parsedRaw.data
        const token_expires_at = toExpiresAt(raw.expires_in)
        let portalId: number | undefined
        let meta: HubspotAccessTokenMetadata | undefined
        if (raw.access_token) {
            try {
                meta = await this.fetchAccessTokenMetadata(raw.access_token)
                portalId = meta.hub_id
            } catch {
                portalId = undefined
            }
        }

        if (args.supabase_id){
            const tokenStore: TokenStore = {
                provider: this.provider,
                id: args.supabase_id,
                access_token: raw.access_token,
                refresh_token: raw.refresh_token ?? null,
                token_expires_at,
                token_last_refreshed_at: new Date(),
                provider_account_id: portalId != null ? String(portalId) : undefined,
            }
            return { raw, tokenStore, portalId }
        }
        return { raw, portalId }
    }

    /**
     * Refresh: refresh_token → new access_token.
     *
      * server-only
     */
    public async refreshAccessToken(clientSecret: string, args: {
        refreshToken: string
    }): Promise<{ raw: HubspotTokenResponse; tokenStore: TokenStore }> {
        const res = await postFormUrlEncoded(HUBSPOT_TOKEN, {
            grant_type: "refresh_token",
            client_id: this.clientId,
            client_secret: clientSecret,
            refresh_token: args.refreshToken,
        })
        const text = await res.text()
        if (!res.ok) {
            throw new Error(`HubSpot refresh failed: ${res.status} ${text}`)
        }
        const parsedRaw = HubspotTokenResponseSchema.safeParse(JSON.parse(text))
        if (!parsedRaw.success) {
            throw new Error(`HubSpot refresh returned unexpected JSON: ${parsedRaw.error.message}`)
        }
        const raw = parsedRaw.data
        const token_expires_at = toExpiresAt(raw.expires_in)
        const tokenStore: TokenStore = {
            provider: this.provider,
            access_token: raw.access_token,
            refresh_token: raw.refresh_token ?? args.refreshToken,
            token_expires_at,
            token_last_refreshed_at: new Date(),
        }
        return { raw, tokenStore }
    }

    /**
     * HubSpot: GET /oauth/v1/access-tokens/{token} — u.a. hub_id (Portal).
     *
      * frontend && server
     */
    public async fetchAccessTokenMetadata(accessToken: string): Promise<HubspotAccessTokenMetadata> {
        const r = await fetch(`${HUBSPOT_API}/oauth/v1/access-tokens/${encodeURIComponent(accessToken)}`)
        const text = await r.text()
        if (!r.ok) {
            throw new Error(`HubSpot access-token metadata failed: ${r.status} ${text}`)
        }
        const parsedMeta = HubspotAccessTokenMetadataSchema.safeParse(JSON.parse(text))
        if (!parsedMeta.success) {
            throw new Error(`HubSpot access-token metadata returned unexpected JSON: ${parsedMeta.error.message}`)
        }
        return parsedMeta.data
    }

    /**
     * Hilfe: gültigen Access Token — entweder aus tokenStore oder nach Refresh.
     *
      * server-only
     */
    public async getValidAccessToken(clientSecret: string, args: {
        accessToken?: string | undefined
        expiresAt?: Date | string | null
        refreshToken?: string | null
        skewMs?: number
    }): Promise<string> {
        const skew = args.skewMs ?? 60_000
        const exp =
            args.expiresAt instanceof Date
                ? args.expiresAt.getTime()
                : args.expiresAt
                  ? new Date(args.expiresAt).getTime()
                  : null

        if (args.accessToken && (exp == null || !Number.isFinite(exp) || exp > Date.now() + skew)) {
            return args.accessToken
        }
        if (!args.refreshToken) {
            throw new Error("HubSpot: no valid access token and no refresh token")
        }
        const { tokenStore } = await this.refreshAccessToken(clientSecret, {
            refreshToken: args.refreshToken,
        })
        if (!tokenStore.access_token) {
            throw new Error("HubSpot refresh returned no access_token")
        }
        return tokenStore.access_token
    }
}

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
    public connection: HubspotConnection

    constructor({ clientId, redirectUri }: HubspotInit) {
        super()
        this.connection = new HubspotConnection({ clientId, redirectUri })
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
