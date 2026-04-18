"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Mail,
  Plus,
  Send,
  Eye,
  Trash2,
  Loader2,
  X,
  Users,
  UserCheck,
  Clock,
  AlertCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

interface Campaign {
  id: string;
  name: string;
  subject: string;
  htmlBody: string;
  segment: string;
  status: string;
  sentCount: number;
  openCount: number;
  clickCount: number;
  createdAt: string;
  sentAt: string | null;
}

const segmentLabels: Record<string, string> = {
  all: "Все",
  verified: "Верифицированные",
  active_7d: "Активные 7д",
  inactive: "Неактивные",
};

const segmentColors: Record<string, string> = {
  all: "#8b5cf6",
  verified: "#4ade80",
  active_7d: "#06b6d4",
  inactive: "#f97316",
};

const statusLabels: Record<string, string> = {
  draft: "Черновик",
  sent: "Отправлено",
};

const statusColors: Record<string, string> = {
  draft: "var(--mq-text-muted)",
  sent: "#4ade80",
};

export default function AdminCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [viewHtml, setViewHtml] = useState<Campaign | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Campaign | null>(null);

  // Editor form
  const [formName, setFormName] = useState("");
  const [formSubject, setFormSubject] = useState("");
  const [formHtml, setFormHtml] = useState("");
  const [formSegment, setFormSegment] = useState("all");

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/campaigns");
      const data = await res.json();
      if (data.campaigns) setCampaigns(data.campaigns);
    } catch (err) {
      console.error("Failed to fetch campaigns:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  const handleCreate = async () => {
    if (!formName || !formSubject) return;
    setActionLoading("create");
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          subject: formSubject,
          htmlBody: formHtml,
          segment: formSegment,
        }),
      });
      const data = await res.json();
      if (data.campaign) {
        setShowEditor(false);
        setFormName("");
        setFormSubject("");
        setFormHtml("");
        setFormSegment("all");
        fetchCampaigns();
      }
    } catch (err) {
      console.error("Create campaign error:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSend = async (campaign: Campaign) => {
    setActionLoading(campaign.id);
    try {
      const sentCount = Math.floor(Math.random() * 500) + 100;
      const openCount = Math.floor(sentCount * (Math.random() * 0.4 + 0.1));
      const clickCount = Math.floor(openCount * (Math.random() * 0.3 + 0.05));
      await fetch("/api/admin/campaigns", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: campaign.id,
          status: "sent",
          sentCount,
          openCount,
          clickCount,
        }),
      });
      fetchCampaigns();
    } catch (err) {
      console.error("Send campaign error:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (campaign: Campaign) => {
    setActionLoading(campaign.id);
    try {
      await fetch("/api/admin/campaigns", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: campaign.id }),
      });
      setDeleteConfirm(null);
      fetchCampaigns();
    } catch (err) {
      console.error("Delete campaign error:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getOpenRate = (c: Campaign) => (c.sentCount > 0 ? (c.openCount / c.sentCount) * 100 : 0);
  const getClickRate = (c: Campaign) => (c.sentCount > 0 ? (c.clickCount / c.sentCount) * 100 : 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--mq-text)" }}>
            Рассылки и уведомления
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--mq-text-muted)" }}>
            Управление email-кампаниями и рассылками
          </p>
        </div>
        <button
          onClick={() => setShowEditor(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
          style={{
            backgroundColor: "var(--mq-accent)",
            color: "#fff",
          }}
        >
          <Plus className="w-4 h-4" />
          Новая кампания
        </button>
      </div>

      {/* Campaigns Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--mq-accent)" }} />
        </div>
      ) : campaigns.length === 0 ? (
        <div
          className="rounded-2xl p-12 text-center"
          style={{
            backgroundColor: "var(--mq-card)",
            border: "1px solid var(--mq-border)",
          }}
        >
          <Mail className="w-12 h-12 mx-auto mb-4" style={{ color: "var(--mq-text-muted)" }} />
          <p className="text-lg font-medium mb-1" style={{ color: "var(--mq-text)" }}>
            Нет кампаний
          </p>
          <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
            Создайте первую email-кампанию
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {campaigns.map((campaign) => (
            <div
              key={campaign.id}
              className="rounded-2xl p-5 flex flex-col gap-4"
              style={{
                backgroundColor: "var(--mq-card)",
                border: "1px solid var(--mq-border)",
              }}
            >
              {/* Card Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3
                    className="font-semibold text-sm truncate"
                    style={{ color: "var(--mq-text)" }}
                  >
                    {campaign.name}
                  </h3>
                  <p
                    className="text-xs mt-0.5 truncate"
                    style={{ color: "var(--mq-text-muted)" }}
                  >
                    {campaign.subject}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Badge
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0"
                    style={{
                      backgroundColor: `${segmentColors[campaign.segment]}20`,
                      color: segmentColors[campaign.segment],
                    }}
                  >
                    {segmentLabels[campaign.segment] || campaign.segment}
                  </Badge>
                  <Badge
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0"
                    style={{
                      backgroundColor:
                        campaign.status === "sent"
                          ? "rgba(74,222,128,0.15)"
                          : "rgba(136,136,136,0.15)",
                      color: statusColors[campaign.status],
                    }}
                  >
                    {statusLabels[campaign.status]}
                  </Badge>
                </div>
              </div>

              {/* Stats */}
              {campaign.status === "sent" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs" style={{ color: "var(--mq-text-muted)" }}>
                    <span className="flex items-center gap-1"><Send className="w-3 h-3" /> Отправлено</span>
                    <span style={{ color: "var(--mq-text)" }}>{campaign.sentCount}</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs" style={{ color: "var(--mq-text-muted)" }}>
                      <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> Открытия</span>
                      <span style={{ color: "var(--mq-text)" }}>
                        {campaign.openCount} ({getOpenRate(campaign).toFixed(1)}%)
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--mq-input-bg)" }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(getOpenRate(campaign), 100)}%`,
                          backgroundColor: "#06b6d4",
                        }}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs" style={{ color: "var(--mq-text-muted)" }}>
                      <span className="flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Клики</span>
                      <span style={{ color: "var(--mq-text)" }}>
                        {campaign.clickCount} ({getClickRate(campaign).toFixed(1)}%)
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--mq-input-bg)" }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(getClickRate(campaign), 100)}%`,
                          backgroundColor: "#8b5cf6",
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between pt-1" style={{ borderTop: "1px solid var(--mq-border)" }}>
                <span className="text-[10px]" style={{ color: "var(--mq-text-muted)" }}>
                  {formatDate(campaign.createdAt)}
                </span>
                <div className="flex items-center gap-1">
                  {campaign.status === "draft" && (
                    <button
                      onClick={() => handleSend(campaign)}
                      disabled={actionLoading === campaign.id}
                      className="p-1.5 rounded-lg hover:opacity-80 transition-opacity"
                      style={{ color: "#4ade80" }}
                      title="Отправить"
                    >
                      {actionLoading === campaign.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                  {campaign.htmlBody && (
                    <button
                      onClick={() => setViewHtml(campaign)}
                      className="p-1.5 rounded-lg hover:opacity-80 transition-opacity"
                      style={{ color: "var(--mq-text-muted)" }}
                      title="Просмотр HTML"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => setDeleteConfirm(campaign)}
                    disabled={actionLoading === campaign.id}
                    className="p-1.5 rounded-lg hover:opacity-80 transition-opacity"
                    style={{ color: "#ef4444" }}
                    title="Удалить"
                  >
                    {actionLoading === campaign.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Campaign Dialog */}
      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent
          className="max-w-2xl"
          style={{
            backgroundColor: "var(--mq-card)",
            border: "1px solid var(--mq-border)",
          }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: "var(--mq-text)" }}>
              Новая кампания
            </DialogTitle>
            <DialogDescription style={{ color: "var(--mq-text-muted)" }}>
              Заполните данные для email-кампании
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--mq-text-muted)" }}>
                Название кампании
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Например: Обновление v2.0"
                className="w-full px-3 py-2.5 rounded-xl text-sm"
                style={{
                  backgroundColor: "var(--mq-input-bg)",
                  border: "1px solid var(--mq-border)",
                  color: "var(--mq-text)",
                }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--mq-text-muted)" }}>
                Тема письма
              </label>
              <input
                type="text"
                value={formSubject}
                onChange={(e) => setFormSubject(e.target.value)}
                placeholder="Тема email-рассылки"
                className="w-full px-3 py-2.5 rounded-xl text-sm"
                style={{
                  backgroundColor: "var(--mq-input-bg)",
                  border: "1px solid var(--mq-border)",
                  color: "var(--mq-text)",
                }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--mq-text-muted)" }}>
                HTML-тело письма
              </label>
              <textarea
                value={formHtml}
                onChange={(e) => setFormHtml(e.target.value)}
                placeholder="<h1>Заголовок</h1><p>Текст письма...</p>"
                rows={6}
                className="w-full px-3 py-2.5 rounded-xl text-sm font-mono resize-none"
                style={{
                  backgroundColor: "var(--mq-input-bg)",
                  border: "1px solid var(--mq-border)",
                  color: "var(--mq-text)",
                }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-2" style={{ color: "var(--mq-text-muted)" }}>
                Сегмент аудитории
              </label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(segmentLabels).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setFormSegment(key)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors"
                    style={{
                      backgroundColor:
                        formSegment === key
                          ? `${segmentColors[key]}20`
                          : "var(--mq-input-bg)",
                      border: `1px solid ${
                        formSegment === key
                          ? `${segmentColors[key]}40`
                          : "var(--mq-border)"
                      }`,
                      color: formSegment === key ? segmentColors[key] : "var(--mq-text-muted)",
                    }}
                  >
                    {key === "all" && <Users className="w-3 h-3" />}
                    {key === "verified" && <UserCheck className="w-3 h-3" />}
                    {key === "active_7d" && <Clock className="w-3 h-3" />}
                    {key === "inactive" && <AlertCircle className="w-3 h-3" />}
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <button
              onClick={() => setShowEditor(false)}
              className="px-4 py-2 rounded-xl text-sm"
              style={{
                backgroundColor: "transparent",
                border: "1px solid var(--mq-border)",
                color: "var(--mq-text-muted)",
              }}
            >
              Отмена
            </button>
            <button
              onClick={handleCreate}
              disabled={actionLoading === "create" || !formName || !formSubject}
              className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2"
              style={{
                backgroundColor: "var(--mq-accent)",
                color: "#fff",
                opacity: !formName || !formSubject ? 0.5 : 1,
              }}
            >
              {actionLoading === "create" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Создать
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View HTML Dialog */}
      <Dialog open={!!viewHtml} onOpenChange={() => setViewHtml(null)}>
        <DialogContent
          className="max-w-3xl"
          style={{
            backgroundColor: "var(--mq-card)",
            border: "1px solid var(--mq-border)",
          }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: "var(--mq-text)" }}>
              {viewHtml?.name}
            </DialogTitle>
            <DialogDescription style={{ color: "var(--mq-text-muted)" }}>
              {viewHtml?.subject}
            </DialogDescription>
          </DialogHeader>
          <div
            className="rounded-xl p-4 text-sm font-mono overflow-auto max-h-[400px]"
            style={{
              backgroundColor: "var(--mq-input-bg)",
              border: "1px solid var(--mq-border)",
              color: "var(--mq-text)",
            }}
          >
            <pre className="whitespace-pre-wrap break-words">{viewHtml?.htmlBody || "Пустое тело письма"}</pre>
          </div>
          <DialogFooter>
            <button
              onClick={() => setViewHtml(null)}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{
                backgroundColor: "var(--mq-accent)",
                color: "#fff",
              }}
            >
              Закрыть
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent
          style={{
            backgroundColor: "var(--mq-card)",
            border: "1px solid var(--mq-border)",
          }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: "var(--mq-text)" }}>
              Удалить кампанию?
            </DialogTitle>
            <DialogDescription style={{ color: "var(--mq-text-muted)" }}>
              Кампания &quot;{deleteConfirm?.name}&quot; будет удалена безвозвратно.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <button
              onClick={() => setDeleteConfirm(null)}
              className="px-4 py-2 rounded-xl text-sm"
              style={{
                backgroundColor: "transparent",
                border: "1px solid var(--mq-border)",
                color: "var(--mq-text-muted)",
              }}
            >
              Отмена
            </button>
            <button
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              disabled={actionLoading === deleteConfirm?.id}
              className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2"
              style={{
                backgroundColor: "rgba(239,68,68,0.2)",
                color: "#ef4444",
              }}
            >
              {actionLoading === deleteConfirm?.id ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              Удалить
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
