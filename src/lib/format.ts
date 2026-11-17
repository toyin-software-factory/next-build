const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

/** Absolute UTC date such as "16 Nov 2026, 14:05 UTC". Fixed locale and zone, so server and client agree. */
export function formatIdeaDate(ms: number): string {
  return `${dateFormat.format(new Date(ms))} UTC`;
}
