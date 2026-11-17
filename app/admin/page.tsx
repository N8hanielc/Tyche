"use client";

import { AdminApp } from "@/admin/AdminApp";

/**
 * Tyche Admin Control Panel.
 * The page itself carries no data. Everything it shows or changes goes through the
 * admin_* database functions (supabase/admin.sql), which check the signed-in user's
 * admin role on the server and log every change.
 */
export default function AdminPage() {
  return <AdminApp />;
}
