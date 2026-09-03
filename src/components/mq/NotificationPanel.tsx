"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, X, Check, Trash2, MessageCircle, UserPlus, UserCheck, Music } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { canPollProtected, controlled401Recovery } from "@/lib/authGate";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: string;
  read: boolean;
  createdAt: string;
}

// Phase 4B «Тихая редакция»: side sheet on surface-1 with a hairline
// edge and one dialog-level shadow. Rows follow the unified .mq-row
// pattern (accent tint for unread, dot marker, meta typography).

function formatNotifTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return "только что";
  if (diff < 5) return `${diff} мин назад`;
  if (diff < 60) return `${diff} мин назад`;
  if (diff < 1440) return `${Math.floor(diff / 60)} ч назад`;
  if (diff < 10080) return `${Math.floor(diff / 1440)} дн назад`;
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function getNotifIcon(type: string) {
  switch (type) {
    case "message": return <MessageCircle className="w-4 h-4" />;
    case "friend_request": return <UserPlus className="w-4 h-4" />;
    case "friend_accepted": return <UserCheck className="w-4 h-4" />;
    case "now_playing": return <Music className="w-4 h-4" />;
    default: return <Bell className="w-4 h-4" />;
  }
}

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function NotificationPanel({ isOpen, onClose }: NotificationPanelProps) {
  const userId = useAppStore((s) => s.userId);
  const setNotificationCount = useAppStore((s) => s.setNotificationCount);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    // Gate: real authenticated sessions only — demo mode must not poll
    // (Phase 2C: this poller fired 401s every cycle in demo mode).
    const st = useAppStore.getState();
    if (!canPollProtected(st.userId, st.isAuthenticated)) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/notifications?userId=${userId}`);
      if (res.status === 401) {
        // Controlled recovery — suspends polling until next login.
        controlled401Recovery("notifications");
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch { /* silent */ }
    finally { setIsLoading(false); }
  }, [userId]);

  // Fetch on open
  useEffect(() => {
    if (isOpen) fetchNotifications();
  }, [isOpen, fetchNotifications]);

  // Poll for new notifications every 15s — real authenticated sessions only
  // (demo users skip: their userId is set but the session is local-only).
  useEffect(() => {
    if (!userId) return;
    if (!canPollProtected(useAppStore.getState().userId, useAppStore.getState().isAuthenticated)) return;
    const interval = setInterval(() => {
      if (!canPollProtected(useAppStore.getState().userId, useAppStore.getState().isAuthenticated)) {
        clearInterval(interval);
        return;
      }
      fetchNotifications();
    }, 15000);
    return () => clearInterval(interval);
  }, [userId, fetchNotifications]);

  const markAllRead = async () => {
    if (!userId) return;
    try {
      await fetch("/api/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      });
      setNotificationCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch { /* silent */ }
  };

  const markRead = async (id: string) => {
    try {
      await fetch("/api/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId: id }),
      });
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch { /* silent */ }
  };

  const deleteNotification = async (id: string) => {
    if (!userId) return;
    try {
      await fetch(`/api/notifications?userId=${userId}&notificationId=${id}`, { method: "DELETE" });
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch { /* silent */ }
  };

  // Always update global notification count (not just when open)
  useEffect(() => {
    if (userId) {
      setNotificationCount(unreadCount);
    }
  }, [unreadCount, userId, setNotificationCount]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[300] flex justify-end"
          style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
          onClick={onClose}
        >
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
            className="w-full max-w-sm h-full flex flex-col"
            style={{
              backgroundColor: "var(--mq-surface-1)",
              borderLeft: "1px solid var(--mq-edge-strong)",
              boxShadow: "var(--mq-elev-dialog)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header — serif title, quiet count, meta actions */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 flex-shrink-0" style={{ borderBottom: "1px solid var(--mq-edge)" }}>
              <div className="flex items-baseline gap-2.5">
                <h2 className="mq-t-display text-[19px]" style={{ color: "var(--mq-text)" }}>
                  Уведомления
                </h2>
                {unreadCount > 0 && (
                  <span className="mq-t-num text-[12px] px-1.5 rounded"
                    style={{ color: "var(--mq-accent)", background: "color-mix(in srgb, var(--mq-accent) 10%, transparent)" }}>
                    {unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="px-2 py-1.5 rounded-lg cursor-pointer hover:bg-white/5 transition-colors"
                    style={{ color: "var(--mq-accent)" }} title="Прочитать все">
                    <Check className="w-4 h-4" />
                  </button>
                )}
                <button onClick={onClose} className="px-2 py-1.5 rounded-lg cursor-pointer hover:bg-white/5 transition-colors" aria-label="Закрыть">
                  <X className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
                </button>
              </div>
            </div>

            {/* Notification list */}
            <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "var(--mq-border) transparent" }}>
              {isLoading && notifications.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 rounded-full animate-spin"
                    style={{ borderColor: "var(--mq-accent)", borderTopColor: "transparent" }} />
                </div>
              ) : notifications.length === 0 ? (
                <div className="mq-empty mx-4 my-6">
                  <Bell className="w-6 h-6" style={{ color: "var(--mq-text-muted)" }} />
                  <p className="mq-empty-title">Пока тихо</p>
                  <p className="mq-empty-hint">Друзья, сообщения и обновления появятся здесь.</p>
                </div>
              ) : (
                <div className="py-2">
                  {notifications.map((notif) => (
                    <motion.div
                      key={notif.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="mq-row !items-start mx-2 my-0.5"
                      data-active={!notif.read || undefined}
                      style={{ minHeight: 64 }}
                      onClick={() => {
                        if (!notif.read) markRead(notif.id);
                        // Navigate based on notification type
                        let data: any = {};
                        try { data = JSON.parse(notif.data || "{}"); } catch {}
                        const st = useAppStore.getState();
                        switch (notif.type) {
                          case "message":
                          case "friend_accepted":
                            if (data.senderId) st.setSelectedContact(data.senderId);
                            st.setView("messenger");
                            break;
                          case "friend_request":
                            st.setView("messenger");
                            break;
                        }
                        onClose();
                      }}
                    >
                      {/* Icon — quiet square, accent only when unread */}
                      <div className="w-9 h-9 rounded-[var(--mq-r-art)] flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{
                          backgroundColor: notif.read ? "var(--mq-surface-2)" : "color-mix(in srgb, var(--mq-accent) 14%, transparent)",
                          border: "1px solid " + (notif.read ? "var(--mq-edge)" : "color-mix(in srgb, var(--mq-accent) 30%, transparent)"),
                        }}>
                        <span style={{ color: notif.read ? "var(--mq-text-muted)" : "var(--mq-accent)" }}>
                          {getNotifIcon(notif.type)}
                        </span>
                      </div>
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[13px] font-semibold truncate" style={{ color: notif.read ? "var(--mq-text)" : "var(--mq-accent)" }}>
                            {notif.title}
                          </p>
                          {!notif.read && (
                            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: "var(--mq-accent)" }} />
                          )}
                        </div>
                        {notif.body && (
                          <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--mq-text-muted)" }}>
                            {notif.body}
                          </p>
                        )}
                        <p className="mq-t-meta text-[11px] mt-1.5">
                          {formatNotifTime(notif.createdAt)}
                        </p>
                      </div>
                      {/* Delete */}
                      <button onClick={(e) => { e.stopPropagation(); deleteNotification(notif.id); }}
                        className="p-1 rounded cursor-pointer hover:opacity-100 transition-opacity flex-shrink-0 opacity-40"
                        style={{ color: "var(--mq-text-muted)" }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
