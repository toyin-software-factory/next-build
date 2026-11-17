import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PostResult } from "@/app/actions";

const refresh = vi.fn();
const postIdea = vi.fn<(input: unknown) => Promise<PostResult>>();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/actions", () => ({ postIdea: (input: unknown) => postIdea(input) }));

// The real script is never loaded in unit tests: the mock reports "ready" at once.
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

const { IdeaForm: RawIdeaForm } = await import("./IdeaForm");

type Options = { callback: (token: string) => void };
const fake = {
  count: 0,
  options: null as Options | null,
  render: vi.fn((_el: HTMLElement, options: Options) => {
    fake.options = options;
    options.callback(`token-${String(++fake.count)}`);
    return "w1";
  }),
  reset: vi.fn(() => {
    fake.options?.callback(`token-${String(++fake.count)}`);
  }),
  remove: vi.fn(),
};

function IdeaForm({ siteKey = "site-key" }: { siteKey?: string | null }) {
  return <RawIdeaForm siteKey={siteKey} nonce="n" />;
}

beforeEach(() => {
  refresh.mockReset();
  postIdea.mockReset();
  fake.count = 0;
  fake.options = null;
  fake.render.mockClear();
  fake.reset.mockClear();
  (window as unknown as { turnstile: typeof fake }).turnstile = fake;
});

function type(text: string, key?: { key: string; shiftKey?: boolean }) {
  const field = screen.getByLabelText(/idea/i);
  fireEvent.change(field, { target: { value: text } });
  if (key) fireEvent.keyDown(field, key);
}

describe("IdeaForm", () => {
  it("sends on Enter, clears the field and refreshes the board", async () => {
    postIdea.mockResolvedValue({ ok: true });
    render(<IdeaForm />);
    type("Dark mode", { key: "Enter" });
    await waitFor(() => {
      expect(refresh).toHaveBeenCalledTimes(1);
    });
    expect(postIdea).toHaveBeenCalledWith(expect.objectContaining({ text: "Dark mode" }));
    expect(screen.getByLabelText(/idea/i)).toHaveValue("");
  });

  it("does not send on Shift+Enter", () => {
    render(<IdeaForm />);
    type("Hello", { key: "Enter", shiftKey: true });
    expect(postIdea).not.toHaveBeenCalled();
  });

  it("shows the refusal under the field and keeps the text", async () => {
    postIdea.mockResolvedValue({ ok: false, code: "empty" });
    render(<IdeaForm />);
    type(" ", { key: "Enter" });
    expect(await screen.findByText(/./, { selector: "p[id$='-error'] span" })).toBeVisible();
    expect(screen.getByLabelText(/idea/i)).toHaveAttribute("aria-invalid", "true");
  });

  it("clears the field error on any edit so it never shows a stale count", async () => {
    postIdea.mockResolvedValue({ ok: false, code: "too_long", over: 5 });
    render(<IdeaForm />);
    type("x".repeat(145), { key: "Enter" });
    expect(await screen.findByText(/./, { selector: "p[id$='-error'] span" })).toBeVisible();
    type("x".repeat(141));
    expect(document.querySelector("p[id$='-error']")).toBeNull();
  });

  it("announces a refused submit in the status region", async () => {
    const region = document.createElement("div");
    region.id = "status";
    document.body.appendChild(region);
    postIdea.mockResolvedValue({ ok: false, code: "empty" });
    render(<IdeaForm />);
    type(" ", { key: "Enter" });
    await waitFor(() => {
      expect(region.textContent).not.toBe("");
    });
    region.remove();
  });

  it("reuses the submission id when retrying the same text after a failure", async () => {
    postIdea
      .mockResolvedValueOnce({ ok: false, code: "server" })
      .mockResolvedValueOnce({ ok: true });
    render(<IdeaForm />);
    type("Same idea", { key: "Enter" });
    fireEvent.click(await screen.findByRole("button", { name: /try again/i }));
    await waitFor(() => {
      expect(postIdea).toHaveBeenCalledTimes(2);
    });
    const ids = postIdea.mock.calls.map(
      ([input]) => (input as { submissionId: string }).submissionId,
    );
    expect(ids[0]).toBe(ids[1]);
  });

  it("locks the field and button while sending, sends once for a double press, then unlocks (AC-11)", async () => {
    let finish: (value: PostResult) => void = () => undefined;
    postIdea.mockImplementation(
      () =>
        new Promise<PostResult>((resolve) => {
          finish = resolve;
        }),
    );
    render(<IdeaForm />);
    type("Slow idea");
    const button = screen.getByRole("button", { name: "Add idea" });
    fireEvent.click(button);
    const sendingButton = await screen.findByRole("button", { name: "Adding…" });
    const field = screen.getByLabelText(/idea/i);
    expect(field).toHaveAttribute("readonly");
    expect(field).toHaveAttribute("aria-busy", "true");
    expect(sendingButton).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(sendingButton);
    fireEvent.keyDown(field, { key: "Enter" });
    finish({ ok: true });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add idea" })).toHaveAttribute(
        "aria-disabled",
        "false",
      );
    });
    expect(postIdea).toHaveBeenCalledTimes(1);
    expect(field).not.toHaveAttribute("readonly");
    expect(field).toHaveAttribute("aria-busy", "false");
  });

  it("is editable again after a failure and keeps the text (AC-8, AC-11)", async () => {
    postIdea.mockResolvedValue({ ok: false, code: "server" });
    render(<IdeaForm />);
    type("Keep me", { key: "Enter" });
    await screen.findByRole("alert");
    const field = screen.getByLabelText(/idea/i);
    expect(field).not.toHaveAttribute("readonly");
    expect(field).toHaveValue("Keep me");
  });

  it("after no_voter, loads the page first, then resends the same text and submission id (AC-9)", async () => {
    let loaded: () => void = () => undefined;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          loaded = () => {
            resolve(new Response("ok"));
          };
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    postIdea
      .mockResolvedValueOnce({ ok: false, code: "no_voter" })
      .mockResolvedValueOnce({ ok: true });
    render(<IdeaForm />);
    type("Needs a cookie", { key: "Enter" });
    expect(await screen.findByText("Please reload the page and try again.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledTimes(1);
    });
    expect(postIdea).toHaveBeenCalledTimes(1);
    loaded();
    await waitFor(() => {
      expect(postIdea).toHaveBeenCalledTimes(2);
    });
    const calls = postIdea.mock.calls.map(
      ([input]) => input as { submissionId: string; text: string },
    );
    expect(calls[1]?.text).toBe("Needs a cookie");
    expect(calls[1]?.submissionId).toBe(calls[0]?.submissionId);
    vi.unstubAllGlobals();
  });

  it("shows a server failure when the action throws", async () => {
    postIdea.mockRejectedValue(new Error("boom"));
    render(<IdeaForm />);
    type("x", { key: "Enter" });
    expect(await screen.findByRole("alert")).toBeVisible();
  });

  it("sends the token with the idea and resets the widget after the attempt (AC-12, AC-13)", async () => {
    postIdea.mockResolvedValue({ ok: true });
    render(<IdeaForm />);
    type("First", { key: "Enter" });
    await waitFor(() => {
      expect(refresh).toHaveBeenCalledTimes(1);
    });
    expect(postIdea).toHaveBeenCalledWith(expect.objectContaining({ token: "token-1" }));
    expect(fake.reset).toHaveBeenCalledTimes(1);
    type("Second", { key: "Enter" });
    await waitFor(() => {
      expect(postIdea).toHaveBeenCalledTimes(2);
    });
    expect(postIdea).toHaveBeenLastCalledWith(expect.objectContaining({ token: "token-2" }));
  });

  it("resets the widget after a refused attempt too, and Try again uses a fresh token", async () => {
    postIdea
      .mockResolvedValueOnce({ ok: false, code: "rate_limited" })
      .mockResolvedValueOnce({ ok: true });
    render(<IdeaForm />);
    type("Idea", { key: "Enter" });
    fireEvent.click(await screen.findByRole("button", { name: /try again/i }));
    await waitFor(() => {
      expect(postIdea).toHaveBeenCalledTimes(2);
    });
    const tokens = postIdea.mock.calls.map(([input]) => (input as { token: string }).token);
    expect(tokens).toEqual(["token-1", "token-2"]);
    expect(fake.reset).toHaveBeenCalledTimes(2);
  });

  it("shows the challenge_failed message and never calls the server when there is no token", async () => {
    render(<IdeaForm siteKey={null} />);
    type("Idea", { key: "Enter" });
    expect(await screen.findByRole("alert")).toHaveTextContent(/confirm you're not a robot/i);
    expect(postIdea).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /try again/i })).toBeVisible();
  });
});
