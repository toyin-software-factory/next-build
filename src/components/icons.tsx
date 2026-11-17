type IconProps = { className?: string };

const base = {
  width: 20,
  height: 20,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

export function WarningIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M10 3 18 17H2L10 3Z" />
      <path d="M10 8v4M10 14.5v.01" />
    </svg>
  );
}

export function ArrowUpIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M10 16V4M5 9l5-5 5 5" />
    </svg>
  );
}

/** The voted state of the vote arrow: same shape, filled. */
export function ArrowUpFilledIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M10 16V4M5 9l5-5 5 5" />
      <path d="M5 9l5-5 5 5Z" fill="currentColor" />
    </svg>
  );
}

export function LightbulbIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M7 14.5h6M8 17h4M6 8a4 4 0 1 1 8 0c0 1.6-.9 2.5-1.7 3.4-.4.4-.3 1.1-.3 1.6H8c0-.5.1-1.2-.3-1.6C6.9 10.5 6 9.6 6 8Z" />
    </svg>
  );
}
