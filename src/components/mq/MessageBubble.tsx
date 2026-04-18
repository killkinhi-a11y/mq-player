"use client";

import { useAppStore } from "@/store/useAppStore";
import { motion } from "framer-motion";
import { Lock, Play, Music2 } from "lucide-react";
import { simulateDecryptSync } from "@/lib/crypto";

interface MessageBubbleProps {
  message: {
    id: string;
    content: string;
    senderId: string;
    receiverId: string;
    encrypted: boolean;
    createdAt: string;
    senderName?: string;
    messageType?: string;
  };
  currentUserId?: string;
}

export default function MessageBubble({ message, currentUserId }: MessageBubbleProps) {
  const isMine = message.senderId === currentUserId;
  const time = new Date(message.createdAt).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Decrypt content for display
  const displayContent = (() => {
    try {
      return simulateDecryptSync(message.content);
    } catch {
      return message.content;
    }
  })();

  // Check if content is an image URL
  const isImageUrl = /^https?:\/\/.*\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(displayContent.trim());

  // Check if it's a JSON track_share message
  let trackShareData: { id: string; title: string; artist: string; cover: string; duration: number; streamUrl: string } | null = null;
  const isTrackShare = (() => {
    try {
      const parsed = JSON.parse(message.content);
      if (parsed && parsed.type === "track_share" && parsed.track) {
        trackShareData = parsed.track;
        return true;
      }
    } catch {}
    // Fallback: check for emoji prefix (legacy format)
    return displayContent.startsWith("🎵");
  })();

  // Highlight @mentions in text
  const renderContent = () => {
    if (isImageUrl) {
      return (
        <img
          src={displayContent.trim()}
          alt="Image"
          className="rounded-lg max-w-full max-h-64 object-cover"
          loading="lazy"
        />
      );
    }

    const parts = displayContent.split(/(@\w+)/g);
    return parts.map((part, i) => {
      if (part.startsWith("@")) {
        return (
          <span key={i} style={{ color: "var(--mq-accent)", fontWeight: 600 }}>
            {part}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={`flex ${isMine ? "justify-end" : "justify-start"}`}
    >
      <div className="max-w-[80%] lg:max-w-[65%]">
        {/* Show sender name for received messages */}
        {!isMine && message.senderName && (
          <p className="text-[10px] mb-1 ml-1" style={{ color: "var(--mq-accent)" }}>
            {message.senderName}
          </p>
        )}
        <div
          className="rounded-2xl px-4 py-2.5 relative"
          style={{
            backgroundColor: isMine ? "var(--mq-accent)" : "var(--mq-card)",
            borderBottomRightRadius: isMine ? "6px" : undefined,
            borderBottomLeftRadius: isMine ? undefined : "6px",
            borderTopRightRadius: isMine ? "6px" : undefined,
            borderTopLeftRadius: isMine ? undefined : "6px",
            border: isMine ? "none" : "1px solid var(--mq-border)",
          }}
        >
          {/* Track share card */}
          {isTrackShare && trackShareData && (
            <motion.div
              className="flex items-center gap-3 mb-2 p-2.5 rounded-xl cursor-pointer"
              style={{ backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                const store = useAppStore.getState();
                if (trackShareData.streamUrl || trackShareData.cover) {
                  store.playTrack({
                    id: trackShareData.id,
                    title: trackShareData.title,
                    artist: trackShareData.artist,
                    cover: trackShareData.cover,
                    audioUrl: trackShareData.streamUrl || "",
                    duration: trackShareData.duration,
                  }, []);
                }
              }}
            >
              {trackShareData.cover && (
                <img
                  src={trackShareData.cover}
                  alt={trackShareData.title}
                  className="w-11 h-11 rounded-lg object-cover flex-shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate" style={{ color: "var(--mq-text)" }}>
                  {trackShareData.title}
                </p>
                <p className="text-[11px] truncate" style={{ color: "var(--mq-text-muted)" }}>
                  {trackShareData.artist}
                </p>
              </div>
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: "var(--mq-accent)" }}
              >
                <Play className="w-3.5 h-3.5" style={{ color: "var(--mq-text)", marginLeft: 1 }} />
              </div>
            </motion.div>
          )}
          {isTrackShare && !trackShareData && (
            <div
              className="flex items-center gap-2 mb-1.5 p-2 rounded-lg"
              style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
            >
              <Music2 className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate" style={{ color: "var(--mq-text)" }}>
                  Поделился треком
                </p>
              </div>
            </div>
          )}
          {!isTrackShare && (
          <div className="text-sm break-words" style={{ color: "var(--mq-text)" }}>
            {renderContent()}
          </div>
          )}

          <div className="flex items-center justify-end gap-1 mt-1">
            {message.encrypted && (
              <div className="flex items-center gap-0.5" title="Зашифровано">
                <Lock className="w-2.5 h-2.5" style={{ color: isMine ? "var(--mq-text)" : "var(--mq-accent)", opacity: 0.7 }} />
              </div>
            )}
            <span className="text-[10px]" style={{ color: isMine ? "var(--mq-text)" : "var(--mq-text-muted)", opacity: 0.7 }}>
              {time}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
