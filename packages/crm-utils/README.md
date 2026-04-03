# `@delofarag/crm-utils`

TypeScript-Hilfsbibliothek für **CRM-Integrationen**: ein gemeinsames Datenmodell für Tokens (`TokenStore`), eine abstrakte **CRM-API** (Contacts, Companies, Notes, Search) und pro Anbieter eine **OAuth-Verbindung** plus HTTP-Wrapper.

**Aktuell implementiert:** HubSpot (`Hubspot`, `HubspotConnection`).

---

## Für KI / Cursor — Kurzüberblick

| Frage | Antwort |
|--------|---------|
| Wie instanziiere ich den CRM-Client? | `getCRM("hubspot", { clientId, redirectUri })` → `Hubspot` |
| Wo ist OAuth? | `hub.connection` (`HubspotConnection`): `buildAuthorizeUrl` → User zu HubSpot → Callback mit `code` → `exchangeAuthorizationCode(clientSecret, { code })` |
| Wo sind CRM-Daten-APIs? | `hub.getContacts`, `hub.getCompanies`, `hub.createContact`, … — immer mit `accessToken` (serverseitig) |
| Darf `clientSecret` ins Frontend? | **Nein.** Nur Server (Route Handler, Backend). |
| Tokens speichern? | `TokenStore` ist das beabsichtigte Shape; Persistenz (DB) passiert **in deiner App** nach den Connection-Returns. |
| Neues CRM hinzufügen? | `CRM` + `CrmConnection` erweitern, `getCRM` + `CRMInitMap` / `CRMInstanceMap` in `getCRM.ts` ergänzen, `CRMs`-Array erweitern. |

---

## Installation

```bash
pnpm add @delofarag/crm-utils
# oder npm / yarn
```

Paket baut nach `dist/` (`pnpm build` im Package). Consumer importieren aus dem Package-Root (`@delofarag/crm-utils`).

**Peer-Umgebung:** Node mit `fetch` (Node 18+) oder entsprechende Polyfills. `oauth-helpers` nutzt `node:crypto` für `randomState` — für reine Browser-Nutzung der OAuth-Helfer ggf. eigenes State erzeugen.

---

## Architektur

```
getCRM(name, init)
    └── Hubspot
            ├── connection: HubspotConnection  ← OAuth (authorize, code exchange, refresh, metadata)
            └── CRM-Methoden                 ← REST (Contacts, Companies, Notes, Search)
```

- **`CRM` (abstrakt):** gemeinsame Methodensignatur für alle CRMs (`getContacts`, `getCompanies`, `createContact`, `updateContact`, `createNote`, `searchRecords`).
- **`CrmConnection` (abstrakt):** OAuth-Schicht; `HubspotConnection` setzt HubSpot-URLs und Token-Flow um.
- **`TokenStore`:** flaches Objekt für OAuth-State und Tokens (`access_token`, `refresh_token`, `token_expires_at`, `provider_account_id`, `id` für eure User-DB, …).

---

## Öffentliche Exports (`src/index.ts`)

| Export | Rolle |
|--------|--------|
| `getCRM`, `CRMs`, `CRMName`, `CRMInitMap`, `CRMInstanceMap` | Factory und Typen für unterstützte CRMs |
| `CRM` | Abstrakte Basisklasse für CRM-Implementierungen |
| `CrmConnection` | Abstrakte Basisklasse für OAuth (`provider`) |
| `TokenStore` | Token-/State-Shape |
| `Hubspot`, `HubspotConnection` | HubSpot-Implementierung |
| `HubspotInit` | `{ clientId, redirectUri }` |
| HubSpot-Zod-Typen | `HubspotTokenResponse`, Schemas (Parsing von Token-JSON) |
| `oauth-helpers` | `randomState`, `buildQueryString`, `postFormUrlEncoded`, `toExpiresAt` |

---

## HubSpot: Initialisierung

```ts
import { getCRM } from "@delofarag/crm-utils"

const hub = getCRM("hubspot", {
    clientId: process.env.HUBSPOT_CLIENT_ID!,
    redirectUri: "https://your-domain.com/api/hubspot/callback",
})
```

- **`redirectUri`:** muss **exakt** mit einer in der HubSpot-App eingetragenen Redirect-URL übereinstimmen und bei `buildAuthorizeUrl` und `exchangeAuthorizationCode` identisch sein (OAuth). Das ist die URL, auf die HubSpot den Browser mit `code` und `state` zurückschickt.
- **`clientId`:** öffentlich; **`clientSecret`** wird **nicht** im Constructor gespeichert, sondern nur an `exchangeAuthorizationCode` und `refreshAccessToken` / `getValidAccessToken` übergeben.

---

## HubSpot: OAuth-Ablauf (Reihenfolge)

1. **`hub.connection.buildAuthorizeUrl({ scopes, supabase_id? })`**
   - Erzeugt `state` (CSRF) und ein `tokenStore`-Objekt mit `state` (und optional `id` aus `supabase_id`).
   - Rückgabe: `{ authorizeUrl, state, tokenStore }` — Browser des Users zu `authorizeUrl` navigieren (volle Seiten-Navigation, kein `fetch` für den Start). State/Tokens bei dir persistieren, wenn du willst (nach dem Return).

2. **Callback-Route** (Query: `code`, `state`):
   - `state` mit gespeichertem State abgleichen (Session/DB/Cookie).
   - **`hub.connection.exchangeAuthorizationCode(clientSecret, { code, id? })`**
   - Liefert u. a. `tokenStore` (inkl. `access_token`, `refresh_token`, `provider_account_id` / Portal-ID aus Metadata) und `raw` (HubSpot-Antwort).

3. **Später / bei abgelaufenem Access Token:**
   - **`hub.connection.refreshAccessToken(clientSecret, { refreshToken })`**
   - oder **`hub.connection.getValidAccessToken(clientSecret, { accessToken, expiresAt, refreshToken, skewMs? })`** — refresht bei Bedarf automatisch.

4. **Optional:** **`hub.connection.fetchAccessTokenMetadata(accessToken)`** — u. a. `hub_id` (Portal).

**Nicht** für den Refresh: `redirectUri` (nur Authorize + Code-Exchange).

---

## HubSpot: CRM-API (Datenebene)

Alle folgenden Methoden erwarten ein gültiges **`accessToken`** (serverseitig). Rückgaben sind bewusst **`Promise<unknown>`** — Response-Shapes kommen von HubSpot; bei Bedarf in der App casten oder validieren.

| Methode | Kurzbeschreibung |
|---------|------------------|
| `getContacts({ accessToken, limit?, after? })` | Liste Contacts (Pagination `after`) |
| `getCompanies({ accessToken, limit?, after? })` | Liste Companies |
| `createContact({ accessToken, properties })` | Neuer Contact |
| `updateContact({ accessToken, id, properties })` | Contact PATCH |
| `createNote({ accessToken, body, associateToObjectType, associateToId })` | Note + Association zu Contact/Company/Deal |
| `searchRecords({ accessToken, objectType, filterGroups?, properties?, limit?, after? })` | CRM Search API |

HubSpot-HTTP-Basis: `https://api.hubapi.com`; Fehler werden als `Error` mit Status-Text geworfen.

---

## `TokenStore`

`TokenStore` (`src/types.ts`) bündelt u. a.:

- **`state`** — OAuth CSRF (vor dem Callback).
- **`id`** — eure interne User-/Tenant-ID (z. B. Supabase), z. B. über `buildAuthorizeUrl({ supabase_id })` oder `exchangeAuthorizationCode` `{ id }`.
- **`provider_account_id`** — z. B. HubSpot Portal-ID (String).
- **`access_token` / `refresh_token` / `token_expires_at` / `token_last_refreshed_at`**

Persistenz (Datenbank, Session) implementierst **du** in der App, sobald du `tokenStore` aus den Methoden zurückbekommst — **crm-utils** bleibt ohne DB.

---

## Neues CRM ergänzen (Checkliste)

1. Ordner `src/crms/<name>/` mit Implementierung.
2. Klasse erweitert `CRM` (alle abstrakten Methoden implementieren).
3. Connection-Klasse erweitert `CrmConnection` mit `provider` und OAuth-Logik.
4. **`getCRM.ts`:** `CRMs` um Namen erweitern, `CRMInitMap` / `CRMInstanceMap` und `switch` in `getCRM` ergänzen.
5. **`src/index.ts`:** neue Typen/Klassen exportieren.
6. README / Changelog im Repo pflegen.

---

## Sicherheit — Kurz

- **`clientSecret`**, **Refresh/Access Tokens** nur auf dem Server halten.
- **`redirectUri`** in der OAuth-App registrieren; keine Wildcards nachlässig mischen.
- **`state`** immer prüfen, bevor `code` getauscht wird.
- Öffentliche Repos: keine echten Tokens committen.

---

