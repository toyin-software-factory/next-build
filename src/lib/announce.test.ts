import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { announce } from "./announce";

beforeEach(() => {
  document.body.innerHTML = '<p id="status" role="status"></p>';
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    queueMicrotask(() => {
      cb(0);
    });
    return 0;
  });
});
afterEach(() => vi.unstubAllGlobals());

it("clears the region, then sets the text on the next frame", async () => {
  const region = document.getElementById("status");
  if (region === null) throw new Error("no region");
  region.textContent = "Idea added";
  announce("Idea added");
  expect(region.textContent).toBe("");
  await Promise.resolve();
  expect(region.textContent).toBe("Idea added");
});

it("does nothing when the page has no status region", () => {
  document.body.innerHTML = "";
  expect(() => {
    announce("x");
  }).not.toThrow();
});
