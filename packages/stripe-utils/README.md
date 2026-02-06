# @delofarag/stripe-utils

Stripe-Zahlungen mit Supabase und Next.js einbinden. Dieses Tutorial führt in 5 Schritten zum lauffähigen Setup – inklusive **warum** jeder Schritt nötig ist.

**Peer Dependencies:** `@delofarag/supabase-utils`, `next`

---

## Schritt 1: StripeHandler und Config

**Warum:** Der StripeHandler verbindet Stripe mit deiner Datenbank. Dafür braucht er deine User-Tabelle (mit `stripe_id`), eine Tabelle für Webhook-Event-IDs (Idempotenz) und ein Produkt-Objekt mit den Price-IDs aus dem Stripe-Dashboard.

Lege eine zentrale Config-Datei an (z. B. `app/api/config.ts`):

```ts
import { SupabaseTable } from "@delofarag/supabase-utils"
import { StripeTable, WebhookEventTable, Products } from "@delofarag/stripe-utils"
import { createStripeHandler } from "@delofarag/stripe-utils/server"

// User-Tabelle: muss mind. id, email, stripe_id (nullable), stripe_subscriptions haben (Typ StripeTable)
export const userTable = new SupabaseTable<StripeTable & { name: string }>("users")

// Webhook-Event-Tabelle: eine Spalte event_id (UNIQUE), damit jedes Stripe-Event nur einmal verarbeitet wird
export const webhookEventTable = new SupabaseTable<WebhookEventTable>("webhook-events")

// Produkte: Keys sind deine productKeys (z. B. "sub", "lifetime"). Price-IDs holst du aus dem Stripe-Dashboard (Products → Price)
export const products: Products = {
  sub: {
    name: "Subscription",
    description: "Monatliches Abo",
    priceId: "price_xxxxx", // aus Stripe Dashboard
  },
  lifetime: {
    name: "Lifetime",
    description: "Einmalzahlung",
    priceId: "price_yyyyy",
  },
}

export const stripeHandler = createStripeHandler({
  dataTable: userTable,
  webhookEventTable: webhookEventTable,
  products:products,
})
```

In Supabase: Tabelle `users` mit Spalten wie in `StripeTable`; Tabelle `webhook-events` mit Spalte `event_id` (unique). Stripe API Keys in `.env`: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_KEY`.

---

## Schritt 2: App-URL in .env

**Warum:** Der oRPC-Client (Frontend/Server) und Stripe-Redirects brauchen die Basis-URL deiner App. Ohne diese Variable schlagen Aufrufe fehl.

In deiner `.env`:

```env
# Entwicklung
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Später in Production ersetzen durch deine echte Domain, z. B.:
# NEXT_PUBLIC_APP_URL=https://meineapp.de
```

---

## Schritt 3: Next.js Proxy (Cookie-Refresh für Auth)

**Warum:** Die oRPC-Procedures nutzen `getUser()` aus den Cookies. Supabase speichert die Session in Cookies; die müssen regelmäßig refreshed werden. Die Middleware ruft vor jeder Request `getClaims()` auf und aktualisiert die Cookies – sonst ist die Session oft „abgelaufen“ und du bekommst UNAUTHORIZED.

Lege im **Projekt-Root** (oder unter `src/`) eine Datei `proxy.ts` an:

```ts
import { supabaseAuthProxy } from "@delofarag/supabase-utils/server"
import { NextRequest } from "next/server"

export async function proxy(request: NextRequest) {
  return supabaseAuthProxy(request)
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] }
```

---

## Schritt 4: oRPC-Route anlegen

**Warum:** Die Lib spricht per oRPC mit dem Backend. Der Pfad muss **genau** `/api/stripe/orpc` sein, damit Client und Server zusammenspielen. Diese Route nimmt die Requests entgegen und führt die Stripe-Procedures mit deinem `stripeHandler` aus.

Erstelle die Datei **`app/api/stripe/orpc/[[...rest]]/route.ts`** (oder unter `src/app/...`, je nach Projektstruktur):

```ts
import { createStripeRequestHandler } from "@delofarag/stripe-utils/server"
import { stripeHandler } from "../../../config"  // Pfad zu deiner config mit stripeHandler

const stripeRequestHandler = createStripeRequestHandler(stripeHandler)

export const GET = stripeRequestHandler
export const POST = stripeRequestHandler
export const PUT = stripeRequestHandler
export const PATCH = stripeRequestHandler
export const DELETE = stripeRequestHandler
export const OPTIONS = stripeRequestHandler
export const HEAD = stripeRequestHandler
```

Ab jetzt kannst du die Client-Funktionen nutzen – der Client spricht automatisch mit dieser Route (über `NEXT_PUBLIC_APP_URL` + `/api/stripe/orpc`). Beispiele:

**Checkout starten (User wird zu Stripe Checkout weitergeleitet):**

```ts
import { handleCheckoutSession } from "@delofarag/stripe-utils/client"

await handleCheckoutSession({
  productKey: "lifetime",
  successEndpoint: "/success",
  cancelEndpoint: "/cancel",
  mode: "payment",
})
```

Dafür brauchst du im Frontend außerdem `NEXT_PUBLIC_STRIPE_PUBLIC_KEY` in der `.env` (Stripe Publishable Key).

**Billing-Portal öffnen (Subscription verwalten):**

```ts
import { handleBillingPortal } from "@delofarag/stripe-utils/client"

await handleBillingPortal({ returnEndpoint: "/dashboard" })
```

Die URLs werden intern aus `NEXT_PUBLIC_APP_URL` + Endpoint gebaut. Der User muss eingeloggt sein (Cookies/Session), sonst antwortet das Backend mit UNAUTHORIZED.

---

## Schritt 5: Webhook-Route für Stripe

**Warum:** Stripe sendet Events (Checkout abgeschlossen, Rechnung bezahlt, Abo geändert usw.) an deine App. Ohne diese Route kannst du keine Abos oder Zahlungen in deiner DB oder Logik verarbeiten.

Erstelle **`app/api/stripe/webhook/route.ts`**:

```ts
import { NextRequest } from "next/server"
import { stripeHandler as sh } from "../../config"

export async function POST(req: NextRequest) {
  return await sh.handleWebhook({
    req,
    webhookConfig: {
      "checkout.session.completed": async (userId, priceId) => {
        // z. B. Abo in DB aktivieren
      },
      "invoice.paid": async (userId, priceId) => {
        // Rechnung bezahlt
      },
      "invoice.payment_failed": async (userId, priceId) => {
        // Zahlung fehlgeschlagen
      },
      "customer.subscription.updated": async (userId, priceId, status) => {
        // Abo-Status geändert (active, canceled, past_due, …)
      },
      "customer.subscription.deleted": async (userId, priceId) => {
        // Abo gekündigt
      },
      // optional: "invoice.payment_action_required", "customer.subscription.created"
    },
  })
}
```

Im Stripe-Dashboard unter Webhooks die Endpoint-URL eintragen: `https://deine-domain/api/stripe/webhook`. Lokal: `stripe listen --forward-to localhost:3000/api/stripe/webhook` und den angezeigten Signing Secret als `STRIPE_WEBHOOK_KEY` in `.env` nutzen.

**Nur zum Testen** mit `stripe trigger`: Du kannst `runCallbacksWithoutUserAndPrice: true` übergeben, dann laufen die Callbacks auch ohne gefundenen User/Price (mit Platzhalter-Werten). In Production weglassen.

---

## Übersicht

| Schritt | Was | Warum |
|--------|-----|--------|
| 1 | Config mit Tabellen + Products + `createStripeHandler` | Stripe mit deiner DB und deinen Produkten verbinden |
| 2 | `NEXT_PUBLIC_APP_URL` in .env | Basis-URL für Client und Redirects |
| 3 | Middleware mit `supabaseAuthProxy` | Session-Cookies refreshen, damit `getUser()` funktioniert |
| 4 | `/api/stripe/orpc/[[...rest]]/route.ts` | oRPC-Endpoint für Checkout und Billing-Portal |
| 5 | `/api/stripe/webhook/route.ts` | Stripe-Events empfangen und verarbeiten |

Nach diesen 5 Schritten kannst du `handleCheckoutSession` und `handleBillingPortal` aus `@delofarag/stripe-utils/client` nutzen und alle beschriebenen Webhook-Events verarbeiten.
