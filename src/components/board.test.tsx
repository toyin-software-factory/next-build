import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/actions", () => ({ setVote: vi.fn(), postIdea: vi.fn() }));

import { CharacterCounter } from "./CharacterCounter";
import { IdeaList } from "./IdeaList";

const ideas = [
  {
    id: "a",
    text: "Dark mode",
    createdAt: Date.parse("2026-11-01T10:00:00Z"),
    votes: 3,
    voted: false,
  },
  {
    id: "b",
    text: "Emoji 👍 reactions",
    createdAt: Date.parse("2026-11-02T10:00:00Z"),
    votes: 0,
    voted: false,
  },
];

describe("CharacterCounter", () => {
  it("shows plain count below 120, a left cue from 120, an over cue past 140", () => {
    const { rerender } = render(<CharacterCounter id="c" length={50} />);
    expect(screen.getByText("50 / 140")).toBeVisible();
    expect(screen.queryByText(/left|over/)).toBeNull();
    rerender(<CharacterCounter id="c" length={130} />);
    expect(screen.getByText(/10 left/)).toBeVisible();
    rerender(<CharacterCounter id="c" length={145} />);
    expect(screen.getByText(/5 over/)).toBeVisible();
  });
});

describe("IdeaList", () => {
  it("renders each idea in order with a labelled vote count", () => {
    render(<IdeaList ideas={ideas} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Dark mode");
    expect(items[1]).toHaveTextContent("Emoji 👍 reactions");
  });

  it("keeps each row's own vote button when the order changes (AC-5)", () => {
    const { rerender } = render(<IdeaList ideas={ideas} />);
    const before = screen.getAllByRole("button", { name: /Upvote idea/ });
    const bButton = before[1];
    bButton?.focus();
    const [a, b] = ideas;
    if (!a || !b) throw new Error("fixture");
    rerender(<IdeaList ideas={[{ ...b, votes: 4, voted: true }, a]} />);
    const after = screen.getAllByRole("button", { name: /Upvote idea/ });
    expect(after[0]).toBe(bButton);
    expect(after[0]).toHaveFocus();
    expect(after[0]).toHaveAttribute("aria-pressed", "true");
  });

  it("has no axe violations", async () => {
    const { container } = render(<IdeaList ideas={ideas} />);
    expect((await axe(container)).violations).toEqual([]);
  });
});
