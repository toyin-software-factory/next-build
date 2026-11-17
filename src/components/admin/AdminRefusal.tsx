import { ADMIN_REFUSAL_TEXT } from "@/lib/admin-refusal";

/** What the /admin page shows when its own check refuses (the middleware answers the same words with a 403). */
export function AdminRefusal() {
  return (
    <section aria-labelledby="admin-refusal">
      <h2 id="admin-refusal" className="text-xl leading-7 font-semibold">
        {ADMIN_REFUSAL_TEXT}
      </h2>
    </section>
  );
}
