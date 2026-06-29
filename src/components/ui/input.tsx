import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-10 w-full min-w-0 rounded-xl border px-3 py-2 text-sm transition-[color,box-shadow] outline-none",
        "bg-transparent placeholder:text-muted-foreground",
        "border-[var(--mq-border-thin)]",
        "focus-visible:border-[var(--mq-accent)] focus-visible:outline-none",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      style={{
        color: "var(--mq-text)",
        ...props.style,
      }}
      {...props}
    />
  )
}

export { Input }
