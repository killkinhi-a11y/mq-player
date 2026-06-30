"use client";

import { useEffect, useState } from "react";

/**
 * useNetworkStatus — tracks browser online/offline state.
 * Online state is also polled every 30s for reliability (Navigator API
 * can be flaky on Android WebView).
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const update = () => {
      const online = navigator.onLine;
      setIsOnline(online);
      if (!online) setWasOffline(true);
    };

    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);

    // Poll every 30s — navigator.onLine can be stale on Android WebView
    const interval = setInterval(update, 30000);

    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      clearInterval(interval);
    };
  }, []);

  return { isOnline, wasOffline };
}
