"use client";

import dynamic from "next/dynamic";

// ── Skip SSR entirely for the app shell ──
// The /play page is a pure client-side SPA. SSR was causing TDZ errors
// in the Zustand store module evaluation ("Cannot access 'D' before initialization"),
// which blocked hydration and left users stuck on the "mq" loading icon.
// By using dynamic import with ssr: false, the heavy module graph
// (Zustand store, framer-motion, all view components) is never evaluated
// on the server, eliminating the TDZ error entirely.
const AppShell = dynamic(() => import("@/components/mq/AppShell"), {
  ssr: false,
  loading: () => (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-6"
      style={{ backgroundColor: "#0e0e0e" }}
    >
      <div className="flex flex-col items-center gap-3">
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: "#e03131", boxShadow: "0 0 40px rgba(224,49,49,0.4)" }}
        >
          <span className="text-3xl font-black text-white">mq</span>
        </div>
      </div>
      <div className="h-0.5 w-24 rounded-full animate-pulse" style={{ backgroundColor: "#e03131", opacity: 0.4 }} />
    </div>
  ),
});

export default function PlayPage() {
  return <AppShell />;
}
