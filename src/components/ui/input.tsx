import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex w-full min-w-0 px-3 py-2 text-sm outline-none",
        "bg-transparent placeholder:text-muted-foreground",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      style={{
        outline: "none",
        ...props.style,
      }}
      {...props}
    />
  )
}

export { Input }
