"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ToggleLeft as ToggleLeftIcon,
  Plus,
  Loader2,
  X,
} from "lucide-react";

interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  description: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function AdminFlagsPage() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggleLoading, setToggleLoading] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Create form
  const [formKey, setFormKey] = useState("");
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");

  const fetchFlags = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/feature-flags");
      const data = await res.json();
      if (data.flags) setFlags(data.flags);
    } catch (err) {
      console.error("Failed to fetch feature flags:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFlags();
  }, [fetchFlags]);

  const handleToggle = async (flag: FeatureFlag) => {
    setToggleLoading(flag.id);
    try {
      await fetch("/api/admin/feature-flags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: flag.id, enabled: !flag.enabled }),
      });
      fetchFlags();
    } catch (err) {
      console.error("Toggle flag error:", err);
    } finally {
      setToggleLoading(null);
    }
  };

  const handleCreate = async () => {
    if (!formKey || !formName) return;
    setCreateLoading(true);
    setCreateError("");
    try {
      const res = await fetch("/api/admin/feature-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: formKey,
          name: formName,
          description: formDescription || null,
          enabled: false,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setCreateError(data.error);
      } else {
        setShowCreate(false);
        setFormKey("");
        setFormName("");
        setFormDescription("");
        fetchFlags();
      }
    } catch (err) {
      console.error("Create flag error:", err);
      setCreateError("Ошибка создания флага");
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--mq-text)" }}>
            Feature Flags
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--mq-text-muted)" }}>
            Управление экспериментальными функциями и флагами
          </p>
        </div>
        <button
          onClick={() => {
            setShowCreate(true);
            setCreateError("");
          }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
          style={{
            backgroundColor: "var(--mq-accent)",
            color: "#fff",
          }}
        >
          <Plus className="w-4 h-4" />
          Новый флаг
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div
          className="rounded-2xl p-5 space-y-4"
          style={{
            backgroundColor: "var(--mq-card)",
            border: "1px solid var(--mq-border)",
          }}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold" style={{ color: "var(--mq-text)" }}>
              Новый флаг
            </h3>
            <button
              onClick={() => setShowCreate(false)}
              className="p-1 rounded-lg"
              style={{ color: "var(--mq-text-muted)" }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {createError && (
            <p className="text-xs" style={{ color: "#ef4444" }}>
              {createError}
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--mq-text-muted)" }}>
                Ключ
              </label>
              <input
                type="text"
                value={formKey}
                onChange={(e) => setFormKey(e.target.value.replace(/\s/g, "_").toLowerCase())}
                placeholder="my_feature_flag"
                className="w-full px-3 py-2.5 rounded-xl text-sm font-mono"
                style={{
                  backgroundColor: "var(--mq-input-bg)",
                  border: "1px solid var(--mq-border)",
                  color: "var(--mq-text)",
                }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--mq-text-muted)" }}>
                Название
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Моя функция"
                className="w-full px-3 py-2.5 rounded-xl text-sm"
                style={{
                  backgroundColor: "var(--mq-input-bg)",
                  border: "1px solid var(--mq-border)",
                  color: "var(--mq-text)",
                }}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--mq-text-muted)" }}>
              Описание
            </label>
            <input
              type="text"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Описание функции..."
              className="w-full px-3 py-2.5 rounded-xl text-sm"
              style={{
                backgroundColor: "var(--mq-input-bg)",
                border: "1px solid var(--mq-border)",
                color: "var(--mq-text)",
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreate(false)}
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
              disabled={createLoading || !formKey || !formName}
              className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2"
              style={{
                backgroundColor: "var(--mq-accent)",
                color: "#fff",
                opacity: !formKey || !formName ? 0.5 : 1,
              }}
            >
              {createLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Создать
            </button>
          </div>
        </div>
      )}

      {/* Flags List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--mq-accent)" }} />
        </div>
      ) : flags.length === 0 ? (
        <div
          className="rounded-2xl p-12 text-center"
          style={{
            backgroundColor: "var(--mq-card)",
            border: "1px solid var(--mq-border)",
          }}
        >
          <ToggleLeftIcon className="w-12 h-12 mx-auto mb-4" style={{ color: "var(--mq-text-muted)" }} />
          <p className="text-lg font-medium mb-1" style={{ color: "var(--mq-text)" }}>
            Нет флагов
          </p>
          <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
            Создайте первый feature flag
          </p>
        </div>
      ) : (
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            backgroundColor: "var(--mq-card)",
            border: "1px solid var(--mq-border)",
          }}
        >
          {flags.map((flag, idx) => (
            <div
              key={flag.id}
              className="flex items-center gap-4 px-4 sm:px-5 py-4"
              style={{
                borderBottom: idx < flags.length - 1 ? "1px solid var(--mq-border)" : "none",
              }}
            >
              {/* Toggle Switch */}
              <button
                onClick={() => handleToggle(flag)}
                disabled={toggleLoading === flag.id}
                className="flex-shrink-0 relative w-11 h-6 rounded-full transition-colors"
                style={{
                  backgroundColor: flag.enabled ? "var(--mq-accent)" : "var(--mq-border)",
                }}
              >
                {toggleLoading === flag.id ? (
                  <Loader2
                    className="absolute top-1 left-1 w-4 h-4 animate-spin"
                    style={{ color: "#fff" }}
                  />
                ) : (
                  <div
                    className="absolute top-1 w-4 h-4 rounded-full transition-transform"
                    style={{
                      backgroundColor: "#fff",
                      transform: flag.enabled ? "translateX(20px)" : "translateX(0)",
                    }}
                  />
                )}
              </button>

              {/* Flag Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-medium text-sm" style={{ color: "var(--mq-text)" }}>
                    {flag.name}
                  </h3>
                  <code
                    className="text-[11px] px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: "var(--mq-input-bg)",
                      border: "1px solid var(--mq-border)",
                      color: "var(--mq-text-muted)",
                    }}
                  >
                    {flag.key}
                  </code>
                </div>
                {flag.description && (
                  <p className="text-xs mt-0.5 truncate" style={{ color: "var(--mq-text-muted)" }}>
                    {flag.description}
                  </p>
                )}
              </div>

              {/* Status Label */}
              <span
                className="text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0"
                style={{
                  backgroundColor: flag.enabled ? "rgba(74,222,128,0.15)" : "rgba(136,136,136,0.15)",
                  color: flag.enabled ? "#4ade80" : "var(--mq-text-muted)",
                }}
              >
                {flag.enabled ? "ON" : "OFF"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
