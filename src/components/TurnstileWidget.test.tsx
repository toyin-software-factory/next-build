import { act, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/lib/copy";

vi.mock("next/script", async () => {
  const { useEffect } = await import("react");
  return {
    default: function MockScript({ onReady }: { onReady?: () => void }) {
      useEffect(() => {
        onReady?.();
      }, [onReady]);
      return null;
    },
  };
});

const { TurnstileWidget, TOKEN_WAIT_MS } = await import("./TurnstileWidget");
import type { TurnstileControl } from "./TurnstileWidget";

type Options = Record<string, (value?: string) => void> & { action: string; appearance: string };
let options: Options;
const api = {
  render: vi.fn((_el: HTMLElement, o: Options) => {
    options = o;
    return "w1";
  }),
  reset: vi.fn(),
  remove: vi.fn(),
};

beforeEach(() => {
  vi.useFakeTimers();
  api.render.mockClear();
  api.reset.mockClear();
  api.remove.mockClear();
  (window as unknown as { turnstile: typeof api }).turnstile = api;
  const region = document.createElement("div");
  region.id = "status";
  document.body.appendChild(region);
});
afterEach(() => {
  vi.useRealTimers();
  document.getElementById("status")?.remove();
});

function mount(siteKey: string | null = "key") {
  const control = createRef<TurnstileControl>();
  render(<TurnstileWidget ref={control} siteKey={siteKey} nonce="abc" />);
  return control;
}

describe("TurnstileWidget (AC-12, AC-13)", () => {
  it("renders explicitly, invisible until a check is needed, for the post_idea action", () => {
    mount();
    expect(api.render).toHaveBeenCalledTimes(1);
    expect(options.action).toBe("post_idea");
    expect(options.appearance).toBe("interaction-only");
  });

  it("returns the token it already has, and the next one when it has none", async () => {
    const control = mount();
    const early = control.current?.getToken();
    options.callback?.("tok-a");
    await expect(early).resolves.toBe("tok-a");
    await expect(control.current?.getToken()).resolves.toBe("tok-a");
  });

  it("gives null after 10 seconds when nothing arrives", async () => {
    const control = mount();
    const wait = control.current?.getToken();
    await vi.advanceTimersByTimeAsync(TOKEN_WAIT_MS);
    await expect(wait).resolves.toBeNull();
  });

  it("an old timer never ends a later wait (overlapping waits)", async () => {
    const control = mount();
    const first = control.current?.getToken();
    await vi.advanceTimersByTimeAsync(TOKEN_WAIT_MS - 1000);
    options.callback?.("tok-1");
    await expect(first).resolves.toBe("tok-1");
    act(() => {
      control.current?.reset();
    });
    const second = control.current?.getToken();
    let done = false;
    void second?.then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(1500);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(TOKEN_WAIT_MS);
    await expect(second).resolves.toBeNull();
  });

  it("does not cut off a visitor who is completing a shown check", async () => {
    const control = mount();
    const wait = control.current?.getToken();
    act(() => {
      options["before-interactive-callback"]?.();
    });
    await vi.advanceTimersByTimeAsync(TOKEN_WAIT_MS * 3);
    let done = false;
    void wait?.then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false);
    options.callback?.("late");
    await expect(wait).resolves.toBe("late");
  });

  it.each(["expired-callback", "error-callback", "timeout-callback", "unsupported-callback"])(
    "%s ends the wait with null and drops the token",
    async (name) => {
      const control = mount();
      options.callback?.("tok");
      options[name]?.();
      const wait = control.current?.getToken();
      options[name]?.();
      await expect(wait).resolves.toBeNull();
    },
  );

  it("says the check is needed through the status region, once, and clears it afterwards", () => {
    mount();
    vi.stubGlobal("requestAnimationFrame", (cb: () => void) => {
      cb();
      return 0;
    });
    act(() => {
      options["before-interactive-callback"]?.();
    });
    expect(document.getElementById("status")?.textContent).toBe(COPY.challengeStep);
    act(() => {
      options["after-interactive-callback"]?.();
    });
    expect(document.getElementById("status")?.textContent).toBe("");
    vi.unstubAllGlobals();
  });

  it("reset drops the token and asks Cloudflare for a new one", async () => {
    const control = mount();
    options.callback?.("tok");
    control.current?.reset();
    expect(api.reset).toHaveBeenCalledWith("w1");
    const wait = control.current?.getToken();
    options.callback?.("tok2");
    await expect(wait).resolves.toBe("tok2");
  });

  it("without a site key renders nothing and gives null at once", async () => {
    const control = mount(null);
    expect(api.render).not.toHaveBeenCalled();
    await expect(control.current?.getToken()).resolves.toBeNull();
  });

  it("removes the widget when it unmounts", () => {
    const control = createRef<TurnstileControl>();
    const view = render(<TurnstileWidget ref={control} siteKey="key" nonce="n" />);
    view.unmount();
    expect(api.remove).toHaveBeenCalledWith("w1");
  });
});
