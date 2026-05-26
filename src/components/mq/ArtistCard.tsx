"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { Music, Play, Pause, Heart, Users, Headphones, Check } from "lucide-react";

interface ArtistCardProps {
  avatar?: string;
  username: string;
  genre?: string;
  followers?: number;
  trackCount?: number;
  isSubscribed?: boolean;
  onClick?: () => void;
  onSubscribeClick?: (e: React.MouseEvent) => void;
  onPlayClick?: (e: React.MouseEvent) => void;
  index?: number;
  animationsEnabled?: boolean;
  variant?: "compact" | "full";
  size?: "sm" | "md" | "lg";
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

export default function ArtistCard({
  avatar,
  username,
  genre,
  followers,
  trackCount,
  isSubscribed = false,
  onClick,
  onSubscribeClick,
  onPlayClick,
  index = 0,
  animationsEnabled = true,
  variant = "full",
  size = "md",
}: ArtistCardProps) {
  const initials = username
    .replace("@", "")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase())
    .slice(0, 2)
    .join("");

  const hasAvatar = avatar && avatar.trim() !== "" && avatar !== "null" && avatar !== "undefined";
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseEnter = useCallback(() => setIsHovered(true), []);
  const handleMouseLeave = useCallback(() => setIsHovered(false), []);

  const handleClick = useCallback(() => {
    onClick?.();
  }, [onClick]);

  const handlePlayBtnClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onPlayClick?.(e);
  }, [onPlayClick]);

  const handleSubBtnClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSubscribeClick?.(e);
  }, [onSubscribeClick]);

  // Sizes
  const avatarSize = size === "sm" ? "w-12 h-12" : size === "lg" ? "w-20 h-20 lg:w-24 lg:h-24" : "w-16 h-16 sm:w-[72px] sm:h-[72px]";
  const cardWidth = size === "sm" ? "w-[90px] sm:w-[100px]" : size === "lg" ? "w-[130px] sm:w-[155px]" : "w-[110px] sm:w-[130px]";

  if (variant === "compact") {
    // Compact variant for inline lists (e.g. subscriptions list, search results)
    return (
      <motion.button
        initial={animationsEnabled ? { opacity: 0, x: -10 } : undefined}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.03 }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        onClick={onClick}
        className="flex items-center gap-3 p-2.5 rounded-xl cursor-pointer text-left transition-all w-full"
        style={{
          backgroundColor: "var(--mq-card)",
          border: "1px solid var(--mq-border)",
        }}
      >
        {/* Avatar */}
        <div
          className={`${size === "sm" ? "w-9 h-9" : "w-11 h-11"} rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center relative`}
          style={{ border: isSubscribed ? "2px solid var(--mq-accent)" : "2px solid var(--mq-border)" }}
        >
          {hasAvatar ? (
            <Image src={avatar} alt={username} width={36} height={36} className="w-full h-full object-cover" loading="lazy" unoptimized />
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: "var(--mq-accent)", opacity: 0.7 }}>
              <span className="text-xs font-bold" style={{ color: "var(--mq-text)" }}>{initials}</span>
            </div>
          )}
          {/* Subscribed badge */}
          {isSubscribed && (
            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "var(--mq-accent)", border: "2px solid var(--mq-card)" }}>
              <Check className="w-2 h-2" style={{ color: "var(--mq-text)" }} />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate" style={{ color: "var(--mq-text)" }}>{username}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            {genre && (
              <span className="text-[10px] truncate" style={{ color: "var(--mq-text-muted)" }}>{genre}</span>
            )}
            {followers != null && followers > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: "var(--mq-surface, #1a1a1a)", color: "var(--mq-text-muted)" }}>
                {formatNumber(followers)}
              </span>
            )}
          </div>
        </div>
      </motion.button>
    );
  }

  // Full card variant
  return (
    <motion.button
      initial={animationsEnabled ? { opacity: 0, y: 20, scale: 0.95 } : undefined}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.05, type: "spring", stiffness: 200, damping: 20 }}
      whileHover={animationsEnabled ? { scale: 1.04, y: -4 } : undefined}
      whileTap={{ scale: 0.95 }}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`${cardWidth} flex-shrink-0 flex flex-col items-center gap-2.5 cursor-pointer group relative`}
    >
      {/* Card background */}
      <div
        className="relative rounded-lg p-3 pb-4 w-full transition-all duration-300 overflow-hidden"
        style={{
          backgroundColor: "var(--mq-card)",
          border: isSubscribed
            ? "1.5px solid var(--mq-accent)"
            : isHovered
              ? "1.5px solid var(--mq-accent)"
              : "1px solid var(--mq-border)",
        }}
      >

        {/* Avatar container */}
        <div className="relative z-10 flex justify-center mb-2">
          <div
            className={`${avatarSize} rounded-full overflow-hidden flex-shrink-0 relative transition-shadow duration-300`}
            style={{
              boxShadow: isHovered
                ? "0 4px 20px rgba(0,0,0,0.4)"
                : "0 2px 10px rgba(0,0,0,0.2)",
              border: isSubscribed
                ? "2.5px solid var(--mq-accent)"
                : "2px solid var(--mq-border)",
            }}
          >
            {hasAvatar ? (
              <Image
                src={avatar}
                alt={username}
                width={96}
                height={96}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                loading="lazy"
                unoptimized
                onError={(e) => {
                  // Hide image and show fallback
                  const target = e.target as HTMLImageElement;
                  target.style.display = "none";
                }}
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center"
                style={{ backgroundColor: "var(--mq-accent)", opacity: 0.7 }}
              >
                <span className={`font-bold ${size === "sm" ? "text-sm" : size === "lg" ? "text-xl lg:text-2xl" : "text-base sm:text-lg"}`} style={{ color: "var(--mq-text)" }}>
                  {initials || "?"}
                </span>
              </div>
            )}

            {/* Play overlay on hover */}
            <motion.div
              className="absolute inset-0 flex items-center justify-center transition-colors duration-200 rounded-full"
              style={{ backgroundColor: isHovered ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0)" }}
              onClick={handlePlayBtnClick}
            >
              <motion.div
                animate={{ scale: isHovered ? 1 : 0.5, opacity: isHovered ? 1 : 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shadow-lg cursor-pointer"
                style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}
              >
                <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 ml-0.5" fill="currentColor" />
              </motion.div>
            </motion.div>
          </div>

          {/* Subscribed indicator (floating badge) */}
          {isSubscribed && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.2 }}
              className="absolute -top-1 -right-1 w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center shadow-lg z-20 cursor-pointer"
              style={{ backgroundColor: "var(--mq-accent)", border: "2px solid var(--mq-card)" }}
              onClick={handleSubBtnClick}
            >
              <Heart className="w-2.5 h-2.5 sm:w-3 sm:h-3" style={{ color: "var(--mq-text)", fill: "var(--mq-text)" }} />
            </motion.div>
          )}
        </div>

        {/* Name */}
        <p
          className="text-xs sm:text-[13px] font-semibold truncate w-full text-center leading-tight transition-colors duration-200 z-10 relative"
          style={{ color: isHovered ? "var(--mq-accent)" : "var(--mq-text)" }}
        >
          {username}
        </p>

        {/* Stats row */}
        <div className="flex items-center justify-center gap-1.5 z-10 relative">
          {followers != null && followers > 0 && (
            <span className="text-[10px] flex items-center gap-0.5" style={{ color: "var(--mq-text-muted)" }}>
              <Users className="w-2.5 h-2.5" />
              {formatNumber(followers)}
            </span>
          )}
          {trackCount != null && trackCount > 0 && (
            <span className="text-[10px] flex items-center gap-0.5" style={{ color: "var(--mq-text-muted)" }}>
              <Headphones className="w-2.5 h-2.5" />
              {formatNumber(trackCount)}
            </span>
          )}
        </div>

        {/* Genre tag */}
        {genre && (
          <motion.span
            className="text-[10px] px-2.5 py-0.5 rounded-full truncate max-w-full z-10 relative"
            style={{
              backgroundColor: isHovered ? "var(--mq-accent)" : "var(--mq-surface, #1a1a1a)",
              color: isHovered ? "var(--mq-text)" : "var(--mq-text-muted)",
              border: isHovered ? "1px solid var(--mq-accent)" : "1px solid var(--mq-border)",
              transition: "all 0.2s ease",
            }}
          >
            {genre}
          </motion.span>
        )}
      </div>
    </motion.button>
  );
}
