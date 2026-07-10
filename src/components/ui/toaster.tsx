"use client"

import { useToast, type MQToast } from "@/hooks/use-toast"
import { AnimatePresence, motion } from "framer-motion"
import { Check, AlertCircle, Info, X } from "lucide-react"

/**
 * MQ Toaster — custom toast renderer in project design language.
 * No Radix, no tw-animate-css. Uses Framer Motion for enter/exit.
 *
 * Design: glassmorphic card with accent glow, slides up from bottom-right
 * (desktop) / bottom-center (mobile). 250ms enter, 300ms exit fade+slide.
 */

const variantConfig = {
  default: {
    icon: Info,
    iconColor: "var(--mq-text-muted)",
    glow: "transparent",
  },
  success: {
    icon: Check,
    iconColor: "#4ade80",
    glow: "rgba(74, 222, 128, 0.15)",
  },
  destructive: {
    icon: AlertCircle,
    iconColor: "#ef4444",
    glow: "rgba(239, 68, 68, 0.15)",
  },
}

function ToastItem({ toast }: { toast: MQToast & { visible: boolean } }) {
  const config = variantConfig[toast.variant || "default"]
  const Icon = config.icon

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.95 }}
      transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
      className="pointer-events-auto relative flex items-center gap-3 rounded-2xl overflow-hidden"
      style={{
        backgroundColor: "color-mix(in srgb, var(--mq-card) 92%, transparent)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        border: "1px solid var(--mq-border-thin)",
        boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 24px ${config.glow}`,
        padding: "12px 16px",
        minWidth: 260,
        maxWidth: 360,
      }}
    >
      {/* Icon */}
      <div
        className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
        style={{
          backgroundColor: `color-mix(in srgb, ${config.iconColor} 15%, transparent)`,
        }}
      >
        <Icon className="w-4 h-4" style={{ color: config.iconColor }} />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        {toast.title && (
          <p className="text-sm font-semibold truncate" style={{ color: "var(--mq-text)" }}>
            {toast.title}
          </p>
        )}
        {toast.description && (
          <p className="text-xs mt-0.5 truncate" style={{ color: "var(--mq-text-muted)" }}>
            {toast.description}
          </p>
        )}
      </div>

      {/* Close button */}
      <button
        onClick={() => useToastDismiss(toast.id)}
        className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-opacity hover:opacity-70"
        style={{ color: "var(--mq-text-muted)" }}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  )
}

// Inline dismiss to avoid circular import
function useToastDismiss(id: string) {
  // This is a placeholder — the actual dismiss is handled by the hook
  // We need to dispatch dismiss from here
  if (typeof window !== "undefined") {
    // Use the global dismiss from the hook
    const event = new CustomEvent("mq-toast-dismiss", { detail: id })
    window.dispatchEvent(event)
  }
}

export function Toaster() {
  const { toasts, dismiss } = useToast()

  // Listen for dismiss events from ToastItem close buttons
  React.useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as string
      dismiss(detail)
    }
    window.addEventListener("mq-toast-dismiss", handler)
    return () => window.removeEventListener("mq-toast-dismiss", handler)
  }, [dismiss])

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col-reverse gap-2 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} />
        ))}
      </AnimatePresence>
    </div>
  )
}

// Need React import for useEffect in Toaster
import * as React from "react"
