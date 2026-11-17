import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PostResult } from "@/app/actions";

const refresh = vi.fn();
const postIdea = vi.fn<(input: unknown) => Promise<PostResult>>();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/actions", () => ({ postIdea: (input: unknown) => postIdea(input) }));

const { IdeaForm } = await import("./IdeaForm");

beforeEach(() => {
  refresh.mockReset();
  postIdea.mockReset();
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

  it("shows a server failure when the action throws", async () => {
    postIdea.mockRejectedValue(new Error("boom"));
    render(<IdeaForm />);
    type("x", { key: "Enter" });
    expect(await screen.findByRole("alert")).toBeVisible();
  });
});
