/**
 * Builds the per request Content-Security-Policy (spec 0001). The nonce lets Next.js's own
 * inline scripts run; `strict-dynamic` trusts scripts those load, including Turnstile's api.js.
 */
export function buildContentSecurityPolicy(nonce: string, isDev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com${isDev ? " 'unsafe-eval'" : ""}`,
    // A nonce makes browsers ignore 'unsafe-inline', so development (Next's dev overlay and
    // hot reload inject un-nonced styles) gets 'unsafe-inline' without the nonce.
    isDev ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-src https://challenges.cloudflare.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function generateNonce(): string {
  return btoa(crypto.randomUUID());
}
