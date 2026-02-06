import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Erstellt einen Supabase-Client für den Server.
 * .env = NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
 */
export async function createServerSupabase() {
    const cookieStore = await cookies();
  
    return createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
            } catch {
              // The `setAll` method was called from a Server Component.
              // This can be ignored if you have middleware refreshing
              // user sessions.
            }
          },
        },
      }
    );
  }

  /**
   * returns the user from the cookies wich were refreshed by the middleware (DONT FORGET MIDDLEWARE)
   * WICHTIG: throwed einen new Error bei einem fehler, für self-handling errors nutze 'safeGetUser()'
   * @returns the user 
   */
export async function getUser() {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims) {
        throw new Error(`Error getting claims: ${error?.message}`);
    }
    
    return {
        id: data.claims.sub,
        email: data.claims.email,
    }
}

/**
 * returns the user from the cookies wich were refreshed by the middleware (DONT FORGET MIDDLEWARE)
 * WICHTIG: returns null bei einem fehler also handlest du den error selbst
 * @returns the user or null
 */
export async function safeGetUser() {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims) {
        return null;
    }
    return {
        id: data.claims.sub,
        email: data.claims.email,
    }
}
  





