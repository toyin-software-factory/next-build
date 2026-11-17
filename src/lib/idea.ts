/** Longest idea, counted in code points (spec 0002, 0004). */
export const MAX_IDEA_LENGTH = 140;

/** NFC, trim the ends, then collapse any run of whitespace (new lines too) into one space. */
export function normalizeIdea(text: string): string {
  return text.normalize("NFC").replace(/\s+/gu, " ").trim();
}

/** Length as people see it: code points, matching SQLite length() on text. */
export function ideaLength(text: string): number {
  return text.match(/./gsu)?.length ?? 0;
}
