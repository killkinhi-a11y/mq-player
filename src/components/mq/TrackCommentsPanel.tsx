"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, MessageSquare, Clock, User } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";

// ── Helpers ──────────────────────────────────────────────

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatRelativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return "только что";
  if (diff < 5) return `${diff} мин назад`;
  if (diff < 60) return `${diff} мин назад`;
  if (diff < 1440) return `${Math.floor(diff / 60)} ч назад`;
  if (diff < 10080) return `${Math.floor(diff / 1440)} дн назад`;
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

// Group comments into timestamp ranges (SoundCloud style — every 10s)
function groupCommentsByTimestamp(comments: TrackCommentData[]): Map<string, TrackCommentData[]> {
  const groups = new Map<string, TrackCommentData[]>();
  for (const comment of comments) {
    const rangeStart = Math.floor(comment.timestamp / 10) * 10;
    const rangeEnd = rangeStart + 10;
    const key = `${formatTimestamp(rangeStart)} – ${formatTimestamp(rangeEnd)}`;
    const existing = groups.get(key) || [];
    existing.push(comment);
    groups.set(key, existing);
  }
  return groups;
}

// ── Types ────────────────────────────────────────────────

interface TrackCommentData {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  content: string;
  timestamp: number;
  likes: number;
  createdAt: string;
}

interface TrackCommentsPanelProps {
  trackId: string | number;
  currentProgress: number;
  onSeek: (time: number) => void;
  isOpen: boolean;
  onClose: () => void;
}

// ── Component ────────────────────────────────────────────

export default function TrackCommentsPanel({
  trackId,
  currentProgress,
  onSeek,
  isOpen,
  onClose,
}: TrackCommentsPanelProps) {
  const { userId, username } = useAppStore();
  const [comments, setComments] = useState<TrackCommentData[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [inputText, setInputText] = useState("");
  const [commentTimestamp, setCommentTimestamp] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const trackIdStr = String(trackId);

  // Fetch comments when panel opens or trackId changes
  const fetchComments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tracks/${trackIdStr}/comments`);
      if (res.ok) {
        const data = await res.json();
        setComments(data.comments || []);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [trackIdStr]);

  useEffect(() => {
    if (isOpen) fetchComments();
  }, [isOpen, fetchComments]);

  // Auto-fill timestamp when input is focused and track is playing
  const handleInputFocus = () => {
    if (currentProgress >= 0) {
      setCommentTimestamp(currentProgress);
    }
  };

  const handleSubmit = async () => {
    if (!inputText.trim()) return;
    if (!userId) return; // Require auth for posting

    setSending(true);
    try {
      const res = await fetch(`/api/tracks/${trackIdStr}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackId: trackIdStr,
          content: inputText.trim(),
          timestamp: commentTimestamp,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setComments((prev) => {
          const updated = [...prev, data.comment];
          return updated.sort((a, b) => a.timestamp - b.timestamp);
        });
        setInputText("");
      }
    } catch { /* silent */ }
    finally { setSending(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const commentGroups = groupCommentsByTimestamp(comments);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="absolute bottom-0 left-0 right-0 z-20 rounded-t-2xl flex flex-col"
          style={{
            maxHeight: "55vh",
            backgroundColor: "var(--mq-card)",
            borderTop: "1px solid var(--mq-border)",
            boxShadow: "0 -8px 32px rgba(0,0,0,0.35)",
          }}
        >
          {/* Handle bar */}
          <div className="flex justify-center pt-2 pb-1">
            <div className="w-10 h-1 rounded-full" style={{ backgroundColor: "var(--mq-border)" }} />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-4 pb-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
              <h3 className="text-sm font-bold" style={{ color: "var(--mq-text)" }}>
                Комментарии
              </h3>
              {comments.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: "rgba(224,49,49,0.1)", color: "var(--mq-accent)" }}>
                  {comments.length}
                </span>
              )}
            </div>
            <button onClick={onClose} style={{ color: "var(--mq-text-muted)" }}>
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Comments list */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4"
            style={{
              maxHeight: "35vh",
              scrollbarWidth: "thin",
              scrollbarColor: "var(--mq-border) transparent",
            }}
          >
            {loading && comments.length === 0 ? (
              <div className="space-y-3 py-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-2 animate-pulse">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full" style={{ backgroundColor: "var(--mq-input-bg)" }} />
                      <div className="h-3 w-20 rounded" style={{ backgroundColor: "var(--mq-input-bg)" }} />
                    </div>
                    <div className="h-3 w-3/4 rounded ml-9" style={{ backgroundColor: "var(--mq-input-bg)" }} />
                  </div>
                ))}
              </div>
            ) : comments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <MessageSquare className="w-10 h-10" style={{ color: "var(--mq-text-muted)", opacity: 0.3 }} />
                <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                  Пока нет комментариев
                </p>
                <p className="text-xs" style={{ color: "var(--mq-text-muted)", opacity: 0.6 }}>
                  Напишите первый комментарий к этому треку
                </p>
              </div>
            ) : (
              <div className="space-y-4 pb-4">
                {[...commentGroups.entries()].map(([rangeLabel, groupComments]) => (
                  <div key={rangeLabel}>
                    {/* Timestamp group header */}
                    <div
                      className="flex items-center gap-1.5 mb-2 cursor-pointer group/timestamp"
                      onClick={() => onSeek(groupComments[0].timestamp)}
                    >
                      <Clock className="w-3 h-3 transition-colors"
                        style={{ color: "var(--mq-text-muted)", opacity: 0.6 }} />
                      <span className="text-[11px] font-medium transition-colors"
                        style={{
                          color: "var(--mq-text-muted)",
                          opacity: 0.6,
                        }}
                        onMouseEnter={(e) => {
                          (e.target as HTMLElement).style.opacity = "1";
                          (e.target as HTMLElement).style.color = "var(--mq-accent)";
                        }}
                        onMouseLeave={(e) => {
                          (e.target as HTMLElement).style.opacity = "0.6";
                          (e.target as HTMLElement).style.color = "var(--mq-text-muted)";
                        }}>
                        {rangeLabel}
                      </span>
                    </div>

                    {/* Comments in group */}
                    <div className="space-y-2 ml-1">
                      {groupComments.map((comment) => (
                        <motion.div
                          key={comment.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex items-start gap-2.5 rounded-xl p-2.5 transition-colors"
                          style={{ backgroundColor: "rgba(255,255,255,0.02)" }}
                        >
                          {/* Avatar */}
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden"
                            style={{ backgroundColor: "var(--mq-input-bg)" }}
                          >
                            {comment.avatar ? (
                              <img src={comment.avatar} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <User className="w-3.5 h-3.5" style={{ color: "var(--mq-text-muted)" }} />
                            )}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold truncate"
                                style={{ color: "var(--mq-text)" }}>
                                {comment.username}
                              </span>
                              <button
                                className="text-[10px] font-mono cursor-pointer transition-colors rounded px-1 py-0.5"
                                style={{
                                  backgroundColor: "var(--mq-input-bg)",
                                  color: "var(--mq-text-muted)",
                                }}
                                onClick={() => onSeek(comment.timestamp)}
                                title="Перейти к моменту"
                              >
                                {formatTimestamp(comment.timestamp)}
                              </button>
                              <span className="text-[9px]" style={{ color: "var(--mq-text-muted)", opacity: 0.5 }}>
                                {formatRelativeTime(comment.createdAt)}
                              </span>
                            </div>
                            <p className="text-xs mt-0.5 break-words" style={{ color: "var(--mq-text-muted)" }}>
                              {comment.content}
                            </p>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Input area */}
          <div
            className="flex-shrink-0 px-4 py-3"
            style={{ borderTop: "1px solid var(--mq-border)" }}
          >
            {userId ? (
              <div className="flex items-end gap-2">
                {/* Timestamp badge */}
                <div className="flex items-center gap-1 px-2 py-1 rounded-lg flex-shrink-0"
                  style={{ backgroundColor: "var(--mq-input-bg)" }}>
                  <Clock className="w-3 h-3" style={{ color: "var(--mq-accent)" }} />
                  <span className="text-[10px] font-mono" style={{ color: "var(--mq-accent)" }}>
                    {formatTimestamp(commentTimestamp)}
                  </span>
                </div>
                <div className="flex-1">
                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={handleInputFocus}
                    placeholder="Написать комментарий..."
                    rows={1}
                    maxLength={500}
                    className="w-full text-xs rounded-xl px-3 py-2 resize-none outline-none"
                    style={{
                      backgroundColor: "var(--mq-input-bg)",
                      color: "var(--mq-text)",
                      border: "1px solid var(--mq-border)",
                    }}
                  />
                </div>
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  onClick={handleSubmit}
                  disabled={!inputText.trim() || sending}
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-opacity"
                  style={{
                    backgroundColor: inputText.trim() ? "var(--mq-accent)" : "var(--mq-input-bg)",
                    color: inputText.trim() ? "var(--mq-text)" : "var(--mq-text-muted)",
                    opacity: inputText.trim() && !sending ? 1 : 0.5,
                  }}
                >
                  <Send className="w-3.5 h-3.5" />
                </motion.button>
              </div>
            ) : (
              <p className="text-xs text-center" style={{ color: "var(--mq-text-muted)" }}>
                <a href="/auth" className="underline" style={{ color: "var(--mq-accent)" }}>
                  Войдите
                </a>
                , чтобы оставить комментарий
              </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
