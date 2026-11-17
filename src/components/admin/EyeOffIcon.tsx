/** Marks the Hidden status: an eye with a slash (decorative, the text carries the meaning). */
export function EyeOffIcon({ className }: { className?: string }) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10Z" />
      <circle cx="10" cy="10" r="2.25" />
      <path d="M3.5 3.5l13 13" />
    </svg>
  );
}
