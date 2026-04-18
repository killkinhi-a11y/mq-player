"use client";

import { useState, useEffect, useCallback } from "react";
import {
  DollarSign,
  TrendingUp,
  Receipt,
  RotateCcw,
  Loader2,
  ChevronDown,
  Gift,
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
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
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
          style={{
            backgroundColor: showFilters ? "rgba(224,49,49,0.1)" : "var(--mq-card)",
            border: "1px solid var(--mq-border)",
            color: showFilters ? "var(--mq-accent)" : "var(--mq-text-muted)",
          }}
        >
          <ChevronDown className="w-4 h-4" />
          Фильтр
        </button>
      </div>

      {/* Filter */}
      {showFilters && (
        <div
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
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--mq-accent)" }} />
        </div>
      ) : data ? (
        <>
          {/* Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div
              className="rounded-2xl p-5"
              style={{
                backgroundColor: "var(--mq-card)",
                border: "1px solid var(--mq-border)",
              }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: "rgba(139,92,246,0.15)" }}
                >
                  <TrendingUp className="w-5 h-5" style={{ color: "#8b5cf6" }} />
                </div>
                <span className="text-xs font-medium" style={{ color: "var(--mq-text-muted)" }}>
                  Текущий MRR
                </span>
              </div>
              <p className="text-2xl font-bold" style={{ color: "var(--mq-text)" }}>
                ${data.currentMRR.toFixed(2)}
              </p>
            </div>

            <div
              className="rounded-2xl p-5"
              style={{
                backgroundColor: "var(--mq-card)",
                border: "1px solid var(--mq-border)",
              }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: "rgba(74,222,128,0.15)" }}
                >
                  <DollarSign className="w-5 h-5" style={{ color: "#4ade80" }} />
                </div>
                <span className="text-xs font-medium" style={{ color: "var(--mq-text-muted)" }}>
                  Общий доход
                </span>
              </div>
              <p className="text-2xl font-bold" style={{ color: "var(--mq-text)" }}>
                ${data.totalRevenue.toFixed(2)}
              </p>
            </div>

            <div
              className="rounded-2xl p-5"
              style={{
                backgroundColor: "var(--mq-card)",
                border: "1px solid var(--mq-border)",
              }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: "rgba(6,182,212,0.15)" }}
                >
                  <Receipt className="w-5 h-5" style={{ color: "#06b6d4" }} />
                </div>
                <span className="text-xs font-medium" style={{ color: "var(--mq-text-muted)" }}>
                  Транзакций
                </span>
              </div>
              <p className="text-2xl font-bold" style={{ color: "var(--mq-text)" }}>
                {data.totalTransactions}
              </p>
            </div>
          </div>

          {/* MRR Chart */}
          {data.mrrData.length > 0 && (
            <div
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
                        backgroundColor: "var(--mq-accent)",
                      }}
                    />
                    <span className="text-[10px]" style={{ color: "var(--mq-text-muted)" }}>
                      {formatMonth(m.month)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Transactions Table */}
          <div
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
                    <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider" style={{ color: "var(--mq-text-muted)" }}>
                      Пользователь
                    </th>
                    <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider" style={{ color: "var(--mq-text-muted)" }}>
                      Сумма
                    </th>
                    <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider hidden sm:table-cell" style={{ color: "var(--mq-text-muted)" }}>
                      Тип
                    </th>
                    <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider hidden sm:table-cell" style={{ color: "var(--mq-text-muted)" }}>
                      Статус
                    </th>
                    <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider hidden md:table-cell" style={{ color: "var(--mq-text-muted)" }}>
                      Дата
                    </th>
                    <th className="text-right px-4 py-2.5 font-medium text-xs uppercase tracking-wider" style={{ color: "var(--mq-text-muted)" }}>
                      Действия
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((t) => (
                    <tr key={t.id} style={{ borderBottom: "1px solid var(--mq-border)" }}>
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium" style={{ color: "var(--mq-text)" }}>
                            {t.userName || "—"}
                          </p>
                          <p className="text-xs truncate max-w-[150px]" style={{ color: "var(--mq-text-muted)" }}>
                            {t.userId.substring(0, 12)}...
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium" style={{ color: "var(--mq-text)" }}>
                        ${t.amount.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0"
                          style={{
                            backgroundColor: `${typeColors[t.type] || "var(--mq-text-muted)"}20`,
                            color: typeColors[t.type] || "var(--mq-text-muted)",
                          }}
                        >
                          {typeLabels[t.type] || t.type}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0"
                          style={{
                            backgroundColor: `${statusColors[t.status] || "var(--mq-text-muted)"}20`,
                            color: statusColors[t.status] || "var(--mq-text-muted)",
                          }}
                        >
                          {statusLabels[t.status] || t.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs hidden md:table-cell" style={{ color: "var(--mq-text-muted)" }}>
                        {formatDate(t.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {t.status === "completed" && t.type !== "promo_period" && (
                          <button
                            onClick={() => setRefundConfirm(t)}
                            className="p-1.5 rounded-lg hover:opacity-80 transition-opacity"
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
                      <td colSpan={6} className="px-4 py-8 text-center" style={{ color: "var(--mq-text-muted)" }}>
                        Нет транзакций
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
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
    </div>
  );
}
