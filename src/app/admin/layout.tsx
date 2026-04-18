"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Settings,
  ScrollText,
  ChevronLeft,
  Shield,
  Clock,
  DollarSign,
  ToggleLeft,
  MessageCircle,
} from "lucide-react";
import { useAppStore } from "@/store/useAppStore";

const navItems = [
  { href: "/admin", label: "Дашборд", icon: LayoutDashboard },
  { href: "/admin/users", label: "Пользователи", icon: Users },
  { href: "/admin/cron", label: "Задачи", icon: Clock },
  { href: "/admin/audit", label: "Аудит", icon: ScrollText },
  { href: "/admin/billing", label: "Финансы", icon: DollarSign },
  { href: "/admin/flags", label: "Флаги", icon: ToggleLeft },
  { href: "/admin/support", label: "Поддержка", icon: MessageCircle },
  { href: "/admin/settings", label: "Настройки", icon: Settings },
];

function useAdminCheck(email: string | null) {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (!email) {
      setIsAdmin(false);
      return;
    }
    let cancelled = false;
    fetch("/api/admin/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setIsAdmin(!!data.isAdmin);
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false);
      });
    return () => { cancelled = true; };
  }, [email]);

  return isAdmin;
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { email } = useAppStore();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAdmin = useAdminCheck(email);

  if (isAdmin === null) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: "var(--mq-bg)" }}
      >
        <div
          className="animate-spin w-8 h-8 border-2 rounded-full"
          style={{ borderColor: "var(--mq-border)", borderTopColor: "var(--mq-accent)" }}
        />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: "var(--mq-bg)" }}
      >
        <div
          className="rounded-2xl p-8 max-w-md w-full mx-4 text-center"
          style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
        >
          <Shield
            className="w-16 h-16 mx-auto mb-4"
            style={{ color: "var(--mq-accent)" }}
          />
          <h1
            className="text-2xl font-bold mb-2"
            style={{ color: "var(--mq-text)" }}
          >
            Доступ запрещён
          </h1>
          <p className="mb-4" style={{ color: "var(--mq-text-muted)" }}>
            У вас нет прав администратора для доступа к этой странице.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
            style={{
              backgroundColor: "var(--mq-accent)",
              color: "var(--mq-text)",
            }}
          >
            <ChevronLeft className="w-4 h-4" />
            На главную
          </Link>
        </div>
      </div>
    );
  }

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  };

  return (
    <div
      className="min-h-screen flex"
      style={{ backgroundColor: "var(--mq-bg)" }}
    >
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden bg-black/60"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen flex flex-col transition-all duration-300 ${
          collapsed ? "lg:w-16" : "lg:w-64"
        } ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
        style={{
          backgroundColor: "var(--mq-card)",
          borderRight: "1px solid var(--mq-border)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 h-16 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--mq-border)" }}
        >
          <Shield className="w-6 h-6 flex-shrink-0" style={{ color: "var(--mq-accent)" }} />
          {!collapsed && (
            <span
              className="font-bold text-lg truncate"
              style={{ color: "var(--mq-text)" }}
            >
              MQ Admin
            </span>
          )}
          <button
            onClick={() => {
              setCollapsed(!collapsed);
              setMobileOpen(false);
            }}
            className="hidden lg:flex ml-auto items-center justify-center w-6 h-6 rounded"
            style={{ color: "var(--mq-text-muted)" }}
          >
            <ChevronLeft
              className={`w-4 h-4 transition-transform ${collapsed ? "rotate-180" : ""}`}
            />
          </button>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden ml-auto p-1"
            style={{ color: "var(--mq-text-muted)" }}
          >
            ✕
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  collapsed ? "lg:justify-center" : ""
                }`}
                style={{
                  backgroundColor: active ? "rgba(224,49,49,0.1)" : "transparent",
                  color: active ? "var(--mq-accent)" : "var(--mq-text-muted)",
                }}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {(!collapsed || typeof window !== "undefined" && window.innerWidth < 1024) && (
                  <span className="truncate">{item.label}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div
          className="px-4 py-3 flex-shrink-0"
          style={{ borderTop: "1px solid var(--mq-border)" }}
        >
          <Link
            href="/"
            className="flex items-center gap-2 text-sm"
            style={{ color: "var(--mq-text-muted)" }}
          >
            <ChevronLeft className="w-4 h-4" />
            {!collapsed && <span>Назад в приложение</span>}
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0">
        {/* Mobile header */}
        <div
          className="lg:hidden flex items-center gap-3 px-4 h-14 sticky top-0 z-30"
          style={{
            backgroundColor: "var(--mq-card)",
            borderBottom: "1px solid var(--mq-border)",
          }}
        >
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-lg"
            style={{ color: "var(--mq-text)" }}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          </button>
          <Shield className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
          <span className="font-semibold" style={{ color: "var(--mq-text)" }}>
            MQ Admin
          </span>
        </div>

        <div className="p-4 lg:p-6">{children}</div>
      </main>
    </div>
  );
}
