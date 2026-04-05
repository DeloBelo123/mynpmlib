# `@delofarag/crm-utils`

TypeScript-Bibliothek, mit der **deine Anwendung als einheitliche Schicht vor verschiedenen CRM-Systemen** steht: gleiche **OOP-Struktur** pro Anbieter, gemeinsames **Token-Modell**, und eine **Factory**, mit der du zur Laufzeit den passenden CRM-Client wählst. Die Package ist darauf ausgelegt, **CRM-Funktionalität in dein Produkt einzubetten** (Connect-Flows, Datenzugriff, spätere Erweiterung um weitere CRMs) — nicht nur „einmalig HubSpot anbinden“.

**Aktuell mitgelieferte Implementierung:** `hubspot` (Referenz / Test). Weitere CRMs folgen dasselbe Muster.

---

## Idee: CRM-Plugin für deine App

- **Ein gemeinsames Kontrakt-Modell** (`CRM`, `CrmConnection`, `TokenStore`), damit UI, Jobs und API-Routen **anbieterneutral** bleiben können.
- **Pro CRM-Anbieter** eine konkrete Klasse, die die Basisklasse **`CRM`** erfüllt und intern eine **`CrmConnection`** für Auth und API-Details kapselt.
- **`getCRM(name, init)`** liefert die richtige Instanz — sobald du mehrere CRMs registrierst, reicht ein Switch über `name` (oder später Konfiguration aus der DB).
- **`listCRMs()`** gibt dieselben Einträge wie das Konstanten-Array **`CRMs`** zurück — für Dropdowns, Config-Checks oder „welche Provider sind eingebaut?“.

So kannst du z. B. „Benutzer verbindet sein CRM“ und „Sync / Anzeige von Kontakten“ **einmal** modellieren und nur die Implementierung pro Anbieter austauschen.

---

## Architektur (OOP)

### Basisklasse `CRM`

`CRM` ist **abstrakt** und definiert die **einheitliche Datenebene** gegenüber deiner App — grob **CRUD-/Listen-orientiert** (Kontakte, Firmen, Notizen, Suche), unabhängig vom konkreten CRM:

- `getContacts` / `getCompanies` — lesen (mit Pagination, soweit der Anbieter das vorsieht)
- `createContact` / `updateContact` — schreiben
- `createNote` — Notiz/Timeline an ein Objekt hängen
- `searchRecords` — gefilterte Suche, soweit der Anbieter eine Such-API hat

Jede konkrete Implementierung (z. B. `Hubspot`) **erbt** von `CRM` und setzt diese Methoden mit den **jeweiligen REST-/HTTP-Details** um. Rückgaben sind bewusst oft **`unknown`**, damit du in der App casten oder validieren kannst, ohne dass die Library feste Vendor-JSON-Schemas erzwingt.

### `CrmConnection` — Verbindung App ↔ CRM

Neben den Datenmethoden brauchst du eine Schicht für **Authentifizierung und Session** (typischerweise OAuth: Authorize-URL, Code gegen Tokens tauschen, Refresh). Dafür gibt es die abstrakte Basis **`CrmConnection`**.

- Jede CRM-Klasse **stellt** über **`connection`** ein Objekt bereit (konkreter Connection-Typ des Anbieters), das **genau diese Verbindungslogik** bündelt — deine Routes können einheitlich über `crm.connection` arbeiten, statt pro Anbieter eine andere Abstraktion zu lernen.
- Konkrete Connections (z. B. `HubspotConnection`) implementieren **provider-spezifische** Endpunkte, Header und Token-Parsing; die **Idee** bleibt: *eine klare Stelle für „wie komme ich an gültige Credentials“*.

### `TokenStore` — gemeinsames Token-Shape

`TokenStore` ist ein **flaches Interface** für alles, was du zwischen OAuth-Schritten und deiner **eigenen** Persistenz (Datenbank, Session) transportieren willst:

- Identität in **deiner** App (`id`, …)
- OAuth-State (`crm_state`)
- Anbieter-Kontext (`crm_provider`, `crm_account_id` — z. B. Portal- oder Account-ID beim jeweiligen CRM)
- Tokens und Gültigkeit (`crm_access_token`, `crm_refresh_token`, `crm_access_token_expires_at`, `crm_access_token_last_refreshed_at`)

Die Library **speichert nichts selbst** — du entscheidest, wann du schreibst und liest. So bleibt **crm-utils** frei von DB- und Framework-Details.

**Hinweis:** Feldnamen im `TokenStore` sind mit Präfix `crm_` … gewählt, damit sie sich in deinen eigenen Tabellen gut von anderen Spalten unterscheiden.

### `getCRM` — Factory

```ts
getCRM<N extends CRMName>(name: N, init: CRMInitMap[N]): CRMInstanceMap[N]
```

- **`CRMs`** — Liste der unterstützten Namen (z. B. `"hubspot"`).
- **`CRMInitMap` / `CRMInstanceMap`** — pro Name der passende Init-Typ und die konkrete Klasse.
- **`getCRM("hubspot", { … })`** liefert eine **`Hubspot`-Instanz** mit `.connection` und allen `CRM`-Methoden.

Wenn du ein weiteres CRM hinzufügst, erweiterst du diese Map und den `switch` in `src/crms/crm-helpers.ts` — Aufrufer können dann dieselbe Signatur nutzen.

### `listCRMs()` — registrierte Anbieter

```ts
import { listCRMs, CRMs } from "@delofarag/crm-utils"

const ids = listCRMs() // z. B. readonly ["hubspot", …] — entspricht `CRMs`
```

Damit bleibt deine App synchron mit dem, was die Library wirklich ausliefert (ohne die Konstante `CRMs` separat zu importieren, wenn du nur eine Funktion willst).

---

## Ordner- und Erweiterungsmodell

```
src/
  CRM.ts              # abstrakte Datenebene
  CrmConnection.ts    # abstrakte Verbindungs-/Auth-Basis
  types.ts            # TokenStore
  oauth-helpers.ts    # kleine HTTP/State-Helfer (z. B. form-post, Ablaufzeit)
  crms/
    crm-helpers.ts    # getCRM, listCRMs, CRMs, Typ-Maps
    <anbieter>/       # pro CRM: Implementierung + ggf. types (Schemas)
```

**Neues CRM:** Unter `crms/<anbieter>/` Klasse `extends CRM` + `extends CrmConnection`, in `crm-helpers.ts` registrieren (`CRMs`, `CRMInitMap`, `CRMInstanceMap`, `switch` in `getCRM`), in `src/index.ts` exportiert (`export * from "./crms/crm-helpers"`).

---

## Typische Integration in deiner App (generisch)

1. **Connect:** User startet OAuth (oder anderen Flow) über `crm.connection` des gewählten CRMs — du leitest den Browser zur Authorize-URL, speicherst `crm_state` sicher ab.
2. **Callback:** Du prüfst `state`, tauschst `code` gegen Tokens (serverseitig, mit Client-Secret beim Anbieter).
3. **Persistenz:** Du schreibst `TokenStore`-Felder in **deine** DB, verknüpft mit deinem User/Tenant.
4. **API-Nutzung:** Du lädst Tokens, ggf. Refresh über die Connection-Methoden, und rufst `getContacts` / … auf der **`CRM`-Instanz** auf.

Secrets (**Client-Secret**, Refresh-Tokens) bleiben **serverseitig**.

---

## Abstrakte Methoden der Basisklasse `CRM` (Überblick)

| Richtung | Methoden (vereinfacht) |
|----------|-------------------------|
| Lesen | `getContacts`, `getCompanies`, `searchRecords` |
| Schreiben | `createContact`, `updateContact`, `createNote` |

Konkrete CRM-Klassen implementieren das mit den jeweiligen APIs.

---

## Installation & Build

```bash
pnpm add @delofarag/crm-utils
```

Paket exportiert aus dem Root; Build im Repo: `pnpm build` → `dist/`. Für `oauth-helpers` wird u. a. `node:crypto` genutzt — in reinen Browser-Bundles ggf. eigene State-Erzeugung einplanen.

---

## Beispiel: ein registriertes CRM (HubSpot)

HubSpot ist die **aktuell mitgelieferte Referenzimplementierung** — sie zeigt, wie `CRM` + `CrmConnection` zusammenspielen (u. a. `HubspotConnection` mit OAuth-Schritten, `Hubspot` mit CRM-v3-REST). Init-Typ: `HubspotInit` (`clientId`, `redirectUri`). Details und Methodennamen siehe `src/crms/hubspot/hubspot.ts`.

Neue CRMs müssen **nicht** HubSpot gleichen; sie müssen nur **`CRM` und `CrmConnection`** sinnvoll ausfüllen und in `crm-helpers.ts` / `getCRM` registriert sein.

---

## Öffentliche Exports (Kurz)

| Bereich | Inhalt |
|---------|--------|
| Kern | `CRM`, `CrmConnection`, `TokenStore`, `getCRM`, `listCRMs`, `CRMs`, `CRMName`, `CRMInitMap`, `CRMInstanceMap` |
| Helfer | `oauth-helpers` |
| Anbieter | z. B. `Hubspot`, `HubspotConnection`, `HubspotInit` (+ ggf. Zod-Typen im HubSpot-Modul) |

---

## Sicherheit (Kurz)

- **Client-Secret** und **Tokens** nur auf dem Server.
- **OAuth-`state`** vor Token-Tausch validieren.
- **Redirect-URIs** exakt wie beim Identity-Provider registriert.
- Keine Secrets in Repos oder Client-Bundles.

---

## Für KI / Tooling — Schnellreferenz

| Thema | Inhalt |
|--------|--------|
| Rolle der Package | Einheitliche CRM-Schicht für deine App („Plugin“-Stil); mehrere CRMs über dieselben Konzepte. |
| `CRM` | Abstrakte Datenebene — Listen/CRUD-artige Operationen pro Anbieter implementiert. |
| `CrmConnection` | Abstrahiert Verbindung/Auth zum CRM; konkrete Klasse pro Anbieter, an `crm.connection` hängend. |
| `TokenStore` | Gemeinsames Objekt für State + Tokens; Persistenz in **deiner** App. |
| `getCRM` | Factory: `name` + init → konkrete `CRM`-Instanz. |
| `listCRMs` | Gibt die registrierten CRM-IDs (Kopie/View auf `CRMs`) — z. B. für UI oder Validierung. |
| Neues CRM | `crms/<name>/`, `extends CRM` + `extends CrmConnection`, `crm-helpers.ts` anpassen + Export über `index.ts`. |
| HubSpot | Nur **eine** derzeitige Implementierung; als Muster, nicht als einzige Wahrheit. |
