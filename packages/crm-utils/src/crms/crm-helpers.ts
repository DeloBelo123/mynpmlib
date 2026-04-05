import { Hubspot } from "./hubspot/hubspot"
import type { HubspotInit } from "./hubspot/types"

export const CRMs = ["hubspot"] as const
export type CRMName = (typeof CRMs)[number]

export type CRMInitMap = {
	hubspot: HubspotInit
}

export type CRMInstanceMap = {
	hubspot: Hubspot
}

export type CRMArgPairs = {
	[K in keyof CRMInitMap]: [K, CRMInitMap[K]]
}[keyof CRMInitMap]

/**
 * Liefert eine konkrete CRM-Instanz passend zu `name` und `init`.
 */
export function getCRM<N extends CRMName>(name: N, init: CRMInitMap[N]): CRMInstanceMap[N] {
	const crm: CRMName = name
	switch (crm) {
		case "hubspot":
			return new Hubspot(init) as CRMInstanceMap[N]
		default:
			crm satisfies never
			throw new Error(`Unknown CRM: ${String(crm)}`)
	}
}

/**
 * Gibt die Liste der registrierten CRM-Identifikatoren zurück (gleiches Array wie `CRMs`).
 * Nützlich für UI (Auswahl), Feature-Flags oder Validierung.
 */
export function listCRMs() {
	return CRMs
}




