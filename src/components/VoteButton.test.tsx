import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { axe } from "vitest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.hoisted(() => vi.fn());
const setVote = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/actions", () => ({ setVote }));

import { VoteButton } from "./VoteButton";

const ID = "33333333-3333-4333-8333-333333333333";
const status = () => document.getElementById("status")?.textContent ?? "";

function setup(props: { count?: number; voted?: boolean } = {}) {
  render(
    <main>
      <div id="status" role="status" />
      <h2 id="ideas-heading" tabIndex={-1}>
        Ideas
      </h2>
      <p id={`idea-${ID}-text`}>Dark mode</p>
      <VoteButton ideaId={ID} count={props.count ?? 2} voted={props.voted ?? false} />
    </main>,
  );
  return screen.getByRole("button", { name: /Upvote idea/ });
}

beforeEach(() => {
  refresh.mockReset();
  setVote.mockReset();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("ok")));
});

describe("VoteButton", () => {
  it("shows the stable name, the pressed state and is described by the idea text", async () => {
    const button = setup({ count: 1, voted: true });
    expect(button).toHaveAccessibleName("Upvote idea, 1 vote");
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveAccessibleDescription("Dark mode");
    expect((await axe(document.body)).violations).toEqual([]);
  });

  it("sends the opposite of what is shown, shows it at once, announces and refreshes", async () => {
    setVote.mockResolvedValue({ ok: true, count: 3, voted: true });
    const button = setup();
    fireEvent.click(button);
    await waitFor(() => {
      expect(button).toHaveAttribute("aria-pressed", "true");
    });
    expect(setVote).toHaveBeenCalledWith({ ideaId: ID, want: "on" });
    await waitFor(() => {
      expect(status()).toBe("Voted. Now 3 votes.");
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("sends off for a voted row and never shows a count below zero", async () => {
    setVote.mockResolvedValue({ ok: true, count: 0, voted: false });
    const button = setup({ count: 0, voted: true });
    fireEvent.click(button);
    await waitFor(() => {
      expect(setVote).toHaveBeenCalledWith({ ideaId: ID, want: "off" });
    });
    expect(button).toHaveAccessibleName("Upvote idea, 0 votes");
    await waitFor(() => {
      expect(status()).toBe("Not voted. Now 0 votes.");
    });
  });

  it("ignores a second press while a request is in flight and marks the button busy", async () => {
    let finish: (value: unknown) => void = () => undefined;
    setVote.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const button = setup();
    fireEvent.click(button);
    await waitFor(() => {
      expect(button).toHaveAttribute("aria-disabled", "true");
    });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(setVote).toHaveBeenCalledTimes(1);
    await act(() => {
      finish({ ok: true, count: 3, voted: true });
      return Promise.resolve();
    });
  });

  it.each([
    ["server", "Couldn't save your vote.", true],
    [
      "rate_limited",
      "You've reached the voting limit for now. Please try again in a little while.",
      false,
    ],
    ["invalid", "Couldn't save your vote.", false],
  ] as const)(
    "shows a %s failure in the row, not in the status region",
    async (code, text, refreshes) => {
      setVote.mockResolvedValue({ ok: false, code });
      const button = setup();
      fireEvent.click(button);
      expect(await screen.findByRole("alert")).toHaveTextContent(text);
      expect(button).toHaveAttribute("aria-pressed", "false");
      expect(status()).toBe("");
      await waitFor(() => {
        expect(refresh).toHaveBeenCalledTimes(refreshes ? 1 : 0);
      });
      expect((await axe(document.body)).violations).toEqual([]);
    },
  );

  it("treats a thrown call and a malformed answer as an unknown outcome: error and one refresh", async () => {
    setVote.mockRejectedValueOnce(new Error("boom"));
    const button = setup();
    fireEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save your vote.");
    await waitFor(() => {
      expect(refresh).toHaveBeenCalledTimes(1);
    });
    setVote.mockResolvedValueOnce({ nonsense: true });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => {
      expect(refresh).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("Try again resends the same wanted state and returns focus to the vote button", async () => {
    setVote.mockResolvedValueOnce({ ok: false, code: "rate_limited" });
    const button = setup();
    fireEvent.click(button);
    const again = await screen.findByRole("button", { name: "Try again" });
    setVote.mockResolvedValueOnce({ ok: true, count: 3, voted: true });
    fireEvent.click(again);
    await waitFor(() => {
      expect(setVote).toHaveBeenCalledTimes(2);
    });
    expect(setVote).toHaveBeenLastCalledWith({ ideaId: ID, want: "on" });
    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
    expect(button).toHaveFocus();
  });

  it("does not add a second vote when a retry finds the vote already stored", async () => {
    setVote.mockRejectedValueOnce(new Error("lost answer"));
    const tree = (voted: boolean, count: number) => (
      <main>
        <div id="status" role="status" />
        <h2 id="ideas-heading" tabIndex={-1}>
          Ideas
        </h2>
        <p id={`idea-${ID}-text`}>Dark mode</p>
        <VoteButton ideaId={ID} count={count} voted={voted} />
      </main>
    );
    const { rerender } = render(tree(false, 2));
    fireEvent.click(screen.getByRole("button", { name: /Upvote idea/ }));
    const again = await screen.findByRole("button", { name: "Try again" });
    // The recovery refresh brings the stored vote.
    rerender(tree(true, 3));
    let resolve: (value: unknown) => void = () => undefined;
    setVote.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    fireEvent.click(again);
    await waitFor(() => {
      expect(setVote).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByRole("button", { name: /Upvote idea/ })).toHaveAccessibleName(
      "Upvote idea, 3 votes",
    );
    resolve({ ok: true, count: 3, voted: true });
  });

  it("pressing the vote button on an error row clears the error and sends the new opposite", async () => {
    setVote.mockResolvedValueOnce({ ok: false, code: "rate_limited" });
    const button = setup();
    fireEvent.click(button);
    await screen.findByRole("alert");
    setVote.mockResolvedValueOnce({ ok: true, count: 3, voted: true });
    fireEvent.click(button);
    await waitFor(() => {
      expect(setVote).toHaveBeenCalledTimes(2);
    });
    expect(setVote).toHaveBeenLastCalledWith({ ideaId: ID, want: "on" });
    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });

  it("for no_voter, Try again loads the page first, then resends, without a refresh before", async () => {
    setVote.mockResolvedValueOnce({ ok: false, code: "no_voter" });
    const button = setup();
    fireEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Please reload the page and try again.",
    );
    expect(refresh).not.toHaveBeenCalled();
    setVote.mockResolvedValueOnce({ ok: true, count: 3, voted: true });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => {
      expect(setVote).toHaveBeenCalledTimes(2);
    });
    expect(fetch).toHaveBeenCalledWith("/", { credentials: "same-origin" });
  });

  it("announces idea_unavailable, shows no alert, refreshes and moves focus to the board heading", async () => {
    setVote.mockResolvedValue({ ok: false, code: "idea_unavailable" });
    const button = setup();
    fireEvent.click(button);
    await waitFor(() => {
      expect(status()).toBe("This idea is no longer on the board.");
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
