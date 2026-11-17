import { MAX_IDEA_LENGTH } from "./idea";
import type { VoteErrorCode } from "./schemas";

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
  rate_limited: () =>
    "You've reached the posting limit for now. Please try again in a little while.",
  challenge_failed: () => "We couldn't confirm you're not a robot. Try again.",
  server: () => "We couldn't add your idea. Try again.",
} satisfies Record<PostErrorCode, (over?: number) => string>;

/** Message for each vote refusal (spec 0005). A code without a string fails the type check. */
export const VOTE_ERROR_COPY = {
  invalid: "Couldn't save your vote.",
  no_voter: "Please reload the page and try again.",
  idea_unavailable: "This idea is no longer on the board.",
  rate_limited: "You've reached the voting limit for now. Please try again in a little while.",
  server: "Couldn't save your vote.",
} satisfies Record<VoteErrorCode, string>;

export const COPY = {
  productName: "Next Build",
  purpose: "Suggest what we build next, and vote for the ideas you want.",
  skipLink: "Skip to content",
  fieldLabel: "Your idea",
  submit: "Add idea",
  submitting: "Adding…",
  tryAgain: "Try again",
  challengeStep: "One more step: complete the check below.",
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
  adminHeading: "Admin",
  adminPageTitle: "Next Build admin",
  adminSummary: (ideas: number, hidden: number) =>
    `${String(ideas)} ${ideas === 1 ? "idea" : "ideas"}, ${String(hidden)} hidden.`,
  adminRefusal: "This page is only for the site admin.",
  adminSessionEnded: "Your admin sign in has ended. Reload this page to sign in again.",
  reload: "Reload",
  adminBack: "Back to the board",
  adminListLabel: "Ideas, admin view",
  adminEmpty: "No ideas yet. New ideas will show up here.",
  adminCapped: (shown: number) => `Showing the newest ${String(shown)} ideas.`,
  adminHidden: "Idea hidden",
  adminShown: "Idea shown again",
  adminHideFailed: "Couldn't hide this idea.",
  adminShowFailed: "Couldn't show this idea.",
  adminHide: "Hide",
  adminUnhide: "Unhide",
  adminHideName: "Hide idea",
  adminUnhideName: "Unhide idea",
  adminColIdea: "Idea",
  adminColVotes: "Votes",
  adminColAdded: "Added",
  adminColStatus: "Status",
  adminColAction: "Action",
  adminStatusVisible: "Visible",
  adminStatusHidden: "Hidden",
  voteName: (n: number) => `Upvote idea, ${n === 1 ? "1 vote" : `${String(n)} votes`}`,
  voted: (n: number) => `Voted. Now ${n === 1 ? "1 vote" : `${String(n)} votes`}.`,
  notVoted: (n: number) => `Not voted. Now ${n === 1 ? "1 vote" : `${String(n)} votes`}.`,
  voteLabel: (n: number) => (n === 1 ? "1 vote" : `${String(n)} votes`),
} as const;
