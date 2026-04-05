# `@delofarag/crm-utils`

TypeScript-Bibliothek mit **einheitlicher CRM-Datenschicht** für deine Anwendung: abstrakte Basisklasse **`CRM`**, konkrete Implementierungen pro Anbieter (aktuell u. a. **HubSpot**), plus **`getCRM` / `listCRMs`** zur Auswahl des Clients.

**Fokus:** CRUD-/Listen-Operationen gegen CRM-HTTP-APIs (Kontakte, Firmen, Notizen, Suche). **Authentifizierung (OAuth, Token-Refresh, Redirects)** liegt **bewusst außerhalb** dieser Package — du beschaffst z. B. Access-Tokens in deiner App und übergibst sie an die Methoden als `accessToken`.

Kleine HTTP-Hilfen ohne CRM-Bezug bleiben in **`oauth-helpers`** (z. B. Query-Strings, form-urlencoded POST).

---

## Architektur

### `CRM` (abstrakt)

Definiert die **gemeinsame API** für alle Anbieter, z. B.:

- Lesen: `getContacts`, `getCompanies`, `searchRecords`
- Schreiben: `createContact`, `updateContact`, `createNote`

Jede Implementierung erbt von `CRM` und kapselt die **provider-spezifischen** Endpunkte und Request-Formate. Rückgaben sind oft **`Promise<unknown>`**, damit du in der App casten oder validieren kannst.

### Konkrete CRM-Klassen (z. B. `Hubspot`)

Liegen unter `src/crms/<anbieter>/`. Sie enthalten **nur** die Datenebene — **keine** eingebaute OAuth-Klasse mehr.

### `getCRM` / `listCRMs` / `CRMs`

In **`src/crms/crm-helpers.ts`**: Factory `getCRM(name, init)` liefert die passende Instanz; `listCRMs()` bzw. das Array **`CRMs`** nennen die registrierten Anbieter-IDs.

### `HubspotInit`

Optionaler Platzhalter-Typ (`Record<string, never>`) für `getCRM("hubspot", init)`, falls du später Konfiguration ergänzen willst.

---

## Installation

```bash
pnpm add @delofarag/crm-utils
```

Build im Repo: `pnpm build` → `dist/`.

---

## Nutzung (skizziert)

```ts
import { getCRM } from "@delofarag/crm-utils"

const crm = getCRM("hubspot")
// Token von deiner Auth-Schicht / Env:
const rows = await crm.getContacts({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN!, limit: 10 })
```

---

## Ordnerüberblick

```
src/
  CRM.ts
  oauth-helpers.ts
  crms/
    crm-helpers.ts    # getCRM, listCRMs, CRMs, Typ-Maps
    hubspot/
      hubspot.ts
      types.ts        # HubspotInit
```

**Neues CRM:** Unter `crms/<name>/` Klasse `extends CRM`, in `crm-helpers.ts` registrieren, in `index.ts` exportieren.

---

## Öffentliche Exports (Kurz)

| Bereich | Inhalt |
|---------|--------|
| Kern | `CRM`, `getCRM`, `listCRMs`, `CRMs`, `CRMName`, `CRMInitMap`, `CRMInstanceMap` |
| Helfer | `oauth-helpers` |
| Anbieter | z. B. `Hubspot`, `HubspotInit` |

---

## Sicherheit

- **`accessToken`** nur serverseitig verwenden und nicht ins Client-Bundle leaken.

---

## Für KI / Tooling

| Thema | Inhalt |
|--------|--------|
| Rolle | Einheitliche **CRM-Daten-API**; **kein** OAuth in der Package. |
| `CRM` | Abstrakte Methoden für Listen/Schreiben/Suche pro Anbieter. |
| `getCRM` | `name` + `init` → konkrete Instanz. |
| Auth | **Nicht** Teil von crm-utils; Tokens von außen übergeben. |
