import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * WICHTIG: nutze im frontend einen 'createBrowserClient()' damit der sb-* token in den cookies gesetzt wird, !localStorage
 * -> Kurze Erklärung:
 * Dieser proxy server dient dazu, das wenn du mit einer 'createBrowserClient()' instanz das login und registrieren des 
 * users machst und somit die sb-* tokens in die cookies kommen und nicht localStorage wie bei 'createClient()', genau diese
 * tokens in den cookies abgecheckt werden, eine security massnnahme stattfindet ob die supabase-id nicht gespoofed ist
 * sondern es wirklich der user ist, und ob der access-token noch gültig ist oder per refreshtoken der access-token erneurt
 * werden soll. also -> createBrowserClient() -> sb-* tokens in cookies -> proxy server -> supabase.auth.getClaims() -> 
 * im server frische sb-daten weil dieser proxy frisch-gecheckte cookies weiterleitet!
 * WICHTIG: du musst im root von source eine proxy.ts file haben die genau so aussieht:
 * @example 
 *  import { NextRequest } from "next/server";
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
