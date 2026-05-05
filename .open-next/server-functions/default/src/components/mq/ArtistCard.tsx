"use client";

import { motion } from "framer-motion";
import { Music } from "lucide-react";

interface ArtistCardProps {
  avatar?: string;
  username: string;
  genre?: string;
  onClick?: () => void;
  index?: number;
  animationsEnabled?: boolean;
}

export default function ArtistCard({ avatar, username, genre, onClick, index = 0, animationsEnabled = true }: ArtistCardProps) {
  const initials = username
    .replace("@", "")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase())
    .slice(0, 2)
    .join("");

  const hasAvatar = avatar && avatar.trim() !== "" && avatar !== "null" && avatar !== "undefined";

  return (
    <motion.button
      initial={animationsEnabled ? { opacity: 0, x: 20 } : undefined}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04 }}
      whileHover={{ scale: 1.05, y: -2 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className="flex-shrink-0 w-[100px] sm:w-[120px] flex flex-col items-center gap-2 cursor-pointer group"
    >
      {/* Circular avatar */}
      <div
        className="w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden flex-shrink-0 shadow-lg shadow-black/20 group-hover:shadow-xl transition-shadow duration-200"
        style={{ border: "2px solid var(--mq-border)" }}
      >
        {hasAvatar ? (
          <img
            src={avatar}
            alt={username}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
              (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
            }}
          />
        ) : null}
        <div
          className={`w-full h-full flex items-center justify-center ${hasAvatar ? "hidden" : ""}`}
          style={{ backgroundColor: "var(--mq-accent)", opacity: 0.7 }}
        >
          {hasAvatar ? null : (
            <span className="text-lg sm:text-xl font-bold" style={{ color: "var(--mq-text)" }}>
              {initials || "?"}
            </span>
          )}
        </div>
      </div>

      {/* Name */}
      <p
        className="text-xs font-semibold truncate w-full text-center leading-tight group-hover:opacity-80 transition-opacity"
        style={{ color: "var(--mq-text)" }}
      >
        {username}
      </p>

      {/* Genre tag */}
      {genre && (
        <span
          className="text-[10px] px-2 py-0.5 rounded-full truncate max-w-full"
          style={{
            backgroundColor: "var(--mq-card)",
            color: "var(--mq-text-muted)",
            border: "1px solid var(--mq-border)",
          }}
        >
          {genre}
        </span>
      )}
    </motion.button>
  );
}
