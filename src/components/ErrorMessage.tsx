import { COPY } from "@/lib/copy";

import { WarningIcon } from "./icons";

/** A failure with an icon, plain text and, when a retry makes sense, a Try again button. */
export function ErrorMessage({
  id,
  message,
  onRetry,
}: {
  id?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      id={id}
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-control border border-danger bg-surface p-3 text-danger"
    >
      <WarningIcon className="size-5 shrink-0" />
      <p className="flex-1">{message}</p>
      {onRetry ? (
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          {COPY.tryAgain}
        </button>
      ) : null}
    </div>
  );
}
