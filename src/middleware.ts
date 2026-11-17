import { NextResponse, type NextRequest } from "next/server";

import { buildContentSecurityPolicy, generateNonce } from "@/lib/csp";

// Sets a per request nonce based Content-Security-Policy. Next.js reads the nonce from the
// request's CSP header and applies it to its own inline scripts. Pages are dynamic anyway.
export function middleware(request: NextRequest) {
  const nonce = generateNonce();
  const csp = buildContentSecurityPolicy(nonce, process.env.NODE_ENV === "development");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
