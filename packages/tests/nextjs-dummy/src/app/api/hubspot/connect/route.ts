import { NextResponse } from "next/server"
import { getCRM } from "@delofarag/crm-utils"

const SCOPES = ["oauth", "crm.objects.contacts.read"]

export async function GET() {
    const clientId = process.env.HUBSPOT_CLIENT_ID
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
    if (!clientId) {
        return new NextResponse("Missing HUBSPOT_CLIENT_ID", { status: 500 })
    }
    const redirectUri = `${baseUrl.replace(/\/$/, "")}/api/hubspot/callback`
    const hub = getCRM("hubspot", { clientId, redirectUri })
    const { authorizeUrl, state } = await hub.connection.buildAuthUrl({
        scopes: SCOPES,
    })
    const res = NextResponse.redirect(authorizeUrl)
    res.cookies.set("hubspot_oauth_state", state, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 600,
        secure: process.env.NODE_ENV === "production",
    })
    return res
}
