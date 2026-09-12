# Phase 4B — SECOND DEEP VISUAL REDESIGN «Тихая редакция» (Quiet Editorial)

## Task ID: 4B
Agent: main (Super Z)
Repo: /home/z/my-project/mq-player (GitHub main → Vercel → mq1.vercel.app)

## Design language (globals.css Phase 4B foundation)
- Surface ladder: --mq-surface-1 (#151517) / surface-2 (#1b1b1e); depth = border + spacing + typography, NOT blur/glow
- Radius scale: --mq-r-card 12 / card-lg 16 / art 10 — one card radius, one artwork radius
- Hairline edges: --mq-edge 7% / edge-strong 12% / edge-hover 14%
- Elevation only for genuinely floating surfaces: --mq-elev-dialog, --mq-elev-bar
- Artwork depth: --mq-art-edge (inner hairline) + --mq-art-shadow (grounded), no bloom
- Type voices: .mq-t-display (Playfair serif — greetings/hero/empty titles), .mq-t-title, .mq-t-meta, .mq-t-num (mono tabular)
- Unified patterns: .mq-row (list row: hover surface, active = accent tint + 2px bar), .mq-card-track (card row, ~1500 instances), .mq-section-head (serif section titles + mono counts), .mq-empty (dashed quiet empty state), .mq-art, .mq-play-overlay (solid accent circle)
- Removed keyframes mqBreathe / mqPulseTint (infinite pulsing on active cards)

## Structural changes (the 5+ majors)
1. TrackCard rewritten to .mq-card-track: killed blur(16-20px) ambient glow layer, border glow ring, mqBreathe accent bar, mqPulseTint tint, magnetic 3D tilt (useTilt3D), glass play button (backdrop-blur), EQ glow stack. Active = tint + static bar + flat white eq.
2. Home: RecHero (giant featured card) removed — lead card = first card of first strip (editorial lead column, featured 232px vs 160px); Section rhythm unified (mq-section-head, serif titles); Wave hero gradient halved saturation; mobile blurred-cover backdrop removed.
3. NavBar rebuilt: glass blur(32px) saturate(200%) → solid surface-1 + hairline; glow shadows + inset highlights gone; scale/y hover hops gone; segmented tab nav (active = bg surface + accent text, no floating pill); notification bell ADDED (re-wires orphaned NotificationPanel).
4. Search rebuilt: display-serif page header; search input surface+hairline (no 16px radius glow ring); genre chips = quiet pills (no accent-tint gradients per genre, no scale hops); results header = real section head (serif "Результаты" + mono count); SearchTrackRow = .mq-row + a11y (role/tabIndex/Enter/Space); empty state = .mq-empty (floating dots + gradient icon box removed); suggestions dropdown solid surface.
5. QueueView: panel surface-1 + edge + elev-dialog; header serif + mono count; NowPlayingCard = .mq-card-track data-active (accent tint + bar + flat eq — current track unambiguous); HistoryTrackItem = .mq-row; sortable items quiet; DragOverlayCard de-glowed; empty state unified.
6. FullTrackView: artwork shadow premium-lg → art token; seek chip solid (no blur); More menu solid surface (no 20px blur); play button flat accent (glow removed); queue/history/lyrics panels = surface + edge; panel rows = .mq-row + .mq-art.
7. FullTrackViewMobile: serif display title; play button flat; playlist sheet + bottom sheet surfaces unified.
8. PlayerBar: docked surface solid (blur 16px gone) + elev-bar; cover art token + quiet fallback; play flat; Up-Next tooltip + More menu solid surface.
9. ProfileView de-admin: gradient banner + avatar triple-glow ring removed; tinted icon-boxes (accent 12% squares) → quiet surface-2 + plain icons; stats numbers mono tabular; username serif; cards unified.
10. SettingsView control center: tab bar solid (blur 20px gone, tab glow gone, scale hovers gone); Card primitive quiet; CardTitle plain icon; SettingRow/SettingToggle icon boxes quiet (accent only when ON/danger); avatar gradient ring removed; Telegram row glow removed.
11. NotificationPanel: quiet editorial sheet (serif title, mono count, .mq-row items, .mq-empty state); re-wired via NavBar bell (was orphaned — store state + API existed, no trigger).
12. EmptyState component: breathing scale[1,1.05,1]∞ animation REMOVED → .mq-empty static pattern app-wide.

## Social + lists
- FriendsView: dialog blur(8px) scrim → plain; online dot glow removed; dialog surface unified
- MessengerView: scrim de-blurred
- MessageBubble: reaction picker blur(16px)+glass → solid surface + elev-dialog
- HistoryView: sticky day header blur(16px) → solid; accent icon-box → plain icon
- LibraryView: tab indicator glow removed

## Dead code removed (13 files, never mounted)
SideVisuals, ArtistCard, AnimatedGradientBg, LikeBurst, CinematicAtmosphere, CursorParticleField, SeasonalEffects, VisualizerCanvas, SongDNA, DNAHelixVisual, TrackCanvas, SynthVisualizerView, TrackCommentsPanel

## Process notes
- CRITICAL discovery: dev.sh serves the OUTER wrapper (/home/z/my-project/src), not the repo — earlier screenshots showed stale UI until full rsync mq-player/src → src + SW unregister + chunk cache clear. AFTER screenshots (27, 1440×900 + 390×844) captured with the real code.
- Dev-server OOMs when compiling many routes from the nested repo (cgroup ~2GB) — used outer mirror for dev verification, nested repo for tsc/lint/test/build.
- VLM BEFORE/AFTER reviews: 8-9/10 on Search/FullPlayer/Settings/Profile; main notes addressed (Settings "Открыть" truncation, Profile badge contrast, badge 10px→11px).
- Track duration-s] typo (Tailwind) in RecCard fixed.

## Verification
- npx tsc --noEmit: 0 errors
- npm test: 226/226 pass (1 file-load failure pre-existing: @upstash/redis not installed, untouched by 4B)
- eslint on modified files: 0 new errors (net −8 problems vs baseline)
- npm run build: success
- Browser smoke: play→pause→seek→fullplayer→queue panel→search (78 rows)→library→bell — all green; console shows only pre-existing key/nested-button warnings

## Deploy + production verification
- Commit c48aec3 pushed to GitHub main → Vercel auto-deploy READY
- Production CSS bundle verified: mq-card-track/mq-t-display/mq-surface-1/mq-row/mq-empty/mq-play-overlay present; mqBreathe/mqPulseTint absent (keyframes deleted)
- Production smoke (mq1.vercel.app): NavBar 8 buttons incl. bell · track card click → resolveStream progressive (real CDN) · pause→play toggle · full player opens · queue panel opens (current track accented) · search "daft punk" 79 rows · bell/notifications, profile, settings, messenger all reachable
- Console: 0 NEW runtime errors (19 pre-existing React key/nested-button warnings, unchanged)
- VLM production verdict: "highly polished, mature product... intentional and sophisticated... cohesive and premium"
- VLM nitpick applied in 37aa6c0: Wave hero play button 56→48px + quieter white; second deploy verified live

---

# Phase WASM — Rust/WASM Audio Engine (Task 5)

## What shipped (commit 51c937b)

Full production WASM playback pipeline per AUDIO_ENGINE_ARCHITECTURE.md:

```
HTMLMediaElement path (unchanged, fallback)      WasmAudioBackend (new)
  HLS → hls.js → MSE → EME (DRM)                  progressive non-DRM:
  progressive → /api proxy → element                 fetch(Range) → codec_wasm (Symphonia)
                                                     → MessagePort PCM → audio_wasm (DSP)
                                                     → AudioWorklet → destination
```

- **Rust**: 7-crate workspace, 66 tests, flat C-ABI (mq_*/mq_dec_*), SIMD128, panic=abort, LTO
- **JS**: worklet (in-scope wasm compile, ring, credits, stats, JS timing) + worker (Range fetch, decode, backpressure)
- **TS**: src/lib/wasm-audio — manifest bootstrap, decision gate, backend, diagnostics (window.__mqWasmAudio)
- **App**: wasm-first for SC-progressive/Audius/demo; HLS/DRM/rate≠1 stay element; automatic fallback on ANY failure; settings toggle; seek routed everywhere
- **Versioning**: 4-artifact content-hash tag → immutable URLs; version.json always network; runtime ABI check (WASM_VERSION_MISMATCH)

## Production verification (mq1.vercel.app, tag 5f6658-53a483-a5c7f2)

- audio_wasm.wasm 200 application/wasm immutable; codec 200; worklet/worker 200; version.json 200 must-revalidate; Range 206
- Real SC track: backend=wasm, frames 33986, underruns 0, overruns 0, simd=1, 44100/44100
- avg DSP ~53µs/block (headless Date.now coarse; prod browsers get µs via performance.now)
- seek/pause/resume/next/prev/progress all green; console 100% clean
- gzip: core 150KB, codec 345KB

## Bugs found & fixed (root causes)

1. WebAssembly.Module: not transferable (worker postMessage transfer list) → clone; not cloneable to AudioWorklet ports → raw bytes + in-worklet compile
2. Tag didn't hash worklet/worker JS → immutable cache served stale JS under same URL → tag = hash of all 4 artifacts
3. instantiate(bytes) returns {module, instance} — destructure
4. onNodeMessage missing 'ready' case → init timeout
5. dec handle 0 is falsy — !dec guard killed the pump (dec === null check now)
6. performance undefined in (headless) worklet scope → Date.now fallback
7. Rust: pause drained ring (audio kept playing ≤ring); pop_pcm didn't re-trigger decode (tail loss); Vec alloc in process hot path

## v1 limitations (honest)

- Seek = CBR byte estimate (±1-2s VBR); ~100ms refetch gap
- No crossfade/gapless on the wasm path (element path only)
- playbackRate ≠ 1 → element path (no time-stretch)
- Insert-mode DSP for HLS non-DRM = future work
- COOP/COEP not needed (MessagePort + Transferable baseline)
