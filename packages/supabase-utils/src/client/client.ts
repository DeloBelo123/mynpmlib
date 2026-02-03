import { createClient, type Provider, SupabaseClient } from "@supabase/supabase-js";
import axios from "axios";

export type SupabaseClientConfig = {
    url: string
    anonKey: string
}

export function createSupabaseClient(config: SupabaseClientConfig): SupabaseClient {
    return createClient(config.url, config.anonKey)
}

/**
 * sendet die relevantesten daten der session an ein backend. 
 * die daten sind: provider-token, refresh-token, userobjekt mit id und email (den erst nicht, nur diese 2 sind die wichtigsten)
 * WICHTIG: das ist eine async function, du muss sie awaiten!
 * @param supabase - der Supabase Client
 * @param toBackend = das ist die backend url an der du deine session schicken willst
 * @returns backend-response
 */
export async function sendSession<T>({supabase, toBackend,extraData}:{supabase: SupabaseClient,toBackend:string, extraData?:any}){
    const { data, error:sessionError } = await supabase.auth.getSession()
    console.log(`google_access_token:${data.session?.provider_token}`)
    console.log(`google_refresh_token:${data.session?.provider_refresh_token}`)
    console.log(`user_id und mail = id:${data.session?.user.id} + email:${data.session?.user.email}`)
    if (sessionError) throw new Error("fehler beim session Kriegen!")
    if (!data.session) {
        console.warn("Keine aktive Session - User ist nicht eingeloggt!")
        // Return a mock response or handle gracefully instead of throwing
        return {
            data: { message: "User not logged in", success: false } as T,
            status: 401
        }
    }
    try{
        const { data:backendData,status } = await axios.post<T>(
            toBackend,
            {
                google_access_token:data.session?.provider_token,
                google_refresh_token:data.session?.provider_refresh_token || null,
                user:{
                    id:data.session?.user.id,
                    email:data.session?.user.email
                },
                ...(extraData !== undefined && { extraData })
            }
        )
        return { data:backendData,status,session:data.session }
    }catch(e) {
        if (axios.isAxiosError(e)) {
            console.error(`Axios Fehler:, {
                status: ${e.response?.status},
                data: ${e.response?.data},
                message: ${e.message},
                code: ${e.code},
                config: {
                    url: ${e.config?.url},
                    method: ${e.config?.method},
                    baseURL: ${e.config?.baseURL}
                }
            }`)
            return { data: null, status: e.response?.status || 500 }
        } else {
            console.error("Unbekannter Fehler:", e)
            return { data: null, status: 500 }
        }
    }
}

export interface OAuthProps{
    provider?:Provider 
    scopes?:Array<string> | undefined
    redirectTo:string
}
/**
 * kümmert sich um den OAuth login prozess
 * WICHTIG: das ist eine async function, du muss sie awaiten!
 * @param supabase - der Supabase Client, standardmäßig ist es der client mit den .env variablen
 * @param provider - der OAuth provider den du nutzen möchtest, standardmäßig ist es "google"
 * @param scopes - die scopes die du für den OAuth login möchtest, als Array
 * @param redirectTo - die url auf die der user zurückgeleitet wird nach dem login, muss in supabase als autorisierte url eingetragen sein
 * @returns nichts, startet einfach den OAuth login prozess
 */
export async function OAuthLogin({supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!), provider = "google",scopes,redirectTo}:OAuthProps & {supabase?: SupabaseClient}){
    if(!supabase) throw new Error("No supabase client provided, check your .env file (NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY) or give in a instance yourself")
        const { error:SignInError } = await supabase.auth.signInWithOAuth({
            provider: provider,
            options: {
                scopes:scopes ? scopes.join(" ") : undefined,
                redirectTo:redirectTo
            }
        })
        if (SignInError) throw new Error("fehler beim OAuth Sign in!")  
    }

/**
 * holt das user-objekt von supabase (nicht zu verwechseln mit einer row aus deiner tabelle) aus der session
 * @param supabase - der Supabase Client, standardmäßig ist es der client mit den .env variablen
 * @returns das user-objekt
 */
export async function getUser({supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)}:{supabase?: SupabaseClient} = {}){
    const { data: { user }, error } = await supabase.auth.getUser()
    if(error) throw new Error("Error beim user kriegen in der 'getUser' function, Error: " + error)
    if(!user) throw new Error("Kein User gekriegt beim 'getUser' function call!")
    return user
}

/**
 * gibt dir die supabase session
 * @param supabase - der Supabase Client, standardmäßig ist es der client mit den .env variablen
 * @returns die session
 */
export async function getSession({supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)}:{supabase?: SupabaseClient} = {}){
    const { data: { session }, error } = await supabase.auth.getSession()
    if(error) throw new Error("Error beim session kriegen in der 'getSession' function, Error: " + error)
    if(!session) throw new Error("Keine Session gekriegt beim 'getSession' function call!")
    return session
}
