import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * WICHTIG: nutze im frontend einen 'createBrowserClient()' damit der sb-* token in den cookies gesetzt wird, !localStorage
 * WICHTIG: du musst im root von source eine proxy.ts file haben die genau so aussieht:
 * @example import { NextRequest } from "next/server";
    import { supabaseAuthProxy } from "@delofarag/supabase-utils";

    // (copy-paste this):
    export async function proxy(request: NextRequest) {
    return supabaseAuthProxy(request);
    }
    
    // (copy-paste this):
    export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
 * @param request 
 * @returns 
 */
export async function supabaseAuthProxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  );

  await supabase.auth.getClaims();

  return response;
}
