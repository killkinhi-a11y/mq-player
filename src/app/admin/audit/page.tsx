"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ScrollText,
  Search,
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader2,
  Shield,
  UserCheck,
  UserX,
  Key,
  Trash2,
  Mail,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface AuditLogEntry {
  id: string;
  adminId: string;
  action: string;
  targetId: string | null;
  details: string | null;
  createdAt: string;
  admin: {
    id: string;
    username: string;
    email: string;
  };
}

const actionLabels: Record<string, string> = {
  confirm_email: "Подтверждение email",
  block_user: "Блокировка",
  unblock_user: "Разблокировка",
  change_role: "Смена роли",
  reset_password: "Сброс пароля",
  delete_user: "Удаление пользователя",
};

const actionColors: Record<string, string> = {
  confirm_email: "#4ade80",
  block_user: "#f97316",
  unblock_user: "#06b6d4",
  change_role: "#8b5cf6",
  reset_password: "#f59e0b",
  delete_user: "#ef4444",
};

const actionIcons: Record<string, typeof Shield> = {
  confirm_email: Mail,
  block_user: UserX,
  unblock_user: UserCheck,
  change_role: Shield,
  reset_password: Key,
  delete_user: Trash2,
};

const actionFilters = [
  { value: "", label: "Все действия" },
  { value: "confirm_email", label: "Подтверждение email" },
  { value: "block_user", label: "Блокировка" },
  { value: "unblock_user", label: "Разблокировка" },
  { value: "change_role", label: "Смена роли" },
  { value: "reset_password", label: "Сброс пароля" },
  { value: "delete_user", label: "Удаление" },
];

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [limit] = useState(20);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (actionFilter) params.set("action", actionFilter);
      const res = await fetch(`/api/admin/audit?${params}`);
      const data = await res.json();
      if (data.error) return;
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error("Failed to fetch logs:", err);
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter, limit]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const totalPages = Math.ceil(total / limit);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const parseDetails = (details: string | null) => {
    if (!details) return null;
    try {
      return JSON.parse(details);
    } catch {
      return details;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--mq-text)" }}>
            Журнал аудита
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--mq-text-muted)" }}>
            Все действия администраторов ({total.toLocaleString("ru-RU")})
          </p>
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
          style={{
            backgroundColor: showFilters ? "rgba(224,49,49,0.1)" : "var(--mq-card)",
            border: "1px solid var(--mq-border)",
            color: showFilters ? "var(--mq-accent)" : "var(--mq-text-muted)",
          }}
        >
          <Filter className="w-4 h-4" />
          Фильтр
        </button>
      </div>

      {/* Filter dropdown */}
      {showFilters && (
        <div
          className="rounded-2xl p-4"
          style={{
            backgroundColor: "var(--mq-card)",
            border: "1px solid var(--mq-border)",
          }}
        >
          <p className="text-xs font-medium mb-3" style={{ color: "var(--mq-text-muted)" }}>
            Фильтр по действию
          </p>
          <div className="flex flex-wrap gap-2">
            {actionFilters.map((filter) => (
              <button
                key={filter.value}
                onClick={() => {
                  setActionFilter(filter.value);
                  setPage(1);
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={{
                  backgroundColor:
                    actionFilter === filter.value
                      ? "rgba(224,49,49,0.15)"
                      : "var(--mq-input-bg)",
                  border:
                    actionFilter === filter.value
                      ? "1px solid rgba(224,49,49,0.3)"
                      : "1px solid var(--mq-border)",
                  color:
                    actionFilter === filter.value
                      ? "var(--mq-accent)"
                      : "var(--mq-text-muted)",
                }}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Audit logs table */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          backgroundColor: "var(--mq-card)",
          border: "1px solid var(--mq-border)",
        }}
      >
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--mq-accent)" }} />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--mq-border)" }}>
                    <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider" style={{ color: "var(--mq-text-muted)" }}>
                      Действие
                    </th>
                    <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider hidden sm:table-cell" style={{ color: "var(--mq-text-muted)" }}>
                      Администратор
                    </th>
                    <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider hidden md:table-cell" style={{ color: "var(--mq-text-muted)" }}>
                      Детали
                    </th>
                    <th className="text-right px-4 py-2.5 font-medium text-xs uppercase tracking-wider" style={{ color: "var(--mq-text-muted)" }}>
                      Дата
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const Icon = actionIcons[log.action] || ScrollText;
                    const color = actionColors[log.action] || "var(--mq-text-muted)";
                    const label = actionLabels[log.action] || log.action;
                    const details = parseDetails(log.details);
                    return (
                      <tr key={log.id} style={{ borderBottom: "1px solid var(--mq-border)" }}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Icon className="w-4 h-4 flex-shrink-0" style={{ color }} />
                            <span className="font-medium" style={{ color: "var(--mq-text)" }}>
                              {label}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <div>
                            <p className="font-medium" style={{ color: "var(--mq-text)" }}>
                              {log.admin.username}
                            </p>
                            <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
                              {log.admin.email}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          {details && typeof details === "object" ? (
                            <div className="flex flex-wrap gap-1.5">
                              {Object.entries(details).map(([key, value]) => (
                                <span
                                  key={key}
                                  className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md"
                                  style={{
                                    backgroundColor: "var(--mq-input-bg)",
                                    border: "1px solid var(--mq-border)",
                                    color: "var(--mq-text-muted)",
                                  }}
                                >
                                  <span style={{ color: "var(--mq-text)" }}>{key}:</span>{" "}
                                  {String(value)}
                                </span>
                              ))}
                            </div>
                          ) : details ? (
                            <p className="text-xs truncate max-w-[250px]" style={{ color: "var(--mq-text-muted)" }}>
                              {String(details)}
                            </p>
                          ) : (
                            <span className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
                              —
                            </span>
                          )}
                        </td>
                        <td
                          className="px-4 py-3 text-right text-xs whitespace-nowrap"
                          style={{ color: "var(--mq-text-muted)" }}
                        >
                          {formatDate(log.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                  {logs.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center" style={{ color: "var(--mq-text-muted)" }}>
                        {actionFilter
                          ? "Нет записей для выбранного фильтра"
                          : "Журнал аудита пуст"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div
                className="flex items-center justify-between px-4 py-3"
                style={{ borderTop: "1px solid var(--mq-border)" }}
              >
                <span className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
                  Страница {page} из {totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="p-1.5 rounded-lg disabled:opacity-30"
                    style={{ color: "var(--mq-text-muted)" }}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page === totalPages}
                    className="p-1.5 rounded-lg disabled:opacity-30"
                    style={{ color: "var(--mq-text-muted)" }}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
