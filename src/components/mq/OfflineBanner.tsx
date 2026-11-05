"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WifiOff, Wifi } from "lucide-react";
import { useNetworkStatus } from "@/hooks/use-network-status";

/**
 * OfflineBanner — shows a top banner when internet is lost.
 * - Slides in from top when going offline
 * - Slides out when back online (with "Back online" confirmation for 2s)
 * - Non-blocking: pointer-events: none when offline, so user can still navigate
 */
export function OfflineBanner() {
  const { isOnline, wasOffline } = useNetworkStatus();
  const [showBackOnline, setShowBackOnline] = useState(false);

  // Raise the "back online" chip when the network status transitions into
  // online-after-offline (adjust-state-during-render, not in an effect).
  const statusKey = `${isOnline}|${wasOffline}`;
  const [prevStatusKey, setPrevStatusKey] = useState(statusKey);
  if (prevStatusKey !== statusKey) {
    setPrevStatusKey(statusKey);
    if (isOnline && wasOffline) setShowBackOnline(true);
  }

  // Auto-hide after 2.5s.
  useEffect(() => {
    if (!showBackOnline) return;
    const t = setTimeout(() => setShowBackOnline(false), 2500);
    return () => clearTimeout(t);
  }, [showBackOnline]);

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="fixed top-0 left-0 right-0 z-[200] flex items-center justify-center gap-2 px-4 py-2.5"
          style={{
            background: "linear-gradient(180deg, #ef4444 0%, #dc2626 100%)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            boxShadow: "0 4px 16px rgba(239,68,68,0.4)",
            paddingTop: "max(10px, env(safe-area-inset-top))",
          }}
        >
          <WifiOff className="w-4 h-4" />
          <span>Нет соединения с интернетом</span>
        </motion.div>
      )}

      {showBackOnline && isOnline && (
        <motion.div
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="fixed top-0 left-0 right-0 z-[200] flex items-center justify-center gap-2 px-4 py-2.5"
          style={{
            background: "linear-gradient(180deg, #22c55e 0%, #16a34a 100%)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            boxShadow: "0 4px 16px rgba(34,197,94,0.4)",
            paddingTop: "max(10px, env(safe-area-inset-top))",
          }}
        >
          <Wifi className="w-4 h-4" />
          <span>Соединение восстановлено</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
