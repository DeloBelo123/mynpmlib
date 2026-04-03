import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getCRM } from "@delofarag/crm-utils"

const PREVIEW_MAX = 4500

function redirectWithError(baseUrl: string, message: string) {
    const u = new URL("/hubspot/connected", baseUrl.replace(/\/$/, ""))
    u.searchParams.set("error", message)
    const res = NextResponse.redirect(u)
    res.cookies.set("hubspot_oauth_state", "", { maxAge: 0, path: "/" })
    res.cookies.set("hubspot_oauth_preview", "", { maxAge: 0, path: "/" })
    return res
}

export async function GET(request: Request) {
    const url = new URL(request.url)
    const code = url.searchParams.get("code")
    const state = url.searchParams.get("state")
    const cookieStore = await cookies()
    const expected = cookieStore.get("hubspot_oauth_state")?.value
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
    const appOrigin = baseUrl.replace(/\/$/, "")

    if (!code || !state || !expected || state !== expected) {
        return redirectWithError(appOrigin, "Ungültiger OAuth-State oder kein code.")
    }

    const clientId = process.env.HUBSPOT_CLIENT_ID
    const clientSecret = process.env.HUBSPOT_CLIENT_SECRET
    if (!clientId || !clientSecret) {
        return redirectWithError(appOrigin, "HUBSPOT_CLIENT_ID oder HUBSPOT_CLIENT_SECRET fehlt.")
    }

    const redirectUri = `${appOrigin}/api/hubspot/callback`
    const hub = getCRM("hubspot", { clientId, redirectUri })

    let tokenStore
    try {
        const exchanged = await hub.connection.exchangeAuthorizationCode(clientSecret, { code })
        tokenStore = exchanged.tokenStore
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return redirectWithError(appOrigin, `Token-Austausch: ${msg}`)
    }

    const accessToken = tokenStore.access_token
    if (!accessToken) {
        return redirectWithError(appOrigin, "Kein access_token in der HubSpot-Antwort.")
    }

    try {
        const contacts = await hub.getContacts({ accessToken, limit: 5 })
        let sampleJson = JSON.stringify(contacts, null, 2)
        if (sampleJson.length > PREVIEW_MAX) {
            sampleJson = `${sampleJson.slice(0, PREVIEW_MAX)}…`
        }
        const payload = {
            portalId: tokenStore.provider_account_id,
            fetchedAt: new Date().toISOString(),
            sampleJson,
        }
        const ok = NextResponse.redirect(new URL("/hubspot/connected", appOrigin))
        ok.cookies.set("hubspot_oauth_state", "", { maxAge: 0, path: "/" })
        ok.cookies.set("hubspot_oauth_preview", JSON.stringify(payload), {
            httpOnly: true,
            sameSite: "lax",
            path: "/",
            maxAge: 120,
            secure: process.env.NODE_ENV === "production",
        })
        return ok
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return redirectWithError(
            appOrigin,
            `API nach Token: ${msg} (Scopes in connect route vs HubSpot-App prüfen)`,
        )
    }
}
