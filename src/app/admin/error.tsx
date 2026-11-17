"use client";

import { SessionEnded } from "@/components/admin/SessionEnded";

// A failed read or a refused call lands here. The usual cause is an ended sign in, so say that
// and offer a reload (which sends the admin back through Cloudflare Access).
export default function AdminError() {
  return <SessionEnded />;
}
