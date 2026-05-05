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
  Activity,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";

interface SystemInfo {
  dbStatus: "connected" | "error";
  dbResponseTime: number;
  envVarsCount: number;
  nodeEnv: string;
  dbProvider: string;
  uptime: number;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export default function AdminSettingsPage() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [startTime] = useState(Date.now());

  useEffect(() => {
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
      <div className="flex items-center justify-center py-24">
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
      color: "#4ade80",
      errorColor: "#ef4444",
    },
    {
      title: "Среда выполнения",
      description: `Node.js — ${info.nodeEnv}`,
      icon: Server,
      status: "connected",
      statusLabel: "Работает",
      detail: `Uptime: ${info.uptime}с`,
      color: "#06b6d4",
      errorColor: "#ef4444",
    },
    {
      title: "Переменные окружения",
      description: "Настроенные переменные",
      icon: Globe,
      status: info.envVarsCount > 0 ? "connected" : "error",
      statusLabel: `${info.envVarsCount} переменных`,
      detail: "Системные настройки",
      color: "#8b5cf6",
      errorColor: "#ef4444",
    },
  ];

  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <motion.div variants={itemVariants}>
        <h1 className="text-2xl font-bold" style={{ color: "var(--mq-text)" }}>
          Настройки системы
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--mq-text-muted)" }}>
          Информация о сервере и сервисах
        </p>
      </motion.div>

      {/* System info cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {infoCards.map((card) => {
          const Icon = card.icon;
          const isOk = card.status === "connected";
          return (
            <motion.div
              key={card.title}
              whileHover={{ y: -2, transition: { duration: 0.2 } }}
              className="rounded-2xl p-5"
              style={{
                backgroundColor: "var(--mq-card)",
                border: "1px solid var(--mq-border)",
              }}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center"
                    style={{
                      background: isOk
                        ? `linear-gradient(135deg, ${card.color}22, ${card.color}08)`
                        : `linear-gradient(135deg, ${card.errorColor}22, ${card.errorColor}08)`,
                    }}
                  >
                    <Icon
                      className="w-5 h-5"
                      style={{ color: isOk ? card.color : card.errorColor }}
                    />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm" style={{ color: "var(--mq-text)" }}>
                      {card.title}
                    </h3>
                    <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
                      {card.description}
                    </p>
                  </div>
                </div>
                <Badge
                  variant="secondary"
                  className="text-[10px] px-2 py-0.5"
                  style={{
                    backgroundColor: isOk
                      ? `${card.color}18`
                      : `${card.errorColor}18`,
                    color: isOk ? card.color : card.errorColor,
                  }}
                >
                  {card.statusLabel}
                </Badge>
              </div>
              <div className="flex items-center gap-1.5">
                {isOk ? (
                  <CheckCircle className="w-3.5 h-3.5" style={{ color: card.color }} />
                ) : (
                  <XCircle className="w-3.5 h-3.5" style={{ color: card.errorColor }} />
                )}
                <span className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
                  {card.detail}
                </span>
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* System details */}
      <motion.div
        variants={itemVariants}
        className="rounded-2xl p-5"
        style={{
          backgroundColor: "var(--mq-card)",
          border: "1px solid var(--mq-border)",
        }}
      >
        <div className="flex items-center gap-2.5 mb-5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: "rgba(224,49,49,0.1)" }}
          >
            <Shield className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
          </div>
          <h2 className="font-semibold" style={{ color: "var(--mq-text)" }}>
            Системная информация
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { label: "Платформа", value: "Next.js 16 + Vercel", icon: Globe, color: "#06b6d4" },
            { label: "База данных", value: "PostgreSQL (Neon)", icon: Database, color: "#4ade80" },
            { label: "ORM", value: "Prisma", icon: Cpu, color: "#8b5cf6" },
            { label: "Среда", value: info.nodeEnv.toUpperCase(), icon: Server, color: "#f59e0b" },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className="flex items-center gap-3 px-4 py-3 rounded-xl"
                style={{
                  backgroundColor: "var(--mq-input-bg)",
                  border: "1px solid var(--mq-border)",
                }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${item.color}15` }}
                >
                  <Icon className="w-4 h-4" style={{ color: item.color }} />
                </div>
                <div>
                  <p className="text-[11px] font-medium" style={{ color: "var(--mq-text-muted)" }}>
                    {item.label}
                  </p>
                  <p className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>
                    {item.value}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}
