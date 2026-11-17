import type { Metadata } from "next";
import Link from "next/link";

import { AdminIdeaList } from "@/components/admin/AdminIdeaList";
import { AdminRefusal } from "@/components/admin/AdminRefusal";
import { ADMIN_LIST_LIMIT, countIdeasForAdmin, listIdeasForAdmin } from "@/db/admin-queries";
import { requireAdmin } from "@/lib/access";
import { COPY } from "@/lib/copy";

// Dynamic and never cached: it reads D1 for the admin only (spec 0006).
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: COPY.adminPageTitle, robots: { index: false } };

// The middleware already refused outsiders; this checks again so a missed rule cannot show data.
export default async function AdminPage() {
  const admin = await requireAdmin("page");
  if (admin === null) return <AdminRefusal />;

  const [{ total, hidden }, ideas] = await Promise.all([
    countIdeasForAdmin(admin),
    listIdeasForAdmin(admin),
  ]);
  return (
    <section aria-labelledby="admin-heading">
      <h2 id="admin-heading" className="text-xl leading-7 font-semibold">
        {COPY.adminHeading}
      </h2>
      <p className="mt-2 text-muted">{COPY.adminSummary(total, hidden)}</p>
      <p className="mt-2">
        <Link href="/" className="underline underline-offset-2">
          {COPY.adminBack}
        </Link>
      </p>
      {total > ADMIN_LIST_LIMIT ? (
        <p className="mt-2 text-sm text-muted">{COPY.adminCapped(ADMIN_LIST_LIMIT)}</p>
      ) : null}
      <div className="mt-4">
        <AdminIdeaList ideas={ideas} />
      </div>
    </section>
  );
}
