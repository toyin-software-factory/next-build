import type { Metadata } from "next";

import { AdminRefusal } from "@/components/admin/AdminRefusal";
import { countIdeasForAdmin } from "@/db/admin-queries";
import { requireAdmin } from "@/lib/access";
import { COPY } from "@/lib/copy";

// Dynamic and never cached: it reads D1 for the admin only (spec 0006).
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: COPY.adminPageTitle, robots: { index: false } };

// The middleware already refused outsiders; this checks again so a missed rule cannot show data.
export default async function AdminPage() {
  const admin = await requireAdmin("page");
  if (admin === null) return <AdminRefusal />;

  const { total, hidden } = await countIdeasForAdmin(admin);
  return (
    <section aria-labelledby="admin-heading">
      <h2 id="admin-heading" className="text-xl leading-7 font-semibold">
        {COPY.adminHeading}
      </h2>
      <p className="mt-2 text-muted">{COPY.adminSummary(total, hidden)}</p>
    </section>
  );
}
