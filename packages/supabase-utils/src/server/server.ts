import { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

// das hier ist motto ein type für alle Request-Objekte die das hier haben müssen, ts typed strukturell (motto "HAT typ x alles von typ y" anstatt "IST typ x = typ y")
export interface ServerRequestLike {
    cookies: {
      getAll(): { name: string; value: string }[]
      setAll(cookies: { name: string; value: string; options?: any }[]): void
    }
}
  
/**
 * erstellt einen supabase client für den server
 * .env = NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
 * @param req das request objekt
 * @returns den supabase client
 */
export function createServerSupabase(req: ServerRequestLike): SupabaseClient {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        throw new Error("NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set, but needed for server-side supabase client!")
    }
    return createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return req.cookies.getAll()
          },
          setAll(cookies) {
            req.cookies.setAll(cookies)
          },
        },
      }
    )
}

export async function getUser({req}:{req: ServerRequestLike}){
    const supabase = createServerSupabase(req)
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error) throw new Error(`Error getting user: ${error.message}`)
    if (!user) throw new Error("No user found")
    return user
}

export async function getSession({req}:{req: ServerRequestLike}){
    const supabase = createServerSupabase(req)
    const { data: { session }, error } = await supabase.auth.getSession()
    if (error) throw new Error(`Error getting session: ${error.message}`)
    if (!session) throw new Error("No session found")
    return session
}
  





