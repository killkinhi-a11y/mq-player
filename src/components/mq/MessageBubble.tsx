"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion } from "framer-motion";
import { Lock, Play, Pause, Music2, Headphones } from "lucide-react";
import { simulateDecryptSync } from "@/lib/crypto";

// ── Types ────────────────────────────────────────────────────

interface ReplyToData {
  id: string;
  content: string;
  senderId: string;
  senderName?: string;
}

interface MessageData {
  id: string;
  content: string;
  senderId: string;
  receiverId: string;
  encrypted: boolean;
  createdAt: string;
  senderName?: string;
  messageType?: string;
  replyToId?: string;
  replyTo?: ReplyToData | null;
  edited?: boolean;
  deleted?: boolean;
  voiceUrl?: string | null;
  voiceDuration?: number | null;
}

interface MessageBubbleProps {
  message: MessageData;
  currentUserId?: string;
  onReplyClick?: (replyToId: string) => void;
}

// ── Fake waveform bars generator ────────────────────────────

function FakeWaveform({ playing, isMine }: { playing: boolean; isMine: boolean }) {
  const bars = 28;
  const heights = useRef(
    Array.from({ length: bars }, () => 12 + Math.random() * 28)
  );

  return (
    <div className="flex items-center gap-[2px] h-8 flex-1 min-w-0">
      {heights.current.map((h, i) => (
        <div
          key={i}
          className="w-[3px] rounded-full transition-all duration-300"
          style={{
            height: `${playing ? h : 6}px`,
            backgroundColor: isMine
              ? "var(--mq-text)"
              : "var(--mq-accent)",
            opacity: playing ? 0.9 : 0.35,
            animation: playing
              ? `mq-wave 0.${6 + (i % 4)}s ease-in-out ${i * 0.03}s infinite alternate`
              : "none",
          }}
        />
      ))}
      <style>{`
        @keyframes mq-wave {
          0% { transform: scaleY(0.35); }
          100% { transform: scaleY(1); }
        }
      `}</style>
    </div>
  );
}

// ── Voice Player Component ──────────────────────────────────

function VoicePlayer({
  voiceUrl,
  voiceDuration,
  isMine,
}: {
  voiceUrl: string;
  voiceDuration: number | null;
  isMine: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(voiceDuration || 0);

  useEffect(() => {
    const audio = new Audio(voiceUrl);
    audioRef.current = audio;

    const onLoaded = () => setDuration(audio.duration || voiceDuration || 0);
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onEnded = () => {
      setPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
      audio.pause();
      audio.src = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceUrl]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play().catch(() => {});
      setPlaying(true);
    }
  }, [playing]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-3 min-w-[220px]">
      {/* Play / Pause */}
      <button
        onClick={togglePlay}
        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-transform hover:scale-105 active:scale-95"
        style={{
          backgroundColor: isMine ? "rgba(255,255,255,0.2)" : "var(--mq-accent)",
        }}
      >
        {playing ? (
          <Pause className="w-4 h-4" style={{ color: isMine ? "var(--mq-text)" : "var(--mq-text)" }} />
        ) : (
          <Play className="w-4 h-4" style={{ color: isMine ? "var(--mq-text)" : "var(--mq-text)", marginLeft: 1 }} />
        )}
      </button>

      {/* Waveform + progress bar */}
      <div className="relative flex-1 min-w-0">
        <div className="absolute inset-0 flex items-center">
          <div
            className="h-[2px] rounded-full transition-all duration-200"
            style={{
              width: `${progress}%`,
              backgroundColor: isMine ? "var(--mq-text)" : "var(--mq-accent)",
              opacity: 0.5,
            }}
          />
        </div>
        <FakeWaveform playing={playing} isMine={isMine} />
      </div>

      {/* Duration */}
      <span
        className="text-[10px] flex-shrink-0 tabular-nums"
        style={{
          color: isMine ? "var(--mq-text)" : "var(--mq-text-muted)",
          opacity: 0.7,
        }}
      >
        {playing ? formatTime(currentTime) : formatTime(duration)}
      </span>
    </div>
  );
}

// ── Reply Preview Component ─────────────────────────────────

function ReplyPreview({
  replyTo,
  onReplyClick,
}: {
  replyTo: ReplyToData;
  onReplyClick?: (replyToId: string) => void;
}) {
  const truncated =
    replyTo.content.length > 50
      ? replyTo.content.slice(0, 50) + "…"
      : replyTo.content;

  const senderLabel = replyTo.senderName || "User";

  return (
    <div
      onClick={() => onReplyClick?.(replyTo.id)}
      className={`
        flex items-stretch gap-2 rounded-xl px-3 py-2 mb-1.5 cursor-pointer
        transition-colors duration-150
      `}
      style={{
        backgroundColor: "rgba(255,255,255,0.04)",
        borderLeft: "4px solid var(--mq-accent)",
      }}
      title="Перейти к сообщению"
    >
      {/* Vertical accent line is handled by borderLeft above */}
      <div className="min-w-0 flex-1">
        <p
          className="text-[10px] font-bold leading-tight truncate"
          style={{ color: "var(--mq-accent)" }}
        >
          {senderLabel}
        </p>
        <p
          className="text-[10px] leading-snug truncate mt-0.5"
          style={{ color: "var(--mq-text-muted)" }}
        >
          {truncated}
        </p>
      </div>
    </div>
  );
}

// ── @mention renderer ───────────────────────────────────────

function renderTextWithMentions(text: string) {
  const parts = text.split(/(@\w+)/g);
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
}

// ── Main Component ──────────────────────────────────────────

export default function MessageBubble({
  message,
  currentUserId,
  onReplyClick,
}: MessageBubbleProps) {
  const isMine = message.senderId === currentUserId;

  const time = new Date(message.createdAt).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // ── Decrypt content ──
  const displayContent = (() => {
    try {
      return simulateDecryptSync(message.content);
    } catch {
      return message.content;
    }
  })();

  // ── Detect special types ──
  const isImageUrl = /^https?:\/\/.*\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(
    displayContent.trim()
  );

  let trackShareData: {
    id: string;
    title: string;
    artist: string;
    cover: string;
    duration: number;
    streamUrl: string;
    scTrackId?: number;
    source?: string;
  } | null = null;
  const isTrackShare = (() => {
    try {
      const parsed = JSON.parse(message.content);
      if (parsed && parsed.type === "track_share" && parsed.track) {
        trackShareData = parsed.track;
        return true;
      }
    } catch {
      /* not JSON */
    }
    return displayContent.startsWith("🎵");
  })();

  const isVoice = message.messageType === "voice" && !!message.voiceUrl;
  const isSticker = message.messageType === "sticker";
  const isDeleted = message.deleted === true;
  const isSystem = message.messageType === "system";
  const isEdited = message.edited === true;

  // ── Deleted message ──
  if (isDeleted) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className={`flex ${isMine ? "justify-end" : "justify-start"} w-full`}
      >
        <div className="max-w-[80%] lg:max-w-[65%] w-fit">
          <div
            className="rounded-2xl px-4 py-2"
            style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
          >
            <p
              className="text-xs italic"
              style={{ color: "var(--mq-text-muted)", opacity: 0.6 }}
            >
              [Удалено]
            </p>
          </div>
        </div>
      </motion.div>
    );
  }

  // ── System message ──
  if (isSystem) {
    // Check for listen together invite
    if (displayContent.startsWith("listen_invite:")) {
      const sessionId = displayContent.replace("listen_invite:", "");
      return (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-center w-full"
        >
          <div
            className="rounded-2xl px-5 py-3 max-w-[85%] flex flex-col items-center gap-2"
            style={{
              backgroundColor: "var(--mq-card)",
              border: "1px solid var(--mq-border)",
            }}
          >
            <p className="text-xs text-center font-medium" style={{ color: "var(--mq-text)" }}>
              Приглашение слушать вместе
            </p>
            <p className="text-[11px] text-center" style={{ color: "var(--mq-text-muted)" }}>
              Присоединиться к совместному прослушиванию?
            </p>
            <button
              onClick={async () => {
                try {
                  const res = await fetch("/api/listen-session/accept", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ sessionId }),
                  });
                  if (res.ok) {
                    const data = await res.json();
                    useAppStore.getState().setListenSession(data.session);
                  }
                } catch {}
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium transition-opacity hover:opacity-80"
              style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}
            >
              <Headphones className="w-3.5 h-3.5" />
              Принять
            </button>
          </div>
        </motion.div>
      );
    }

    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-center w-full"
      >
        <div
          className="rounded-full px-4 py-1.5 max-w-[75%]"
          style={{
            backgroundColor: "var(--mq-card)",
            border: "1px solid var(--mq-border)",
          }}
        >
          <p
            className="text-[11px] text-center break-words"
            style={{ color: "var(--mq-text-muted)" }}
          >
            {displayContent}
          </p>
        </div>
      </motion.div>
    );
  }

  // ── Sticker message ──
  if (isSticker) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 20 }}
        className={`flex ${isMine ? "justify-end" : "justify-start"} w-full`}
      >
        <div
          className="text-5xl py-2 select-none cursor-default"
          style={{ lineHeight: 1.2 }}
          role="img"
          aria-label={displayContent}
        >
          {displayContent}
        </div>
      </motion.div>
    );
  }

  // ── Voice message ──
  if (isVoice) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className={`flex ${isMine ? "justify-end" : "justify-start"} w-full`}
      >
        <div className="max-w-[85%] lg:max-w-[70%] w-fit">
          {!isMine && message.senderName && (
            <p
              className="text-[10px] mb-1 ml-1 font-medium"
              style={{ color: "var(--mq-accent)" }}
            >
              {message.senderName}
            </p>
          )}
          {/* Reply preview */}
          {message.replyTo && onReplyClick && (
            <ReplyPreview replyTo={message.replyTo} onReplyClick={onReplyClick} />
          )}
          <div
            className="rounded-2xl px-4 py-3 relative"
            style={{
              backgroundColor: isMine ? "var(--mq-accent)" : "var(--mq-card)",
              border: isMine ? "none" : "1px solid var(--mq-border)",
              boxShadow: "0 2px 16px rgba(0,0,0,0.12)",
              backdropFilter: "blur(8px)",
              borderBottomRightRadius: isMine ? "6px" : undefined,
              borderBottomLeftRadius: isMine ? undefined : "6px",
            }}
          >
            <VoicePlayer
              voiceUrl={message.voiceUrl!}
              voiceDuration={message.voiceDuration ?? null}
              isMine={isMine}
            />
            <div className="flex items-center justify-end gap-1 mt-1.5">
              {message.encrypted && (
                <Lock
                  className="w-2.5 h-2.5"
                  style={{
                    color: isMine ? "var(--mq-text)" : "var(--mq-accent)",
                    opacity: 0.7,
                  }}
                />
              )}
              <span
                className="text-[10px]"
                style={{
                  color: isMine ? "var(--mq-text)" : "var(--mq-text-muted)",
                  opacity: 0.7,
                }}
              >
                {time}
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // ── Standard text / image / track share message ──
  const contentRenderer = () => {
    if (isImageUrl) {
      return (
        <img
          src={displayContent.trim()}
          alt="Image"
          className="rounded-xl max-w-full max-h-64 object-cover"
          loading="lazy"
        />
      );
    }

    if (isTrackShare && trackShareData) {
      return (
        <motion.div
          className="flex items-center gap-3 mb-2 p-2.5 rounded-xl cursor-pointer"
          style={{
            backgroundColor: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            const store = useAppStore.getState();
            store.playTrack(
              {
                id: trackShareData!.id,
                title: trackShareData!.title,
                artist: trackShareData!.artist,
                cover: trackShareData!.cover,
                audioUrl: trackShareData!.streamUrl || "",
                duration: trackShareData!.duration,
                album: "",
                genre: "",
                source: (trackShareData!.source as any) || "soundcloud",
                scTrackId: trackShareData!.scTrackId,
              } as any,
              []
            );
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
            <p
              className="text-xs font-semibold truncate"
              style={{ color: "var(--mq-text)" }}
            >
              {trackShareData.title}
            </p>
            <p
              className="text-[11px] truncate"
              style={{ color: "var(--mq-text-muted)" }}
            >
              {trackShareData.artist}
            </p>
          </div>
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: "var(--mq-accent)" }}
          >
            <Play
              className="w-3.5 h-3.5"
              style={{ color: "var(--mq-text)", marginLeft: 1 }}
            />
          </div>
        </motion.div>
      );
    }

    if (isTrackShare && !trackShareData) {
      return (
        <div
          className="flex items-center gap-2 mb-1.5 p-2 rounded-lg"
          style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
        >
          <Music2 className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
          <div className="flex-1 min-w-0">
            <p
              className="text-xs font-medium truncate"
              style={{ color: "var(--mq-text)" }}
            >
              Поделился треком
            </p>
          </div>
        </div>
      );
    }

    // Normal text with mentions
    return renderTextWithMentions(displayContent);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={`flex ${isMine ? "justify-end" : "justify-start"} w-full`}
    >
      <div className="max-w-[85%] lg:max-w-[70%] w-fit" style={{ minWidth: 0 }}>
        {/* Sender name (received messages only) */}
        {!isMine && message.senderName && (
          <p
            className="text-[10px] mb-1 ml-1 font-medium"
            style={{ color: "var(--mq-accent)" }}
          >
            {message.senderName}
          </p>
        )}

        {/* Reply preview */}
        {message.replyTo && onReplyClick && (
          <ReplyPreview replyTo={message.replyTo} onReplyClick={onReplyClick} />
        )}

        {/* Bubble */}
        <div
          className="rounded-2xl px-4 py-2.5 relative transition-shadow duration-200"
          style={{
            backgroundColor: isMine ? "var(--mq-accent)" : "var(--mq-card)",
            border: isMine ? "none" : "1px solid var(--mq-border)",
            boxShadow: "0 2px 16px rgba(0,0,0,0.10)",
            backdropFilter: "blur(8px)",
            borderBottomRightRadius: isMine ? "6px" : undefined,
            borderBottomLeftRadius: isMine ? undefined : "6px",
            borderTopRightRadius: isMine ? "6px" : undefined,
            borderTopLeftRadius: isMine ? undefined : "6px",
          }}
        >
          {/* Message content */}
          {isTrackShare ? (
            contentRenderer()
          ) : isImageUrl ? (
            contentRenderer()
          ) : (
            <div className="text-sm break-words whitespace-pre-wrap" style={{ color: "var(--mq-text)", overflowWrap: "break-word", wordBreak: "break-word" }}>
              {renderTextWithMentions(displayContent)}
            </div>
          )}

          {/* Timestamp + lock + edited */}
          <div className="flex items-center justify-end gap-1 mt-1">
            {message.encrypted && (
              <div className="flex items-center gap-0.5" title="Зашифровано">
                <Lock
                  className="w-2.5 h-2.5"
                  style={{
                    color: isMine ? "var(--mq-text)" : "var(--mq-accent)",
                    opacity: 0.7,
                  }}
                />
              </div>
            )}
            <span
              className="text-[10px]"
              style={{
                color: isMine ? "var(--mq-text)" : "var(--mq-text-muted)",
                opacity: 0.7,
              }}
            >
              {time}
            </span>
            {isEdited && (
              <span
                className="text-[10px]"
                style={{ color: "var(--mq-text-muted)", opacity: 0.6 }}
              >
                ред.
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
