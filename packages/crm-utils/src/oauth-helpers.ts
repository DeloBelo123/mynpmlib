import { randomBytes } from "node:crypto"

export function randomState(byteLength: number = 32): string {
    return randomBytes(byteLength).toString("hex")
}

export function buildQueryString(params: Record<string, string>): string {
    return new URLSearchParams(params).toString()
}

export async function postFormUrlEncoded(
    url: string,
    body: Record<string, string>,
): Promise<Response> {
    return fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(body),
    })
}

export function toExpiresAt(expiresInSeconds: number | undefined): Date | null {
    if (typeof expiresInSeconds !== "number" || !Number.isFinite(expiresInSeconds)) {
        return null
    }
    return new Date(Date.now() + expiresInSeconds * 1000)
}
