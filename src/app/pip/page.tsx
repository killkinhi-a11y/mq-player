"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, X } from "lucide-react";

/**
 * /pip — standalone PiP page opened as a new tab/window.
 *
 * Communicates with the main app via BroadcastChannel + window.opener.
 * This page NEVER gets blocked by popup blockers since it's
 * opened as regular navigation (window.open('/pip')).
 */

interface PiPState {
  title: string;
  artist: string;
  cover: string | null;
  isPlaying: boolean;
  progress: number;
  duration: number;
  volume: number;
  progressPct: number;
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ":" + (s < 10 ? "0" : "") + s;
}

const INITIAL: PiPState = {
  title: "MQ Player",
  artist: "",
  cover: null,
  isPlaying: false,
  progress: 0,
  duration: 0,
  volume: 70,
  progressPct: 0,
};

export default function PiPPage() {
  const [st, setSt] = useState<PiPState>(INITIAL);
  const chRef = useRef<BroadcastChannel | null>(null);
  const syncRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // BroadcastChannel for cross-tab communication
    try {
      const ch = new BroadcastChannel("mq-pip");
      chRef.current = ch;
      ch.onmessage = (e) => {
        if (e.data?.type === "pip-state") setSt(e.data.state);
      };
      ch.postMessage({ type: "pip-ready" });
    } catch { /* not supported */ }

    // Poll via window.opener for same-origin direct access
    syncRef.current = setInterval(() => {
      try {
        const opener = window.opener as any;
        if (!opener || opener.closed) { window.close(); return; }
        if (opener.__mqPipGetState) {
          const state = opener.__mqPipGetState();
          if (state) setSt(state);
        }
      } catch { /* */ }
    }, 500);

    return () => {
      chRef.current?.close();
      if (syncRef.current) clearInterval(syncRef.current);
    };
  }, []);

  const sendAction = useCallback((action: string, value?: any) => {
    chRef.current?.postMessage({ type: "pip-action", action, value });
    try {
      const opener = window.opener as any;
      if (opener && !opener.closed && opener.__mqPipAction) {
        opener.__mqPipAction(action, value);
      }
    } catch { /* */ }
  }, []);

  const pct = st.duration > 0 ? (st.progress / st.duration) * 100 : 0;
  const safePct = isNaN(pct) ? 0 : Math.max(0, Math.min(100, pct));

  return (
    <html lang="ru">
      <head>
        <meta charSet="utf-8" />
        <title>MQ Player</title>
      </head>
      <body style={{
        margin: 0, padding: 0, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        background: '#0e0e0e', overflow: 'hidden', userSelect: 'none', WebkitUserSelect: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh',
      }}>
        <div style={{ width: 360, maxWidth: '100vw', position: 'relative' }}>
          {/* Glow */}
          <div style={{ position: 'absolute', inset: -2, background: '#e03131', opacity: .12, filter: 'blur(10px)', borderRadius: 18, pointerEvents: 'none' }} />
          {/* Card */}
          <div style={{ position: 'relative', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 16, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,.4), 0 0 16px rgba(224,49,49,.3)' }}>
            {/* Drag handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px', cursor: 'grab' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: '#2a2a2a', opacity: .6 }} />
            </div>
            {/* Content */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 14px' }}>
              <div>
                {st.cover
                  ? <img src={st.cover} alt="" style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover' }} />
                  : <div style={{ width: 56, height: 56, borderRadius: 12, background: '#e03131', opacity: .4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: '#fff' }}>&#9835;</div>
                }
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3 }}>{st.title}</div>
                <div style={{ fontSize: 11, color: '#888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2, marginTop: 2 }}>{st.artist}</div>
              </div>
              {/* EQ bars */}
              <div style={{ display: st.isPlaying ? 'flex' : 'none', alignItems: 'flex-end', gap: 2, height: 20, opacity: .6 }}>
                {[0, 1, 2].map(i => (
                  <span key={i} style={{ width: 3, borderRadius: 2, background: '#e03131', animation: `eq .6s ease-in-out ${i * .15}s infinite alternate`, display: 'block' }} />
                ))}
              </div>
            </div>
            {/* Controls */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '2px 14px 4px' }}>
              <button onClick={() => sendAction("prev")} style={btnStyle}>&#9198;</button>
              <button onClick={() => sendAction("togglePlay")} style={{ ...btnStyle, width: 38, height: 38, background: '#e03131', color: '#fff', fontSize: 16, boxShadow: st.isPlaying ? '0 0 14px rgba(224,49,49,.3)' : 'none' }}>
                {st.isPlaying ? <Pause size={16} /> : <Play size={16} style={{ marginLeft: 2 }} />}
              </button>
              <button onClick={() => sendAction("next")} style={btnStyle}>&#9197;</button>
              <button onClick={() => sendAction("toggleMute")} style={btnStyle}>
                {st.volume === 0 ? <VolumeX size={13} /> : <Volume2 size={13} />}
              </button>
              <button onClick={() => window.close()} style={{ ...btnStyle, marginLeft: 'auto', background: 'rgba(255,255,255,.06)' }}>
                <X size={12} />
              </button>
            </div>
            {/* Progress */}
            <div
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const p = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                sendAction("seek", p);
              }}
              style={{ height: 4, background: 'rgba(255,255,255,.08)', margin: '2px 14px 4px', borderRadius: 2, cursor: 'pointer', position: 'relative' }}
            >
              <div style={{ height: '100%', background: '#e03131', borderRadius: 2, transition: 'width .1s linear', width: safePct + '%' }} />
              <div style={{ position: 'absolute', top: '50%', left: safePct + '%', width: 10, height: 10, borderRadius: '50%', background: '#e03131', transform: 'translate(-50%,-50%)', boxShadow: '0 0 6px rgba(224,49,49,.3)', opacity: 0, transition: 'opacity .15s' }} />
            </div>
            {/* Time */}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 14px 10px', fontSize: 9, color: '#888' }}>
              <span>{fmt(st.progress)}</span>
              <span style={{ color: '#e03131', fontSize: 8, opacity: .7 }}>MQ</span>
              <span>{fmt(st.duration)}</span>
            </div>
          </div>
        </div>
        <style>{`@keyframes eq{0%{height:4px}100%{height:14px}}`}</style>
      </body>
    </html>
  );
}

const btnStyle: React.CSSProperties = {
  width: 30, height: 30, borderRadius: '50%', border: 'none',
  background: 'transparent', color: '#888', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 14, transition: 'background .15s', padding: 0,
};
