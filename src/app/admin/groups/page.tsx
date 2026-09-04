"use client";

/**
 * /admin/groups — Phase O §5.6.
 * Real data from /api/admin/groups (withAdminAuth): owner, member count,
 * message count, created/updated. Delete via server-side admin API only.
 * If the metric can't be fetched → "Недоступно", never a fabricated number.
 */

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Users, Trash2, Search, Loader2, MessageCircle, Crown, RefreshCw } from "lucide-react";

interface AdminGroup {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  ownerUsername: string | null;
  memberCount: number;
  messageCount: number;
}

export default function AdminGroupsPage() {
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/admin/groups?${params}`);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setGroups(Array.isArray(data.groups) ? data.groups : []);
      setTotal(typeof data.total === "number" ? data.total : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить группы");
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(fetchGroups, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [fetchGroups, search]);

  const handleDelete = useCallback(async (groupId: string) => {
    setDeleting(groupId);
    try {
      const res = await fetch("/api/admin/groups", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId }),
      });
      if (res.ok) {
        setGroups((p) => p.filter((g) => g.id !== groupId));
        setTotal((t) => (t !== null ? Math.max(0, t - 1) : t));
        setConfirmId(null);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Не удалось удалить группу");
      }
    } finally {
      setDeleting(null);
    }
  }, []);

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("ru-RU", {
        day: "numeric", month: "short", year: "numeric",
      });
    } catch {
      return "—";
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="mq-t-title text-xl" style={{ color: "var(--mq-text)" }}>Группы</h1>
          <p className="mq-t-meta text-xs mt-1" style={{ color: "var(--mq-text-muted)" }}>
            {total !== null ? `${total} групповых чатов` : "Недоступно"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--mq-text-muted)" }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по названию"
              className="pl-9 pr-3 py-2 rounded-xl text-sm outline-none w-56"
              style={{
                backgroundColor: "var(--mq-input-bg, rgba(255,255,255,0.04))",
                border: "1px solid var(--mq-border)",
                color: "var(--mq-text)",
              }}
            />
          </div>
          <button
            onClick={fetchGroups}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors hover:bg-white/[0.04]"
            style={{ border: "1px solid var(--mq-border)", color: "var(--mq-text-muted)" }}
            aria-label="Обновить"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error && (
        <div
          className="rounded-xl px-4 py-3 mb-4 text-sm"
          style={{ backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}
          role="alert"
        >
          {error}
        </div>
      )}

      {loading && groups.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--mq-accent)" }} />
        </div>
      ) : groups.length === 0 && !error ? (
        <div className="text-center py-16">
          <Users className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--mq-text-muted)", opacity: 0.4 }} />
          <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
            {search.trim() ? "Ничего не найдено" : "Групп пока нет"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => (
            <motion.div
              key={g.id}
              initial={false}
              layout
              className="rounded-xl p-4 flex items-center gap-4"
              style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: "rgba(139,92,246,0.12)" }}>
                <Users className="w-5 h-5" style={{ color: "#8b5cf6" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="mq-t-body text-sm font-semibold truncate" style={{ color: "var(--mq-text)" }}>
                  {g.name}
                </p>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className="mq-t-meta text-[11px] flex items-center gap-1" style={{ color: "var(--mq-text-muted)" }}>
                    <Crown className="w-3 h-3" />
                    {g.ownerUsername || "владелец удалён"}
                  </span>
                  <span className="mq-t-num text-[11px]" style={{ color: "var(--mq-text-muted)" }}>
                    {g.memberCount} участников
                  </span>
                  <span className="mq-t-num text-[11px] flex items-center gap-1" style={{ color: "var(--mq-text-muted)" }}>
                    <MessageCircle className="w-3 h-3" />
                    {g.messageCount}
                  </span>
                  <span className="mq-t-meta text-[11px]" style={{ color: "var(--mq-text-muted)" }}>
                    создана {fmtDate(g.createdAt)}
                  </span>
                </div>
              </div>
              {confirmId === g.id ? (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleDelete(g.id)}
                    disabled={deleting === g.id}
                    className="px-3 h-8 rounded-lg text-xs font-semibold"
                    style={{ backgroundColor: "#ef4444", color: "#fff" }}
                  >
                    {deleting === g.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Удалить"}
                  </button>
                  <button
                    onClick={() => setConfirmId(null)}
                    className="px-3 h-8 rounded-lg text-xs"
                    style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--mq-text)" }}
                  >
                    Отмена
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmId(g.id)}
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors hover:bg-red-500/10"
                  aria-label={`Удалить группу ${g.name}`}
                >
                  <Trash2 className="w-4 h-4" style={{ color: "#ef4444" }} />
                </button>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
