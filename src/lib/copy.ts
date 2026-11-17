import { MAX_IDEA_LENGTH } from "./idea";

export type PostErrorCode =
  | "empty"
  | "too_long"
  | "raw_too_long"
  | "invalid"
  | "no_voter"
  | "rate_limited"
  | "challenge_failed"
  | "server";

/** Message for each refusal. too_long takes how many characters over the limit. */
export const POST_ERROR_COPY = {
  empty: () => "Write an idea first.",
  too_long: (over = 0) =>
    `Ideas can be up to ${String(MAX_IDEA_LENGTH)} characters. Yours is ${String(over)} over.`,
  raw_too_long: () => "That's too long to add.",
  invalid: () => "That idea can't be added. Check it and try again.",
  no_voter: () => "Please reload the page and try again.",
  rate_limited: () => "You're adding ideas too fast. Wait a moment and try again.",
  challenge_failed: () => "We couldn't confirm you're not a robot. Try again.",
  server: () => "We couldn't add your idea. Try again.",
} satisfies Record<PostErrorCode, (over?: number) => string>;

export const COPY = {
  productName: "Next Build",
  purpose: "Suggest what we build next, and vote for the ideas you want.",
  skipLink: "Skip to content",
  fieldLabel: "Your idea",
  submit: "Add idea",
  submitting: "Adding…",
  tryAgain: "Try again",
  added: "Idea added",
  boardError: "We couldn't load the ideas. Try again.",
  emptyHeading: "No ideas yet",
  emptyBody: "Be the first to suggest what we build next.",
  emptyStateAction: "Write an idea",
  listHeading: "Ideas",
  sortNote: "Most votes first",
  nearLimit: (left: number) => `${String(left)} left`,
  overLimit: (over: number) => `${String(over)} over the limit`,
  announceNear: (left: number) => `${String(left)} characters left`,
  announceOver: (over: number) => `${String(over)} characters over the limit`,
  voteLabel: (n: number) => (n === 1 ? "1 vote" : `${String(n)} votes`),
} as const;
