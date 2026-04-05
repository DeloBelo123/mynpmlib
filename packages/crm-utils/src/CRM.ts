export abstract class CRM {
	abstract readonly provider: string

	abstract getContacts(options: {
		accessToken: string
		limit?: number
		after?: string
	}): Promise<unknown>

	abstract getCompanies(options: {
		accessToken: string
		limit?: number
		after?: string
	}): Promise<unknown>

	abstract createContact(options: {
		accessToken: string
		properties: Record<string, string | number | boolean | null>
	}): Promise<unknown>

	abstract updateContact(options: {
		accessToken: string
		id: string
		properties: Record<string, string | number | boolean | null>
	}): Promise<unknown>

	abstract createNote(options: {
		accessToken: string
		body: string
		associateToObjectType: string
		associateToId: string
	}): Promise<unknown>

	abstract searchRecords(options: {
		accessToken: string
		objectType: string
		filterGroups?: unknown[]
		properties?: string[]
		limit?: number
		after?: string
	}): Promise<unknown>
}
