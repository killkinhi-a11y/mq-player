"use client";

// Demo session: signs in as the demo user, seeds the queue and the demo playlist.
// Extracted from AuthView (Task B); bodies moved verbatim.
import { useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import type { AppState } from "@/store/types";

export function useDemoLogin(setAuth: AppState["setAuth"]) {
  // ─── Demo login ─────────────────────────────────────────────────────
  const [demoLoading, setDemoLoading] = useState(false);

  const handleDemoLogin = async () => {
    setDemoLoading(true);
    try {
      setAuth("demo-user-id", "Демо", "demo@mq-player.internal");
      useAppStore.setState({ demoLoading: true });
      const { DEMO_TRACKS } = await import("@/lib/demoTracks");
      await new Promise((r) => setTimeout(r, 300));
      const store = useAppStore.getState();
      if (store.queue.length === 0) {
        useAppStore.setState({
          queue: DEMO_TRACKS,
          currentTrack: DEMO_TRACKS[0],
          isPlaying: false,
          queueIndex: 0,
          demoLoading: false,
        });
      } else {
        useAppStore.setState({ demoLoading: false });
      }
      // P1 (demo onboarding, ~10s to sound): also seed ONE real local
      // playlist with the demo tracks so Библиотека → Плейлисты opens on
      // content, and the queue's instant local audio (/demo/*.mp3 — no
      // proxy, no cold start) is one tap away from three surfaces:
      // hero play, player bar, and the playlist itself.
      const st = useAppStore.getState();
      const hasDemoPlaylist = (st.playlists || []).some((p) => p.name === "Демо-микс MQ");
      if (!hasDemoPlaylist) {
        st.createPlaylist("Демо-микс MQ", "Локальные демо-треки — мгновенный звук без интернета");
        const st2 = useAppStore.getState();
        const created = st2.playlists[st2.playlists.length - 1];
        if (created) {
          for (const t of DEMO_TRACKS) {
            st2.addToPlaylist(created.id, t);
          }
        }
      }
    } catch (err) {
      console.error("[Demo] Failed to load:", err);
      setDemoLoading(false);
      useAppStore.setState({ demoLoading: false });
    }
  };

  return { demoLoading, handleDemoLogin };
}
