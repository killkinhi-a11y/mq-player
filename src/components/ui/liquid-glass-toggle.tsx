"use client"

import { motion, useMotionValue, useSpring, useTransform } from "framer-motion"
import { useCallback, useRef, useState } from "react"

export interface LiquidGlassToggleProps {
  checked: boolean
  onCheckedChange?: (checked: boolean) => void
  /** Override accent color (default: var(--mq-accent)) */
  color?: string
  /** Size preset: "sm" | "md" | "lg" (default: "md") */
  size?: "sm" | "md" | "lg"
  /** Show checkmark icon when on (default: false) */
  showCheck?: boolean
  disabled?: boolean
  className?: string
}

const SIZES = {
  sm: { track: { w: 40, h: 22 }, thumb: { size: 16, offsetOn: 22, offsetOff: 3 } },
  md: { track: { w: 50, h: 28 }, thumb: { size: 22, offsetOn: 25, offsetOff: 3 } },
  lg: { track: { w: 56, h: 30 }, thumb: { size: 24, offsetOn: 28, offsetOff: 3 } },
} as const

type SizeKey = keyof typeof SIZES
type SizeConfig = (typeof SIZES)[SizeKey]

export function LiquidGlassToggle({
  checked,
  onCheckedChange,
  color,
  size = "md",
  showCheck = false,
  disabled = false,
  className = "",
}: LiquidGlassToggleProps) {
  const s = SIZES[size]
  const trackRef = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState(false)
  const [pressed, setPressed] = useState(false)

  // Motion values for physics-based animations
  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const springX = useSpring(mx, { stiffness: 300, damping: 28 })
  const springY = useSpring(my, { stiffness: 300, damping: 28 })

  // Mouse tilt on hover
  const rotateX = useTransform(springY, [0, s.track.h], [4, -4])
  const rotateY = useTransform(springX, [0, s.track.w], [-4, 4])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!trackRef.current || !hovered) return
      const rect = trackRef.current.getBoundingClientRect()
      mx.set(e.clientX - rect.left)
      my.set(e.clientY - rect.top)
    },
    [hovered, mx, my],
  )

  const handleMouseLeave = useCallback(() => {
    setHovered(false)
    mx.set(s.track.w / 2)
    my.set(s.track.h / 2)
  }, [mx, my, s])

  const handleClick = useCallback(() => {
    if (disabled) return
    onCheckedChange?.(!checked)
  }, [checked, disabled, onCheckedChange])

  const accentColor = color || "var(--mq-accent)"

  return (
    <motion.div
      ref={trackRef}
      className={`relative rounded-full cursor-pointer select-none flex-shrink-0 ${disabled ? "opacity-40 cursor-not-allowed" : ""} ${className}`}
      style={{ width: s.track.w, height: s.track.h }}
      onClick={handleClick}
      onMouseEnter={() => !disabled && setHovered(true)}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseDown={() => !disabled && setPressed(true)}
      onMouseUp={() => setPressed(false)}
      whileTap={!disabled ? { scale: 0.95 } : undefined}
    >
      {/* ── Track ── */}
      <motion.div
        className="absolute inset-0 rounded-full overflow-hidden"
        style={{
          background: checked
            ? `linear-gradient(135deg, ${accentColor}dd, ${accentColor}bb)`
            : "linear-gradient(135deg, rgba(120,120,128,0.28), rgba(84,84,88,0.22))",
          boxShadow: checked
            ? `0 0 12px ${accentColor}44, inset 0 1px 1px rgba(255,255,255,0.15)`
            : "inset 0 1px 1px rgba(255,255,255,0.08), inset 0 -1px 1px rgba(0,0,0,0.08)",
          borderRadius: s.track.h / 2,
          rotateX,
          rotateY,
        }}
        animate={{ scale: pressed ? 0.96 : 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      >
        {/* ── Inner glass blur layer ── */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            backdropFilter: "blur(12px) saturate(180%)",
            WebkitBackdropFilter: "blur(12px) saturate(180%)",
            background: "linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.02) 100%)",
          }}
        />

        {/* ── Top edge light ── */}
        <div
          className="absolute inset-x-0 top-0 h-[1px] rounded-full"
          style={{
            background: "linear-gradient(90deg, transparent 10%, rgba(255,255,255,0.35) 50%, transparent 90%)",
          }}
        />

        {/* ── Moving specular highlight (follows thumb) ── */}
        <motion.div
          className="absolute top-[2px] rounded-full"
          style={{
            width: s.thumb.size + 6,
            height: s.thumb.size * 0.45,
            background: "radial-gradient(ellipse at center, rgba(255,255,255,0.3) 0%, transparent 70%)",
            x: checked ? s.thumb.offsetOn - 1 : s.thumb.offsetOff - 1,
          }}
          animate={{ x: checked ? s.thumb.offsetOn - 1 : s.thumb.offsetOff - 1, opacity: checked ? 0.9 : 0.5 }}
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
        />

        {/* ── Ambient glow when on ── */}
        {checked && (
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{
              background: `radial-gradient(ellipse at 75% 50%, ${accentColor}33 0%, transparent 70%)`,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          />
        )}
      </motion.div>

      {/* ── Thumb ── */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: s.thumb.size,
          height: s.thumb.size,
          top: (s.track.h - s.thumb.size) / 2,
          y: 0,
        }}
        animate={{
          x: checked ? s.thumb.offsetOn : s.thumb.offsetOff,
          scale: pressed ? 0.88 : 1,
        }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      >
        {/* Thumb body — frosted glass sphere */}
        <div
          className="w-full h-full rounded-full relative"
          style={{
            background: checked
              ? "linear-gradient(145deg, #ffffff 0%, #f0f0f0 50%, #e2e2e2 100%)"
              : "linear-gradient(145deg, #ffffff 0%, #f8f8f8 50%, #eaeaea 100%)",
            boxShadow: checked
              ? `0 2px 8px rgba(0,0,0,0.18), 0 0 4px ${accentColor}44, inset 0 1px 2px rgba(255,255,255,0.9), inset 0 -1px 2px rgba(0,0,0,0.06)`
              : "0 2px 6px rgba(0,0,0,0.15), 0 1px 2px rgba(0,0,0,0.1), inset 0 1px 2px rgba(255,255,255,0.9), inset 0 -1px 2px rgba(0,0,0,0.04)",
          }}
        >
          {/* Specular highlight on thumb */}
          <div
            className="absolute rounded-full"
            style={{
              width: s.thumb.size * 0.55,
              height: s.thumb.size * 0.35,
              top: s.thumb.size * 0.12,
              left: s.thumb.size * 0.15,
              background: "radial-gradient(ellipse at 50% 40%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 70%)",
            }}
          />

          {/* Bottom edge soft reflection */}
          <div
            className="absolute rounded-full"
            style={{
              width: s.thumb.size * 0.5,
              height: s.thumb.size * 0.2,
              bottom: s.thumb.size * 0.12,
              left: s.thumb.size * 0.25,
              background: "radial-gradient(ellipse at 50% 80%, rgba(255,255,255,0.15) 0%, transparent 70%)",
            }}
          />

          {/* Checkmark icon when enabled */}
          {showCheck && checked && (
            <motion.svg
              width={s.thumb.size * 0.5}
              height={s.thumb.size * 0.5}
              viewBox="0 0 24 24"
              fill="none"
              stroke={accentColor}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="absolute"
              style={{
                top: "50%",
                left: "50%",
                marginTop: -(s.thumb.size * 0.25),
                marginLeft: -(s.thumb.size * 0.25),
              }}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.2, delay: 0.05 }}
            >
              <motion.polyline
                points="20 6 9 17 4 12"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.25, delay: 0.05 }}
              />
            </motion.svg>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
