import { COPY } from "./copy";

/** Words on the admin refusal page (in copy.ts). Same for every cause, so nothing tells an outsider what failed. */
export const ADMIN_REFUSAL_TEXT = COPY.adminRefusal;

/** Headers every /admin response carries (spec 0006): never cached, never indexed. */
export const ADMIN_HEADERS = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex",
} as const;

/** True for /admin and anything under it, also with percent encoding, case changes or a trailing slash. */
export function isAdminPath(pathname: string): boolean {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // A malformed escape never reaches a real route, but treat it as admin to stay safe.
    return /^\/(%61|a)dmin/i.test(pathname);
  }
  return /^\/+admin(\/|$)/i.test(decoded);
}

/**
 * The refusal page as one small HTML string for the middleware (no React in middleware). The nonce
 * lets the one inline style pass the page's CSP. No scripts, no links, no data.
 */
export function refusalHtml(nonce: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="robots" content="noindex"><title>Admin only</title><style nonce="${nonce}">body{margin:0;min-height:100vh;display:grid;place-items:center;padding:1rem;font:1rem/1.5 ui-sans-serif,system-ui,sans-serif;background:#fafafa;color:#171717}@media(prefers-color-scheme:dark){body{background:#0a0a0a;color:#fafafa}}main{max-width:32rem}h1{font-size:1.25rem;line-height:1.75rem;margin:0}</style></head><body><main><h1>${ADMIN_REFUSAL_TEXT}</h1></main></body></html>`;
}
