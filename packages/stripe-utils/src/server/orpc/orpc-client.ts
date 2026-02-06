import type { RouterClient } from '@orpc/server'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { routes } from './orpc-routes'

export type StripeClient = RouterClient<typeof routes>

/**
 * url optional: im Browser wird bei fehlender url die aktuelle Origin genutzt (same-origin).
 *  NEXT_PUBLIC_APP_URL. Fehler, wenn nirgends eine URL verfügbar ist.
 * fetch mit credentials: 'include', damit Cookies (Session) zum Server geschickt werden.
 */
export function createStripeClient(options: { url?: string; headers?: Record<string, string> } = {}): StripeClient {
  const base =
    options.url ??
    (typeof window !== 'undefined'
      ? window.location.origin
      : process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL)
  if (!base) {
    throw new Error(
      'Stripe oRPC client: URL fehlt. Entweder createStripeClient({ url: "..." }) übergeben oder  NEXT_PUBLIC_APP_URL setzen.'
    )
  }
  const url = base.includes('/api/stripe/orpc') ? base : `${base.replace(/\/$/, '')}/api/stripe/orpc`
  const link = new RPCLink({
    url,
    headers: options.headers ?? { Authorization: 'Bearer token' },
    fetch: (request, init) => fetch(request, { ...init, credentials: 'include' }),
  })
  return createORPCClient(link)
}

/** Default-Client; nutzt NEXT_PUBLIC_APP_URL aus .env (lokal und Production). */
export const stripeClient = createStripeClient()