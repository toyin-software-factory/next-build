import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/admin/actions", () => ({ setHidden: vi.fn() }));

import { AdminIdeaList } from "./AdminIdeaList";

const ideas = [
  {
    id: "a",
    text: "Dark mode",
    createdAt: Date.UTC(2026, 10, 16, 14, 5),
    votes: 4,
    hiddenAt: null,
  },
  { id: "b", text: "Spam spam", createdAt: Date.UTC(2026, 10, 15, 9, 0), votes: 0, hiddenAt: 5 },
];

describe("AdminIdeaList", () => {
  it("shows an empty message with no ideas", () => {
    render(<AdminIdeaList ideas={[]} />);
    expect(screen.getByText("No ideas yet. New ideas will show up here.")).toBeInTheDocument();
  });

  it("renders a labelled list and a table from the same rows", () => {
    render(<AdminIdeaList ideas={ideas} />);
    const list = screen.getByRole("list", { name: "Ideas, admin view", hidden: true });
    expect(within(list).getAllByRole("listitem", { hidden: true })).toHaveLength(2);
    expect(within(list).getByText("Votes: 4", { exact: false })).toBeInTheDocument();
    expect(within(list).getByText(/16 Nov 2026, 14:05 UTC/)).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Ideas, admin view", hidden: true });
    expect(
      within(table)
        .getAllByRole("columnheader", { hidden: true })
        .map((h) => h.textContent),
    ).toEqual(["Idea", "Votes", "Added", "Status", "Action"]);
    expect(within(table).getAllByRole("row", { hidden: true })).toHaveLength(3);
  });

  it("marks hidden ideas with a Hidden badge and offers Unhide, visible ones Hide", () => {
    render(<AdminIdeaList ideas={ideas} />);
    expect(screen.getAllByText("Hidden", { exact: true })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Unhide idea", hidden: true })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Hide idea", hidden: true })).toHaveLength(2);
  });

  it("gives each rendering its own text ids and passes axe", async () => {
    const { container } = render(<AdminIdeaList ideas={ideas} />);
    expect(container.querySelector("#admin-list-a-text")).not.toBeNull();
    expect(container.querySelector("#admin-table-a-text")).not.toBeNull();
    expect((await axe(container)).violations).toEqual([]);
  });
});
