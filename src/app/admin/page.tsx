"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Users,
  UserCheck,
  UserX,
  MessageSquare,
  Music2,
  ListMusic,
  TrendingUp,
  Clock,
  ArrowRight,
  Activity,
  Zap,
  UserPlus,
  BarChart3,
  Settings,
  Flag,
  Shield,
  Loader2,
  Radio,
  Headphones,
  Globe,
  Server,
  Database,
  Cpu,
  HardDrive,
} from "lucide-react";
import { motion } from "framer-motion";

interface Stats {
  totalUsers: number;
  confirmedUsers: number;
  blockedUsers: number;
  todayUsers: number;
  weekUsers: number;
  monthUsers: number;
  totalMessages: number;
  totalStories: number;
  totalPlaylists: number;
  recentRegistrations: {
    id: string;
    username: string;
    email: string;
    confirmed: boolean;
    blocked: boolean;
    role: string;
    createdAt: string;
  }[];
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toString();
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentTime, setCurrentTime] = useState("");

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(
        new Date().toLocaleTimeString("ru-RU", {
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setStats(data);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="flex flex-col items-center gap-4">
          <motion.div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            }}
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          >
            <Loader2 className="w-6 h-6 text-white animate-spin" />
          </motion.div>
          <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
            Загрузка данных...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-2xl p-8 text-center"
        style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
      >
        <div className="w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center"
          style={{ backgroundColor: "rgba(239,68,68,0.1)" }}>
          <Activity className="w-6 h-6" style={{ color: "#ef4444" }} />
        </div>
        <p className="font-medium mb-1" style={{ color: "var(--mq-text)" }}>Ошибка загрузки</p>
        <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>{error}</p>
      </div>
    );
  }

  if (!stats) return null;

  const primaryStats = [
    {
      label: "Пользователи",
      value: stats.totalUsers,
      sub: `+${stats.todayUsers} сегодня`,
      icon: Users,
      color: "#6366f1",
      bg: "rgba(99,102,241,0.08)",
      border: "rgba(99,102,241,0.12)",
    },
    {
      label: "Подтверждённые",
      value: stats.confirmedUsers,
      sub: `${Math.round((stats.confirmedUsers / Math.max(1, stats.totalUsers)) * 100)}% от всех`,
      icon: UserCheck,
      color: "#10b981",
      bg: "rgba(16,185,129,0.08)",
      border: "rgba(16,185,129,0.12)",
    },
    {
      label: "Сообщений",
      value: stats.totalMessages,
      sub: `${stats.totalMessages > 0 ? Math.round(stats.totalMessages / Math.max(1, stats.totalUsers)) : 0} на пользователя`,
      icon: MessageSquare,
      color: "#f59e0b",
      bg: "rgba(245,158,11,0.08)",
      border: "rgba(245,158,11,0.12)",
    },
    {
      label: "Плейлисты",
      value: stats.totalPlaylists,
      sub: `${stats.totalStories} историй`,
      icon: ListMusic,
      color: "#ec4899",
      bg: "rgba(236,72,153,0.08)",
      border: "rgba(236,72,153,0.12)",
    },
  ];

  const growthStats = [
    { label: "Сегодня", value: stats.todayUsers, icon: TrendingUp, color: "#06b6d4" },
    { label: "За неделю", value: stats.weekUsers, icon: Clock, color: "#8b5cf6" },
    { label: "За месяц", value: stats.monthUsers, icon: UserPlus, color: "#f97316" },
    { label: "Заблокировано", value: stats.blockedUsers, icon: UserX, color: "#ef4444" },
  ];

  const quickNav = [
    { href: "/admin/users", label: "Пользователи", desc: "Аккаунты и роли", icon: Users, color: "#6366f1" },
    { href: "/admin/support", label: "Поддержка", desc: "Чат с пользователями", icon: MessageSquare, color: "#06b6d4" },
    { href: "/admin/billing", label: "Финансы", desc: "Транзакции", icon: BarChart3, color: "#10b981" },
    { href: "/admin/flags", label: "Флаги", desc: "Feature flags", icon: Flag, color: "#f59e0b" },
    { href: "/admin/audit", label: "Аудит", desc: "Логи действий", icon: Activity, color: "#ec4899" },
    { href: "/admin/settings", label: "Сервер", desc: "Настройки системы", icon: Settings, color: "#8b5cf6" },
    { href: "/admin/cron", label: "Задачи", desc: "Планировщик", icon: Clock, color: "#f97316" },
  ];

  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              }}
            >
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold" style={{ color: "var(--mq-text)" }}>
                Панель управления
              </h1>
            </div>
          </div>
          <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
            Обзор системы MQ Player
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium"
            style={{
              backgroundColor: "rgba(16,185,129,0.06)",
              border: "1px solid rgba(16,185,129,0.12)",
              color: "#10b981",
            }}
          >
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: "#10b981" }} />
            Онлайн
          </div>
          <div
            className="px-3 py-2 rounded-xl text-xs font-mono"
            style={{
              backgroundColor: "var(--mq-card)",
              border: "1px solid var(--mq-border)",
              color: "var(--mq-text-muted)",
            }}
          >
            {currentTime}
          </div>
        </div>
      </motion.div>

      {/* Primary Stats - Big Cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {primaryStats.map((card, idx) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.label}
              whileHover={{ y: -3, transition: { duration: 0.25 } }}
              className="rounded-2xl p-4 lg:p-5 cursor-default"
              style={{
                backgroundColor: card.bg,
                border: `1px solid ${card.border}`,
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: `${card.color}15` }}
                >
                  <Icon className="w-5 h-5" style={{ color: card.color }} />
                </div>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-md" style={{
                  backgroundColor: `${card.color}10`,
                  color: card.color,
                }}>
                  #{idx + 1}
                </span>
              </div>
              <p
                className="text-3xl lg:text-4xl font-bold tracking-tight mb-1"
                style={{ color: "var(--mq-text)" }}
              >
                {formatNumber(card.value)}
              </p>
              <p className="text-xs font-medium" style={{ color: card.color }}>
                {card.label}
              </p>
              <p className="text-[11px] mt-1" style={{ color: "var(--mq-text-muted)" }}>
                {card.sub}
              </p>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Growth Stats Row */}
      <motion.div variants={itemVariants} className="grid grid-cols-4 gap-3">
        {growthStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="rounded-xl px-4 py-3 flex items-center gap-3"
              style={{
                backgroundColor: "var(--mq-card)",
                border: "1px solid var(--mq-border)",
              }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${stat.color}12` }}
              >
                <Icon className="w-4 h-4" style={{ color: stat.color }} />
              </div>
              <div className="min-w-0">
                <p className="text-lg font-bold leading-tight" style={{ color: "var(--mq-text)" }}>
                  {formatNumber(stat.value)}
                </p>
                <p className="text-[10px] font-medium" style={{ color: "var(--mq-text-muted)" }}>
                  {stat.label}
                </p>
              </div>
            </div>
          );
        })}
      </motion.div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Quick Navigation */}
        <motion.div
          variants={itemVariants}
          className="xl:col-span-1 rounded-2xl p-5"
          style={{
            backgroundColor: "var(--mq-card)",
            border: "1px solid var(--mq-border)",
          }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-4 h-4" style={{ color: "#6366f1" }} />
            <h2 className="text-sm font-semibold" style={{ color: "var(--mq-text)" }}>
              Навигация
            </h2>
          </div>
          <div className="space-y-1.5">
            {quickNav.map((item) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.href}
                  whileHover={{ x: 3 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Link
                    href={item.href}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors group"
                    style={{ color: "var(--mq-text)" }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.03)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                    }}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${item.color}10` }}
                    >
                      <Icon className="w-4 h-4" style={{ color: item.color }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-[10px]" style={{ color: "var(--mq-text-muted)" }}>
                        {item.desc}
                      </p>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-50 transition-opacity flex-shrink-0" />
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* Recent Registrations */}
        <motion.div
          variants={itemVariants}
          className="xl:col-span-2 rounded-2xl overflow-hidden"
          style={{
            backgroundColor: "var(--mq-card)",
            border: "1px solid var(--mq-border)",
          }}
        >
          <div
            className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom: "1px solid var(--mq-border)" }}
          >
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: "rgba(99,102,241,0.1)" }}
              >
                <Users className="w-4 h-4" style={{ color: "#6366f1" }} />
              </div>
              <div>
                <h2 className="text-sm font-semibold" style={{ color: "var(--mq-text)" }}>
                  Последние регистрации
                </h2>
                <p className="text-[10px]" style={{ color: "var(--mq-text-muted)" }}>
                  Новые пользователи системы
                </p>
              </div>
            </div>
            <Link
              href="/admin/users"
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
              style={{ color: "#6366f1", backgroundColor: "rgba(99,102,241,0.06)" }}
            >
              Все
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--mq-border)" }}>
                  <th
                    className="text-left px-5 py-3 font-medium text-[10px] uppercase tracking-wider"
                    style={{ color: "var(--mq-text-muted)" }}
                  >
                    Пользователь
                  </th>
                  <th
                    className="text-left px-5 py-3 font-medium text-[10px] uppercase tracking-wider hidden sm:table-cell"
                    style={{ color: "var(--mq-text-muted)" }}
                  >
                    Email
                  </th>
                  <th
                    className="text-left px-5 py-3 font-medium text-[10px] uppercase tracking-wider"
                    style={{ color: "var(--mq-text-muted)" }}
                  >
                    Статус
                  </th>
                  <th
                    className="text-left px-5 py-3 font-medium text-[10px] uppercase tracking-wider hidden md:table-cell"
                    style={{ color: "var(--mq-text-muted)" }}
                  >
                    Роль
                  </th>
                  <th
                    className="text-right px-5 py-3 font-medium text-[10px] uppercase tracking-wider hidden lg:table-cell"
                    style={{ color: "var(--mq-text-muted)" }}
                  >
                    Дата
                  </th>
                </tr>
              </thead>
              <tbody>
                {stats.recentRegistrations.map((user) => (
                  <tr
                    key={user.id}
                    className="transition-colors"
                    style={{ borderBottom: "1px solid var(--mq-border)" }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.015)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                    }}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold flex-shrink-0 text-white"
                          style={{
                            background: user.blocked
                              ? "linear-gradient(135deg, #f97316, #fb923c)"
                              : "linear-gradient(135deg, #6366f1, #818cf8)",
                          }}
                        >
                          {user.username.charAt(0).toUpperCase()}
                        </div>
                        <span
                          className="font-medium text-sm truncate"
                          style={{ color: "var(--mq-text)" }}
                        >
                          {user.username}
                        </span>
                      </div>
                    </td>
                    <td
                      className="px-5 py-3 hidden sm:table-cell truncate max-w-[200px] text-xs"
                      style={{ color: "var(--mq-text-muted)" }}
                    >
                      {user.email}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5">
                        <div
                          className="w-1.5 h-1.5 rounded-full"
                          style={{
                            backgroundColor: user.blocked
                              ? "#f97316"
                              : user.confirmed
                              ? "#10b981"
                              : "var(--mq-text-muted)",
                          }}
                        />
                        <span
                          className="text-[11px] font-medium"
                          style={{
                            color: user.blocked
                              ? "#f97316"
                              : user.confirmed
                              ? "#10b981"
                              : "var(--mq-text-muted)",
                          }}
                        >
                          {user.blocked ? "Блок" : user.confirmed ? "Подтв." : "Ожидает"}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3 hidden md:table-cell">
                      {user.role === "admin" ? (
                        <span
                          className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md"
                          style={{
                            backgroundColor: "rgba(99,102,241,0.1)",
                            color: "#6366f1",
                          }}
                        >
                          <Shield className="w-3 h-3" />
                          Админ
                        </span>
                      ) : (
                        <span className="text-[11px]" style={{ color: "var(--mq-text-muted)" }}>
                          Пользователь
                        </span>
                      )}
                    </td>
                    <td
                      className="px-5 py-3 text-right text-[11px] hidden lg:table-cell"
                      style={{ color: "var(--mq-text-muted)" }}
                    >
                      {formatDate(user.createdAt)}
                    </td>
                  </tr>
                ))}
                {stats.recentRegistrations.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-16 text-center"
                      style={{ color: "var(--mq-text-muted)" }}
                    >
                      <Users
                        className="w-8 h-8 mx-auto mb-2"
                        style={{ color: "var(--mq-text-muted)", opacity: 0.2 }}
                      />
                      <p className="text-sm">Нет зарегистрированных пользователей</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>

      {/* System Info */}
      <motion.div
        variants={itemVariants}
        className="grid grid-cols-2 sm:grid-cols-4 gap-3"
      >
        {[
          { icon: Server, label: "Сервер", value: "Active", color: "#10b981" },
          { icon: Database, label: "База данных", value: "Connected", color: "#6366f1" },
          { icon: Globe, label: "API", value: "Healthy", color: "#06b6d4" },
          { icon: Cpu, label: "CPU", value: "Normal", color: "#f59e0b" },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className="rounded-xl px-4 py-3 flex items-center gap-3"
              style={{
                backgroundColor: "var(--mq-card)",
                border: "1px solid var(--mq-border)",
              }}
            >
              <Icon className="w-4 h-4 flex-shrink-0" style={{ color: item.color }} />
              <div className="min-w-0">
                <p className="text-[10px] font-medium" style={{ color: "var(--mq-text-muted)" }}>
                  {item.label}
                </p>
                <p className="text-xs font-semibold" style={{ color: item.color }}>
                  {item.value}
                </p>
              </div>
            </div>
          );
        })}
      </motion.div>
    </motion.div>
  );
}
