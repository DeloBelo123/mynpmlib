/**
 * Flacher Record für OAuth/Tokens — ohne Generics.
 * Felder je nach Phase optional; Callbacks/Returns nutzen dasselbe Shape.
 */
export interface TokenStore {
    /**
     * die supabase-id
     */
    id?: string
    /**
     * von dir erfundener code zur wiederfindung des aktuellen users per oauth
     */
    crm_state?: string
    /**
     * die ID des users von seiner crm, wird bei jedem call der crm an meine app mitgeschickt
     */
    crm_account_id?: string

    crm_provider?: "hubspot" | string & {}
    crm_access_token_last_refreshed_at?: string | Date
    crm_access_token_expires_at?: string | Date | null
    crm_access_token?: string
    crm_refresh_token?: string | null
}


