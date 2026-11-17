import { fireEvent, render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { describe, expect, it } from "vitest";

import { EmptyState } from "./EmptyState";

// Spec 0004, AC-6: the empty board.
describe("EmptyState (AC-6)", () => {
  it("shows the empty heading and the body text", () => {
    render(<EmptyState />);
    expect(screen.getByRole("heading", { name: "No ideas yet" })).toBeVisible();
    expect(screen.getByText(/be the first to suggest/i)).toBeVisible();
  });

  it("moves focus to the idea field when Write an idea is pressed", () => {
    const field = document.createElement("textarea");
    field.id = "idea-field";
    document.body.appendChild(field);
    render(<EmptyState />);
    fireEvent.click(screen.getByRole("button", { name: "Write an idea" }));
    expect(field).toHaveFocus();
    field.remove();
  });

  it("has no axe violations", async () => {
    const { container } = render(<EmptyState />);
    expect((await axe(container)).violations).toEqual([]);
  });
});
