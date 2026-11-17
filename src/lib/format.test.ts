import { expect, it } from "vitest";

import { formatIdeaDate } from "./format";

it("formats an absolute UTC date", () => {
  expect(formatIdeaDate(Date.UTC(2026, 10, 16, 14, 5))).toBe("16 Nov 2026, 14:05 UTC");
});
it("shows 00:05 just after midnight, not 24:05", () => {
  expect(formatIdeaDate(Date.UTC(2026, 10, 17, 0, 5))).toBe("17 Nov 2026, 00:05 UTC");
});
