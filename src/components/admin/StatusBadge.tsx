import { COPY } from "@/lib/copy";

import { EyeOffIcon } from "./EyeOffIcon";

/** "Visible" as plain text, or a "Hidden" badge with an icon (never colour alone). */
export function StatusBadge({ hidden }: { hidden: boolean }) {
  if (!hidden) return <span>{COPY.adminStatusVisible}</span>;
  return (
    <span className="inline-flex items-center gap-1 rounded-control bg-accent-soft px-2 py-1 text-sm font-medium text-text">
      <EyeOffIcon className="size-4" />
      {COPY.adminStatusHidden}
    </span>
  );
}
