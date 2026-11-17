"use client";

import { useEffect, useRef } from "react";

import { ErrorMessage } from "@/components/ErrorMessage";
import { COPY } from "@/lib/copy";

/** The board failed to render. Try again re-renders it; after a success, focus moves to the list. */
export default function BoardError({
  unstable_retry,
}: {
  error: Error;
  unstable_retry: () => void;
}) {
  const retried = useRef(false);
  useEffect(
    () => () => {
      if (!retried.current) return;
      // The boundary unmounts when the retry works: send focus to the Ideas heading or the empty board's field.
      requestAnimationFrame(() => {
        (
          document.getElementById("ideas-heading") ?? document.getElementById("idea-field")
        )?.focus();
      });
    },
    [],
  );
  return (
    <ErrorMessage
      message={COPY.boardError}
      onRetry={() => {
        retried.current = true;
        unstable_retry();
      }}
    />
  );
}
