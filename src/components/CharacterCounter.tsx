import { COPY } from "@/lib/copy";
import { MAX_IDEA_LENGTH } from "@/lib/idea";

import { WarningIcon } from "./icons";

const NEAR_LIMIT = 120;

/** "n / 140", plus a text and icon cue near and over the limit, so colour is never the only signal. */
export function CharacterCounter({ id, length }: { id: string; length: number }) {
  const over = length - MAX_IDEA_LENGTH;
  const tone = over > 0 ? "text-danger" : length >= NEAR_LIMIT ? "text-warning" : "text-muted";
  return (
    <p id={id} className={`${tone} flex items-center justify-end gap-1 text-sm tabular-nums`}>
      {over > 0 ? <WarningIcon className="size-4" /> : null}
      <span>
        {String(length)} / {String(MAX_IDEA_LENGTH)}
      </span>
      {over > 0 ? (
        <span>· {COPY.overLimit(over)}</span>
      ) : length >= NEAR_LIMIT ? (
        <span>· {COPY.nearLimit(MAX_IDEA_LENGTH - length)}</span>
      ) : null}
    </p>
  );
}
