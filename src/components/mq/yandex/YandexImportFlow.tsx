"use client";

/**
 * YandexImportFlow — «Импортировать из Яндекс Музыки».
 *
 * Multi-step import wizard (Library → Playlists → Импорт → Яндекс Музыка):
 *   connect  — OAuth Device Flow: код + страница подтверждения Яндекса
 *   select   — список плейлистов аккаунта (поиск, выбор, «импортирован ранее»)
 *   preview  — сводка + конфликт имён (копия / добавить в существующий)
 *   progress — job-прогресс (fetch → match → import), полоса + текущий плейлист
 *   done     — отчёт: импортировано / не найдено / спорные с выбором варианта
 *
 * Design: MQ dark glass (CSS-переменные приложения), framer-motion,
 * 44×44 touch targets, mobile-first (390×844) + desktop (1440×900).
 *
 * SECURITY: браузер никогда не видит Yandex-токены — только user_code
 * подтверждения и публичные данные плейлистов.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  Copy,
  ExternalLink,
  ListMusic,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAppStore } from "@/store/useAppStore";
import type { Track } from "@/lib/musicApi";

// ── API types (client mirror of src/lib/yandex/* server shapes) ──────────────

interface YandexPlaylistItem {
  uid: number | null;
  kind: number;
  title: string;
  description: string;
  trackCount: number;
  visibility: string;
  ownerLogin: string;
  coverUrl: string;
  durationMs: number;
  modified: string;
  collective: boolean;
  imported: boolean;
}

interface MatchEntryView {
  position: number;
  yandexTitle: string;
  yandexArtists: string[];
  yandexDurationSec: number;
  status: "pending" | "matched" | "ambiguous" | "unmatched" | "resolved";
  score?: number;
  exact?: boolean;
  mqTrack?: Track | null;
  candidates?: Track[];
}

interface DetailPlaylist {
  kind: number;
  title: string;
  createdPlaylistId: string | null;
  createdName: string | null;
  error: string | null;
  matches: MatchEntryView[];
}

interface ImportReportView {
  playlistsTotal: number;
  playlistsImported: number;
  playlistsFailed: number;
  tracksFound: number;
  tracksImported: number;
  tracksMatched: number;
  tracksAmbiguous: number;
  tracksUnmatched: number;
  duplicates: number;
  skippedExisting: number;
  createdPlaylists: Array<{ kind: number; playlistId: string; name: string }>;
  failures: Array<{ kind: number; title: string; error: string }>;
}

interface SnapshotView {
  id: string;
  status: string;
  phase: "fetching" | "matching" | "importing" | "done" | null;
  progress: { done: number; total: number; unit: "playlists" | "tracks"; currentTitle: string };
  playlists: Array<{
    kind: number;
    title: string;
    trackCount: number;
    status: string;
    imported: number;
    matched: number;
    ambiguous: number;
    unmatched: number;
    error?: string | null;
  }>;
  report: ImportReportView | null;
}

type Step = "connect" | "code" | "select" | "preview" | "importing" | "done";

interface Props {
  open: boolean;
  onClose: () => void;
  onImported?: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtCount(n: number): string {
  const s = String(n);
  const last = Number(s.slice(-1));
  const last2 = Number(s.slice(-2));
  if (last === 1 && last2 !== 11) return `${n} плейлист`;
  if (last >= 2 && last <= 4 && (last2 < 12 || last2 > 14)) return `${n} плейлиста`;
  return `${n} плейлистов`;
}

function fmtTracks(n: number): string {
  const s = String(n);
  const last = Number(s.slice(-1));
  const last2 = Number(s.slice(-2));
  if (last === 1 && last2 !== 11) return `${n} трек`;
  if (last >= 2 && last <= 4 && (last2 < 12 || last2 > 14)) return `${n} трека`;
  return `${n} треков`;
}

function fmtDuration(sec: number): string {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.message || "Ошибка сети") as Error & { code?: string; status?: number };
    err.code = data?.error;
    err.status = res.status;
    throw err;
  }
  return data as T;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function YandexImportFlow({ open, onClose, onImported }: Props) {
  if (!open) return null;
  // FlowInner mounts fresh on every open — all wizard state resets naturally,
  // no reset effects (and no setState-in-effect cascades).
  return <FlowInner onClose={onClose} onImported={onImported} />;
}

/** Names of playlists the user already has (conflict detection). Derived from
 *  the store snapshot when the flow opens — no effects, no extra state. */
function useExistingPlaylistNames(openKey: string): Set<string> {
  return useMemo(() => {
    try {
      const playlists = useAppStore.getState().playlists ?? [];
      return new Set(playlists.map((p) => String(p.name || "").trim().toLowerCase()));
    } catch {
      return new Set<string>();
    }
    // recompute when the flow (re)opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey]);
}


function FlowInner({ onClose, onImported }: { onClose: () => void; onImported?: () => void }) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("connect");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // connect / code
  const [account, setAccount] = useState<{ login: string | null; displayName: string | null } | null>(null);
  const [device, setDevice] = useState<{ userCode: string; verificationUrl: string; expiresIn: number } | null>(null);
  const [codeTtl, setCodeTtl] = useState(0);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  // select
  const [playlists, setPlaylists] = useState<YandexPlaylistItem[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState("");

  // preview
  const [conflicts, setConflicts] = useState<Record<number, "copy" | "merge">>({});

  // progress
  const [jobId, setJobId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<SnapshotView | null>(null);
  const [detail, setDetail] = useState<{ snapshot: SnapshotView; playlists: DetailPlaylist[] } | null>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (pollTimer.current) clearTimeout(pollTimer.current);
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    };
  }, []);

  const stopTimers = useCallback(() => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
  }, []);

  // Mount: check connection status; jump straight to selection if linked
  useEffect(() => {
    (async () => {
      try {
        const data = await api<{ connected: boolean; account?: { login: string | null; displayName: string | null } }>(
          "/api/yandex/account"
        );
        if (!mounted.current) return;
        if (data.connected && data.account) {
          setAccount(data.account);
          setStep("select");
          void loadPlaylists();
        }
      } catch {
        if (mounted.current) setAccount(null);
      }
    })();
  }, []);

  async function loadPlaylists() {
    setPlaylists(null);
    setError(null);
    try {
      const data = await api<{ playlists: YandexPlaylistItem[] }>("/api/yandex/playlists");
      if (!mounted.current) return;
      setPlaylists(data.playlists || []);
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code === "no_yandex_account" || err.code === "yandex_unauthorized") {
        setAccount(null);
        setStep("connect");
        setError("Сессия Яндекс.Музыки истекла — подключите аккаунт заново.");
      } else {
        setError(err.message || "Не удалось загрузить плейлисты.");
      }
    }
  }

  // ── Device auth ──

  async function startAuth() {
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ userCode: string; verificationUrl: string; expiresIn: number; interval: number }>(
        "/api/yandex/auth/start",
        { method: "POST", body: "{}" }
      );
      if (!mounted.current) return;
      setDevice({ userCode: data.userCode, verificationUrl: data.verificationUrl, expiresIn: data.expiresIn });
      setCodeTtl(data.expiresIn);
      setStep("code");
    } catch (e) {
      setError((e as Error).message || "Не удалось начать вход через Яндекс.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  function pollAuth(interval: number) {
      pollTimer.current = setTimeout(async () => {
        try {
          const data = await api<{ status: string; account?: { login: string | null; displayName: string | null } }>(
            "/api/yandex/auth/poll",
            { method: "POST", body: "{}" }
          );
          if (!mounted.current) return;
          if (data.status === "pending") {
            pollAuth(interval);
            return;
          }
          if (data.status === "expired") {
            setError("Код истёк. Начните вход заново.");
            setStep("connect");
            return;
          }
          // ok
          setAccount(data.account ?? null);
          toast({ title: "Яндекс.Музыка подключена", description: data.account?.displayName || data.account?.login || "" });
          setStep("select");
          void loadPlaylists();
        } catch (e) {
          const err = e as Error & { code?: string };
          if (err.code === "device_code_expired" || err.code === "device_code_cancelled") {
            setError("Код истёк. Начните вход заново.");
            setStep("connect");
            return;
          }
          setError(err.message || "Ошибка подтверждения. Попробуйте ещё раз.");
          pollAuth(interval);
        }
      }, Math.max(2, Math.min(10, interval)) * 1000);
  }

  // start polling when the code screen appears
  useEffect(() => {
    if (step === "code" && device) {
      pollAuth(5);
      return () => {
        if (pollTimer.current) clearTimeout(pollTimer.current);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, device?.userCode]);

  // countdown for the code screen
  useEffect(() => {
    if (step !== "code" || !codeTtl) return;
    const t = setInterval(() => {
      setCodeTtl((v) => (v > 0 ? v - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [step, codeTtl]);

  async function disconnect() {
    setBusy(true);
    try {
      await api("/api/yandex/account", { method: "DELETE" });
      if (!mounted.current) return;
      setAccount(null);
      setPlaylists(null);
      setStep("connect");
      toast({ title: "Аккаунт Яндекс.Музыки отключён" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  // ── Selection → preview ──

  const filtered = useMemo(() => {
    if (!playlists) return [];
    const f = filter.trim().toLowerCase();
    if (!f) return playlists;
    return playlists.filter((p) => p.title.toLowerCase().includes(f) || p.ownerLogin.toLowerCase().includes(f));
  }, [playlists, filter]);

  const selectedItems = useMemo(
    () => (playlists || []).filter((p) => selected.has(p.kind)),
    [playlists, selected]
  );

  const totalSelectedTracks = useMemo(
    () => selectedItems.reduce((acc, p) => acc + (p.trackCount || 0), 0),
    [selectedItems]
  );

  const existingNames = useExistingPlaylistNames(useRef(`ym-${Date.now()}`).current);

  const conflictsDetected = useMemo(
    () => selectedItems.filter((p) => existingNames.has(p.title.trim().toLowerCase())),
    [selectedItems, existingNames]
  );

  const toggle = useCallback((kind: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected((prev) => (prev.size === filtered.length ? new Set() : new Set(filtered.map((p) => p.kind))));
  }, [filtered]);

  const conflictModeFor = useCallback(
    (kind: number): "copy" | "merge" => (conflicts[kind] === "merge" ? "merge" : "copy"),
    [conflicts]
  );

  // ── Start import ──

  const startImport = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ jobId: string }>("/api/yandex/import", {
        method: "POST",
        body: JSON.stringify({
          playlists: selectedItems.map((p) => ({
            kind: p.kind,
            uid: p.uid,
            title: p.title,
            conflictMode: conflictModeFor(p.kind),
          })),
        }),
      });
      if (!mounted.current) return;
      setJobId(data.jobId);
      setStep("importing");
      advanceLoop(data.jobId);
    } catch (e) {
      setError((e as Error).message || "Не удалось начать импорт.");
    } finally {
      if (mounted.current) setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItems, conflictModeFor]);

  function advanceLoop(id: string) {
    const run = async () => {
      try {
        const snap = await api<SnapshotView>(`/api/yandex/import/${id}/advance`, { method: "POST", body: "{}" });
        if (!mounted.current) return;
        setSnapshot(snap);
        const terminal = ["completed", "completed_with_errors", "failed", "cancelled"];
        if (terminal.includes(snap.status)) {
          await loadDetail(id);
          setStep("done");
          onImported?.();
          return;
        }
        advanceTimer.current = setTimeout(run, 1200);
      } catch (e) {
        const err = e as Error & { code?: string };
        if (err.code === "yandex_rate_limited") {
          advanceTimer.current = setTimeout(run, 4000);
          return;
        }
        if (mounted.current) {
          setError(err.message || "Импорт прерван. Нажмите «Повторить».");
          setRetryJobId(id);
        }
      }
    };
    run();
  }

  const [retryJobId, setRetryJobId] = useState<string | null>(null);

  function retryImport() {
    const id = retryJobId || jobId;
    if (!id) return;
    setError(null);
    setStep("importing");
    advanceLoop(id);
  }

  async function cancelImport() {
    const id = jobId || retryJobId;
    stopTimers();
    if (id) {
      try {
        await api(`/api/yandex/import/${id}/cancel`, { method: "POST", body: "{}" });
      } catch {
        /* best effort */
      }
    }
    onClose();
  }

  async function loadDetail(id: string) {
    try {
      const data = await api<{ snapshot: SnapshotView; playlists: DetailPlaylist[] }>(
        `/api/yandex/import/${id}?detail=1`
      );
      if (mounted.current) setDetail(data);
    } catch {
      /* detail is optional — snapshot report already has the summary */
    }
  }

  async function resolveTrack(kind: number, position: number, track: Track) {
      const id = jobId || retryJobId;
      if (!id) return;
      try {
        await api(`/api/yandex/import/${id}/resolve`, {
          method: "POST",
          body: JSON.stringify({ kind, position, track }),
        });
        // optimistic local update
        setDetail((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            playlists: prev.playlists.map((p) =>
              p.kind !== kind
                ? p
                : {
                    ...p,
                    matches: p.matches.map((m) =>
                      m.position === position
                        ? { ...m, status: "resolved" as const, mqTrack: track, candidates: undefined }
                        : m
                    ),
                  }
            ),
          };
        });
        toast({ title: "Трек добавлен в плейлист" });
      } catch (e) {
        toast({ title: "Не удалось добавить трек", description: (e as Error).message, variant: "destructive" });
      }
    }

  function copyCode() {
    if (device?.userCode) {
      void navigator.clipboard?.writeText(device.userCode).catch(() => undefined);
      toast({ title: "Код скопирован" });
    }
  }

  const stepTitle: Record<Step, string> = {
    connect: "Импорт из Яндекс Музыки",
    code: "Вход в Яндекс.Музыку",
    select: "Ваши плейлисты",
    preview: "Предпросмотр импорта",
    importing: "Импорт плейлистов",
    done: "Импорт завершён",
  };

  return (
    <AnimatePresence>
      <motion.div
        key="yandex-import-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center"
        style={{ backgroundColor: "rgba(0,0,0,0.62)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}
        onClick={step === "importing" ? undefined : onClose}
      >
        <motion.div
          key="yandex-import-panel"
          initial={{ y: 48, opacity: 0, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 48, opacity: 0, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 380, damping: 34 }}
          className="w-full sm:max-w-[560px] h-[100dvh] sm:h-auto sm:max-h-[86vh] flex flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl"
          style={{
            backgroundColor: "var(--mq-surface-1, #141414)",
            border: "1px solid var(--mq-border-thin, rgba(255,255,255,0.08))",
            boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className="flex items-center gap-3 px-5 py-4 shrink-0"
            style={{ borderBottom: "1px solid var(--mq-border-thin, rgba(255,255,255,0.08))" }}
          >
            {step !== "connect" && step !== "importing" ? (
              <button
                onClick={() => {
                  stopTimers();
                  setError(null);
                  if (step === "code") setStep("connect");
                  else if (step === "select") setStep(account ? "select" : "connect");
                  else if (step === "preview") setStep("select");
                  else if (step === "done") onClose();
                }}
                aria-label="Назад"
                className="flex items-center justify-center rounded-xl transition-colors"
                style={{ width: 44, height: 44, color: "var(--mq-text-muted)", backgroundColor: "var(--mq-overlay-hover, rgba(255,255,255,0.05))" }}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            ) : (
              <div className="flex items-center justify-center rounded-2xl shrink-0" style={{ width: 44, height: 44, backgroundColor: "rgba(255,204,0,0.12)" }}>
                <ListMusic className="w-5 h-5" style={{ color: "#FFCC00" }} />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-[15px] font-semibold truncate" style={{ color: "var(--mq-text)" }}>
                {stepTitle[step]}
              </h2>
              {step === "select" && account ? (
                <p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>
                  {account.displayName || account.login || "аккаунт подключён"}
                </p>
              ) : null}
            </div>
            {step === "select" && account ? (
              <button
                onClick={disconnect}
                disabled={busy}
                className="text-xs px-3 rounded-xl transition-colors disabled:opacity-50"
                style={{ height: 44, color: "var(--mq-text-muted)" }}
              >
                Отключить
              </button>
            ) : step === "importing" ? (
              <span className="text-xs tabular-nums" style={{ color: "var(--mq-text-muted)" }}>
                {snapshot?.progress.total
                  ? `${Math.min(100, Math.round((snapshot.progress.done / snapshot.progress.total) * 100))}%`
                  : "…"}
              </span>
            ) : step !== "done" ? (
              <button
                onClick={onClose}
                aria-label="Закрыть"
                className="flex items-center justify-center rounded-xl transition-colors"
                style={{ width: 44, height: 44, color: "var(--mq-text-muted)" }}
              >
                <X className="w-5 h-5" />
              </button>
            ) : null}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.18 }}
              >
                {step === "connect" ? <ConnectStep busy={busy} error={error} onStart={startAuth} /> : null}
                {step === "code" && device ? (
                  <CodeStep
                    device={device}
                    ttl={codeTtl}
                    onCopy={copyCode}
                    error={error}
                    onRestart={startAuth}
                  />
                ) : null}
                {step === "select" ? (
                  <SelectStep
                    playlists={playlists}
                    filtered={filtered}
                    filter={filter}
                    setFilter={setFilter}
                    selected={selected}
                    onToggle={toggle}
                    onSelectAll={selectAll}
                    onRetry={loadPlaylists}
                    error={error}
                    onNext={() => {
                      setError(null);
                      setStep("preview");
                    }}
                    busy={busy}
                  />
                ) : null}
                {step === "preview" ? (
                  <PreviewStep
                    items={selectedItems}
                    conflictsDetected={conflictsDetected.map((p) => p.kind)}
                    conflictModeFor={conflictModeFor}
                    setConflictMode={(kind, mode) => setConflicts((prev) => ({ ...prev, [kind]: mode }))}
                    totalTracks={totalSelectedTracks}
                    onStart={startImport}
                    busy={busy}
                    error={error}
                  />
                ) : null}
                {step === "importing" ? (
                  <ProgressStep snapshot={snapshot} error={error} onCancel={cancelImport} onRetry={retryImport} />
                ) : null}
                {step === "done" ? (
                  <DoneStep
                    snapshot={snapshot}
                    detail={detail}
                    onResolve={resolveTrack}
                    onClose={onClose}
                  />
                ) : null}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Existing playlist names (for conflict detection) ─────────────────────────

// ── Step: connect ─────────────────────────────────────────────────────────────

function ConnectStep({
  busy,
  error,
  onStart,
}: {
  busy: boolean;
  error: string | null;
  onStart: () => void;
}) {
  return (
    <div className="space-y-5">
      <div
        className="rounded-2xl p-5 text-center"
        style={{ backgroundColor: "var(--mq-card, rgba(255,255,255,0.03))", border: "1px solid var(--mq-border-thin, rgba(255,255,255,0.08))" }}
      >
        <div
          className="mx-auto flex items-center justify-center rounded-2xl mb-4"
          style={{ width: 64, height: 64, backgroundColor: "rgba(255,204,0,0.12)" }}
        >
          <ListMusic className="w-8 h-8" style={{ color: "#FFCC00" }} />
        </div>
        <h3 className="text-base font-semibold mb-2" style={{ color: "var(--mq-text)" }}>
          Подключите Яндекс.Музыку
        </h3>
        <p className="text-sm leading-relaxed mb-1" style={{ color: "var(--mq-text-muted)" }}>
          Вы авторизуетесь на сайте Яндекса и разрешаете MQ доступ к списку ваших плейлистов —
          чтобы перенести их сюда с подбором треков.
        </p>
        <p className="text-xs leading-relaxed" style={{ color: "var(--mq-text-muted)" }}>
          MQ не видит ваш пароль. Токен доступа хранится на сервере MQ в зашифрованном виде и
          никогда не попадает в браузер.
        </p>
      </div>

      {error ? (
        <div
          className="flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm"
          style={{ backgroundColor: "rgba(255,77,79,0.1)", border: "1px solid rgba(255,77,79,0.25)", color: "#ff9b9d" }}
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <button
        onClick={onStart}
        disabled={busy}
        className="w-full flex items-center justify-center gap-2 rounded-2xl font-semibold text-sm transition-all active:scale-[0.98] disabled:opacity-60"
        style={{ height: 48, backgroundColor: "var(--mq-accent, #e03131)", color: "#fff" }}
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
        Подключить Яндекс.Музыку
      </button>
    </div>
  );
}

// ── Step: device code ─────────────────────────────────────────────────────────

function CodeStep({
  device,
  ttl,
  onCopy,
  error,
  onRestart,
}: {
  device: { userCode: string; verificationUrl: string; expiresIn: number };
  ttl: number;
  onCopy: () => void;
  error: string | null;
  onRestart: () => void;
}) {
  const expired = ttl <= 0;
  return (
    <div className="space-y-5">
      <div
        className="rounded-2xl p-5 text-center space-y-4"
        style={{ backgroundColor: "var(--mq-card, rgba(255,255,255,0.03))", border: "1px solid var(--mq-border-thin, rgba(255,255,255,0.08))" }}
      >
        <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
          Откройте страницу подтверждения Яндекса и введите код:
        </p>
        <button
          onClick={onCopy}
          className="w-full rounded-2xl py-4 transition-transform active:scale-[0.98]"
          style={{ backgroundColor: "rgba(255,204,0,0.10)", border: "1px dashed rgba(255,204,0,0.45)" }}
          aria-label="Скопировать код"
        >
          <div
            className="text-3xl font-bold tracking-[0.28em] font-mono select-all"
            style={{ color: "#FFCC00" }}
          >
            {device.userCode}
          </div>
        </button>
        <div className="flex items-center justify-center gap-2">
          <a
            href={device.verificationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm font-medium rounded-xl px-4 transition-colors"
            style={{ height: 44, color: "var(--mq-accent, #e03131)" }}
          >
            <ExternalLink className="w-4 h-4" />
            {device.verificationUrl.replace(/^https?:\/\//, "")}
          </a>
          <button
            onClick={onCopy}
            aria-label="Скопировать код"
            className="flex items-center justify-center rounded-xl transition-colors"
            style={{ width: 44, height: 44, color: "var(--mq-text-muted)", backgroundColor: "var(--mq-overlay-hover, rgba(255,255,255,0.05))" }}
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
          {expired
            ? "Код истёк"
            : `Код действует ещё ${Math.floor(ttl / 60)}:${String(ttl % 60).padStart(2, "0")} · ждём подтверждение…`}
        </p>
      </div>

      <div className="flex items-center justify-center gap-2 text-xs" style={{ color: "var(--mq-text-muted)" }}>
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Ожидаем подтверждение на сайте Яндекса
      </div>

      {error ? (
        <div
          className="flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm"
          style={{ backgroundColor: "rgba(255,77,79,0.1)", border: "1px solid rgba(255,77,79,0.25)", color: "#ff9b9d" }}
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
        </div>
      ) : null}

      <button
        onClick={onRestart}
        className="w-full flex items-center justify-center gap-2 rounded-2xl text-sm font-medium transition-colors"
        style={{ height: 48, color: "var(--mq-text-muted)", backgroundColor: "var(--mq-overlay-hover, rgba(255,255,255,0.05))" }}
      >
        <RefreshCw className="w-4 h-4" />
        Новый код
      </button>
    </div>
  );
}

// ── Step: select playlists ────────────────────────────────────────────────────

function SelectStep({
  playlists,
  filtered,
  filter,
  setFilter,
  selected,
  onToggle,
  onSelectAll,
  onRetry,
  error,
  onNext,
}: {
  playlists: YandexPlaylistItem[] | null;
  filtered: YandexPlaylistItem[];
  filter: string;
  setFilter: (v: string) => void;
  selected: Set<number>;
  onToggle: (kind: number) => void;
  onSelectAll: () => void;
  onRetry: () => void;
  error: string | null;
  onNext: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex flex-col min-h-[420px]">
      {error ? (
        <div
          className="flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm mb-4"
          style={{ backgroundColor: "rgba(255,77,79,0.1)", border: "1px solid rgba(255,77,79,0.25)", color: "#ff9b9d" }}
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={onRetry} className="underline shrink-0" style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }}>
            Повторить
          </button>
        </div>
      ) : null}

      <div
        className="flex items-center gap-2 rounded-xl px-3.5 mb-3"
        style={{ backgroundColor: "var(--mq-input-bg, rgba(255,255,255,0.05))", border: "1px solid var(--mq-border-thin, rgba(255,255,255,0.08))" }}
      >
        <Search className="w-4 h-4 shrink-0" style={{ color: "var(--mq-text-muted)" }} />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Поиск плейлиста"
          className="flex-1 bg-transparent outline-none text-sm py-3"
          style={{ color: "var(--mq-text)" }}
        />
      </div>

      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
          {playlists ? `${playlists.length} плейлистов · выбрано ${selected.size}` : "Загрузка…"}
        </span>
        {filtered.length > 0 ? (
          <button
            onClick={onSelectAll}
            className="text-xs font-medium rounded-lg px-2.5"
            style={{ minHeight: 44, display: "inline-flex", alignItems: "center", color: "var(--mq-accent, #e03131)" }}
          >
            {selected.size === filtered.length ? "Снять все" : "Выбрать все"}
          </button>
        ) : null}
      </div>

      <div className="flex-1 space-y-2">
        {!playlists ? (
          <>
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-2xl p-3 animate-pulse"
                style={{ backgroundColor: "var(--mq-card, rgba(255,255,255,0.03))" }}
              >
                <div className="w-12 h-12 rounded-xl shrink-0" style={{ backgroundColor: "rgba(255,255,255,0.06)" }} />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 rounded w-2/3" style={{ backgroundColor: "rgba(255,255,255,0.06)" }} />
                  <div className="h-3 rounded w-1/3" style={{ backgroundColor: "rgba(255,255,255,0.04)" }} />
                </div>
              </div>
            ))}
          </>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-sm" style={{ color: "var(--mq-text-muted)" }}>
            {filter ? "Ничего не найдено" : "В аккаунке нет плейлистов"}
          </div>
        ) : (
          filtered.map((p) => {
            const isSel = selected.has(p.kind);
            return (
              <button
                key={p.kind}
                onClick={() => onToggle(p.kind)}
                className="w-full flex items-center gap-3 rounded-2xl p-3 text-left transition-all active:scale-[0.99]"
                style={{
                  backgroundColor: isSel ? "rgba(224,49,49,0.10)" : "var(--mq-card, rgba(255,255,255,0.03))",
                  border: `1px solid ${isSel ? "var(--mq-accent, #e03131)" : "var(--mq-border-thin, rgba(255,255,255,0.08))"}`,
                }}
              >
                {p.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.coverUrl}
                    alt=""
                    className="w-12 h-12 rounded-xl object-cover shrink-0"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                  >
                    <ListMusic className="w-5 h-5" style={{ color: "var(--mq-text-muted)" }} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: "var(--mq-text)" }}>
                    {p.title || "Без названия"}
                  </div>
                  <div className="text-xs truncate mt-0.5" style={{ color: "var(--mq-text-muted)" }}>
                    {p.ownerLogin || "вы"} · {fmtTracks(p.trackCount)}
                    {p.imported ? " · импортирован ранее" : ""}
                  </div>
                </div>
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors"
                  style={{
                    backgroundColor: isSel ? "var(--mq-accent, #e03131)" : "transparent",
                    border: `2px solid ${isSel ? "var(--mq-accent, #e03131)" : "var(--mq-border-thin, rgba(255,255,255,0.2))"}`,
                  }}
                >
                  {isSel ? <Check className="w-3.5 h-3.5" style={{ color: "#fff" }} /> : null}
                </div>
              </button>
            );
          })
        )}
      </div>

      <div className="pt-4 sticky bottom-0" style={{ background: "linear-gradient(to top, var(--mq-surface-1, #141414) 70%, transparent)" }}>
        <button
          onClick={onNext}
          disabled={selected.size === 0}
          className="w-full flex items-center justify-center gap-2 rounded-2xl font-semibold text-sm transition-all active:scale-[0.98] disabled:opacity-40"
          style={{ height: 48, backgroundColor: "var(--mq-accent, #e03131)", color: "#fff" }}
        >
          Продолжить{selected.size > 0 ? ` · ${selected.size}` : ""}
        </button>
      </div>
    </div>
  );
}

// ── Step: preview ─────────────────────────────────────────────────────────────

function PreviewStep({
  items,
  conflictsDetected,
  conflictModeFor,
  setConflictMode,
  totalTracks,
  onStart,
  busy,
  error,
}: {
  items: YandexPlaylistItem[];
  conflictsDetected: number[];
  conflictModeFor: (kind: number) => "copy" | "merge";
  setConflictMode: (kind: number, mode: "copy" | "merge") => void;
  totalTracks: number;
  onStart: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <div className="space-y-4">
      <div className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
        Импортировать:
      </div>

      <div className="space-y-2">
        {items.map((p) => {
          const hasConflict = conflictsDetected.includes(p.kind);
          const mode = conflictModeFor(p.kind);
          return (
            <div
              key={p.kind}
              className="rounded-2xl p-4"
              style={{ backgroundColor: "var(--mq-card, rgba(255,255,255,0.03))", border: "1px solid var(--mq-border-thin, rgba(255,255,255,0.08))" }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                  style={{ backgroundColor: "var(--mq-accent, #e03131)" }}
                >
                  <Check className="w-3.5 h-3.5" style={{ color: "#fff" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>
                    {p.title || "Без названия"} — {fmtTracks(p.trackCount)}
                  </div>
                  {p.imported ? (
                    <div className="text-xs mt-1" style={{ color: "#f5be5e" }}>
                      Уже импортировался ранее — при повторном импорте возможны дубликаты
                    </div>
                  ) : null}
                  {hasConflict ? (
                    <div className="mt-3 space-y-2">
                      <div className="text-xs" style={{ color: "#f5b3be" }}>
                        Плейлист с таким названием уже есть в MQ:
                      </div>
                      <div className="flex gap-2">
                        {(["copy", "merge"] as const).map((m) => (
                          <button
                            key={m}
                            onClick={() => setConflictMode(p.kind, m)}
                            className="flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition-colors"
                            style={{
                              minHeight: 44,
                              backgroundColor: mode === m ? "var(--mq-accent, #e03131)" : "var(--mq-overlay-hover, rgba(255,255,255,0.05))",
                              color: mode === m ? "#fff" : "var(--mq-text-muted)",
                              border: `1px solid ${mode === m ? "var(--mq-accent, #e03131)" : "var(--mq-border-thin, rgba(255,255,255,0.08))"}`,
                            }}
                          >
                            {m === "copy" ? "Создать копию" : "Добавить в существующий"}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="rounded-xl px-4 py-3 text-xs leading-relaxed"
        style={{ backgroundColor: "var(--mq-overlay-hover, rgba(255,255,255,0.04))", color: "var(--mq-text-muted)" }}
      >
        {fmtCount(items.length)} · около {fmtTracks(totalTracks)}. MQ найдёт соответствующие треки
        в своём каталоге и сохранит порядок как в Яндекс.Музыке. Спорные и ненайденные треки вы
        увидите в отчёте — неправильные песни не добавляются молча.
      </div>

      {error ? (
        <div
          className="flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm"
          style={{ backgroundColor: "rgba(255,77,79,0.1)", border: "1px solid rgba(255,77,79,0.25)", color: "#ff9b9d" }}
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <button
        onClick={onStart}
        disabled={busy}
        className="w-full flex items-center justify-center gap-2 rounded-2xl font-semibold text-sm transition-all active:scale-[0.98] disabled:opacity-60"
        style={{ height: 48, backgroundColor: "var(--mq-accent, #e03131)", color: "#fff" }}
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListMusic className="w-4 h-4" />}
        Импортировать
      </button>
    </div>
  );
}

// ── Step: progress ────────────────────────────────────────────────────────────

function ProgressStep({
  snapshot,
  error,
  onCancel,
  onRetry,
}: {
  snapshot: SnapshotView | null;
  error: string | null;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const pct = snapshot?.progress.total
    ? Math.min(100, Math.round((snapshot.progress.done / snapshot.progress.total) * 100))
    : 4;
  const phaseLabel =
    snapshot?.phase === "fetching"
      ? "Получаем плейлисты из Яндекс.Музыки…"
      : snapshot?.phase === "matching"
        ? "Подбираем соответствующие треки…"
        : snapshot?.phase === "importing"
          ? "Создаём плейлисты…"
          : "Готовим импорт…";

  const totalTracks = snapshot?.playlists.reduce((a, p) => a + p.trackCount, 0) ?? 0;
  const doneTracks =
    snapshot?.playlists.reduce((a, p) => a + p.matched + p.ambiguous + p.unmatched, 0) ?? 0;
  const current =
    snapshot?.progress.currentTitle ||
    snapshot?.playlists.find((p) => p.status === "matching" || p.status === "fetching")?.title ||
    "";

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>
            {phaseLabel}
          </span>
          <span className="text-sm tabular-nums" style={{ color: "var(--mq-text-muted)" }}>
            {pct}%
          </span>
        </div>
        <div className="h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: "var(--mq-accent, #e03131)" }}
            animate={{ width: `${Math.max(pct, 4)}%` }}
            transition={{ duration: 0.45, ease: "easeOut" }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs" style={{ color: "var(--mq-text-muted)" }}>
          <span className="truncate pr-2">{current}</span>
          <span className="tabular-nums shrink-0">
            {doneTracks} / {totalTracks} треков
          </span>
        </div>
      </div>

      <div className="space-y-1.5">
        {(snapshot?.playlists ?? []).map((p) => (
          <div
            key={p.kind}
            className="flex items-center gap-3 rounded-xl px-3.5 py-2.5"
            style={{ backgroundColor: "var(--mq-card, rgba(255,255,255,0.03))", border: "1px solid var(--mq-border-thin, rgba(255,255,255,0.08))" }}
          >
            {p.status === "imported" ? (
              <Check className="w-4 h-4 shrink-0" style={{ color: "#4cd97b" }} />
            ) : p.status === "failed" ? (
              <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: "#ff6b6e" }} />
            ) : (
              <Loader2 className="w-4 h-4 shrink-0 animate-spin" style={{ color: "var(--mq-text-muted)" }} />
            )}
            <span className="text-sm truncate flex-1" style={{ color: "var(--mq-text)" }}>
              {p.title}
            </span>
            <span className="text-xs tabular-nums shrink-0" style={{ color: "var(--mq-text-muted)" }}>
              {p.status === "imported"
                ? `${p.matched} ✓`
                : p.status === "failed"
                  ? "ошибка"
                  : `${p.matched + p.ambiguous + p.unmatched}/${p.trackCount}`}
            </span>
          </div>
        ))}
      </div>

      {error ? (
        <div className="space-y-3">
          <div
            className="flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm"
            style={{ backgroundColor: "rgba(255,77,79,0.1)", border: "1px solid rgba(255,77,79,0.25)", color: "#ff9b9d" }}
          >
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="flex-1">{error}</span>
          </div>
          <button
            onClick={onRetry}
            className="w-full flex items-center justify-center gap-2 rounded-2xl font-semibold text-sm transition-all active:scale-[0.98]"
            style={{ height: 48, backgroundColor: "var(--mq-accent, #e03131)", color: "#fff" }}
          >
            <RefreshCw className="w-4 h-4" />
            Повторить
          </button>
        </div>
      ) : null}

      {snapshot?.status === "failed" ? (
        <div
          className="flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm"
          style={{ backgroundColor: "rgba(255,77,79,0.1)", border: "1px solid rgba(255,77,79,0.25)", color: "#ff9b9d" }}
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Импорт прерван из-за ошибки. Уже созданные плейлисты сохранены.</span>
        </div>
      ) : null}

      <button
        onClick={onCancel}
        className="w-full flex items-center justify-center gap-2 rounded-2xl text-sm font-medium transition-colors"
        style={{ height: 48, color: "var(--mq-text-muted)", backgroundColor: "var(--mq-overlay-hover, rgba(255,255,255,0.05))" }}
      >
        <X className="w-4 h-4" />
        {error ? "Закрыть" : "Отменить импорт"}
      </button>
    </div>
  );
}

// ── Step: done (report) ───────────────────────────────────────────────────────

function DoneStep({
  snapshot,
  detail,
  onResolve,
  onClose,
}: {
  snapshot: SnapshotView | null;
  detail: { snapshot: SnapshotView; playlists: DetailPlaylist[] } | null;
  onResolve: (kind: number, position: number, track: Track) => void;
  onClose: () => void;
}) {
  const report = detail?.snapshot.report ?? snapshot?.report ?? null;
  const playlists = detail?.playlists ?? [];

  const ambiguous = playlists.flatMap((p) =>
    p.matches
      .filter((m) => m.status === "ambiguous")
      .map((m) => ({ ...m, kind: p.kind, playlistTitle: p.title }))
  );
  const unmatched = playlists.flatMap((p) =>
    p.matches
      .filter((m) => m.status === "unmatched")
      .map((m) => ({ ...m, kind: p.kind, playlistTitle: p.title }))
  );
  const matched = playlists.flatMap((p) =>
    p.matches
      .filter((m) => m.status === "matched" || m.status === "resolved")
      .map((m) => ({ ...m, kind: p.kind }))
  );
  const failedPlaylists = playlists.filter((p) => p.error);

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div
        className="rounded-2xl p-5 space-y-2.5"
        style={{ backgroundColor: "var(--mq-card, rgba(255,255,255,0.03))", border: "1px solid var(--mq-border-thin, rgba(255,255,255,0.08))" }}
      >
        {report ? (
          <>
            <ReportRow ok icon={<Check className="w-4 h-4" />} text={`${fmtCount(report.playlistsImported)} импортировано`} />
            {report.playlistsFailed > 0 ? (
              <ReportRow ok={false} icon={<AlertTriangle className="w-4 h-4" />} text={`${fmtCount(report.playlistsFailed)} с ошибками`} />
            ) : null}
            <ReportRow ok icon={<Check className="w-4 h-4" />} text={`${fmtTracks(report.tracksFound)} найдено в Яндекс.Музыке`} />
            <ReportRow ok icon={<Check className="w-4 h-4" />} text={`${fmtTracks(report.tracksImported)} импортировано`} />
            {report.tracksAmbiguous > 0 ? (
              <ReportRow ok={false} warn icon={<AlertTriangle className="w-4 h-4" />} text={`${fmtTracks(report.tracksAmbiguous)} требуют выбора (ниже)`} />
            ) : null}
            {report.tracksUnmatched > 0 ? (
              <ReportRow ok={false} warn icon={<AlertTriangle className="w-4 h-4" />} text={`${fmtTracks(report.tracksUnmatched)} не найдено`} />
            ) : null}
            {report.duplicates > 0 ? (
              <ReportRow ok warn={false} icon={<Copy className="w-4 h-4" />} text={`${fmtTracks(report.duplicates)} повторов сохранено (как в оригинале)`} />
            ) : null}
            {report.skippedExisting > 0 ? (
              <ReportRow ok icon={<Check className="w-4 h-4" />} text={`${fmtTracks(report.skippedExisting)} уже были в плейлисте — пропущены`} />
            ) : null}
          </>
        ) : (
          <ReportRow ok icon={<Check className="w-4 h-4" />} text="Импорт завершён" />
        )}
      </div>

      {/* Created playlists */}
      {report?.createdPlaylists?.length ? (
        <div className="space-y-1.5">
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--mq-text-muted)" }}>
            Созданные плейлисты
          </div>
          {report.createdPlaylists.map((cp) => (
            <div
              key={cp.playlistId}
              className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm"
              style={{ backgroundColor: "var(--mq-card, rgba(255,255,255,0.03))", color: "var(--mq-text)" }}
            >
              <ListMusic className="w-4 h-4 shrink-0" style={{ color: "var(--mq-accent, #e03131)" }} />
              <span className="truncate">{cp.name}</span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Failed playlists */}
      {failedPlaylists.length > 0 ? (
        <div className="space-y-1.5">
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#ff9b9d" }}>
            Не импортированы
          </div>
          {failedPlaylists.map((p) => (
            <div
              key={p.kind}
              className="rounded-xl px-3.5 py-2.5 text-sm"
              style={{ backgroundColor: "rgba(255,77,79,0.08)", color: "#ff9b9d" }}
            >
              <div className="font-medium">{p.title}</div>
              <div className="text-xs mt-0.5">{p.error}</div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Ambiguous: manual resolution */}
      {ambiguous.length > 0 ? (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#f5b3be" }}>
            Не удалось уверенно найти — выберите вариант
          </div>
          {ambiguous.slice(0, 40).map((m) => (
            <div
              key={`${m.kind}-${m.position}`}
              className="rounded-2xl p-3.5 space-y-2.5"
              style={{ backgroundColor: "var(--mq-card, rgba(255,255,255,0.03))", border: "1px solid var(--mq-border-thin, rgba(255,255,255,0.08))" }}
            >
              <div className="text-sm" style={{ color: "var(--mq-text)" }}>
                {m.yandexArtists.join(", ")} — {m.yandexTitle}
                <span className="text-xs ml-2" style={{ color: "var(--mq-text-muted)" }}>
                  {fmtDuration(m.yandexDurationSec)}
                </span>
              </div>
              <div className="space-y-1.5">
                {(m.candidates ?? []).map((c, i) => (
                  <button
                    key={c.id}
                    onClick={() => onResolve(m.kind, m.position, c)}
                    className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors active:scale-[0.99]"
                    style={{
                      backgroundColor: "var(--mq-overlay-hover, rgba(255,255,255,0.04))",
                      border: "1px solid var(--mq-border-thin, rgba(255,255,255,0.08))",
                      minHeight: 44,
                    }}
                  >
                    {c.cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.cover} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" loading="lazy" />
                    ) : (
                      <div className="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
                        <ListMusic className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
                      </div>
                    )}
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm truncate" style={{ color: "var(--mq-text)" }}>
                        {c.artist} — {c.title}
                      </span>
                      <span className="block text-xs" style={{ color: "var(--mq-text-muted)" }}>
                        {fmtDuration(c.duration)} · вариант {i + 1}
                      </span>
                    </span>
                    <Check className="w-4 h-4 shrink-0" style={{ color: "#4cd97b" }} />
                  </button>
                ))}
                {!m.candidates?.length ? (
                  <div className="text-xs px-1" style={{ color: "var(--mq-text-muted)" }}>
                    Кандидатов нет
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          {ambiguous.length > 40 ? (
            <div className="text-xs px-1" style={{ color: "var(--mq-text-muted)" }}>
              …и ещё {ambiguous.length - 40} спорных треков
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Unmatched */}
      {unmatched.length > 0 ? (
        <div className="space-y-1.5">
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--mq-text-muted)" }}>
            Не найдено ({fmtTracks(unmatched.length)})
          </div>
          <div
            className="rounded-2xl p-3.5 space-y-1.5 max-h-52 overflow-y-auto"
            style={{ backgroundColor: "var(--mq-card, rgba(255,255,255,0.03))" }}
          >
            {unmatched.slice(0, 100).map((m) => (
              <div key={`${m.kind}-${m.position}`} className="text-sm truncate" style={{ color: "var(--mq-text-muted)" }}>
                {m.yandexArtists.join(", ")} — {m.yandexTitle}
              </div>
            ))}
            {unmatched.length > 100 ? (
              <div className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
                …и ещё {unmatched.length - 100}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Matched preview (compact) */}
      {matched.length > 0 ? (
        <details>
          <summary
            className="text-xs font-semibold uppercase tracking-wide cursor-pointer select-none"
            style={{ color: "var(--mq-text-muted)" }}
          >
            Импортированные треки ({matched.length})
          </summary>
          <div
            className="mt-2 rounded-2xl p-3.5 space-y-1.5 max-h-64 overflow-y-auto"
            style={{ backgroundColor: "var(--mq-card, rgba(255,255,255,0.03))" }}
          >
            {matched.slice(0, 200).map((m) => (
              <div key={`${m.kind}-${m.position}`} className="text-sm truncate" style={{ color: "var(--mq-text-muted)" }}>
                {m.yandexArtists.join(", ")} — {m.yandexTitle}
                {m.mqTrack ? <span style={{ color: "#4cd97b" }}> ✓</span> : null}
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <button
        onClick={onClose}
        className="w-full flex items-center justify-center gap-2 rounded-2xl font-semibold text-sm transition-all active:scale-[0.98]"
        style={{ height: 48, backgroundColor: "var(--mq-accent, #e03131)", color: "#fff" }}
      >
        <Check className="w-4 h-4" />
        Готово
      </button>
    </div>
  );
}

function ReportRow({
  ok,
  warn,
  icon,
  text,
}: {
  ok: boolean;
  warn?: boolean;
  icon: React.ReactNode;
  text: string;
}) {
  const color = ok && !warn ? "#4cd97b" : warn ? "#f5b3be" : "var(--mq-text-muted)";
  return (
    <div className="flex items-center gap-2.5 text-sm" style={{ color: "var(--mq-text)" }}>
      <span style={{ color }}>{icon}</span>
      <span>{text}</span>
    </div>
  );
}
