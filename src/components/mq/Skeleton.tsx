"use client";

import { motion } from "framer-motion";

interface SkeletonProps {
  className?: string;
  variant?: "text" | "circular" | "rectangular";
  width?: string | number;
  height?: string | number;
}

export function Skeleton({
  className = "",
  variant = "rectangular",
  width,
  height,
}: SkeletonProps) {
  const borderRadius =
    variant === "circular"
      ? "50%"
      : variant === "text"
        ? "var(--mq-radius-sm)"
        : "var(--mq-radius-md)";

  return (
    <motion.div
      className={className}
      style={{
        width,
        height,
        borderRadius,
        background: "var(--mq-card)",
        position: "relative",
        overflow: "hidden",
      }}
      animate={{
        opacity: [0.5, 0.8, 0.5],
      }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%)",
          animation: "mq-shimmer 1.5s infinite",
        }}
      />
    </motion.div>
  );
}

export function TrackCardSkeleton() {
  return (
    <div
      className="flex items-center gap-3 p-3"
      style={{ borderRadius: "var(--mq-radius-md)" }}
    >
      <Skeleton variant="rectangular" width={48} height={48} />
      <div className="flex-1 min-w-0">
        <Skeleton variant="text" height={14} width="70%" />
        <Skeleton variant="text" height={12} width="40%" className="mt-1.5" />
      </div>
    </div>
  );
}

export function PlaylistCardSkeleton() {
  return (
    <div style={{ borderRadius: "var(--mq-radius-lg)" }}>
      <Skeleton variant="rectangular" height={120} />
      <div className="p-3">
        <Skeleton variant="text" height={14} width="60%" />
        <Skeleton variant="text" height={12} width="30%" className="mt-1.5" />
      </div>
    </div>
  );
}

export function MessageSkeleton() {
  return (
    <div className="flex gap-2 mb-3">
      <Skeleton variant="circular" width={36} height={36} />
      <div>
        <Skeleton variant="text" height={12} width={80} />
        <Skeleton
          variant="rectangular"
          height={36}
          width={200}
          className="mt-1"
        />
      </div>
    </div>
  );
}
