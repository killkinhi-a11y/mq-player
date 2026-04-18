"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Clock,
  Play,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Circle,
} from "lucide-react";

interface CronJob {
  id: string;
  name: string;
  cronExpr: string | null;
  status: string;
  lastRun: string | null;
  nextRun: string | null;
  log: string | null;
  createdAt: string;
}

const statusConfig: Record<string, { label: string; color: string; Icon: typeof Loader2 }> = {
  idle: { label: "Ожидание", color: "var(--mq-text-muted)", Icon: Circle },
  running: { label: "Выполняется", color: "#f59e0b", Icon: Loader2 },
  completed: { label: "Выполнено", color: "#4ade80", Icon: CheckCircle },
  failed: { label: "Ошибка", color: "#ef4444", Icon: XCircle },
};

export default function AdminCronPage() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggerLoading, setTriggerLoading] = useState<string | null>(null);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/cron");
      const data = await res.json();
      if (data.jobs) setJobs(data.jobs);
    } catch (err) {
      console.error("Failed to fetch cron jobs:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    // Auto-refresh every 5 seconds
    intervalRef.current = setInterval(fetchJobs, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchJobs]);

  const toggleExpand = (id: string) => {
    setExpandedJobs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleTrigger = async (jobId: string) => {
    setTriggerLoading(jobId);
    try {
      await fetch("/api/admin/cron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "trigger", jobId }),
      });
      fetchJobs();
    } catch (err) {
      console.error("Trigger job error:", err);
    } finally {
      setTriggerLoading(null);
    }
  };

  const handleCleanup = async () => {
    setCleanupLoading(true);
    try {
      await fetch("/api/admin/cron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cleanup" }),
      });
      fetchJobs();
    } catch (err) {
      console.error("Cleanup error:", err);
    } finally {
      setCleanupLoading(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--mq-text)" }}>
            Задачи и Cron
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--mq-text-muted)" }}>
            Управление фоновыми задачами и автоматическими сценариями
          </p>
        </div>
        <button
          onClick={handleCleanup}
          disabled={cleanupLoading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
          style={{
            backgroundColor: "rgba(239,68,68,0.15)",
            color: "#ef4444",
            border: "1px solid rgba(239,68,68,0.3)",
          }}
        >
          {cleanupLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4" />
          )}
          Очистка неверифицированных аккаунтов (30д)
        </button>
      </div>

      {/* Jobs List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--mq-accent)" }} />
        </div>
      ) : jobs.length === 0 ? (
        <div
          className="rounded-2xl p-12 text-center"
          style={{
            backgroundColor: "var(--mq-card)",
            border: "1px solid var(--mq-border)",
          }}
        >
          <Clock className="w-12 h-12 mx-auto mb-4" style={{ color: "var(--mq-text-muted)" }} />
          <p className="text-lg font-medium mb-1" style={{ color: "var(--mq-text)" }}>
            Нет задач
          </p>
          <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
            Запустите первую фоновую задачу
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => {
            const config = statusConfig[job.status] || statusConfig.idle;
            const StatusIcon = config.Icon;
            const isExpanded = expandedJobs.has(job.id);

            return (
              <div
                key={job.id}
                className="rounded-2xl overflow-hidden"
                style={{
                  backgroundColor: "var(--mq-card)",
                  border: "1px solid var(--mq-border)",
                }}
              >
                {/* Job Row */}
                <div className="flex items-center gap-3 px-4 py-3 sm:px-5 sm:py-4">
                  {/* Status Icon */}
                  <div className="flex-shrink-0">
                    <StatusIcon
                      className={`w-5 h-5 ${job.status === "running" ? "animate-spin" : ""}`}
                      style={{ color: config.color }}
                    />
                  </div>

                  {/* Job Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3
                        className="font-medium text-sm truncate"
                        style={{ color: "var(--mq-text)" }}
                      >
                        {job.name}
                      </h3>
                      <span
                        className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                        style={{
                          backgroundColor: `${config.color}20`,
                          color: config.color,
                        }}
                      >
                        {config.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: "var(--mq-text-muted)" }}>
                      {job.cronExpr && (
                        <span className="font-mono">{job.cronExpr}</span>
                      )}
                      <span>
                        Последний запуск: {formatDate(job.lastRun)}
                      </span>
                      {job.nextRun && (
                        <span className="hidden sm:inline">
                          Следующий: {formatDate(job.nextRun)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {job.status !== "running" && (
                      <button
                        onClick={() => handleTrigger(job.id)}
                        disabled={triggerLoading === job.id}
                        className="p-2 rounded-xl hover:opacity-80 transition-opacity"
                        style={{ color: "var(--mq-accent)" }}
                        title="Запустить"
                      >
                        {triggerLoading === job.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                      </button>
                    )}
                    {job.log && (
                      <button
                        onClick={() => toggleExpand(job.id)}
                        className="p-2 rounded-xl hover:opacity-80 transition-opacity"
                        style={{ color: "var(--mq-text-muted)" }}
                        title="Логи"
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded Log Section */}
                {isExpanded && job.log && (
                  <div
                    className="px-5 py-3"
                    style={{
                      borderTop: "1px solid var(--mq-border)",
                      backgroundColor: "var(--mq-input-bg)",
                    }}
                  >
                    <p className="text-[10px] font-medium mb-2 uppercase tracking-wider" style={{ color: "var(--mq-text-muted)" }}>
                      Лог выполнения
                    </p>
                    <pre
                      className="text-xs font-mono whitespace-pre-wrap break-words max-h-48 overflow-y-auto p-3 rounded-xl"
                      style={{
                        backgroundColor: "var(--mq-card)",
                        border: "1px solid var(--mq-border)",
                        color: "var(--mq-text)",
                      }}
                    >
                      {job.log}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
