"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAppStore } from "@/store/useAppStore";
import { type Track } from "@/lib/musicApi";

/**
 * useLiveSessions — manages live listening sessions (group synchronized playback).
 *
 * - listSessions(): fetches active sessions from friends
 * - createSession(track): creates a new session as host
 * - joinSession(code): joins a session by 6-char code
 * - syncSession(id): polls session state every 2s (for guests to sync with host)
 * - updateSession(id, isPlaying, progress): host-only — updates playback state
 * - leaveSession(id): leaves/deletes session
 */

export interface LiveSessionInfo {
  id: string;
  code: string;
  hostId: string;
  hostUsername: string;
  hostAvatar: string;
  trackTitle: string;
  trackArtist: string;
  trackCover: string;
  isPlaying: boolean;
  progress: number;
  guestCount: number;
  isHost: boolean;
}

export interface LiveSessionDetail extends LiveSessionInfo {
  trackId: string;
  scTrackId?: number | null;
  audioUrl: string;
  source: string;
  duration: number;
  members: Array<{ userId: string; username: string; avatar: string }>;
}

export function useLiveSessions() {
  const [sessions, setSessions] = useState<LiveSessionInfo[]>([]);
  const [activeSession, setActiveSession] = useState<LiveSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const listIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // List active sessions (15s polling)
  const listSessions = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await fetch("/api/social/sessions");
      if (!res.ok) return;
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch {
      // Silent
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setSessions([]);
      setLoading(false);
      return;
    }
    listSessions();
    listIntervalRef.current = setInterval(listSessions, 15000);
    return () => {
      if (listIntervalRef.current) clearInterval(listIntervalRef.current);
    };
  }, [isAuthenticated, listSessions]);

  // Create a new session (host)
  const createSession = useCallback(async (track: Track): Promise<LiveSessionDetail | null> => {
    try {
      const res = await fetch("/api/social/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackId: track.id,
          trackTitle: track.title,
          trackArtist: track.artist,
          trackCover: track.cover || "",
          scTrackId: track.scTrackId || null,
          audioUrl: track.audioUrl || "",
          source: track.source || "soundcloud",
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.session) {
        // Fetch full details
        const detailRes = await fetch(`/api/social/sessions/${data.session.id}`);
        if (detailRes.ok) {
          const detailData = await detailRes.json();
          setActiveSession(detailData.session);
          return detailData.session;
        }
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  // Join a session by code
  const joinSession = useCallback(async (code: string): Promise<LiveSessionDetail | null> => {
    try {
      // First find the session by code (list sessions and match)
      const res = await fetch("/api/social/sessions");
      if (!res.ok) return null;
      const data = await res.json();
      const found = (data.sessions || []).find((s: LiveSessionInfo) => s.code === code.toUpperCase());
      if (!found) return null;

      // Join via GET with ?code=
      const detailRes = await fetch(`/api/social/sessions/${found.id}?code=${code.toUpperCase()}`);
      if (!detailRes.ok) return null;
      const detailData = await detailRes.json();
      setActiveSession(detailData.session);
      return detailData.session;
    } catch {
      return null;
    }
  }, []);

  // Sync active session every 2s (guest-side)
  useEffect(() => {
    if (!activeSession) {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
      return;
    }
    const sync = async () => {
      try {
        const res = await fetch(`/api/social/sessions/${activeSession.id}`);
        if (!res.ok) {
          // Session deleted
          setActiveSession(null);
          return;
        }
        const data = await res.json();
        if (data.session) {
          setActiveSession(data.session);
        }
      } catch {
        // Silent
      }
    };
    syncIntervalRef.current = setInterval(sync, 2000);
    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, [activeSession?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Host: update playback state
  const updateSession = useCallback(async (id: string, updates: { isPlaying?: boolean; progress?: number }) => {
    try {
      await fetch(`/api/social/sessions/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
    } catch {
      // Silent
    }
  }, []);

  // Leave/delete session
  const leaveSession = useCallback(async (id: string) => {
    try {
      await fetch(`/api/social/sessions/${id}`, { method: "DELETE" });
      setActiveSession(null);
    } catch {
      // Silent
    }
  }, []);

  return {
    sessions,
    activeSession,
    loading,
    listSessions,
    createSession,
    joinSession,
    updateSession,
    leaveSession,
  };
}
