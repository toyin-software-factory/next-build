"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { postIdea } from "@/app/actions";

/** Thin thread version: plain form, replaced by the styled one in the next steps. */
export function IdeaForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await postIdea({ submissionId: crypto.randomUUID(), text });
    if (result.ok) {
      setText("");
      setMessage("Idea added");
      router.refresh();
    } else {
      setMessage(`Not added: ${result.code}`);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)}>
      <label htmlFor="idea-field">Your idea</label>
      <input
        id="idea-field"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
        }}
      />
      <button type="submit">Add idea</button>
      <p role="status">{message}</p>
    </form>
  );
}
