"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X, Clock } from "lucide-react";

interface MaintenanceInfo {
  maintenance: boolean;
  message: string | null;
}

export default function MaintenanceBanner({
  onDismiss,
}: {
  onDismiss?: () => void;
}) {
  const [info, setInfo] = useState<MaintenanceInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch("/api/maintenance");
        const data = await res.json();
        if (!cancelled) setInfo(data);
      } catch {
        // Silent — if can't check, don't block user
      }
    };
    check();
    // Re-check every 60 seconds (admin might disable maintenance)
    const interval = setInterval(check, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!info?.maintenance) return null;
  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-3 px-4 py-2.5"
      style={{
        background: "linear-gradient(90deg, rgba(234,179,8,0.15), rgba(249,115,22,0.15), rgba(234,179,8,0.15))",
        borderBottom: "1px solid rgba(234,179,8,0.25)",
        backdropFilter: "blur(16px)",
      }}
    >
      <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: "#eab308" }} />
      <p className="text-xs font-medium text-center" style={{ color: "#fbbf24" }}>
        {info.message || "Проводятся технические работы. Некоторые функции могут быть недоступны."}
      </p>
      <Clock className="w-3 h-3 flex-shrink-0" style={{ color: "#eab308", opacity: 0.6 }} />
      <button
        onClick={handleDismiss}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full transition-opacity hover:opacity-100"
        style={{ opacity: 0.5, color: "#eab308" }}
        title="Закрыть"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
