"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

import { postIdea, type PostResult } from "@/app/actions";
import { announce } from "@/lib/announce";
import { COPY, POST_ERROR_COPY, type PostErrorCode } from "@/lib/copy";
import { MAX_IDEA_LENGTH, ideaLength, normalizeIdea } from "@/lib/idea";

import { CharacterCounter } from "./CharacterCounter";
import { ErrorMessage } from "./ErrorMessage";
import { WarningIcon } from "./icons";

type Zone = "normal" | "near" | "over";
type Failure = { code: PostErrorCode; over: number };

// Refusals about the text sit under the field. Everything else shows below the button with Try again.
const FIELD_CODES: readonly PostErrorCode[] = ["empty", "too_long", "raw_too_long", "invalid"];

function zoneOf(length: number): Zone {
  if (length > MAX_IDEA_LENGTH) return "over";
  return MAX_IDEA_LENGTH - length <= 20 ? "near" : "normal";
}

/** Anything thrown, missing or malformed counts as a server failure. */
async function send(submissionId: string, text: string): Promise<PostResult> {
  try {
    const result = await postIdea({ submissionId, text });
    return typeof result === "object" && typeof result.ok === "boolean"
      ? result
      : { ok: false, code: "server" };
  } catch {
    return { ok: false, code: "server" };
  }
}

export function IdeaForm() {
  const router = useRouter();
  const ids = useId();
  const counterId = `${ids}-counter`;
  const fieldErrorId = `${ids}-error`;
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const attempt = useRef<{ id: string; text: string } | null>(null);
  const busy = useRef(false);
  const zone = useRef<Zone>("normal");

  const length = ideaLength(normalizeIdea(text));
  const fieldFailure = failure !== null && FIELD_CODES.includes(failure.code) ? failure : null;
  const otherFailure = failure !== null && fieldFailure === null ? failure : null;

  function onChange(value: string) {
    setText(value);
    const next = zoneOf(ideaLength(normalizeIdea(value)));
    const count = ideaLength(normalizeIdea(value));
    if (next !== zone.current) {
      if (next === "near") announce(COPY.announceNear(MAX_IDEA_LENGTH - count));
      if (next === "over") announce(COPY.announceOver(count - MAX_IDEA_LENGTH));
      zone.current = next;
    }
    // A field error clears as soon as the value is valid again.
    if (fieldFailure !== null && count > 0 && count <= MAX_IDEA_LENGTH) setFailure(null);
  }

  async function submit(retryNoVoter = false) {
    if (busy.current) return;
    busy.current = true;
    setSending(true);
    const sentText = text;
    // Same text keeps the same id, so a retry cannot store the idea twice.
    if (attempt.current?.text !== sentText) {
      attempt.current = { id: crypto.randomUUID(), text: sentText };
    }
    const { id } = attempt.current;
    try {
      if (retryNoVoter) {
        // Load the page again so middleware sets the voter cookie, then resend with the same id.
        await fetch("/", { credentials: "same-origin" }).catch(() => undefined);
      }
      const result = await send(id, sentText);
      if (result.ok) {
        attempt.current = null;
        setText("");
        zone.current = "normal";
        setFailure(null);
        announce(COPY.added);
        router.refresh();
      } else {
        const over = result.over ?? 0;
        setFailure({ code: result.code, over });
        if (FIELD_CODES.includes(result.code)) announce(POST_ERROR_COPY[result.code](over));
      }
    } finally {
      busy.current = false;
      setSending(false);
    }
  }

  return (
    <form
      noValidate
      className="mb-8 rounded-card border border-border bg-surface p-4 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <label htmlFor="idea-field" className="mb-2 block text-sm font-semibold">
        {COPY.fieldLabel}
      </label>
      <textarea
        id="idea-field"
        name="idea"
        rows={2}
        value={text}
        readOnly={sending}
        aria-busy={sending}
        aria-invalid={fieldFailure !== null}
        aria-describedby={fieldFailure === null ? counterId : `${counterId} ${fieldErrorId}`}
        enterKeyHint="send"
        autoComplete="off"
        spellCheck
        className="field-sizing-content max-h-40 min-h-[2.75rem] w-full resize-none rounded-control border border-border-strong bg-surface px-3 py-2 text-text"
        onChange={(e) => {
          onChange(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          // Ideas are one line: Enter sends (not while an input method is composing), Shift+Enter does nothing.
          e.preventDefault();
          if (!e.shiftKey && !e.nativeEvent.isComposing) void submit();
        }}
      />
      <div className="mt-1 min-h-5">
        {fieldFailure !== null ? (
          <p id={fieldErrorId} className="flex items-center gap-1 text-sm text-danger">
            <WarningIcon className="size-4 shrink-0" />
            <span>{POST_ERROR_COPY[fieldFailure.code](fieldFailure.over)}</span>
          </p>
        ) : null}
        <CharacterCounter id={counterId} length={length} />
      </div>
      <button
        type="submit"
        className="btn btn-primary mt-3 w-full sm:w-auto"
        aria-disabled={sending}
        onClick={(e) => {
          if (sending) e.preventDefault();
        }}
      >
        {sending ? COPY.submitting : COPY.submit}
      </button>
      {otherFailure !== null ? (
        <div className="mt-3">
          <ErrorMessage
            message={POST_ERROR_COPY[otherFailure.code]()}
            onRetry={() => {
              void submit(otherFailure.code === "no_voter");
            }}
          />
        </div>
      ) : null}
    </form>
  );
}
