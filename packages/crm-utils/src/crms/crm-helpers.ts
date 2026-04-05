import { Hubspot } from "./hubspot/hubspot"

export const CRMs = ["hubspot"] as const
export type CRMName = typeof CRMs[number]

export type CRMInstanceMap = {
	hubspot: Hubspot
}

/**
 * Liefert eine konkrete CRM-Instanz passend zu `name` und `init`.
 */
export function getCRM<N extends CRMName>(name: N): CRMInstanceMap[N] {
	const crm: CRMName = name
	switch (crm) {
		case "hubspot":
			return new Hubspot()
		default:
			crm satisfies never
			throw new Error(`Unknown CRM: ${String(crm)}`)
	}
}

/**
 * Gibt die Liste aller CRMs für die es eine Class gibt zurück
 * Nützlich für UI (Auswahl), Feature-Flags oder Validierung.
 */
export function listCRMs() {
	return CRMs
}




