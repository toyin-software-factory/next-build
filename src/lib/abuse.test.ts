import { expect, it } from "vitest";

import { checkPost, checkVote } from "./abuse";

it("lets every post through until feature 9 fills the seam", async () => {
  expect(await checkPost({ voterId: "v", ip: null })).toEqual({ ok: true });
});

it("lets every vote through until feature 9 fills the seam", async () => {
  expect(await checkVote({ voterId: "v", ip: null })).toEqual({ ok: true });
});
