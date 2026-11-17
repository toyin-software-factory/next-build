import { act, fireEvent, render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { afterEach, describe, expect, it, vi } from "vitest";

import BoardError from "./error";

// Spec 0004, AC-7: the board could not load.
afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

function runFrames() {
  vi.stubGlobal("requestAnimationFrame", (cb: () => void) => {
    cb();
    return 0;
  });
}

describe("error.tsx (AC-7)", () => {
  it("shows the plain message with a Try again button and no technical detail", () => {
    render(<BoardError error={new Error("D1_ERROR: secret detail")} retry={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't load the ideas. Try again.");
    expect(document.body).not.toHaveTextContent("secret detail");
  });

  it("calls retry() when Try again is pressed", () => {
    const retry = vi.fn();
    render(<BoardError error={new Error("x")} retry={retry} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("moves focus to the Ideas heading after a retry works", () => {
    runFrames();
    const heading = document.createElement("h2");
    heading.id = "ideas-heading";
    heading.tabIndex = -1;
    document.body.appendChild(heading);
    const { unmount } = render(<BoardError error={new Error("x")} retry={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    act(() => {
      unmount();
    });
    expect(heading).toHaveFocus();
  });

  it("moves focus to the idea field when the board is empty after a retry", () => {
    runFrames();
    const field = document.createElement("textarea");
    field.id = "idea-field";
    document.body.appendChild(field);
    const { unmount } = render(<BoardError error={new Error("x")} retry={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    act(() => {
      unmount();
    });
    expect(field).toHaveFocus();
  });

  it("does not steal focus when it unmounts without a retry", () => {
    runFrames();
    const field = document.createElement("textarea");
    field.id = "idea-field";
    document.body.appendChild(field);
    const { unmount } = render(<BoardError error={new Error("x")} retry={vi.fn()} />);
    act(() => {
      unmount();
    });
    expect(field).not.toHaveFocus();
  });

  it("has no axe violations", async () => {
    const { container } = render(<BoardError error={new Error("x")} retry={vi.fn()} />);
    expect((await axe(container)).violations).toEqual([]);
  });
});
