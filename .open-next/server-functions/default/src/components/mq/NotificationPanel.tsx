"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, X, Check, Trash2, MessageCircle, UserPlus, UserCheck, Music } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: string;
  read: boolean;
  createdAt: string;
}

const glassPanelSolid = {
  background: "var(--mq-card)",
  border: "1px solid var(--mq-border)",
};

const shadowDeep = "0 8px 32px rgba(0,0,0,0.35)";

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
  const { userId, setNotificationCount } = useAppStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/notifications?userId=${userId}`);
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

  // Poll for new notifications every 15s (always when authenticated)
  useEffect(() => {
    if (!userId) return;
    const interval = setInterval(fetchNotifications, 15000);
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
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="w-full max-w-sm h-full flex flex-col"
            style={{ backgroundColor: "var(--mq-bg)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 flex-shrink-0" style={{ borderBottom: "1px solid var(--mq-border)" }}>
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
                <h2 className="font-bold text-base" style={{ color: "var(--mq-text)" }}>
                  Уведомления
                </h2>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                    style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}>
                    {unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="p-2 rounded-lg cursor-pointer transition-opacity hover:opacity-70"
                    title="Прочитать все">
                    <Check className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
                  </button>
                )}
                <button onClick={onClose} className="p-2 rounded-lg cursor-pointer transition-opacity hover:opacity-70">
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
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Bell className="w-10 h-10" style={{ color: "var(--mq-text-muted)", opacity: 0.3 }} />
                  <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>Нет уведомлений</p>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: "var(--mq-border)" }}>
                  {notifications.map((notif) => (
                    <motion.div
                      key={notif.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors"
                      style={{
                        backgroundColor: notif.read ? "transparent" : "rgba(255,255,255,0.03)",
                        borderBottom: "1px solid var(--mq-border)",
                      }}
                      onClick={() => { if (!notif.read) markRead(notif.id); }}
                    >
                      {/* Icon */}
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{ backgroundColor: notif.read ? "var(--mq-card)" : "var(--mq-accent)", opacity: notif.read ? 0.7 : 1 }}>
                        <span style={{ color: notif.read ? "var(--mq-text-muted)" : "var(--mq-text)" }}>
                          {getNotifIcon(notif.type)}
                        </span>
                      </div>
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold truncate" style={{ color: "var(--mq-text)" }}>
                            {notif.title}
                          </p>
                          {!notif.read && (
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: "var(--mq-accent)" }} />
                          )}
                        </div>
                        {notif.body && (
                          <p className="text-[11px] mt-0.5 line-clamp-2" style={{ color: "var(--mq-text-muted)" }}>
                            {notif.body}
                          </p>
                        )}
                        <p className="text-[9px] mt-1" style={{ color: "var(--mq-text-muted)", opacity: 0.6 }}>
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
