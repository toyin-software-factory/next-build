"use client";

import Script from "next/script";
import { useCallback, useEffect, useImperativeHandle, useRef, type Ref } from "react";

import { announce } from "@/lib/announce";
import { COPY } from "@/lib/copy";

/** What the form uses: a fresh token for each attempt, and a reset afterwards. */
export type TurnstileControl = {
  /** The current token, or the next one. Null when none arrives (script blocked, error, expired, timeout). */
  getToken: () => Promise<string | null>;
  /** Drops the used token and asks Cloudflare for a new one. */
  reset: () => void;
};

type RenderOptions = {
  sitekey: string;
  action: string;
  appearance: "interaction-only";
  theme: "auto";
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
  "timeout-callback": () => void;
  "unsupported-callback": () => void;
  "before-interactive-callback": () => void;
  "after-interactive-callback": () => void;
};

type TurnstileApi = {
  render: (container: HTMLElement, options: RenderOptions) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export const TURNSTILE_ACTION = "post_idea";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
/** How long getToken waits while no check is shown to the visitor. */
export const TOKEN_WAIT_MS = 10_000;

type Props = {
  siteKey: string | null;
  nonce: string;
  ref: Ref<TurnstileControl>;
};

export function TurnstileWidget({ siteKey, nonce, ref }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const token = useRef<string | null>(null);
  const interactive = useRef(false);
  const waiters = useRef<{ resolve: (value: string | null) => void; timer: number }[]>([]);

  const settle = useCallback((value: string | null) => {
    const pending = waiters.current;
    waiters.current = [];
    for (const waiter of pending) {
      window.clearTimeout(waiter.timer);
      waiter.resolve(value);
    }
  }, []);

  /** Ends one wait only, so an old timer never settles a later wait. */
  const expire = useCallback((waiter: { resolve: (value: string | null) => void }) => {
    if (interactive.current) return;
    waiters.current = waiters.current.filter((w) => w !== waiter);
    waiter.resolve(null);
  }, []);

  const fail = useCallback(() => {
    token.current = null;
    interactive.current = false;
    settle(null);
  }, [settle]);

  const renderWidget = useCallback(() => {
    const api = window.turnstile;
    if (api === undefined || container.current === null || siteKey === null) return;
    if (widgetId.current !== null) return;
    widgetId.current = api.render(container.current, {
      sitekey: siteKey,
      action: TURNSTILE_ACTION,
      appearance: "interaction-only",
      theme: "auto",
      callback: (value) => {
        token.current = value;
        settle(value);
      },
      "expired-callback": fail,
      "error-callback": fail,
      "timeout-callback": fail,
      "unsupported-callback": fail,
      "before-interactive-callback": () => {
        interactive.current = true;
        announce(COPY.challengeStep);
      },
      "after-interactive-callback": () => {
        interactive.current = false;
        announce("");
      },
    });
  }, [siteKey, settle, fail]);

  useImperativeHandle(
    ref,
    () => ({
      getToken: () => {
        if (siteKey === null) return Promise.resolve(null);
        if (token.current !== null) return Promise.resolve(token.current);
        return new Promise<string | null>((resolve) => {
          const waiter = {
            resolve,
            timer: 0,
          };
          // The limit only counts while no check is shown: a visitor completing one is never cut off.
          waiter.timer = window.setTimeout(() => {
            expire(waiter);
          }, TOKEN_WAIT_MS);
          waiters.current.push(waiter);
        });
      },
      reset: () => {
        token.current = null;
        const api = window.turnstile;
        if (api !== undefined && widgetId.current !== null) api.reset(widgetId.current);
      },
    }),
    [expire, siteKey],
  );

  useEffect(() => {
    // The script may already be loaded (a client side navigation back to the page).
    renderWidget();
    return () => {
      const api = window.turnstile;
      if (api !== undefined && widgetId.current !== null) api.remove(widgetId.current);
      widgetId.current = null;
      token.current = null;
      settle(null);
    };
  }, [renderWidget, settle]);

  if (siteKey === null) return null;
  return (
    <>
      <Script src={SCRIPT_SRC} nonce={nonce} strategy="afterInteractive" onReady={renderWidget} />
      <div ref={container} data-testid="turnstile" />
    </>
  );
}
