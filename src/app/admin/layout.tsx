import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Shield, ChevronLeft } from "lucide-react";
import { getSession } from "@/lib/get-session";
import { database } from "@/lib/database";
import AdminShell from "@/components/admin/AdminShell";

/**
 * Phase O §5.2 — SERVER-SIDE authorization for the whole /admin surface.
 *
 * The check runs per-request on the server: session cookie → JWT payload →
 * FRESH role lookup in the database (never trusts a stale JWT role claim).
 * No session → back to the app auth flow. Session without the admin role →
 * a 403 page is rendered; the admin pages' client code never even loads.
 *
 * Every admin API route independently re-checks with withAdminAuth() — this
 * gate protects the UI surface, the APIs protect the data.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  if (!session?.userId) {
    // Not signed in at all — the main app handles authentication.
    redirect("/?admin-auth=required");
  }

  // Fresh role from the database (a user demoted after token issue must
  // lose admin access immediately).
  let role = "user";
  let username: string | null = null;
  try {
    const user = await database.findUserById(session.userId);
    if (user) {
      role = user.role || "user";
      username = user.username || null;
    }
  } catch {
    // DB unavailable — fail CLOSED for an admin surface.
    role = "user";
  }

  if (role !== "admin") {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: "var(--mq-bg, #0e0e0e)" }}
      >
        <div
          className="rounded-2xl p-8 max-w-md w-full mx-4 text-center"
          style={{
            backgroundColor: "var(--mq-card, #161616)",
            border: "1px solid var(--mq-border, #222)",
          }}
        >
          <div
            className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, rgba(224,49,49,0.2), rgba(224,49,49,0.05))",
              border: "1px solid rgba(224,49,49,0.15)",
            }}
          >
            <Shield className="w-8 h-8" style={{ color: "var(--mq-accent, #e03131)" }} />
          </div>
          <h1 className="mq-t-title text-2xl mb-2" style={{ color: "var(--mq-text, #f0f0f0)" }}>
            403 — Доступ запрещён
          </h1>
          <p className="mb-6 text-sm" style={{ color: "var(--mq-text-muted, #9a9a9a)" }}>
            Панель администратора доступна только пользователям с ролью admin
            {username ? ` (вы вошли как ${username})` : ""}. Проверка выполнена на сервере.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white"
            style={{ background: "var(--mq-accent, #e03131)" }}
          >
            <ChevronLeft className="w-4 h-4" />
            На главную
          </Link>
        </div>
      </div>
    );
  }

  return <AdminShell>{children}</AdminShell>;
}
