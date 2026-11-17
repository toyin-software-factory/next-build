"use server";

import { z } from "zod";

import { setIdeaHidden } from "@/db/admin-queries";
import { requireAdmin } from "@/lib/access";

export type AdminResult =
  | { ok: true; hidden: boolean }
  | { ok: false; code: "forbidden" | "invalid" | "not_found" | "server" };

const setHiddenInputSchema = z.object({ ideaId: z.uuid(), hidden: z.boolean() });

function logAdmin(code: string, ideaId?: string): void {
  console.log(
    JSON.stringify({
      event: "admin_set_hidden",
      code,
      surface: "action",
      ...(ideaId === undefined ? {} : { ideaId8: ideaId.slice(0, 8) }),
    }),
  );
}

/**
 * Hides or shows one idea (spec 0006). Order matters: the admin check first (before the input is
 * even parsed), then zod, then the write. Never logs an email.
 */
export async function setHidden(input: unknown): Promise<AdminResult> {
  const admin = await requireAdmin("action");
  if (admin === null) return { ok: false, code: "forbidden" };

  const parsed = setHiddenInputSchema.safeParse(input);
  if (!parsed.success) {
    logAdmin("invalid");
    return { ok: false, code: "invalid" };
  }

  try {
    const result = await setIdeaHidden(admin, parsed.data);
    if (!result.ok) {
      logAdmin(result.code, parsed.data.ideaId);
      return { ok: false, code: result.code };
    }
  } catch {
    logAdmin("server", parsed.data.ideaId);
    return { ok: false, code: "server" };
  }
  logAdmin("ok", parsed.data.ideaId);
  return { ok: true, hidden: parsed.data.hidden };
}
