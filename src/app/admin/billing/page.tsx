"use client";

import { useState, useEffect, useCallback } from "react";
import {
  DollarSign,
  TrendingUp,
  Receipt,
  RotateCcw,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { motion } from "framer-motion";

interface Transaction {
  id: string;
  userId: string;
  userName: string;
  amount: number;
  currency: string;
  status: string;
  type: string;
  createdAt: string;
}

interface MRRData {
  month: string;
  revenue: number;
}

interface BillingData {
  transactions: Transaction[];
  mrrData: MRRData[];
  currentMRR: number;
  totalRevenue: number;
  totalTransactions: number;
}

const typeLabels: Record<string, string> = {
  subscription: "Подписка",
  one_time: "Разовая",
  promo_period: "Промо",
};

const typeColors: Record<string, string> = {
  subscription: "#8b5cf6",
  one_time: "#06b6d4",
  promo_period: "#f59e0b",
};

const statusLabels: Record<string, string> = {
  completed: "Выполнен",
  pending: "Ожидание",
  failed: "Ошибка",
  refunded: "Возврат",
  promo: "Промо",
};

const statusColors: Record<string, string> = {
  completed: "#4ade80",
  pending: "#f59e0b",
  failed: "#ef4444",
  refunded: "#f97316",
  promo: "#06b6d4",
};

const typeFilters = [
  { value: "", label: "Все типы" },
  { value: "subscription", label: "Подписка" },
  { value: "one_time", label: "Разовая" },
  { value: "promo_period", label: "Промо" },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export default function AdminBillingPage() {
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refundLoading, setRefundLoading] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [refundConfirm, setRefundConfirm] = useState<Transaction | null>(null);

  const fetchBilling = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/billing");
      const json = await res.json();
      if (json.transactions) setData(json);
    } catch (err) {
      console.error("Failed to fetch billing data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBilling();
  }, [fetchBilling]);

  const handleRefund = async (transaction: Transaction) => {
    setRefundLoading(transaction.id);
    try {
      await fetch("/api/admin/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refund", transactionId: transaction.id }),
      });
      setRefundConfirm(null);
      fetchBilling();
    } catch (err) {
      console.error("Refund error:", err);
    } finally {
      setRefundLoading(null);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split("-");
    const d = new Date(Number(year), Number(month) - 1, 1);
    return d.toLocaleDateString("ru-RU", { month: "short", year: "2-digit" });
  };

  const filteredTransactions = data?.transactions.filter(
    (t) => !typeFilter || t.type === typeFilter
  ) || [];

  const maxMRR = data?.mrrData.length
    ? Math.max(...data.mrrData.map((m) => m.revenue), 1)
    : 1;

  const rowHoverIn = (e: React.MouseEvent) => {
    (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.02)";
  };
  const rowHoverOut = (e: React.MouseEvent) => {
    (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
  };

  const statCards = [
    {
      label: "Текущий MRR",
      value: `$${data?.currentMRR.toFixed(2) || "0.00"}`,
      icon: TrendingUp,
      color: "#8b5cf6",
      bg: "rgba(139,92,246,0.12)",
    },
    {
      label: "Общий доход",
      value: `$${data?.totalRevenue.toFixed(2) || "0.00"}`,
      icon: DollarSign,
      color: "#4ade80",
      bg: "rgba(74,222,128,0.12)",
    },
    {
      label: "Транзакций",
      value: data?.totalTransactions || 0,
      icon: Receipt,
      color: "#06b6d4",
      bg: "rgba(6,182,212,0.12)",
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
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--mq-text)" }}>
            Финансы
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--mq-text-muted)" }}>
            Обзор транзакций и доходов
          </p>
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors"
          style={{
            backgroundColor: showFilters ? "rgba(224,49,49,0.1)" : "var(--mq-card)",
            border: "1px solid var(--mq-border)",
            color: showFilters ? "var(--mq-accent)" : "var(--mq-text-muted)",
          }}
        >
          <ChevronDown className="w-4 h-4" />
          Фильтр
        </button>
      </motion.div>

      {/* Filter */}
      {showFilters && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-4"
          style={{
            backgroundColor: "var(--mq-card)",
            border: "1px solid var(--mq-border)",
          }}
        >
          <p className="text-xs font-medium mb-3" style={{ color: "var(--mq-text-muted)" }}>
            Фильтр по типу
          </p>
          <div className="flex flex-wrap gap-2">
            {typeFilters.map((f) => (
              <button
                key={f.value}
                onClick={() => setTypeFilter(f.value)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={{
                  backgroundColor:
                    typeFilter === f.value ? "rgba(224,49,49,0.15)" : "var(--mq-input-bg)",
                  border:
                    typeFilter === f.value
                      ? "1px solid rgba(224,49,49,0.3)"
                      : "1px solid var(--mq-border)",
                  color:
                    typeFilter === f.value ? "var(--mq-accent)" : "var(--mq-text-muted)",
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--mq-accent)" }} />
        </div>
      ) : data ? (
        <>
          {/* Stat Cards */}
          <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {statCards.map((card) => {
              const Icon = card.icon;
              return (
                <motion.div
                  key={card.label}
                  whileHover={{ y: -2, transition: { duration: 0.2 } }}
                  className="rounded-2xl p-5"
                  style={{
                    backgroundColor: "var(--mq-card)",
                    border: "1px solid var(--mq-border)",
                  }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: card.bg }}
                    >
                      <Icon className="w-5 h-5" style={{ color: card.color }} />
                    </div>
                    <span className="text-xs font-medium" style={{ color: "var(--mq-text-muted)" }}>
                      {card.label}
                    </span>
                  </div>
                  <p className="text-2xl font-bold" style={{ color: "var(--mq-text)" }}>
                    {card.value}
                  </p>
                </motion.div>
              );
            })}
          </motion.div>

          {/* MRR Chart */}
          {data.mrrData.length > 0 && (
            <motion.div
              variants={itemVariants}
              className="rounded-2xl p-5"
              style={{
                backgroundColor: "var(--mq-card)",
                border: "1px solid var(--mq-border)",
              }}
            >
              <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--mq-text)" }}>
                MRR по месяцам
              </h3>
              <div className="flex items-end gap-2 h-40">
                {data.mrrData.map((m) => (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] font-medium" style={{ color: "var(--mq-text)" }}>
                      ${m.revenue.toFixed(0)}
                    </span>
                    <div
                      className="w-full rounded-t-lg transition-all"
                      style={{
                        height: `${(m.revenue / maxMRR) * 100}%`,
                        minHeight: "4px",
                        background: "linear-gradient(180deg, var(--mq-accent), rgba(224,49,49,0.5))",
                      }}
                    />
                    <span className="text-[10px]" style={{ color: "var(--mq-text-muted)" }}>
                      {formatMonth(m.month)}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Transactions Table */}
          <motion.div
            variants={itemVariants}
            className="rounded-2xl overflow-hidden"
            style={{
              backgroundColor: "var(--mq-card)",
              border: "1px solid var(--mq-border)",
            }}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--mq-border)" }}>
                    <th className="text-left px-5 py-3 font-medium text-[11px] uppercase tracking-wider" style={{ color: "var(--mq-text-muted)" }}>
                      Пользователь
                    </th>
                    <th className="text-left px-5 py-3 font-medium text-[11px] uppercase tracking-wider" style={{ color: "var(--mq-text-muted)" }}>
                      Сумма
                    </th>
                    <th className="text-left px-5 py-3 font-medium text-[11px] uppercase tracking-wider hidden sm:table-cell" style={{ color: "var(--mq-text-muted)" }}>
                      Тип
                    </th>
                    <th className="text-left px-5 py-3 font-medium text-[11px] uppercase tracking-wider hidden sm:table-cell" style={{ color: "var(--mq-text-muted)" }}>
                      Статус
                    </th>
                    <th className="text-left px-5 py-3 font-medium text-[11px] uppercase tracking-wider hidden md:table-cell" style={{ color: "var(--mq-text-muted)" }}>
                      Дата
                    </th>
                    <th className="text-right px-5 py-3 font-medium text-[11px] uppercase tracking-wider" style={{ color: "var(--mq-text-muted)" }}>
                      Действия
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((t) => (
                    <tr
                      key={t.id}
                      className="transition-colors"
                      style={{ borderBottom: "1px solid var(--mq-border)" }}
                      onMouseEnter={rowHoverIn}
                      onMouseLeave={rowHoverOut}
                    >
                      <td className="px-5 py-3.5">
                        <div>
                          <p className="font-medium" style={{ color: "var(--mq-text)" }}>
                            {t.userName || "—"}
                          </p>
                          <p className="text-xs truncate max-w-[150px]" style={{ color: "var(--mq-text-muted)" }}>
                            {t.userId.substring(0, 12)}...
                          </p>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 font-medium" style={{ color: "var(--mq-text)" }}>
                        ${t.amount.toFixed(2)}
                      </td>
                      <td className="px-5 py-3.5 hidden sm:table-cell">
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0"
                          style={{
                            backgroundColor: `${typeColors[t.type] || "var(--mq-text-muted)"}18`,
                            color: typeColors[t.type] || "var(--mq-text-muted)",
                          }}
                        >
                          {typeLabels[t.type] || t.type}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 hidden sm:table-cell">
                        <div className="flex items-center gap-1.5">
                          <div
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: statusColors[t.status] || "var(--mq-text-muted)" }}
                          />
                          <span className="text-[11px] font-medium" style={{ color: statusColors[t.status] || "var(--mq-text-muted)" }}>
                            {statusLabels[t.status] || t.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-xs hidden md:table-cell" style={{ color: "var(--mq-text-muted)" }}>
                        {formatDate(t.createdAt)}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {t.status === "completed" && t.type !== "promo_period" && (
                          <button
                            onClick={() => setRefundConfirm(t)}
                            className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                            style={{ color: "#f97316" }}
                            title="Возврат"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredTransactions.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center" style={{ color: "var(--mq-text-muted)" }}>
                        <Receipt className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--mq-text-muted)", opacity: 0.3 }} />
                        Нет транзакций
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        </>
      ) : null}

      {/* Refund Confirm Dialog */}
      <Dialog open={!!refundConfirm} onOpenChange={() => setRefundConfirm(null)}>
        <DialogContent
          style={{
            backgroundColor: "var(--mq-card)",
            border: "1px solid var(--mq-border)",
          }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: "var(--mq-text)" }}>
              Оформить возврат?
            </DialogTitle>
            <DialogDescription style={{ color: "var(--mq-text-muted)" }}>
              {refundConfirm?.userName} — ${refundConfirm?.amount.toFixed(2)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <button
              onClick={() => setRefundConfirm(null)}
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
              onClick={() => refundConfirm && handleRefund(refundConfirm)}
              disabled={refundLoading === refundConfirm?.id}
              className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2"
              style={{
                backgroundColor: "rgba(249,115,22,0.2)",
                color: "#f97316",
              }}
            >
              {refundLoading === refundConfirm?.id ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4" />
              )}
              Возврат
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
