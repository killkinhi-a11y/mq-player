"use client";

/**
 * AdminShell — client chrome for the admin panel (sidebar, header,
 * breadcrumbs). Authorization is done SERVER-SIDE in app/admin/layout.tsx
 * (session cookie → DB role check → 403); this shell never gates access
 * itself — it renders only when the server already authorized the user.
 */

import { useState, useMemo } from "react";
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
  Menu,
  X,
  ChevronRight,
  Search,
  LogOut,
  Rocket,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";

const navItems = [
  { href: "/admin", label: "Дашборд", icon: LayoutDashboard },
  { href: "/admin/users", label: "Пользователи", icon: Users },
  { href: "/admin/groups", label: "Группы", icon: Users },
  { href: "/admin/audit", label: "Аудит", icon: ScrollText },
  { href: "/admin/support", label: "Поддержка", icon: MessageCircle },
  { href: "/admin/flags", label: "Флаги", icon: ToggleLeft },
  { href: "/admin/cron", label: "Задачи", icon: Clock },
  { href: "/admin/billing", label: "Финансы", icon: DollarSign },
  { href: "/admin/system", label: "Система", icon: Settings },
  { href: "/admin/deployments", label: "Деплой", icon: Rocket },
];

export default function AdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const email = useAppStore((s) => s.email);
  const username = useAppStore((s) => s.username);
  const avatar = useAppStore((s) => s.avatar);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const breadcrumbs = useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    return parts.map((part, idx) => {
      const href = "/" + parts.slice(0, idx + 1).join("/");
      const item = navItems.find((n) => n.href === href);
      return {
        label: item?.label || part.charAt(0).toUpperCase() + part.slice(1),
        href,
        isLast: idx === parts.length - 1,
      };
    });
  }, [pathname]);

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: "var(--mq-bg)" }}>
      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 lg:hidden bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen flex flex-col transition-all duration-300 ease-out ${
          collapsed ? "lg:w-[72px]" : "lg:w-[260px]"
        } ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
        style={{
          background: "linear-gradient(180deg, rgba(99,102,241,0.04) 0%, var(--mq-card) 40%)",
          borderRight: "1px solid var(--mq-border)",
        }}
      >
        {/* Logo Header */}
        <div
          className="flex items-center gap-3 px-4 h-16 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--mq-border)" }}
        >
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: "linear-gradient(135deg, #6366f1, #818cf8)",
            }}
          >
            <Shield className="w-4 h-4 text-white" />
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <span className="font-bold text-sm truncate block" style={{ color: "var(--mq-text)" }}>
                MQ Admin
              </span>
              <span className="text-[11px] truncate block" style={{ color: "var(--mq-text-muted)" }}>
                Панель управления
              </span>
            </div>
          )}
          <button
            onClick={() => {
              setCollapsed(!collapsed);
              setMobileOpen(false);
            }}
            className="hidden lg:flex ml-auto items-center justify-center w-7 h-7 rounded-lg transition-colors hover:bg-white/5"
            style={{ color: "var(--mq-text-muted)" }}
          >
            <motion.div animate={{ rotate: collapsed ? 180 : 0 }} transition={{ duration: 0.3 }}>
              <ChevronLeft className="w-4 h-4" />
            </motion.div>
          </button>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden ml-auto p-1.5 rounded-lg hover:bg-white/5"
            style={{ color: "var(--mq-text-muted)" }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {!collapsed && (
            <p
              className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--mq-text-muted)" }}
            >
              Навигация
            </p>
          )}
          {navItems.map((item, idx) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <motion.div
                key={item.href}
                initial={false}
                transition={{ duration: 0.15 }}
              >
                <Link
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                    collapsed ? "lg:justify-center lg:px-0" : ""
                  }`}
                  style={{
                    color: active ? "#6366f1" : "var(--mq-text-muted)",
                    backgroundColor: active ? "rgba(99,102,241,0.08)" : "transparent",
                  }}
                >
                  {/* Active indicator bar */}
                  {active && (
                    <motion.div
                      layoutId="sidebar-active"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                      style={{
                        background: "linear-gradient(180deg, #6366f1, rgba(99,102,241,0.6))",
                      }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
                      active ? "" : "group-hover:bg-white/5"
                    }`}
                    style={
                      active
                        ? {
                            background: "linear-gradient(135deg, rgba(224,49,49,0.2), rgba(224,49,49,0.08))",
                          }
                        : undefined
                    }
                  >
                    <Icon className="w-[18px] h-[18px]" />
                  </div>
                  {(!collapsed || (typeof window !== "undefined" && window.innerWidth < 1024)) && (
                    <span className="truncate">{item.label}</span>
                  )}
                  {active && !collapsed && (
                    <motion.div
                      className="ml-auto w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: "var(--mq-accent)" }}
                      layoutId="active-dot"
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}
                </Link>
              </motion.div>
            );
          })}
        </nav>

        {/* User Profile Section */}
        <div
          className="px-3 py-3 flex-shrink-0"
          style={{ borderTop: "1px solid var(--mq-border)" }}
        >
          <div
            className={`flex items-center gap-3 p-2 rounded-xl transition-colors ${
              collapsed ? "lg:justify-center lg:px-0" : ""
            }`}
            style={{ backgroundColor: "rgba(255,255,255,0.02)" }}
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold text-white overflow-hidden"
              style={{
                background: avatar
                  ? "transparent"
                  : "linear-gradient(135deg, var(--mq-accent), rgba(224,49,49,0.7))",
              }}
            >
              {avatar ? (
                <img
                  src={avatar}
                  alt=""
                  className="w-full h-full object-cover rounded-xl"
                />
              ) : (
                <span>{(username || "A").charAt(0).toUpperCase()}</span>
              )}
            </div>
            {(!collapsed || (typeof window !== "undefined" && window.innerWidth < 1024)) && (
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate" style={{ color: "var(--mq-text)" }}>
                  {username || "Админ"}
                </p>
                <p className="text-[11px] truncate" style={{ color: "var(--mq-text-muted)" }}>
                  {email || "admin@mq.player"}
                </p>
              </div>
            )}
          </div>
          <Link
            href="/"
            className={`flex items-center gap-2 px-2 py-2 mt-1 rounded-lg text-xs transition-colors hover:bg-white/5 ${
              collapsed ? "lg:justify-center" : ""
            }`}
            style={{ color: "var(--mq-text-muted)" }}
          >
            <LogOut className="w-3.5 h-3.5 flex-shrink-0" />
            {(!collapsed || (typeof window !== "undefined" && window.innerWidth < 1024)) && (
              <span>Назад в приложение</span>
            )}
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar */}
        <header
          className="sticky top-0 z-30 flex items-center gap-3 px-4 lg:px-6 h-14 flex-shrink-0 backdrop-blur-xl"
          style={{
            backgroundColor: "color-mix(in srgb, var(--mq-card) 85%, transparent)",
            borderBottom: "1px solid var(--mq-border)",
          }}
        >
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-white/5 transition-colors"
            style={{ color: "var(--mq-text)" }}
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Breadcrumbs */}
          <nav className="flex items-center gap-1 min-w-0 flex-1">
            {breadcrumbs.map((crumb) => (
              <div key={crumb.href} className="flex items-center gap-1 min-w-0">
                {crumb.href !== breadcrumbs[0]?.href && (
                  <ChevronRight
                    className="w-3.5 h-3.5 flex-shrink-0"
                    style={{ color: "var(--mq-text-muted)", opacity: 0.5 }}
                  />
                )}
                {crumb.isLast ? (
                  <span
                    className="text-sm font-medium truncate"
                    style={{ color: "var(--mq-text)" }}
                  >
                    {crumb.label}
                  </span>
                ) : (
                  <Link
                    href={crumb.href}
                    className="text-sm truncate transition-colors hover:underline"
                    style={{ color: "var(--mq-text-muted)" }}
                  >
                    {crumb.label}
                  </Link>
                )}
              </div>
            ))}
          </nav>

          {/* Search (visual only for top bar, individual pages handle their own) */}
          <div
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg max-w-[200px]"
            style={{
              backgroundColor: "var(--mq-input-bg)",
              border: "1px solid var(--mq-border)",
            }}
          >
            <Search className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} />
            <span className="text-xs" style={{ color: "var(--mq-text-muted)", opacity: 0.5 }}>
              Поиск...
            </span>
          </div>
        </header>

        {/* Content area with subtle pattern */}
        <div className="flex-1 p-4 lg:p-6 relative">
          {/* Subtle grid pattern */}
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.015]"
            style={{
              backgroundImage: `radial-gradient(circle, var(--mq-text-muted) 1px, transparent 1px)`,
              backgroundSize: "24px 24px",
            }}
          />
          <div className="relative">{children}</div>
        </div>
      </main>
    </div>
  );
}
