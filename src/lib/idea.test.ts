import { describe, expect, it } from "vitest";

import { MAX_IDEA_LENGTH, ideaLength, normalizeIdea } from "./idea";

describe("normalizeIdea", () => {
  it("trims and collapses whitespace and new lines", () => {
    expect(normalizeIdea("  a \n\n b\t c  ")).toBe("a b c");
  });
  it("composes to NFC", () => {
    expect(normalizeIdea("é")).toBe("é");
  });
  it("gives an empty string for whitespace only", () => {
    expect(normalizeIdea(" \n\t ")).toBe("");
  });
});

describe("ideaLength", () => {
  it("counts an emoji as one code point", () => {
    expect(ideaLength("😀".repeat(MAX_IDEA_LENGTH))).toBe(MAX_IDEA_LENGTH);
    expect(ideaLength("😀".repeat(MAX_IDEA_LENGTH + 1))).toBe(MAX_IDEA_LENGTH + 1);
  });
});
