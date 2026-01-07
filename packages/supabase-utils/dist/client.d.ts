import { type Provider, SupabaseClient } from "@supabase/supabase-js";
import { SupabaseTable } from "./server";
export type SupabaseClientConfig = {
    url: string;
    anonKey: string;
};
export declare function createSupabaseClient(config: SupabaseClientConfig): SupabaseClient;
/**
 * sendet die relevantesten daten der session an ein backend.
 * die daten sind: provider-token, refresh-token, userobjekt mit id und email (den erst nicht, nur diese 2 sind die wichtigsten)
 * WICHTIG: das ist eine async function, du muss sie awaiten!
 * @param supabase - der Supabase Client
 * @param toBackend = das ist die backend url an der du deine session schicken willst
 * @returns backend-response
 */
export declare function sendSession<T>({ supabase, toBackend, extraData }: {
    supabase: SupabaseClient;
    toBackend: string;
    extraData?: any;
}): Promise<{
    data: T;
    status: number;
    session?: undefined;
} | {
    data: T;
    status: number;
    session: import("@supabase/supabase-js").AuthSession;
} | {
    data: null;
    status: number;
    session?: undefined;
}>;
export interface OAuthProps {
    provider?: Provider;
    scopes?: Array<string> | undefined;
    redirectTo: string;
}
/**
 * kümmert sich um den OAuth login prozess
 * WICHTIG: das ist eine async function, du muss sie awaiten!
 * @param supabase - der Supabase Client
 * @param provider - der OAuth provider den du nutzen möchtest, standardmäßig ist es "google"
 * @param scopes - die scopes die du für den OAuth login möchtest, als Array
 * @param redirectTo - die url auf die der user zurückgeleitet wird nach dem login, muss in supabase als autorisierte url eingetragen sein
 * @returns nichts, startet einfach den OAuth login prozess
 */
export declare function OAuthLogin({ supabase, provider, scopes, redirectTo }: OAuthProps & {
    supabase: SupabaseClient;
}): Promise<void>;
export declare function addUser<T extends {
    user_id: string;
}>({ supabase, toTable }: {
    supabase: SupabaseClient;
    toTable: SupabaseTable<T>;
}): Promise<boolean>;
//# sourceMappingURL=client.d.ts.map