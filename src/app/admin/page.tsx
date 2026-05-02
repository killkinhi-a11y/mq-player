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
  CheckCircle,
  XCircle,
  Shield,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--mq-accent)" }} />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-2xl p-6 text-center"
        style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
      >
        <p style={{ color: "var(--mq-accent)" }}>{error}</p>
      </div>
    );
  }

  if (!stats) return null;

  const statCards = [
    {
      label: "Всего пользователей",
      value: stats.totalUsers,
      icon: Users,
      color: "var(--mq-accent)",
    },
    {
      label: "Подтверждённые",
      value: stats.confirmedUsers,
      icon: UserCheck,
      color: "#4ade80",
    },
    {
      label: "Заблокированные",
      value: stats.blockedUsers,
      icon: UserX,
      color: "#f97316",
    },
    {
      label: "Новых сегодня",
      value: stats.todayUsers,
      icon: TrendingUp,
      color: "#06b6d4",
    },
    {
      label: "Новых за неделю",
      value: stats.weekUsers,
      icon: Clock,
      color: "#8b5cf6",
    },
    {
      label: "Новых за месяц",
      value: stats.monthUsers,
      icon: TrendingUp,
      color: "#ec4899",
    },
    {
      label: "Сообщений",
      value: stats.totalMessages,
      icon: MessageSquare,
      color: "#f59e0b",
    },
    {
      label: "Истории",
      value: stats.totalStories,
      icon: Music2,
      color: "#10b981",
    },
    {
      label: "Плейлисты",
      value: stats.totalPlaylists,
      icon: ListMusic,
      color: "#6366f1",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--mq-text)" }}
        >
          Дашборд
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--mq-text-muted)" }}>
          Обзор системы MQ Player
        </p>
      </div>

      {/* Stat cards grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="rounded-2xl p-4"
              style={{
                backgroundColor: "var(--mq-card)",
                border: "1px solid var(--mq-border)",
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4" style={{ color: card.color }} />
                <span
                  className="text-xs truncate"
                  style={{ color: "var(--mq-text-muted)" }}
                >
                  {card.label}
                </span>
              </div>
              <p
                className="text-2xl font-bold"
                style={{ color: "var(--mq-text)" }}
              >
                {card.value.toLocaleString("ru-RU")}
              </p>
            </div>
          );
        })}
      </div>

      {/* Recent registrations */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          backgroundColor: "var(--mq-card)",
          border: "1px solid var(--mq-border)",
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "1px solid var(--mq-border)" }}
        >
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
            <h2
              className="font-semibold"
              style={{ color: "var(--mq-text)" }}
            >
              Последние регистрации
            </h2>
          </div>
          <Link
            href="/admin/users"
            className="text-xs font-medium"
            style={{ color: "var(--mq-accent)" }}
          >
            Все пользователи →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid var(--mq-border)",
                }}
              >
                <th
                  className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider"
                  style={{ color: "var(--mq-text-muted)" }}
                >
                  Пользователь
                </th>
                <th
                  className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider hidden sm:table-cell"
                  style={{ color: "var(--mq-text-muted)" }}
                >
                  Email
                </th>
                <th
                  className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider"
                  style={{ color: "var(--mq-text-muted)" }}
                >
                  Статус
                </th>
                <th
                  className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider hidden md:table-cell"
                  style={{ color: "var(--mq-text-muted)" }}
                >
                  Роль
                </th>
                <th
                  className="text-right px-4 py-2.5 font-medium text-xs uppercase tracking-wider hidden lg:table-cell"
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
                  style={{ borderBottom: "1px solid var(--mq-border)" }}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                        style={{
                          backgroundColor: "rgba(224,49,49,0.15)",
                          color: "var(--mq-accent)",
                        }}
                      >
                        {user.username.charAt(0).toUpperCase()}
                      </div>
                      <span
                        className="font-medium truncate"
                        style={{ color: "var(--mq-text)" }}
                      >
                        {user.username}
                      </span>
                    </div>
                  </td>
                  <td
                    className="px-4 py-3 hidden sm:table-cell truncate max-w-[200px]"
                    style={{ color: "var(--mq-text-muted)" }}
                  >
                    {user.email}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {user.confirmed ? (
                        <CheckCircle
                          className="w-3.5 h-3.5"
                          style={{ color: "#4ade80" }}
                        />
                      ) : (
                        <XCircle
                          className="w-3.5 h-3.5"
                          style={{ color: "var(--mq-text-muted)" }}
                        />
                      )}
                      {user.blocked && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0"
                          style={{
                            backgroundColor: "rgba(249,115,22,0.15)",
                            color: "#f97316",
                          }}
                        >
                          Блок
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td
                    className="px-4 py-3 hidden md:table-cell"
                    style={{ color: "var(--mq-text-muted)" }}
                  >
                    {user.role === "admin" ? (
                      <span className="flex items-center gap-1 text-xs">
                        <Shield className="w-3 h-3" style={{ color: "var(--mq-accent)" }} />
                        Админ
                      </span>
                    ) : (
                      <span className="text-xs">Пользователь</span>
                    )}
                  </td>
                  <td
                    className="px-4 py-3 text-right text-xs hidden lg:table-cell"
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
                    className="px-4 py-8 text-center"
                    style={{ color: "var(--mq-text-muted)" }}
                  >
                    Нет зарегистрированных пользователей
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
