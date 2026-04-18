"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  MessageCircle,
  Send,
  Loader2,
  Bot,
  UserCircle,
  Zap,
  UserCheck,
  XCircle,
} from "lucide-react";

interface SupportChatSession {
  id: string;
  sessionId: string;
  userId: string | null;
  userName: string | null;
  lastMessage: string;
  messageCount: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface SupportChatMessage {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  createdAt: string;
}

const quickReplies = [
  { label: "Быстрый ответ", icon: Zap, content: "Спасибо за обращение! Ваш запрос принят в обработку. Ожидайте ответ." },
  { label: "Передать специалисту", icon: UserCheck, content: "Ваше обращение передано специалисту. Мы свяжемся с вами в ближайшее время." },
  { label: "Закрыть обращение", icon: XCircle, content: "Обращение закрыто. Если у вас возникнут дополнительные вопросы, обращайтесь снова." },
];

export default function AdminSupportPage() {
  const [sessions, setSessions] = useState<SupportChatSession[]>([]);
  const [messages, setMessages] = useState<SupportChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/support-chat?sessions=true");
      const data = await res.json();
      if (data.sessions) setSessions(data.sessions);
    } catch (err) {
      console.error("Failed to fetch sessions:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMessages = useCallback(async (sessionId: string) => {
    setMessagesLoading(true);
    try {
      const res = await fetch(`/api/admin/support-chat?sessionId=${sessionId}`);
      const data = await res.json();
      if (data.messages) setMessages(data.messages);
    } catch (err) {
      console.error("Failed to fetch messages:", err);
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    if (selectedSession) {
      fetchMessages(selectedSession);
      // Auto refresh messages every 3 seconds
      const interval = setInterval(() => fetchMessages(selectedSession), 3000);
      return () => clearInterval(interval);
    }
  }, [selectedSession, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSelectSession = (sessionId: string) => {
    setSelectedSession(sessionId);
    setMessages([]);
    setInputText("");
  };

  const handleSend = async (content: string) => {
    if (!selectedSession || !content.trim()) return;
    setSendLoading(true);
    try {
      await fetch("/api/admin/support-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: selectedSession,
          role: "admin",
          content: content.trim(),
        }),
      });
      setInputText("");
      fetchMessages(selectedSession);
      fetchSessions();
    } catch (err) {
      console.error("Send message error:", err);
    } finally {
      setSendLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSend(inputText);
  };

  const handleQuickReply = (content: string) => {
    handleSend(content);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const activeSession = sessions.find((s) => s.sessionId === selectedSession);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--mq-text)" }}>
          Поддержка
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--mq-text-muted)" }}>
          Чат поддержки пользователей
        </p>
      </div>

      {/* 2-column layout */}
      <div
        className="rounded-2xl overflow-hidden flex flex-col lg:flex-row"
        style={{
          backgroundColor: "var(--mq-card)",
          border: "1px solid var(--mq-border)",
          height: "calc(100vh - 220px)",
          minHeight: "500px",
        }}
      >
        {/* Left: Session List */}
        <div
          className="w-full lg:w-80 flex-shrink-0 flex flex-col"
          style={{ borderRight: "1px solid var(--mq-border)" }}
        >
          <div
            className="px-4 py-3 flex-shrink-0"
            style={{ borderBottom: "1px solid var(--mq-border)" }}
          >
            <h3 className="text-sm font-semibold" style={{ color: "var(--mq-text)" }}>
              Сессии ({sessions.length})
            </h3>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--mq-accent)" }} />
              </div>
            ) : sessions.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <MessageCircle className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--mq-text-muted)" }} />
                <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
                  Нет активных сессий
                </p>
              </div>
            ) : (
              sessions.map((session) => (
                <button
                  key={session.sessionId}
                  onClick={() => handleSelectSession(session.sessionId)}
                  className="w-full text-left px-4 py-3 transition-colors"
                  style={{
                    backgroundColor:
                      selectedSession === session.sessionId
                        ? "rgba(224,49,49,0.08)"
                        : "transparent",
                    borderBottom: "1px solid var(--mq-border)",
                  }}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span
                      className="text-sm font-medium truncate"
                      style={{
                        color:
                          selectedSession === session.sessionId
                            ? "var(--mq-accent)"
                            : "var(--mq-text)",
                      }}
                    >
                      {session.userName || session.sessionId.substring(0, 8)}
                    </span>
                    <span
                      className="text-[10px] flex-shrink-0 px-1.5 py-0.5 rounded-full"
                      style={{
                        backgroundColor:
                          session.status === "open"
                            ? "rgba(74,222,128,0.15)"
                            : "rgba(136,136,136,0.15)",
                        color: session.status === "open" ? "#4ade80" : "var(--mq-text-muted)",
                      }}
                    >
                      {session.status === "open" ? "Открыт" : "Закрыт"}
                    </span>
                  </div>
                  <p
                    className="text-xs truncate mb-1"
                    style={{ color: "var(--mq-text-muted)" }}
                  >
                    {session.lastMessage || "Нет сообщений"}
                  </p>
                  <div className="flex items-center gap-2 text-[10px]" style={{ color: "var(--mq-text-muted)" }}>
                    <span>{formatDate(session.updatedAt)}</span>
                    <span>•</span>
                    <span>{session.messageCount} сообщ.</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right: Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedSession ? (
            <>
              {/* Chat Header */}
              <div
                className="px-4 py-3 flex items-center gap-3 flex-shrink-0"
                style={{ borderBottom: "1px solid var(--mq-border)" }}
              >
                <MessageCircle className="w-5 h-5 flex-shrink-0" style={{ color: "var(--mq-accent)" }} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate" style={{ color: "var(--mq-text)" }}>
                    {activeSession?.userName || selectedSession.substring(0, 8)}
                  </p>
                  <p className="text-[10px]" style={{ color: "var(--mq-text-muted)" }}>
                    ID: {selectedSession}
                  </p>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messagesLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--mq-accent)" }} />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                      Нет сообщений
                    </p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isUser = msg.role === "user";
                    const isAdmin = msg.role === "admin";
                    const isBot = msg.role === "bot";

                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isUser ? "justify-start" : "justify-end"}`}
                      >
                        <div className="flex gap-2 max-w-[75%]">
                          {!isUser && (
                            <div
                              className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-1"
                              style={{
                                backgroundColor: isAdmin
                                  ? "rgba(224,49,49,0.15)"
                                  : "rgba(6,182,212,0.15)",
                              }}
                            >
                              {isAdmin ? (
                                <UserCircle className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
                              ) : (
                                <Bot className="w-4 h-4" style={{ color: "#06b6d4" }} />
                              )}
                            </div>
                          )}
                          <div>
                            <div
                              className="rounded-2xl px-4 py-2.5 text-sm"
                              style={{
                                backgroundColor: isUser
                                  ? "var(--mq-input-bg)"
                                  : isAdmin
                                  ? "rgba(224,49,49,0.12)"
                                  : "rgba(6,182,212,0.12)",
                                color: "var(--mq-text)",
                                border: `1px solid ${isUser ? "var(--mq-border)" : "transparent"}`,
                              }}
                            >
                              {msg.content}
                            </div>
                            <p
                              className="text-[10px] mt-1"
                              style={{ color: "var(--mq-text-muted)" }}
                            >
                              {formatDate(msg.createdAt)}
                            </p>
                          </div>
                          {isUser && (
                            <div
                              className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-1"
                              style={{ backgroundColor: "rgba(139,92,246,0.15)" }}
                            >
                              <UserCircle className="w-4 h-4" style={{ color: "#8b5cf6" }} />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Replies */}
              <div
                className="px-4 py-2 flex items-center gap-2 flex-shrink-0"
                style={{ borderTop: "1px solid var(--mq-border)" }}
              >
                {quickReplies.map((qr) => (
                  <button
                    key={qr.label}
                    onClick={() => handleQuickReply(qr.content)}
                    disabled={sendLoading}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors flex-shrink-0"
                    style={{
                      backgroundColor: "var(--mq-input-bg)",
                      border: "1px solid var(--mq-border)",
                      color: "var(--mq-text-muted)",
                    }}
                  >
                    <qr.icon className="w-3 h-3" />
                    <span className="hidden xl:inline">{qr.label}</span>
                  </button>
                ))}
              </div>

              {/* Input Area */}
              <form
                onSubmit={handleSubmit}
                className="px-4 py-3 flex items-center gap-2 flex-shrink-0"
                style={{ borderTop: "1px solid var(--mq-border)" }}
              >
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Написать ответ..."
                  disabled={sendLoading}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm"
                  style={{
                    backgroundColor: "var(--mq-input-bg)",
                    border: "1px solid var(--mq-border)",
                    color: "var(--mq-text)",
                  }}
                />
                <button
                  type="submit"
                  disabled={sendLoading || !inputText.trim()}
                  className="p-2.5 rounded-xl flex-shrink-0"
                  style={{
                    backgroundColor: inputText.trim() ? "var(--mq-accent)" : "var(--mq-border)",
                    color: "#fff",
                    opacity: !inputText.trim() ? 0.5 : 1,
                  }}
                >
                  {sendLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </button>
              </form>
            </>
          ) : (
            /* Empty State */
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageCircle className="w-12 h-12 mx-auto mb-4" style={{ color: "var(--mq-text-muted)" }} />
                <p className="text-lg font-medium mb-1" style={{ color: "var(--mq-text)" }}>
                  Выберите сессию
                </p>
                <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                  Выберите сессию чата из списка слева
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
