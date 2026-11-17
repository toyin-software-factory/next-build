import { test as base, type BrowserContext } from "@playwright/test";

/** A random IPv6 address. Each test gets its own /64 so the address limits (spec 0007) never cross tests. */
export function randomClientIp(): string {
  const group = () => Math.floor(Math.random() * 0x10000).toString(16);
  return `2001:db8:${group()}:${group()}:${group()}:${group()}:${group()}:${group()}`;
}

export const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js**";
export const DUMMY_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

// A stand in for Cloudflare's api.js: hands out the documented dummy token. The server still calls the
// real siteverify with the published test secret, so the server side check is real.
const STUB = `
window.turnstile = {
  render(el, o) { window.__turnstile = o; setTimeout(() => o.callback("${DUMMY_TOKEN}"), 0); return "stub"; },
  reset() { setTimeout(() => window.__turnstile.callback("${DUMMY_TOKEN}"), 0); },
  remove() {},
};
`;

/** Gives a browser context its own client address (same origin requests only) and, optionally, the stub widget. */
export async function prepare(
  context: BrowserContext,
  options: { ip?: string; stub?: boolean; origin?: string } = {},
): Promise<string> {
  const ip = options.ip ?? randomClientIp();
  await context.route(
    (url) => url.origin === (options.origin ?? "http://localhost:8787"),
    (route) =>
      route.continue({ headers: { ...route.request().headers(), "cf-connecting-ip": ip } }),
  );
  if (options.stub ?? true) {
    await context.route(TURNSTILE_SCRIPT, (route) =>
      route.fulfill({ contentType: "application/javascript", body: STUB }),
    );
  }
  return ip;
}

type Fixtures = { clientIp: string; stubTurnstile: boolean };

export const test = base.extend<Fixtures>({
  stubTurnstile: [true, { option: true }],
  // Automatic, so every test's context gets its own address before the page opens.
  clientIp: [
    async ({ context, stubTurnstile, baseURL }, provide) => {
      const origin = new URL(baseURL ?? "http://localhost:8787").origin;
      await provide(await prepare(context, { stub: stubTurnstile, origin }));
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";
