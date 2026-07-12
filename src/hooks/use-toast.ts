"use client"

import * as React from "react"

/**
 * Toast state management — simplified, no Radix dependency.
 * Auto-dismiss with configurable duration (default 2500ms).
 */

export interface MQToast {
  id: string
  title?: string
  description?: string
  variant?: "default" | "success" | "destructive"
  duration?: number
  action?: {
    label: string
    onClick: () => void
  }
}

interface State {
  toasts: (MQToast & { visible: boolean })[]
}

const TOAST_LIMIT = 3
const DEFAULT_DURATION = 2500

const listeners: Array<(state: State) => void> = []
let memoryState: State = { toasts: [] }
let count = 0

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

function dispatch(toast: MQToast) {
  const id = toast.id || genId()
  const newToast = { ...toast, id, visible: true }

  memoryState = {
    toasts: [newToast, ...memoryState.toasts].slice(0, TOAST_LIMIT),
  }
  listeners.forEach((l) => l(memoryState))

  // Auto-dismiss after duration — toasts with action get longer duration
  const duration = toast.duration ?? (toast.action ? 5000 : DEFAULT_DURATION)
  setTimeout(() => {
    // First: set visible = false (triggers exit animation)
    memoryState = {
      toasts: memoryState.toasts.map((t) =>
        t.id === id ? { ...t, visible: false } : t
      ),
    }
    listeners.forEach((l) => l(memoryState))

    // Then: remove from DOM after animation completes (300ms)
    setTimeout(() => {
      memoryState = {
        toasts: memoryState.toasts.filter((t) => t.id !== id),
      }
      listeners.forEach((l) => l(memoryState))
    }, 300)
  }, duration)
}

function dismiss(toastId?: string) {
  if (toastId) {
    memoryState = {
      toasts: memoryState.toasts.map((t) =>
        t.id === toastId ? { ...t, visible: false } : t
      ),
    }
  } else {
    memoryState = {
      toasts: memoryState.toasts.map((t) => ({ ...t, visible: false })),
    }
  }
  listeners.forEach((l) => l(memoryState))

  setTimeout(() => {
    memoryState = {
      toasts: toastId
        ? memoryState.toasts.filter((t) => t.id !== toastId)
        : [],
    }
    listeners.forEach((l) => l(memoryState))
  }, 300)
}

function toast(props: Omit<MQToast, "id">) {
  dispatch({ ...props, id: genId() })
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState)

  React.useEffect(() => {
    listeners.push(setState)
    return () => {
      const index = listeners.indexOf(setState)
      if (index > -1) listeners.splice(index, 1)
    }
  }, [])

  return { ...state, toast, dismiss }
}

export { useToast, toast }
