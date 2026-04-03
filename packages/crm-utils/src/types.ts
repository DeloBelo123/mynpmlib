/**
 * Flacher Record für OAuth/Tokens — ohne Generics.
 * Felder je nach Phase optional; Callbacks/Returns nutzen dasselbe Shape.
 */
export interface TokenStore {
    /**
     * von dir erfundener code zur wiederfindung des aktuellen users per oauth
     */
    state?: string
    /**
     * die ID des users von seiner crm, wird bei jedem call der crm an meine app mitgeschickt
     */
    provider_account_id?: string
    /**
     * die supabase-id
     */
    id?: string
    provider?: "hubspot" | string & {}
    token_last_refreshed_at?: string | Date
    token_expires_at?: string | Date | null
    access_token?: string
    refresh_token?: string | null
}


