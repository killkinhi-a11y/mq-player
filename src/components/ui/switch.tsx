"use client"

import * as React from "react"
import * as SwitchPrimitive from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"
import { LiquidGlassToggle } from "@/components/ui/liquid-glass-toggle"

function Switch({
  className,
  checked,
  onCheckedChange,
  disabled,
  ariaLabel,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & { ariaLabel?: string }) {
  return (
    <LiquidGlassToggle
      checked={checked ?? false}
      onCheckedChange={onCheckedChange}
      size="sm"
      disabled={disabled}
      className={className}
      ariaLabel={ariaLabel ?? (props as { "aria-label"?: string })["aria-label"]}
    />
  )
}

export { Switch }
