/**
 * updateManager.ts — Phase M: Smart Deployment Update system (core).
 *
 * Detects new production deployments and lets the USER choose when to update.
 *
 * Detection model:
 *   page buildId  = window.__NEXT_DATA__.buildId  (what THIS page runs)
 *   deployed      = /version.json  (no-store — always revalidated)
 *   different     → UpdateAvailable → banner → user presses «Обновить»
 *
 * Guarantees (Phase M spec):
 * - #39/#24: version checks are plain fetch()s — they NEVER touch the audio
 *   realtime path (no AudioWorklet/decoder/queue interruption).
 * - #47: NO automatic reload on detection. Reload happens only from
 *   applyUpdate() (user action) or bounded recovery after it.
 * - #31: state machine current|checking|available|updating|updated|failed.
 * - #29/#30: BroadcastChannel('mq-update') syncs all tabs; one tab detects →
 *   all show the same state; one coordinated reload (no banner/reload loops).
 * - #33: after reload, verify new build actually loaded; max 3 recovery
 *   attempts, then a visible «Не удалось — Повторить» state. No infinite loop.
 * - #38: version.json is fetched with cache:'no-store' and bypassed by the
 *   Service Worker; hashed chunks stay immutable.
 */

export type UpdateState =
  | "current"
  | "checking"
  | "available"
  | "updating"
  | "updated"
  | "failed";

export interface VersionInfo {
  version: string;
  buildId: string;
  commit?: string;
  releasedAt?: string;
}

export interface UpdateManagerOptions {
  fetchImpl?: typeof fetch;
  broadcastFactory?: () => BroadcastChannelLike | null;
  /** Called right before the update reload — persists playback snapshot. */
  onBeforeReload?: () => void;
  /** Base polling interval (default 10 min, spec allows 5–15). */
  intervalMs?: number;
  /** Startup check delay (default 12s — app boots first, update check later). */
  initialDelayMs?: number;
  /** Injectable reload (tests, Capacitor webview overrides). */
  reloadImpl?: () => void;
}

/** Minimal BroadcastChannel surface (testable without a real browser). */
export interface BroadcastChannelLike {
  postMessage(data: unknown): void;
  addEventListener(type: "message", listener: (ev: { data: unknown }) => void): void;
  removeEventListener(type: "message", listener: (ev: { data: unknown }) => void): void;
  close(): void;
}

// ── Storage keys (namespaced; NEVER touch user data keys) ──
const K_DISMISSED = "mq-update-dismissed"; // sessionStorage: buildId user postponed
const K_ATTEMPTS = "mq-update-attempts"; // sessionStorage: bounded recovery counter
const K_RELOADING = "mq-update-reloading"; // sessionStorage: one-shot reload guard
const CHANNEL = "mq-update";

const CHUNK_ERROR_PATTERNS = [
  "Failed to load chunk",
  "Loading chunk",
  "Loading CSS chunk",
  "ChunkLoadError",
  "Failed to fetch dynamically imported module",
  "Importing a module script failed",
  "error loading dynamically imported module",
];

export function isChunkLoadErrorMessage(msg: string): boolean {
  return CHUNK_ERROR_PATTERNS.some((p) => msg.includes(p));
}

interface ManagerState {
  state: UpdateState;
  info: VersionInfo | null; // latest deployed version info
  error: string | null;
  /** buildId of the deployment the banner is currently offering */
  availableBuildId: string | null;
}

type Listener = (s: ManagerState) => void;

class UpdateManager {
  private state: ManagerState = {
    state: "current",
    info: null,
    error: null,
    availableBuildId: null,
  };
  private listeners = new Set<Listener>();
  private opts: Required<Pick<UpdateManagerOptions, "intervalMs" | "initialDelayMs">> &
    UpdateManagerOptions;
  private _channel: BroadcastChannelLike | null | undefined = undefined; // undefined = not yet created
  private started = false;
  private lastCheckAt = 0;
  private checkTimer: ReturnType<typeof setInterval> | null = null;
  private initialTimer: ReturnType<typeof setTimeout> | null = null;
  /** reload armed by applyUpdate — controllerchange only reloads when true */
  private reloadArmed = false;

  constructor(opts: UpdateManagerOptions = {}) {
    this.opts = {
      intervalMs: 10 * 60 * 1000,
      initialDelayMs: 12_000,
      ...opts,
    };
  }

  /** Lazy channel creation — works with or without start() (tests call checkNow directly). */
  private get channel(): BroadcastChannelLike | null {
    if (this._channel !== undefined) return this._channel;
    try {
      this._channel =
        this.opts.broadcastFactory?.() ??
        (typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL) : null);
    } catch {
      this._channel = null;
    }
    return this._channel;
  }

  // ── Public API ──

  getState(): ManagerState {
    return { ...this.state };
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  /** Page's own build id — NEXT_PUBLIC_MQ_BUILD_ID is inlined into the client
   *  bundle at build time (App Router has no __NEXT_DATA__.buildId — that's
   *  Pages Router only; the __NEXT_DATA__ fallback keeps tests/simple pages working). */
  getCurrentBuildId(): string | null {
    try {
      const inlined = (process.env as { NEXT_PUBLIC_MQ_BUILD_ID?: string })
        .NEXT_PUBLIC_MQ_BUILD_ID;
      const nd = (globalThis as { __NEXT_DATA__?: { buildId?: string } }).__NEXT_DATA__;
      const id = inlined || nd?.buildId;
      if (!id || id === "development") return null; // dev server — no deployment semantics
      return id;
    } catch {
      return null;
    }
  }

  /** Boot the manager: initial check, interval, visibility/focus revalidation,
   *  multi-tab channel, chunk-error detection, post-update recovery verify. */
  start(): void {
    if (this.started) return;
    if (typeof window === "undefined") return; // SSR guard — never run during prerender
    this.started = true;

    // Multi-tab: one tab finds an update → every tab shows the same state.
    this.channel?.addEventListener("message", (ev) => this.onChannelMessage(ev.data));

    // Coordinated reload: a tab only reloads on SW controllerchange if it
    // knows an update is in progress (it applied it or saw 'update-started').
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!this.reloadArmed) return; // #47: no reload without user intent
        this.reloadNow();
      });
    }

    // Scheduled checks
    this.initialTimer = setTimeout(() => this.checkNow("initial"), this.opts.initialDelayMs);
    this.checkTimer = setInterval(() => this.checkNow("interval"), this.opts.intervalMs);

    // Revalidate when the tab becomes visible / focused again (throttled to
    // 2 min — no aggressive polling, #21)
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") this.checkNow("visibility");
    });
    window.addEventListener("focus", () => this.checkNow("focus"), { passive: true });

    // Stale-chunk detection: mixed old-JS/new-server → immediate version check (#28)
    window.addEventListener("error", (ev) => {
      const msg = (ev as ErrorEvent).message || "";
      if (isChunkLoadErrorMessage(msg)) this.checkNow("chunk-error");
    });
    window.addEventListener("unhandledrejection", (ev) => {
      const msg = String((ev as PromiseRejectionEvent)?.reason || "");
      if (isChunkLoadErrorMessage(msg)) this.checkNow("chunk-error");
    });

    // Post-update recovery: did the reload actually land on the new build?
    this.verifyAfterReload();
  }

  stop(): void {
    if (this.initialTimer) clearTimeout(this.initialTimer);
    if (this.checkTimer) clearInterval(this.checkTimer);
    this._channel?.close();
    this._channel = undefined;
    this.started = false;
  }

  /** Check /version.json (always no-store) and compare to the page build. */
  async checkNow(reason: string): Promise<void> {
    if (typeof window === "undefined") return;
    const pageBuild = this.getCurrentBuildId();
    if (!pageBuild) return; // dev / no build id — nothing to compare

    // Throttle revalidation-triggered checks (interval ticks are exempt)
    const now = Date.now();
    if (reason !== "interval" && now - this.lastCheckAt < 120_000) return;
    this.lastCheckAt = now;

    this.setState({ state: "checking" });
    try {
      const doFetch = this.opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
      const res = await doFetch("/version.json?_=" + now, { cache: "no-store" });
      if (!res.ok) throw new Error("version endpoint " + res.status);
      const info = (await res.json()) as VersionInfo;
      if (!info || typeof info.buildId !== "string") throw new Error("malformed version.json");

      if (info.buildId === pageBuild) {
        // Fresh build. Clear recovery counter and any stale banner state.
        this.clearAttempts();
        if (this.state.state !== "updating") {
          this.setState({ state: "current", info, error: null, availableBuildId: null });
        }
        return;
      }

      // New deployment on the server.
      if (this.state.state === "updating" || this.state.state === "updated") return; // already handling
      const dismissed = this.readDismissed();
      if (dismissed === info.buildId) {
        // User said «Позже» for THIS build — keep quiet this session (#32 UX)
        this.setState({ state: "current", info, error: null, availableBuildId: null });
        return;
      }
      this.setState({ state: "available", info, error: null, availableBuildId: info.buildId });
      // Tell other tabs (receivers do NOT re-broadcast → no loop, #30)
      this.channel?.postMessage({ type: "update-available", info });
    } catch {
      // Offline / endpoint error — stay on current, never break the app (#31 Failed → recoverable)
      if (this.state.state === "available" || this.state.state === "updating") return;
      this.setState({ state: "current", error: null });
    }
  }

  /** User pressed «Обновить»: snapshot state → SW update → safe reload. */
  async applyUpdate(): Promise<void> {
    if (this.state.state === "updating") return;
    this.setState({ state: "updating", error: null });
    // All tabs show «Обновление…» — one banner state, one coordinated reload
    this.channel?.postMessage({ type: "update-started" });

    try {
      // 1. Persist user context BEFORE any reload (#25)
      this.opts.onBeforeReload?.();

      // 2. Arm the controllerchange reload (this tab reloads when the new
      //    SW takes control; other tabs arm via 'update-started')
      this.reloadArmed = true;

      // 3. Ask the (single, existing) Service Worker to update + activate
      await this.activateNewServiceWorker();

      // 4. Reload. controllerchange may already have done it — reloadNow is
      //    one-shot guarded, so this is at most ONE reload per update.
      this.reloadNow();
    } catch {
      // #31 Failed: show error + retry, app keeps working
      this.reloadArmed = false;
      this.setState({
        state: "failed",
        error: "Не удалось обновить. Проверьте соединение и повторите.",
      });
      this.channel?.postMessage({ type: "update-failed" });
    }
  }

  /** User pressed «Позже»: keep session on current build, quietly. */
  dismiss(): void {
    const id = this.state.availableBuildId ?? this.state.info?.buildId ?? null;
    if (id) {
      try {
        sessionStorage.setItem(K_DISMISSED, id);
      } catch {}
    }
    this.setState({ state: "current", availableBuildId: null });
  }

  // ── Internals ──

  private setState(patch: Partial<ManagerState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => {
      try {
        l(this.getState());
      } catch {}
    });
  }

  private onChannelMessage(data: unknown): void {
    if (!data || typeof data !== "object") return;
    const msg = data as { type?: string; info?: VersionInfo };
    if (msg.type === "update-available" && msg.info) {
      if (this.state.state === "updating" || this.state.state === "updated") return;
      // Receive-only: do NOT broadcast again (loop prevention)
      this.setState({ state: "available", info: msg.info, error: null, availableBuildId: msg.info.buildId });
    } else if (msg.type === "update-started") {
      if (this.state.state !== "updating") {
        this.setState({ state: "updating", error: null });
      }
      // Synchronized reload: arm this tab too (single reload, all tabs together)
      this.reloadArmed = true;
    } else if (msg.type === "update-failed") {
      if (this.state.state === "updating") {
        this.setState({ state: "failed", error: "Не удалось обновить." });
      }
    }
  }

  private async activateNewServiceWorker(): Promise<void> {
    if (!("serviceWorker" in navigator)) return; // no SW → plain reload path
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return;
      await reg.update(); // fetch new sw.js from the server
      if (reg.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
        // sw.js also calls skipWaiting() on install; give the handover a moment
        await new Promise((r) => setTimeout(r, 400));
      }
    } catch {
      // SW update failed — fall through to plain reload (still correct).
    }
  }

  private reloadNow(): void {
    try {
      if (sessionStorage.getItem(K_RELOADING)) return; // one-shot guard
      sessionStorage.setItem(K_RELOADING, "1");
    } catch {}
    (this.opts.reloadImpl ?? (() => window.location.reload()))();
  }

  /** #33 Recovery: after reload, verify the new build actually loaded.
   *  Bounded to 3 attempts — then a visible failure state, never a loop. */
  private async verifyAfterReload(): Promise<void> {
    try {
      if (!sessionStorage.getItem(K_RELOADING)) return; // this boot wasn't an update reload
      sessionStorage.removeItem(K_RELOADING);
    } catch {
      return;
    }
    const pageBuild = this.getCurrentBuildId();
    if (!pageBuild) return;
    try {
      const doFetch = this.opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
      const res = await doFetch("/version.json?_=" + Date.now(), { cache: "no-store" });
      if (!res.ok) return;
      const info = (await res.json()) as VersionInfo;
      if (info.buildId === pageBuild) {
        // New build is live. Clear attempts; UI resumes; snapshot restore
        // (updateSnapshot.ts) runs independently in AppShell.
        this.clearAttempts();
        this.setState({ state: "updated", info });
        // 'updated' → UI can show a brief confirmation; state settles to current
        setTimeout(() => {
          if (this.state.state === "updated") this.setState({ state: "current" });
        }, 3000);
        return;
      }
      // Still serving the OLD build → bounded retry (user already asked to update)
      const attempts = this.bumpAttempts();
      if (attempts < 3) {
        setTimeout(() => {
          void this.applyUpdate();
        }, 1500);
      } else {
        this.clearAttempts();
        this.setState({
          state: "failed",
          info,
          error: "Обновление не применилось. Попробуйте ещё раз.",
        });
      }
    } catch {
      // Offline right after reload — leave as current; interval will re-check.
    }
  }

  private readDismissed(): string | null {
    try {
      return sessionStorage.getItem(K_DISMISSED);
    } catch {
      return null;
    }
  }

  private bumpAttempts(): number {
    try {
      const n = parseInt(sessionStorage.getItem(K_ATTEMPTS) || "0", 10) || 0;
      sessionStorage.setItem(K_ATTEMPTS, String(n + 1));
      return n + 1;
    } catch {
      return 99; // storage blocked → treat as exceeded, never loop
    }
  }

  private clearAttempts(): void {
    try {
      sessionStorage.removeItem(K_ATTEMPTS);
    } catch {}
  }
}

// ── Singleton for the app (tests construct their own instances) ──
let singleton: UpdateManager | null = null;

export function getUpdateManager(onBeforeReload?: () => void): UpdateManager {
  if (!singleton) {
    singleton = new UpdateManager({ onBeforeReload });
  }
  return singleton;
}

export { UpdateManager };
