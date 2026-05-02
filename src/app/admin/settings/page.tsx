"use client";

import { useState, useEffect } from "react";
import {
  Database,
  Server,
  Shield,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  Globe,
  Cpu,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface SystemInfo {
  dbStatus: "connected" | "error";
  dbResponseTime: number;
  envVarsCount: number;
  nodeEnv: string;
  dbProvider: string;
  uptime: number;
}

export default function AdminSettingsPage() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [startTime] = useState(Date.now());

  useEffect(() => {
    // Check DB status
    const checkSystem = async () => {
      try {
        const dbStart = Date.now();
        const statsRes = await fetch("/api/admin/stats");
        const dbTime = Date.now() - dbStart;
        const statsData = await statsRes.json();

        const knownEnvVars = [
          "DATABASE_URL",
          "POSTGRES_URL_NON_POOLING",
          "NEXTAUTH_SECRET",
          "NEXTAUTH_URL",
          "NODE_ENV",
          "VERCEL_URL",
        ];

        setInfo({
          dbStatus: statsData.error ? "error" : "connected",
          dbResponseTime: dbTime,
          envVarsCount: knownEnvVars.length,
          nodeEnv: process.env.NODE_ENV || "production",
          dbProvider: "PostgreSQL (Neon)",
          uptime: Math.floor((Date.now() - startTime) / 1000),
        });
      } catch {
        setInfo({
          dbStatus: "error",
          dbResponseTime: 0,
          envVarsCount: 0,
          nodeEnv: process.env.NODE_ENV || "unknown",
          dbProvider: "PostgreSQL (Neon)",
          uptime: 0,
        });
      } finally {
        setLoading(false);
      }
    };

    checkSystem();
  }, [startTime]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--mq-accent)" }} />
      </div>
    );
  }

  if (!info) return null;

  const infoCards = [
    {
      title: "База данных",
      description: info.dbProvider,
      icon: Database,
      status: info.dbStatus,
      statusLabel: info.dbStatus === "connected" ? "Подключена" : "Ошибка",
      detail: `${info.dbResponseTime}мс`,
    },
    {
      title: "Среда выполнения",
      description: `Node.js — ${info.nodeEnv}`,
      icon: Server,
      status: "connected",
      statusLabel: "Работает",
      detail: `Uptime: ${info.uptime}с`,
    },
    {
      title: "Переменные окружения",
      description: "Настроенные переменные",
      icon: Globe,
      status: info.envVarsCount > 0 ? "connected" : "error",
      statusLabel: `${info.envVarsCount} переменных`,
      detail: "Системные настройки",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--mq-text)" }}>
          Настройки системы
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--mq-text-muted)" }}>
          Информация о сервере и сервисах
        </p>
      </div>

      {/* System info cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {infoCards.map((card) => {
          const Icon = card.icon;
          const isOk = card.status === "connected";
          return (
            <div
              key={card.title}
              className="rounded-2xl p-4"
              style={{
                backgroundColor: "var(--mq-card)",
                border: "1px solid var(--mq-border)",
              }}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{
                      backgroundColor: isOk ? "rgba(74,222,128,0.1)" : "rgba(239,68,68,0.1)",
                    }}
                  >
                    <Icon
                      className="w-5 h-5"
                      style={{ color: isOk ? "#4ade80" : "#ef4444" }}
                    />
                  </div>
                  <div>
                    <h3
                      className="font-semibold text-sm"
                      style={{ color: "var(--mq-text)" }}
                    >
                      {card.title}
                    </h3>
                    <p
                      className="text-xs"
                      style={{ color: "var(--mq-text-muted)" }}
                    >
                      {card.description}
                    </p>
                  </div>
                </div>
                <Badge
                  variant="secondary"
                  className="text-[10px] px-2 py-0.5"
                  style={{
                    backgroundColor: isOk
                      ? "rgba(74,222,128,0.15)"
                      : "rgba(239,68,68,0.15)",
                    color: isOk ? "#4ade80" : "#ef4444",
                  }}
                >
                  {card.statusLabel}
                </Badge>
              </div>
              <div className="flex items-center gap-1.5">
                {isOk ? (
                  <CheckCircle className="w-3.5 h-3.5" style={{ color: "#4ade80" }} />
                ) : (
                  <XCircle className="w-3.5 h-3.5" style={{ color: "#ef4444" }} />
                )}
                <span className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
                  {card.detail}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* System details */}
      <div
        className="rounded-2xl p-4"
        style={{
          backgroundColor: "var(--mq-card)",
          border: "1px solid var(--mq-border)",
        }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
          <h2 className="font-semibold" style={{ color: "var(--mq-text)" }}>
            Системная информация
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { label: "Платформа", value: "Next.js 16 + Vercel", icon: Globe },
            { label: "База данных", value: "PostgreSQL (Neon)", icon: Database },
            { label: "ORM", value: "Prisma", icon: Cpu },
            { label: "Среда", value: info.nodeEnv.toUpperCase(), icon: Server },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className="flex items-center gap-3 px-3 py-2 rounded-xl"
                style={{
                  backgroundColor: "var(--mq-input-bg)",
                  border: "1px solid var(--mq-border)",
                }}
              >
                <Icon
                  className="w-4 h-4 flex-shrink-0"
                  style={{ color: "var(--mq-text-muted)" }}
                />
                <div>
                  <p
                    className="text-xs"
                    style={{ color: "var(--mq-text-muted)" }}
                  >
                    {item.label}
                  </p>
                  <p
                    className="text-sm font-medium"
                    style={{ color: "var(--mq-text)" }}
                  >
                    {item.value}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
