import { NextResponse, type NextRequest } from "next/server";

import { checkAccess, loadAccessConfig, logRefusal } from "@/lib/access";
import { ADMIN_HEADERS, isAdminPath, refusalHtml } from "@/lib/admin-refusal";
import { buildContentSecurityPolicy, generateNonce } from "@/lib/csp";
import { ensureVoterCookie } from "@/lib/voter-cookie";

// Sets a per request nonce based Content-Security-Policy. Next.js reads the nonce from the
// request's CSP header and applies it to its own inline scripts. Pages are dynamic anyway.
export async function middleware(request: NextRequest) {
  const nonce = generateNonce();
  const csp = buildContentSecurityPolicy(nonce, process.env.NODE_ENV === "development");

  // /admin and everything under it: the Worker checks the Access token itself (spec 0006). The page
  // and every admin action check again, so this is one of three locks, not the only one.
  if (isAdminPath(request.nextUrl.pathname)) {
    const access = await checkAccess(request.headers, await loadAccessConfig());
    if (!access.ok) {
      logRefusal("middleware", access.reason);
      return new NextResponse(refusalHtml(nonce), {
        status: 403,
        headers: {
          ...ADMIN_HEADERS,
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy": csp,
        },
      });
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  ensureVoterCookie(request, response);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
