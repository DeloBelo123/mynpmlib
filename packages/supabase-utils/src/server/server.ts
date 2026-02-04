import { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

/** Strukturell kompatibel mit NextRequest (next/server) – nur Cookie-API. */
export type ReqWithCookies = {
    cookies: { getAll(): { name: string; value: string }[]; set(name: string, value: string): void };
} & Record<any,any>;

/**
 * Erstellt einen Supabase-Client für den Server.
 * .env = NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
 * @param req NextRequest von next/server (Route Handler) passt hier rein.
 */
export function createServerSupabase(req: ReqWithCookies): SupabaseClient {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        throw new Error("NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set!");
    }
    const c = req.cookies;
    const cookies = {
        getAll: () => c.getAll(),
        setAll(cookies: { name: string; value: string; options?: any }[]) {
            for (const x of cookies) c.set(x.name, x.value);
        },
    };
    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies }
    );
}

export async function getUser({ req }: { req: ReqWithCookies }) {
    const supabase = createServerSupabase(req)
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error) throw new Error(`Error getting user: ${error.message}`)
    if (!user) throw new Error("No user found")
    return user
}

export async function getSession({ req }: { req: ReqWithCookies }) {
    const supabase = createServerSupabase(req)
    const { data: { session }, error } = await supabase.auth.getSession()
    if (error) throw new Error(`Error getting session: ${error.message}`)
    if (!session) throw new Error("No session found")
    return session
}
  





