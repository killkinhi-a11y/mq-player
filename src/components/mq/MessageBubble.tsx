"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion } from "framer-motion";
import { Lock, Play, Pause, Music2, Headphones, BookOpen, Loader2, Check, CheckCheck, ChevronDown } from "lucide-react";
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
  onSwipeReply?: (message: MessageData) => void;
}

// ── CSS Keyframes for waveform — moved to globals.css ─────────

// ── Fake waveform bars generator ────────────────────────────

function FakeWaveform({ playing, isMine, progress }: { playing: boolean; isMine: boolean; progress: number }) {
  const bars = 32;
  const heights = useRef(
    Array.from({ length: bars }, () => 10 + Math.random() * 26)
  );

  return (
    <div className="flex items-center gap-[2px] h-8 flex-1 min-w-0 relative">
      {heights.current.map((h, i) => {
        const isPlayed = (i / bars) * 100 < progress;
        return (
          <div
            key={i}
            className="w-[2.5px] rounded-full mq-wave-bar transition-colors duration-300"
            style={{
              height: `${h}px`,
              backgroundColor: isMine
                ? (isPlayed ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.35)")
                : (isPlayed ? "var(--mq-accent)" : "rgba(255,255,255,0.15)"),
              opacity: playing ? 0.9 : 0.3,
              animation: playing
                ? `mq-wave 0.${6 + (i % 4)}s ease-in-out ${i * 0.03}s infinite alternate`
                : "none",
            }}
          />
        );
      })}
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
  const [transcribing, setTranscribing] = useState(false);
  const [transcription, setTranscription] = useState<string | null>(null);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);

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

  const handleTranscribe = useCallback(async () => {
    if (transcribing || transcription) return;
    setTranscribing(true);
    setTranscriptionError(null);

    try {
      const res = await fetch("/api/messages/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceUrl }),
      });

      const data = await res.json();

      if (!res.ok) {
        setTranscriptionError(data.error || "Ошибка транскрибации");
        return;
      }

      if (data.text) {
        setTranscription(data.text);
      } else {
        setTranscriptionError("Не удалось распознать речь");
      }
    } catch {
      setTranscriptionError("Ошибка соединения");
    } finally {
      setTranscribing(false);
    }
  }, [transcribing, transcription, voiceUrl]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 min-w-[200px]">
        {/* Play / Pause */}
        <button
          onClick={togglePlay}
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-transform hover:scale-105 active:scale-95"
          style={{
            backgroundColor: isMine ? "rgba(255,255,255,0.2)" : "var(--mq-accent)",
          }}
        >
          {playing ? (
            <Pause className="w-4 h-4" style={{ color: isMine ? "#fff" : "#fff" }} />
          ) : (
            <Play className="w-4 h-4" style={{ color: "#fff", marginLeft: 1 }} />
          )}
        </button>

        {/* Waveform with progress */}
        <div className="flex-1 min-w-0">
          <FakeWaveform playing={playing} isMine={isMine} progress={progress} />
        </div>

        {/* Duration */}
        <span
          className="text-[11px] flex-shrink-0 tabular-nums"
          style={{
            color: isMine ? "rgba(255,255,255,0.7)" : "var(--mq-text-muted)",
          }}
        >
          {playing ? formatTime(currentTime) : formatTime(duration)}
        </span>
      </div>

      {/* Transcribe button */}
      {!transcription && !transcribing && (
        <button
          onClick={handleTranscribe}
          className="flex items-center gap-1.5 text-[11px] font-medium transition-opacity hover:opacity-80 active:opacity-70 self-start mt-0.5"
          style={{ color: isMine ? "rgba(255,255,255,0.6)" : "var(--mq-text-muted)" }}
          title="Транскрибировать голосовое сообщение"
        >
          <BookOpen className="w-3.5 h-3.5" />
          Транскрибировать
        </button>
      )}

      {/* Transcribing spinner */}
      {transcribing && (
        <div className="flex items-center gap-1.5 text-[11px] self-start mt-0.5" style={{ color: isMine ? "rgba(255,255,255,0.5)" : "var(--mq-text-muted)" }}>
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Транскрибация…
        </div>
      )}

      {/* Transcription result */}
      {transcription && (
        <div
          className="text-[12px] leading-relaxed rounded-lg px-3 py-2 mt-0.5 max-w-[100%] break-words"
          style={{
            backgroundColor: isMine ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.04)",
            color: isMine ? "rgba(255,255,255,0.9)" : "var(--mq-text)",
            borderLeft: `2px solid ${isMine ? "rgba(255,255,255,0.4)" : "var(--mq-accent)"}`,
          }}
        >
          {transcription}
        </div>
      )}

      {/* Transcription error */}
      {transcriptionError && (
        <p className="text-[11px] self-start mt-0.5" style={{ color: isMine ? "rgba(255,255,255,0.4)" : "var(--mq-text-muted)" }}>
          {transcriptionError}
        </p>
      )}
    </div>
  );
}

// ── Reply Preview Component ─────────────────────────────────

function ReplyPreview({
  replyTo,
  onReplyClick,
  isMine,
}: {
  replyTo: ReplyToData;
  onReplyClick?: (replyToId: string) => void;
  isMine: boolean;
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
        flex items-stretch gap-2 rounded-lg px-2.5 py-1.5 mb-1.5 cursor-pointer
        transition-colors duration-150
      `}
      style={{
        backgroundColor: isMine ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
        borderLeft: `3px solid ${isMine ? "rgba(255,255,255,0.5)" : "var(--mq-accent)"}`,
      }}
      title="Перейти к сообщению"
    >
      <div className="min-w-0 flex-1">
        <p
          className="text-[11px] font-bold leading-tight truncate"
          style={{ color: isMine ? "rgba(255,255,255,0.8)" : "var(--mq-accent)" }}
        >
          {senderLabel}
        </p>
        <p
          className="text-[11px] leading-snug truncate mt-0.5"
          style={{ color: isMine ? "rgba(255,255,255,0.55)" : "var(--mq-text-muted)" }}
        >
          {truncated}
        </p>
      </div>
    </div>
  );
}

// ── @mention renderer ───────────────────────────────────────

function renderTextWithMentions(text: string, isMine: boolean) {
  const parts = text.split(/(@\w+)/g);
  return parts.map((part, i) => {
    if (part.startsWith("@")) {
      return (
        <span key={i} style={{ color: isMine ? "rgba(255,255,255,0.9)" : "var(--mq-accent)", fontWeight: 600 }}>
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
  onSwipeReply,
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
            className="rounded-2xl px-4 py-2.5"
            style={{
              backgroundColor: isMine ? "color-mix(in srgb, var(--mq-accent) 85%, rgba(255,255,255,0.18))" : "var(--mq-card)",
              border: isMine ? "none" : "1px solid rgba(255,255,255,0.08)",
              borderTopRightRadius: isMine ? "6px" : undefined,
              borderTopLeftRadius: isMine ? undefined : "6px",
            }}
          >
            <p
              className="text-xs italic"
              style={{ color: isMine ? "rgba(255,255,255,0.5)" : "var(--mq-text-muted)" }}
            >
              Сообщение удалено
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
              boxShadow: "var(--mq-shadow-card)",
            }}
          >
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: "var(--mq-accent)" }}>
              <Headphones className="w-5 h-5" style={{ color: "#fff" }} />
            </div>
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
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-medium transition-opacity hover:opacity-80"
              style={{ backgroundColor: "var(--mq-accent)", color: "#fff" }}
            >
              <Headphones className="w-3.5 h-3.5" />
              Принять
            </button>
          </div>
        </motion.div>
      );
    }

    // P1-fix: don't show raw system content (JSON, codes, etc.)
    let systemText = displayContent;
    if (systemText.startsWith("{") || systemText.startsWith("[")) {
      try {
        const parsed = JSON.parse(systemText);
        systemText = parsed.type === "track_share" ? "🎵 Трек" :
                     parsed.type === "voice" ? "🎤 Голосовое сообщение" :
                     parsed.title || parsed.content || "Системное сообщение";
      } catch { /* keep original */ }
    }
    // Hide raw ENC: prefix if it somehow survived
    if (systemText.startsWith("ENC:")) {
      systemText = "Зашифрованное сообщение";
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
            {systemText}
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
          className="text-5xl py-2 px-2 select-none cursor-default"
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
              className="text-[11px] mb-1 ml-3 font-semibold"
              style={{ color: "var(--mq-accent)" }}
            >
              {message.senderName}
            </p>
          )}
          {/* Reply preview */}
          {message.replyTo && onReplyClick && (
            <ReplyPreview replyTo={message.replyTo} onReplyClick={onReplyClick} isMine={isMine} />
          )}
          <div
            className="rounded-2xl px-4 py-3 relative"
            style={{
              backgroundColor: isMine ? "color-mix(in srgb, var(--mq-accent) 85%, rgba(255,255,255,0.18))" : "var(--mq-card)",
              border: isMine ? "none" : "1px solid rgba(255,255,255,0.08)",
              boxShadow: isMine
                ? "0 2px 16px rgba(var(--mq-accent-rgb, 255,45,109),0.25)"
                : "0 1px 6px rgba(0,0,0,0.12)",
              borderTopRightRadius: isMine ? "6px" : undefined,
              borderTopLeftRadius: isMine ? undefined : "6px",
            }}
          >
            <VoicePlayer
              voiceUrl={message.voiceUrl!}
              voiceDuration={message.voiceDuration ?? null}
              isMine={isMine}
            />
            <div className="flex items-center justify-end gap-1.5 mt-2">
              {message.encrypted && isMine && (
                <span title="Передано по TLS"><Lock className="w-3 h-3" style={{ color: "#64748b" }} /></span>
              )}
              <span
                className="text-[11px]"
                style={{ color: isMine ? "rgba(255,255,255,0.6)" : "var(--mq-text-muted)" }}
              >
                {time}
              </span>
              {isMine && (
                <CheckCheck className="w-3 h-3" style={{ color: "rgba(255,255,255,0.5)" }} />
              )}
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
          className="flex items-center gap-3 mb-2 p-2 rounded-xl cursor-pointer"
          style={{
            backgroundColor: isMine ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)",
            border: `1px solid ${isMine ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.08)"}`,
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
            <div className="relative flex-shrink-0 group/cover">
              <img
                src={trackShareData.cover}
                alt={trackShareData.title}
                className="w-14 h-14 rounded-lg object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center rounded-lg opacity-0 group-hover/cover:opacity-100 transition-opacity" style={{ backgroundColor: "rgba(0,0,0,0.45)" }}>
                <Play className="w-5 h-5 text-white" style={{ marginLeft: 2 }} />
              </div>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate" style={{ color: isMine ? "#fff" : "var(--mq-text)" }}>
              {trackShareData.title}
            </p>
            <p className="text-[11px] truncate" style={{ color: isMine ? "rgba(255,255,255,0.65)" : "var(--mq-text-muted)" }}>
              {trackShareData.artist}
            </p>
          </div>
          <Music2 className="w-4 h-4 flex-shrink-0" style={{ color: isMine ? "rgba(255,255,255,0.5)" : "var(--mq-accent)" }} />
        </motion.div>
      );
    }

    if (isTrackShare && !trackShareData) {
      return (
        <div
          className="flex items-center gap-2 mb-1.5 p-2 rounded-lg"
          style={{ backgroundColor: isMine ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)" }}
        >
          <Music2 className="w-4 h-4" style={{ color: isMine ? "rgba(255,255,255,0.6)" : "var(--mq-accent)" }} />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate" style={{ color: isMine ? "#fff" : "var(--mq-text)" }}>
              Поделился треком
            </p>
          </div>
        </div>
      );
    }

    // Normal text with mentions
    return renderTextWithMentions(displayContent, isMine);
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
            className="text-[11px] mb-1 ml-3 font-semibold"
            style={{ color: "var(--mq-accent)" }}
          >
            {message.senderName}
          </p>
        )}

        {/* Reply preview */}
        {message.replyTo && onReplyClick && (
          <ReplyPreview replyTo={message.replyTo} onReplyClick={onReplyClick} isMine={isMine} />
        )}

        {/* Bubble */}
        <div
          className="rounded-2xl px-3.5 py-2 relative"
          style={{
            backgroundColor: isMine
              ? "color-mix(in srgb, var(--mq-accent) 85%, rgba(255,255,255,0.18))"
              : "var(--mq-card)",
            border: isMine ? "none" : "1px solid rgba(255,255,255,0.08)",
            boxShadow: isMine
              ? "0 2px 16px rgba(var(--mq-accent-rgb, 255,45,109),0.25)"
              : "0 1px 6px rgba(0,0,0,0.12)",
            borderTopRightRadius: isMine ? "6px" : undefined,
            borderTopLeftRadius: isMine ? undefined : "6px",
          }}
        >
          {/* Message content */}
          {isTrackShare || isImageUrl ? (
            contentRenderer()
          ) : (
            <div className="text-sm break-words whitespace-pre-wrap" style={{
              color: isMine ? "#fff" : "var(--mq-text)",
              overflowWrap: "break-word",
              wordBreak: displayContent.length > 100 ? "break-all" : "break-word",
            }}>
              {renderTextWithMentions(displayContent, isMine)}
            </div>
          )}

          {/* Timestamp + lock + edited + checkmarks — inline at end */}
          <div className="flex items-center justify-end gap-1 mt-1 -mb-0.5">
            {isEdited && (
              <span className="text-[11px] italic" style={{ color: isMine ? "rgba(255,255,255,0.45)" : "var(--mq-text-muted)" }}>
                ред.
              </span>
            )}
            {message.encrypted && isMine && (
              <span title="Передано по TLS"><Lock className="w-3 h-3" style={{ color: "#64748b" }} /></span>
            )}
            <span
              className="text-[11px] tabular-nums"
              style={{ color: isMine ? "rgba(255,255,255,0.5)" : "var(--mq-text-muted)" }}
            >
              {time}
            </span>
            {isMine && (
              <CheckCheck className="w-3 h-3" style={{ color: "rgba(255,255,255,0.5)" }} />
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
