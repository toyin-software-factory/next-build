import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

const refresh = vi.hoisted(() => vi.fn());
const setHidden = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/admin/actions", () => ({ setHidden }));

import { HideButton } from "./HideButton";

const ID = "44444444-4444-4444-8444-444444444444";
const status = () => document.getElementById("status")?.textContent ?? "";

function setup(hidden = false) {
  render(
    <main>
      <div id="status" role="status" />
      <p id="t">Dark mode</p>
      <HideButton ideaId={ID} hidden={hidden} describedBy="t" />
    </main>,
  );
  return screen.getByRole("button");
}

beforeEach(() => {
  refresh.mockReset();
  setHidden.mockReset();
});

describe("HideButton", () => {
  it("names its action, is described by the idea and passes axe", async () => {
    const button = setup();
    expect(button).toHaveAccessibleName("Hide idea");
    expect(button).toHaveTextContent("Hide");
    expect(button).toHaveAccessibleDescription("Dark mode");
    expect((await axe(document.body)).violations).toEqual([]);
  });

  it("sends hidden true, flips the label at once, announces and refreshes", async () => {
    setHidden.mockResolvedValue({ ok: true, hidden: true });
    const button = setup();
    fireEvent.click(button);
    await waitFor(() => {
      expect(button).toHaveAccessibleName("Unhide idea");
    });
    expect(setHidden).toHaveBeenCalledWith({ ideaId: ID, hidden: true });
    await waitFor(() => {
      expect(status()).toBe("Idea hidden");
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(button).toHaveFocus();
  });

  it("sends hidden false for a hidden idea and says it is shown again", async () => {
    setHidden.mockResolvedValue({ ok: true, hidden: false });
    const button = setup(true);
    expect(button).toHaveAccessibleName("Unhide idea");
    fireEvent.click(button);
    await waitFor(() => {
      expect(setHidden).toHaveBeenCalledWith({ ideaId: ID, hidden: false });
    });
    await waitFor(() => {
      expect(status()).toBe("Idea shown again");
    });
  });

  it("shows a row error and a Try again that sends the same wanted state", async () => {
    setHidden.mockResolvedValueOnce({ ok: false, code: "server" });
    const button = setup();
    fireEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't hide this idea.");
    expect(button).toHaveAccessibleName("Hide idea");
    setHidden.mockResolvedValueOnce({ ok: true, hidden: true });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => {
      expect(setHidden).toHaveBeenLastCalledWith({ ideaId: ID, hidden: true });
    });
    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });

  it("says Couldn't show this idea. when unhiding fails", async () => {
    setHidden.mockResolvedValue({ ok: false, code: "not_found" });
    fireEvent.click(setup(true));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't show this idea.");
  });

  it.each([
    ["forbidden", () => setHidden.mockResolvedValue({ ok: false, code: "forbidden" })],
    ["a thrown call", () => setHidden.mockRejectedValue(new Error("redirect"))],
  ])("shows the sign in ended message with Reload on %s", async (_name, arrange) => {
    arrange();
    fireEvent.click(setup());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your admin sign in has ended. Reload this page to sign in again.",
    );
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });
});
