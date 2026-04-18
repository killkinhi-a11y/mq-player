"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ToggleLeft as ToggleLeftIcon,
  Plus,
  Loader2,
  X,
  Sparkles,
  Calendar,
} from "lucide-react";
import { seasonalThemes } from "@/lib/themes";

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

  // Check if a seasonal flag is enabled
  const isSeasonalEnabled = (seasonalKey: string) => {
    return flags.some(f => f.key === `theme_${seasonalKey}` && f.enabled);
  };

  // Get current month for auto-suggest
  const currentMonth = new Date().getMonth() + 1;
  const currentSeasonalThemes = seasonalThemes.filter(st => st.months.includes(currentMonth));

  // Separate seasonal flags from regular flags
  const seasonalFlagKeys = seasonalThemes.map(st => `theme_${st.key}`);
  const regularFlags = flags.filter(f => !f.key.startsWith("theme_"));
  const activeSeasonalFlags = flags.filter(f => f.key.startsWith("theme_") && f.enabled);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--mq-text)" }}>
            Feature Flags
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--mq-text-muted)" }}>
            Управление функциями и сезонными темами
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

      {/* Seasonal Themes Section */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          backgroundColor: "var(--mq-card)",
          border: "1px solid var(--mq-border)",
        }}
      >
        <div
          className="flex items-center justify-between px-4 sm:px-5 py-4"
          style={{ borderBottom: "1px solid var(--mq-border)" }}
        >
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
            <div>
              <h2 className="font-semibold text-sm" style={{ color: "var(--mq-text)" }}>
                Сезонные темы
              </h2>
              <p className="text-[11px]" style={{ color: "var(--mq-text-muted)" }}>
                {activeSeasonalFlags.length > 0
                  ? `Активных: ${activeSeasonalFlags.length}`
                  : "Включите тему для автоматического переключения"}
              </p>
            </div>
          </div>
          {currentSeasonalThemes.length > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
              style={{ backgroundColor: "rgba(224,49,49,0.08)", border: "1px solid rgba(224,49,49,0.15)" }}>
              <Sparkles className="w-3 h-3" style={{ color: "var(--mq-accent)" }} />
              <span className="text-[10px] font-medium" style={{ color: "var(--mq-accent)" }}>
                Сейчас: {currentSeasonalThemes.map(st => st.icon).join(" ")}
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-0">
          {seasonalThemes.map((st, idx) => {
            const flag = flags.find(f => f.key === `theme_${st.key}`);
            const isEnabled = !!flag?.enabled;
            const isCurrentMonth = st.months.includes(currentMonth);
            const rowBorder = idx < seasonalThemes.length - 1;

            return (
              <div
                key={st.key}
                className="flex items-center gap-3 px-4 sm:px-5 py-3.5"
                style={{
                  borderBottom: rowBorder ? "1px solid var(--mq-border)" : "none",
                  borderRight: "1px solid var(--mq-border)",
                }}
              >
                <button
                  onClick={() => {
                    if (flag) {
                      handleToggle(flag);
                    } else {
                      // Auto-create the seasonal flag and enable it
                      const createSeasonalFlag = async () => {
                        setToggleLoading(`new_${st.key}`);
                        try {
                          // Create flag
                          await fetch("/api/admin/feature-flags", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              key: `theme_${st.key}`,
                              name: `Тема: ${st.name}`,
                              description: st.description,
                              enabled: true,
                            }),
                          });
                          fetchFlags();
                        } catch (err) {
                          console.error("Create seasonal flag error:", err);
                        } finally {
                          setToggleLoading(null);
                        }
                      };
                      createSeasonalFlag();
                    }
                  }}
                  disabled={toggleLoading === flag?.id || toggleLoading === `new_${st.key}`}
                  className="flex-shrink-0 relative w-11 h-6 rounded-full transition-colors"
                  style={{
                    backgroundColor: isEnabled ? "var(--mq-accent)" : "var(--mq-border)",
                  }}
                >
                  {toggleLoading === flag?.id || toggleLoading === `new_${st.key}` ? (
                    <Loader2
                      className="absolute top-1 left-1 w-4 h-4 animate-spin"
                      style={{ color: "#fff" }}
                    />
                  ) : (
                    <div
                      className="absolute top-1 w-4 h-4 rounded-full transition-transform"
                      style={{
                        backgroundColor: "#fff",
                        transform: isEnabled ? "translateX(20px)" : "translateX(0)",
                      }}
                    />
                  )}
                </button>

                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-lg flex-shrink-0">{st.icon}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="font-medium text-sm truncate" style={{ color: "var(--mq-text)" }}>
                        {st.name}
                      </h3>
                      {isCurrentMonth && (
                        <span
                          className="text-[9px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor: "rgba(224,49,49,0.15)",
                            color: "var(--mq-accent)",
                          }}
                        >
                          СЕЙЧАС
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] truncate" style={{ color: "var(--mq-text-muted)" }}>
                      {st.description}
                    </p>
                  </div>
                </div>

                <span
                  className="text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: isEnabled ? "rgba(74,222,128,0.15)" : "rgba(136,136,136,0.15)",
                    color: isEnabled ? "#4ade80" : "var(--mq-text-muted)",
                  }}
                >
                  {isEnabled ? "ON" : "OFF"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Regular Feature Flags */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          backgroundColor: "var(--mq-card)",
          border: "1px solid var(--mq-border)",
        }}
      >
        {regularFlags.length === 0 ? (
          <div className="p-8 text-center">
            <ToggleLeftIcon className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--mq-text-muted)", opacity: 0.3 }} />
            <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
              Нет пользовательских флагов
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--mq-text-muted)", opacity: 0.6 }}>
              Создайте первый feature flag
            </p>
          </div>
        ) : (
          regularFlags.map((flag, idx) => (
            <div
              key={flag.id}
              className="flex items-center gap-4 px-4 sm:px-5 py-4"
              style={{
                borderBottom: idx < regularFlags.length - 1 ? "1px solid var(--mq-border)" : "none",
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
          ))
        )}
      </div>
    </div>
  );
}
