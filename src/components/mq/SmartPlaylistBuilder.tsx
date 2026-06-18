"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import {
  X, Plus, Trash2, Play, Sparkles, ListFilter,
  Clock, Music, Heart, RotateCcw, ChevronRight, Loader2,
} from "lucide-react";
import { SMART_PLAYLIST_PRESETS, type SmartPlaylistRule, type SmartPlaylistConfig } from "@/lib/smartPlaylist";
import type { Track } from "@/lib/musicApi";
import { toast } from "@/hooks/use-toast";

interface SmartPlaylistBuilderProps {
  onClose: () => void;
  onPlayTracks: (tracks: Track[], startIndex?: number) => void;
}

const FIELDS = [
  { value: "genre", label: "Жанр", type: "text" },
  { value: "artist", label: "Артист", type: "text" },
  { value: "title", label: "Название", type: "text" },
  { value: "duration", label: "Длительность (сек)", type: "number" },
  { value: "lastPlayed", label: "Последнее прослушивание (дней назад)", type: "number" },
  { value: "playCount", label: "Количество прослушиваний", type: "number" },
  { value: "liked", label: "В избранном", type: "boolean" },
] as const;

const TEXT_OPS = [
  { value: "eq", label: "равно" },
  { value: "neq", label: "не равно" },
  { value: "contains", label: "содержит" },
];

const NUMBER_OPS = [
  { value: "eq", label: "=" },
  { value: "gt", label: ">" },
  { value: "gte", label: "≥" },
  { value: "lt", label: "<" },
  { value: "lte", label: "≤" },
];

const SORT_OPTIONS = [
  { value: "createdAt", label: "По дате добавления" },
  { value: "title", label: "По названию" },
  { value: "artist", label: "По артисту" },
  { value: "duration", label: "По длительности" },
  { value: "random", label: "Случайно" },
];

export function SmartPlaylistBuilder({ onClose, onPlayTracks }: SmartPlaylistBuilderProps) {
  const [name, setName] = useState("");
  const [rules, setRules] = useState<SmartPlaylistRule[]>([]);
  const [limit, setLimit] = useState(100);
  const [sortBy, setSortBy] = useState<SmartPlaylistConfig["sortBy"]>("createdAt");
  const [previewTracks, setPreviewTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [existingPlaylists, setExistingPlaylists] = useState<Array<{
    id: string; name: string; rules: string; limit: number; sortBy: string;
  }>>([]);

  const addRule = () => {
    setRules([...rules, { field: "genre", op: "contains", value: "" }]);
  };

  const updateRule = (index: number, patch: Partial<SmartPlaylistRule>) => {
    const updated = [...rules];
    updated[index] = { ...updated[index], ...patch };
    // Reset value when field type changes
    if (patch.field) {
      const fieldDef = FIELDS.find((f) => f.value === patch.field);
      if (fieldDef?.type === "boolean") {
        updated[index].value = true;
        updated[index].op = "eq";
      } else if (fieldDef?.type === "number") {
        updated[index].value = 0;
      } else {
        updated[index].value = "";
      }
    }
    setRules(updated);
  };

  const removeRule = (index: number) => {
    setRules(rules.filter((_, i) => i !== index));
  };

  const applyPreset = (presetId: string) => {
    const preset = SMART_PLAYLIST_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setName(preset.name);
    setRules(preset.config.rules);
    setLimit(preset.config.limit || 100);
    setSortBy(preset.config.sortBy || "createdAt");
  };

  const preview = useCallback(async () => {
    if (rules.length === 0) {
      toast({ title: "Добавьте хотя бы одно правило" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/smart-playlists/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules, limit, sortBy }),
      });
      if (!res.ok) throw new Error("Preview failed");
      const data = await res.json();
      setPreviewTracks(data.tracks || []);
    } catch {
      toast({ title: "Ошибка предпросмотра" });
    } finally {
      setLoading(false);
    }
  }, [rules, limit, sortBy]);

  const save = useCallback(async () => {
    if (!name.trim()) {
      toast({ title: "Введите название" });
      return;
    }
    if (rules.length === 0) {
      toast({ title: "Добавьте хотя бы одно правило" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/smart-playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), rules, limit, sortBy }),
      });
      if (!res.ok) throw new Error("Save failed");
      toast({ title: "Сохранено", description: `Smart playlist "${name}" создан` });
      onClose();
    } catch {
      toast({ title: "Ошибка сохранения" });
    } finally {
      setSaving(false);
    }
  }, [name, rules, limit, sortBy, onClose]);

  const fetchExisting = useCallback(async () => {
    try {
      const res = await fetch("/api/smart-playlists");
      if (!res.ok) return;
      const data = await res.json();
      setExistingPlaylists(data.playlists || []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchExisting(); }, [fetchExisting]);

  const getFieldDef = (field: string) => FIELDS.find((f) => f.value === field);
  const getOpsForField = (field: string) => {
    const def = getFieldDef(field);
    if (!def) return TEXT_OPS;
    return def.type === "number" ? NUMBER_OPS : def.type === "boolean" ? [{ value: "eq", label: "=" }] : TEXT_OPS;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="smart-playlist-title"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 10 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="w-full max-w-2xl rounded-2xl overflow-hidden flex flex-col"
        style={{
          backgroundColor: "var(--mq-card, #1a1a1a)",
          border: "1px solid var(--mq-border, #2a2a2a)",
          boxShadow: "0 25px 60px rgba(0,0,0,0.5)",
          maxHeight: "90vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: "1px solid var(--mq-border)" }}>
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
            <h2 id="smart-playlist-title" className="text-base font-bold" style={{ color: "var(--mq-text)" }}>
              Smart Playlist
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg cursor-pointer hover:opacity-70" style={{ color: "var(--mq-text-muted)" }} aria-label="Закрыть">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="overflow-y-auto px-5 py-4 flex-1">
          {/* Presets */}
          <div className="mb-5">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: "var(--mq-text-muted)" }}>
              Шаблоны
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {SMART_PLAYLIST_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => applyPreset(preset.id)}
                  className="text-left p-3 rounded-xl transition-all hover:opacity-80"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <p className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>{preset.name}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--mq-text-muted)" }}>{preset.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div className="mb-4">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Название плейлиста"
              maxLength={200}
              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
              style={{
                backgroundColor: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "var(--mq-text)",
              }}
            />
          </div>

          {/* Rules */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--mq-text-muted)" }}>
                Правила ({rules.length})
              </h3>
              <button onClick={addRule} className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg cursor-pointer hover:opacity-80" style={{ color: "var(--mq-accent)" }}>
                <Plus className="w-3 h-3" /> Добавить
              </button>
            </div>
            <AnimatePresence>
              {rules.map((rule, index) => {
                const fieldDef = getFieldDef(rule.field);
                return (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-2 mb-2"
                  >
                    <select
                      value={rule.field}
                      onChange={(e) => updateRule(index, { field: e.target.value as SmartPlaylistRule["field"] })}
                      className="px-2 py-1.5 rounded-lg text-xs outline-none flex-shrink-0"
                      style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--mq-text)" }}
                    >
                      {FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                    <select
                      value={rule.op}
                      onChange={(e) => updateRule(index, { op: e.target.value as SmartPlaylistRule["op"] })}
                      className="px-2 py-1.5 rounded-lg text-xs outline-none flex-shrink-0"
                      style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--mq-text)" }}
                    >
                      {getOpsForField(rule.field).map((op) => <option key={op.value} value={op.value}>{op.label}</option>)}
                    </select>
                    {fieldDef?.type === "boolean" ? (
                      <span className="text-xs px-2" style={{ color: "var(--mq-text-muted)" }}>true</span>
                    ) : (
                      <input
                        type={fieldDef?.type === "number" ? "number" : "text"}
                        value={String(rule.value)}
                        onChange={(e) => updateRule(index, { value: fieldDef?.type === "number" ? Number(e.target.value) : e.target.value })}
                        className="flex-1 min-w-0 px-2 py-1.5 rounded-lg text-xs outline-none"
                        style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--mq-text)" }}
                      />
                    )}
                    <button onClick={() => removeRule(index)} className="p-1.5 rounded-lg cursor-pointer hover:opacity-70 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            {rules.length === 0 && (
              <p className="text-xs text-center py-4" style={{ color: "var(--mq-text-muted)" }}>
                Нет правил. Добавьте правило или выберите шаблон.
              </p>
            )}
          </div>

          {/* Limit + Sort */}
          <div className="flex gap-3 mb-4">
            <div className="flex-1">
              <label className="text-[11px] font-medium block mb-1" style={{ color: "var(--mq-text-muted)" }}>Лимит треков</label>
              <input
                type="number"
                value={limit}
                onChange={(e) => setLimit(Math.min(Math.max(1, Number(e.target.value) || 100), 500))}
                className="w-full px-2 py-1.5 rounded-lg text-xs outline-none"
                style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--mq-text)" }}
              />
            </div>
            <div className="flex-1">
              <label className="text-[11px] font-medium block mb-1" style={{ color: "var(--mq-text-muted)" }}>Сортировка</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SmartPlaylistConfig["sortBy"])}
                className="w-full px-2 py-1.5 rounded-lg text-xs outline-none"
                style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--mq-text)" }}
              >
                {SORT_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>
          </div>

          {/* Preview tracks */}
          {previewTracks.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--mq-text-muted)" }}>
                  Предпросмотр ({previewTracks.length})
                </h3>
                <button
                  onClick={() => onPlayTracks(previewTracks)}
                  className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg cursor-pointer"
                  style={{ color: "var(--mq-accent)", backgroundColor: "color-mix(in srgb, var(--mq-accent) 10%, transparent)" }}
                >
                  <Play className="w-3 h-3" fill="currentColor" /> Играть все
                </button>
              </div>
              <div className="max-h-32 overflow-y-auto rounded-xl" style={{ backgroundColor: "rgba(255,255,255,0.02)" }}>
                {previewTracks.slice(0, 20).map((track, i) => (
                  <div key={track.id + "_" + i} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                    <span style={{ color: "var(--mq-text-muted)", minWidth: 20 }}>{i + 1}.</span>
                    <span className="flex-1 truncate" style={{ color: "var(--mq-text)" }}>{track.title}</span>
                    <span className="truncate" style={{ color: "var(--mq-text-muted)" }}>{track.artist}</span>
                  </div>
                ))}
                {previewTracks.length > 20 && (
                  <p className="text-center py-1 text-[10px]" style={{ color: "var(--mq-text-muted)" }}>
                    ...и ещё {previewTracks.length - 20}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Existing smart playlists */}
          {existingPlaylists.length > 0 && (
            <div className="mb-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--mq-text-muted)" }}>
                Существующие ({existingPlaylists.length})
              </h3>
              {existingPlaylists.map((pl) => (
                <div key={pl.id} className="flex items-center gap-2 px-3 py-2 rounded-lg mb-1" style={{ backgroundColor: "rgba(255,255,255,0.02)" }}>
                  <ListFilter className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--mq-accent)" }} />
                  <span className="flex-1 text-xs truncate" style={{ color: "var(--mq-text)" }}>{pl.name}</span>
                  <span className="text-[10px]" style={{ color: "var(--mq-text-muted)" }}>лимит {pl.limit}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 py-4 flex-shrink-0" style={{ borderTop: "1px solid var(--mq-border)" }}>
          <button
            onClick={preview}
            disabled={loading || rules.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--mq-text)" }}
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Предпросмотр
          </button>
          <button
            onClick={save}
            disabled={saving || !name.trim() || rules.length === 0}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium cursor-pointer transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{ backgroundColor: "var(--mq-accent)", color: "#fff" }}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Создать
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
