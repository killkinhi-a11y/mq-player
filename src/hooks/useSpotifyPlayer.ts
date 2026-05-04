"use client";

import { useState, useEffect, useRef, useCallback } from "react";

/* ─── Spotify Web Playback SDK Types ─── */
interface SpotifyPlayerState {
  paused: boolean;
  position: number;
  duration: number;
  track_window: {
    current_track: {
      id: string;
      name: string;
      artists: Array<{ name: string }>;
      album: {
        name: string;
        images: Array<{ url: string }>;
      };
      uri: string;
    };
    next_tracks: unknown[];
    previous_tracks: unknown[];
  };
}

interface SpotifyPlayer {
  connect: () => Promise<boolean>;
  disconnect: () => void;
  getCurrentState: () => Promise<SpotifyPlayerState | null>;
  seek: (position_ms: number) => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
  previousTrack: () => Promise<void>;
  nextTrack: () => Promise<void>;
  togglePlay: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  addListener: (event: string, callback: (...args: any[]) => void) => void;
  removeListener: (event: string, callback: (...args: any[]) => void) => void;
  _options: {
    getOAuthToken: (callback: (token: string) => void) => void;
  };
}

interface SpotifyWindow extends Window {
  onSpotifyWebPlaybackSDKReady?: () => void;
  Spotify?: {
    Player: new (config: {
      name: string;
      getOAuthToken: (callback: (token: string) => void) => void;
      volume?: number;
    }) => SpotifyPlayer;
  };
}

declare const window: SpotifyWindow;

/* ─── Hook return type ─── */
interface UseSpotifyPlayerReturn {
  isReady: boolean;
  deviceId: string | null;
  currentState: SpotifyPlayerState | null;
  isSpotifyConnected: boolean;
  play: (options: { spotify_uri: string; position_ms?: number }) => Promise<boolean>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
  previousTrack: () => Promise<void>;
  nextTrack: () => Promise<void>;
  togglePlay: () => Promise<void>;
}

let sdkLoaded = false;
let sdkLoading = false;

function loadSpotifySDK(): Promise<void> {
  if (sdkLoaded || (typeof window !== "undefined" && window.Spotify)) {
    return Promise.resolve();
  }
  if (sdkLoading) {
    // Wait for existing load
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (sdkLoaded || window.Spotify) {
          clearInterval(check);
          resolve();
        }
      }, 100);
    });
  }

  sdkLoading = true;
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Window not available"));
      return;
    }

    window.onSpotifyWebPlaybackSDKReady = () => {
      sdkLoaded = true;
      sdkLoading = false;
      resolve();
    };

    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    script.onload = () => {
      // SDK loaded, waiting for onSpotifyWebPlaybackSDKReady
    };
    script.onerror = () => {
      sdkLoading = false;
      reject(new Error("Failed to load Spotify SDK"));
    };
    document.head.appendChild(script);

    // Timeout after 10s
    setTimeout(() => {
      if (!sdkLoaded) {
        sdkLoading = false;
        reject(new Error("Spotify SDK load timeout"));
      }
    }, 10000);
  });
}

/**
 * Hook that manages the Spotify Web Playback SDK.
 * Provides full track playback (not just 30-second preview).
 * Requires Spotify Premium and a valid OAuth token.
 */
export function useSpotifyPlayer(): UseSpotifyPlayerReturn {
  const playerRef = useRef<SpotifyPlayer | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [currentState, setCurrentState] = useState<SpotifyPlayerState | null>(null);
  const [isSpotifyConnected, setIsSpotifyConnected] = useState(false);

  // Track whether the player has been initialized
  const initializedRef = useRef(false);
  // Track if we need to force-disconnect on unmount
  const mountedRef = useRef(true);

  // Get access token from cookies via API
  const getAccessToken = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch("/api/spotify/auth/status");
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.connected) return null;

      // The token is in httpOnly cookies, we need a proxy endpoint to make Spotify API calls
      // For the SDK, we use a custom getOAuthToken that fetches from our API
      const tokenRes = await fetch("/api/spotify/auth/token-proxy");
      if (!tokenRes.ok) return null;
      const tokenData = await tokenRes.json();
      return tokenData.access_token || null;
    } catch {
      return null;
    }
  }, []);

  // Initialize the player
  useEffect(() => {
    if (initializedRef.current) return;

    // First check if user has connected Spotify
    const checkAndInit = async () => {
      try {
        const statusRes = await fetch("/api/spotify/auth/status");
        if (!statusRes.ok) return;
        const statusData = await statusRes.json();
        if (!statusData.connected) return;
        setIsSpotifyConnected(true);
      } catch {
        return;
      }

      // Check for SDK support
      if (typeof window === "undefined") return;

      try {
        await loadSpotifySDK();

        if (!window.Spotify) {
          console.warn("[Spotify SDK] Spotify global not available after load");
          return;
        }

        // Fetch client ID
        const clientIdRes = await fetch("/api/spotify/client-id");
        if (!clientIdRes.ok) return;
        const { clientId } = await clientIdRes.json();
        if (!clientId) return;

        initializedRef.current = true;

        // Token refresh state
        let currentToken: string | null = null;

        // Create player instance
        const player = new window.Spotify.Player({
          name: "MQ Player",
          getOAuthToken: async (callback: (token: string) => void) => {
            try {
              const tokenRes = await fetch("/api/spotify/auth/token-proxy");
              if (tokenRes.ok) {
                const data = await tokenRes.json();
                if (data.access_token) {
                  currentToken = data.access_token;
                  callback(data.access_token);
                  return;
                }
              }
              // Token proxy failed — try refreshing
              const refreshRes = await fetch("/api/spotify/refresh-token", { method: "POST" });
              if (refreshRes.ok) {
                const data = await refreshRes.json();
                if (data.access_token) {
                  currentToken = data.access_token;
                  callback(data.access_token);
                  return;
                }
              }
              console.error("[Spotify SDK] Could not get access token");
            } catch (err) {
              console.error("[Spotify SDK] getOAuthToken error:", err);
            }
          },
          volume: 0.3,
        });

        playerRef.current = player;

        // Ready event
        player.addListener("ready", ({ device_id }: { device_id: string }) => {
          if (!mountedRef.current) return;
          console.log("[Spotify SDK] Ready with device ID:", device_id);
          setIsReady(true);
          setDeviceId(device_id);
        });

        // Not Ready event
        player.addListener("not_ready", ({ device_id }: { device_id: string }) => {
          console.log("[Spotify SDK] Device not ready:", device_id);
          setIsReady(false);
        });

        // Player state changed
        player.addListener("player_state_changed", (state: SpotifyPlayerState | null) => {
          if (!mountedRef.current) return;
          setCurrentState(state);

          // Sync with app store
          if (state) {
            const store = require("@/store/useAppStore").useAppStore.getState();
            const trackId = store.currentTrack?.id;

            // Only sync if we're playing a Spotify track
            if (trackId && store.currentTrack?.source === "spotify") {
              // Sync progress
              if (state.position !== undefined && !state.paused) {
                store.setProgress(state.position / 1000);
              }
              // Sync duration
              if (state.duration > 0) {
                store.setDuration(state.duration / 1000);
              }
              // Sync play/pause state
              if (state.paused && store.isPlaying) {
                store.setState({ isPlaying: false });
              } else if (!state.paused && !store.isPlaying) {
                store.setState({ isPlaying: true });
              }
            }

            // Detect track end
            if (state.track_window?.current_track && state.position === 0 && state.paused && store.isPlaying) {
              // Track likely ended
              setTimeout(() => {
                const currentStore = require("@/store/useAppStore").useAppStore.getState();
                if (currentStore.isPlaying && currentStore.currentTrack?.source === "spotify") {
                  if (currentStore.repeat === "one") {
                    // Repeat one handled by Spotify
                  } else {
                    currentStore.nextTrack();
                  }
                }
              }, 500);
            }
          }
        });

        // Authentication error
        player.addListener("authentication_error", ({ message }: { message: string }) => {
          console.error("[Spotify SDK] Authentication error:", message);
          setIsReady(false);
          setIsSpotifyConnected(false);
        });

        // Connect to Spotify
        player.connect().then((success) => {
          if (mountedRef.current) {
            console.log("[Spotify SDK] Connect result:", success);
          }
        }).catch((err) => {
          console.error("[Spotify SDK] Connect error:", err);
        });

      } catch (err) {
        console.error("[Spotify SDK] Initialization error:", err);
      }
    };

    checkAndInit();

    return () => {
      mountedRef.current = false;
      if (playerRef.current) {
        try {
          playerRef.current.disconnect();
        } catch {}
        playerRef.current = null;
      }
      setIsReady(false);
      setDeviceId(null);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Play a track by Spotify URI
  const play = useCallback(async (options: { spotify_uri: string; position_ms?: number }): Promise<boolean> => {
    const player = playerRef.current;
    const id = deviceId;
    if (!player || !id) return false;

    try {
      // Get fresh token
      const tokenRes = await fetch("/api/spotify/auth/token-proxy");
      if (!tokenRes.ok) return false;
      const { access_token } = await tokenRes.json();
      if (!access_token) return false;

      // Use Spotify API to start playback on our device
      const res = await fetch(
        `https://api.spotify.com/v1/me/player/play?device_id=${id}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            uris: [options.spotify_uri],
            position_ms: options.position_ms || 0,
          }),
          signal: AbortSignal.timeout(10000),
        }
      );

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.error("[Spotify SDK] Play failed:", res.status, errText);
        // If 403, user doesn't have Spotify Premium — fall back to preview
        if (res.status === 403) {
          return false;
        }
        return false;
      }

      return true;
    } catch (err) {
      console.error("[Spotify SDK] Play error:", err);
      return false;
    }
  }, [deviceId]);

  const pause = useCallback(async () => {
    try {
      await playerRef.current?.pause();
    } catch {}
  }, []);

  const resume = useCallback(async () => {
    try {
      await playerRef.current?.resume();
    } catch {}
  }, []);

  const seek = useCallback(async (positionMs: number) => {
    try {
      await playerRef.current?.seek(positionMs);
    } catch {}
  }, []);

  const setVolume = useCallback(async (volume: number) => {
    try {
      await playerRef.current?.setVolume(volume);
    } catch {}
  }, []);

  const previousTrack = useCallback(async () => {
    try {
      await playerRef.current?.previousTrack();
    } catch {}
  }, []);

  const nextTrack = useCallback(async () => {
    try {
      await playerRef.current?.nextTrack();
    } catch {}
  }, []);

  const togglePlay = useCallback(async () => {
    try {
      await playerRef.current?.togglePlay();
    } catch {}
  }, []);

  return {
    isReady,
    deviceId,
    currentState,
    isSpotifyConnected,
    play,
    pause,
    resume,
    seek,
    setVolume,
    previousTrack,
    nextTrack,
    togglePlay,
  };
}

export default useSpotifyPlayer;
