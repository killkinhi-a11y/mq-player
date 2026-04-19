"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import { type Track } from "@/lib/musicApi";
import {
  Camera, Plus, X, ChevronLeft, ChevronRight, Play, Pause,
  Heart, MessageCircle, Clock, Eye, Sparkles, Image as ImageIcon,
  Music2, Trash2, Send
} from "lucide-react";

interface Story {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  content: string; // text, image URL, or track JSON
  contentType: "text" | "image" | "track";
  createdAt: string;
  expiresAt: string;
  viewed: boolean;
  likes: number;
  trackData?: {
    id: string;
    title: string;
    artist: string;
    cover: string;
    duration: number;
    streamUrl: string;
  };
}

// Gradient backgrounds for text stories
const storyGradients = [
  "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
  "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
  "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
  "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
  "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
  "linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)",
  "linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)",
];

// Generate demo stories from liked tracks / trending
function mapApiStories(rawStories: any[]): Story[] {
  return rawStories.map((s: any) => {
    let trackData: Story['trackData'] | undefined;
    let contentType: Story['contentType'] = 'text';
    const contentStr = typeof s.content === 'string' ? s.content : '';
    if (s.type === 'music' || s.type === 'track') {
      contentType = 'track';
      try {
        const parsed = JSON.parse(contentStr);
        if (parsed.track) {
          trackData = parsed.track;
        }
      } catch {}
    } else if (s.type === 'image') {
      contentType = 'image';
    }
    return {
      id: s.id,
      userId: s.userId,
      username: s.user?.username || 'User',
      avatar: `https://picsum.photos/seed/${s.user?.username || s.userId}/100/100`,
      content: contentType === 'track' ? contentStr : contentStr,
      contentType,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      viewed: false,
      likes: s.likes?.length || 0,
      trackData,
    };
  });
}

export default function StoriesView() {
  const { userId, username, likedTracksData, animationsEnabled, playTrack } = useAppStore();
  const [stories, setStories] = useState<Story[]>([]);

  // Fetch stories from API on mount
  useEffect(() => {
    const fetchStories = async () => {
      try {
        const res = await fetch('/api/stories?all=true');
        if (res.ok) {
          const data = await res.json();
          setStories(mapApiStories(data.stories || []));
        }
      } catch {
        // silent
      }
    };
    fetchStories();
  }, []);
  const [viewingIndex, setViewingIndex] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newStoryText, setNewStoryText] = useState("");
  const [selectedGradient, setSelectedGradient] = useState(0);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const STORY_DURATION = 5000; // 5 seconds per story

  const viewingStory = viewingIndex !== null ? stories[viewingIndex] : null;

  // Auto-advance story
  useEffect(() => {
    if (viewingIndex === null) return;
    setProgress(0);

    if (isPaused) {
      if (progressRef.current) clearInterval(progressRef.current);
      return;
    }

    progressRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(progressRef.current!);
          // Auto advance to next story
          if (viewingIndex < stories.length - 1) {
            setViewingIndex((prev) => (prev !== null ? prev + 1 : null));
          } else {
            setViewingIndex(null);
          }
          return 0;
        }
        return prev + (100 / (STORY_DURATION / 100));
      });
    }, 100);

    return () => {
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, [viewingIndex, isPaused, stories.length]);

  const handlePrevStory = useCallback(() => {
    if (viewingIndex !== null && viewingIndex > 0) {
      setViewingIndex(viewingIndex - 1);
      setProgress(0);
    }
  }, [viewingIndex]);

  const handleNextStory = useCallback(() => {
    if (viewingIndex !== null && viewingIndex < stories.length - 1) {
      setViewingIndex(viewingIndex + 1);
      setProgress(0);
    } else {
      setViewingIndex(null);
    }
  }, [viewingIndex, stories.length]);

  const closeViewer = useCallback(() => {
    setViewingIndex(null);
    setProgress(0);
  }, []);

  const handlePlayTrack = useCallback((story: Story) => {
    if (story.trackData) {
      const track: Track = {
        id: story.trackData.id,
        title: story.trackData.title,
        artist: story.trackData.artist,
        album: "",
        duration: story.trackData.duration,
        cover: story.trackData.cover,
        genre: "",
        audioUrl: story.trackData.streamUrl || story.trackData.cover || "",
        source: "soundcloud",
      };
      playTrack(track, []);
    }
  }, [playTrack]);

  const createStory = useCallback(async () => {
    if (!newStoryText.trim() || !userId) return;
    try {
      const res = await fetch('/api/stories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, type: 'text', content: newStoryText.trim() }),
      });
      if (res.ok) {
        setShowCreateModal(false);
        setNewStoryText('');
        // Refresh stories
        const storiesRes = await fetch('/api/stories?all=true');
        if (storiesRes.ok) {
          const storiesData = await storiesRes.json();
          setStories(mapApiStories(storiesData.stories || []));
        }
      }
    } catch {
      // silent
    }
  }, [newStoryText, userId]);

  // Group stories by unique user
  const storyGroups = stories.reduce<Record<string, Story[]>>((acc, story) => {
    if (!acc[story.userId]) acc[story.userId] = [];
    acc[story.userId].push(story);
    return acc;
  }, {});

  const groupKeys = Object.keys(storyGroups);

  return (
    <div className="p-4 lg:p-6 pb-40 lg:pb-28">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Sparkles className="w-6 h-6" style={{ color: "var(--mq-accent)" }} />
          <h1 className="text-2xl font-bold" style={{ color: "var(--mq-text)" }}>Истории</h1>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
          style={{
            backgroundColor: "var(--mq-accent)",
            color: "var(--mq-text)",
          }}
        >
          <Plus className="w-4 h-4" />
          Создать
        </motion.button>
      </div>

      {/* Stories carousel */}
      <div className="flex gap-4 overflow-x-auto pb-4 mb-6 scrollbar-hide"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
        {/* Add story button */}
        <motion.button
          initial={animationsEnabled ? { opacity: 0, scale: 0.8 } : undefined}
          animate={{ opacity: 1, scale: 1 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowCreateModal(true)}
          className="flex flex-col items-center gap-2 flex-shrink-0 cursor-pointer"
        >
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center"
            style={{
              border: "2px dashed var(--mq-border)",
              backgroundColor: "var(--mq-card)",
            }}
          >
            <Plus className="w-6 h-6" style={{ color: "var(--mq-accent)" }} />
          </div>
          <span className="text-xs" style={{ color: "var(--mq-text-muted)" }}>Ваша история</span>
        </motion.button>

        {/* Story circles */}
        {groupKeys.map((userId, groupIdx) => {
          const userStories = storyGroups[userId];
          const firstStory = userStories[0];
          const hasUnviewed = userStories.some(s => !s.viewed);
          const firstUnviewedIdx = stories.findIndex(s => s.userId === userId && !s.viewed);

          return (
            <motion.button
              key={userId}
              initial={animationsEnabled ? { opacity: 0, scale: 0.8 } : undefined}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: (groupIdx + 1) * 0.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setViewingIndex(firstUnviewedIdx >= 0 ? firstUnviewedIdx : stories.indexOf(firstStory))}
              className="flex flex-col items-center gap-2 flex-shrink-0 cursor-pointer"
            >
              <div
                className="w-20 h-20 rounded-full p-[3px]"
                style={{
                  background: hasUnviewed
                    ? "linear-gradient(135deg, var(--mq-accent), #f5576c, #fa709a)"
                    : "var(--mq-border)",
                }}
              >
                <div className="w-full h-full rounded-full overflow-hidden" style={{ border: "3px solid var(--mq-bg)" }}>
                  <img
                    src={firstStory.avatar}
                    alt={firstStory.username}
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
              <span
                className="text-xs max-w-[72px] truncate"
                style={{ color: hasUnviewed ? "var(--mq-text)" : "var(--mq-text-muted)" }}
              >
                {firstStory.username}
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* Stories feed */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold" style={{ color: "var(--mq-text)" }}>Все истории</h2>
        {stories.map((story, i) => (
          <motion.button
            key={story.id}
            initial={animationsEnabled ? { opacity: 0, y: 10 } : undefined}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            onClick={() => setViewingIndex(i)}
            className="w-full flex items-center gap-4 p-4 rounded-xl text-left cursor-pointer"
            style={{
              backgroundColor: "var(--mq-card)",
              border: "1px solid var(--mq-border)",
              opacity: story.viewed ? 0.5 : 1,
            }}
          >
            <div className="relative flex-shrink-0">
              <img
                src={story.avatar}
                alt={story.username}
                className="w-12 h-12 rounded-full object-cover"
              />
              {story.contentType === "track" && (
                <div
                  className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "var(--mq-accent)" }}
                >
                  <Music2 className="w-3 h-3" style={{ color: "var(--mq-text)" }} />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>
                {story.username}
              </p>
              <p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>
                {story.contentType === "text"
                  ? story.content.slice(0, 60)
                  : story.contentType === "track"
                  ? `Поделился треком: ${story.trackData?.title || ""}`
                  : "Фото"}
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: "var(--mq-text-muted)" }}>
                {Math.floor((Date.now() - new Date(story.createdAt).getTime()) / 3600000)}ч назад
              </p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              {story.likes > 0 && (
                <div className="flex items-center gap-1">
                  <Heart className="w-3 h-3" style={{ color: "var(--mq-accent)" }} />
                  <span className="text-xs" style={{ color: "var(--mq-text-muted)" }}>{story.likes}</span>
                </div>
              )}
              {story.viewed && (
                <Eye className="w-3 h-3" style={{ color: "var(--mq-text-muted)" }} />
              )}
            </div>
          </motion.button>
        ))}
      </div>

      {/* Full screen story viewer */}
      <AnimatePresence>
        {viewingStory && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] flex items-center justify-center"
            style={{ backgroundColor: "rgba(0,0,0,0.95)" }}
            onClick={handleNextStory}
          >
            {/* Close button */}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={(e) => { e.stopPropagation(); closeViewer(); }}
              className="absolute top-4 right-4 z-[310] p-2 rounded-full"
              style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
            >
              <X className="w-5 h-5 text-white" />
            </motion.button>

            {/* Progress bars */}
            <div className="absolute top-0 left-0 right-0 z-[310] flex gap-1 p-2">
              {stories.map((_, i) => (
                <div
                  key={i}
                  className="h-0.5 flex-1 rounded-full overflow-hidden"
                  style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-100"
                    style={{
                      backgroundColor: i === viewingIndex ? "white" : "rgba(255,255,255,0.5)",
                      width: i < (viewingIndex ?? 0) ? "100%" : i === viewingIndex ? `${progress}%` : "0%",
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Navigation arrows */}
            {viewingIndex !== null && viewingIndex > 0 && (
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={(e) => { e.stopPropagation(); handlePrevStory(); }}
                className="absolute left-2 z-[310] p-2 rounded-full"
                style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
              >
                <ChevronLeft className="w-5 h-5 text-white" />
              </motion.button>
            )}
            {viewingIndex !== null && viewingIndex < stories.length - 1 && (
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={(e) => { e.stopPropagation(); handleNextStory(); }}
                className="absolute right-2 z-[310] p-2 rounded-full"
                style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
              >
                <ChevronRight className="w-5 h-5 text-white" />
              </motion.button>
            )}

            {/* Story content */}
            <motion.div
              key={viewingStory.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-[420px] h-[85vh] rounded-2xl overflow-hidden mx-2"
              style={{ backgroundColor: "var(--mq-card)" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="absolute top-0 left-0 right-0 z-20 flex items-center gap-3 p-4"
                style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)" }}>
                <img
                  src={viewingStory.avatar}
                  alt={viewingStory.username}
                  className="w-9 h-9 rounded-full object-cover"
                  style={{ border: "2px solid white" }}
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">{viewingStory.username}</p>
                  <p className="text-[10px] text-white/60">
                    {new Date(viewingStory.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={(e) => { e.stopPropagation(); setIsPaused(!isPaused); }}
                  className="p-2 rounded-full"
                  style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
                >
                  {isPaused
                    ? <Play className="w-4 h-4 text-white" />
                    : <Pause className="w-4 h-4 text-white" />
                  }
                </motion.button>
              </div>

              {/* Story body */}
              <div className="w-full h-full flex items-center justify-center"
                style={viewingStory.contentType === "text" ? { background: storyGradients[(viewingIndex ?? 0) % storyGradients.length] } : {}}>
                {viewingStory.contentType === "text" && (
                  <div className="p-8 text-center">
                    <p className="text-xl font-medium text-white leading-relaxed">
                      {viewingStory.content}
                    </p>
                  </div>
                )}

                {viewingStory.contentType === "image" && (
                  <img
                    src={viewingStory.content}
                    alt="Story"
                    className="w-full h-full object-cover"
                  />
                )}

                {viewingStory.contentType === "track" && viewingStory.trackData && (
                  <div className="p-6 flex flex-col items-center gap-4">
                    {viewingStory.trackData.cover && (
                      <img
                        src={viewingStory.trackData.cover}
                        alt={viewingStory.trackData.title}
                        className="w-48 h-48 rounded-2xl object-cover shadow-2xl"
                      />
                    )}
                    <div className="text-center">
                      <p className="text-lg font-bold text-white">{viewingStory.trackData.title}</p>
                      <p className="text-sm text-white/70">{viewingStory.trackData.artist}</p>
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={(e) => { e.stopPropagation(); handlePlayTrack(viewingStory); }}
                      className="flex items-center gap-2 px-6 py-3 rounded-full text-sm font-medium"
                      style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}
                    >
                      <Play className="w-4 h-4" style={{ marginLeft: 1 }} />
                      Слушать
                    </motion.button>
                  </div>
                )}
              </div>

              {/* Bottom actions */}
              <div className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-between p-4"
                style={{ background: "linear-gradient(to top, rgba(0,0,0,0.6), transparent)" }}>
                <div className="flex items-center gap-4">
                  <motion.button whileTap={{ scale: 1.2 }} className="flex items-center gap-1 cursor-pointer">
                    <Heart className="w-6 h-6 text-white" />
                    <span className="text-xs text-white">{viewingStory.likes}</span>
                  </motion.button>
                  <MessageCircle className="w-6 h-6 text-white cursor-pointer" />
                </div>
                <Clock className="w-4 h-4 text-white/50" />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create story modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[250] flex items-center justify-center p-4"
            style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
            onClick={() => setShowCreateModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="w-full max-w-[420px] rounded-2xl overflow-hidden"
              style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal header */}
              <div className="flex items-center justify-between p-4" style={{ borderBottom: "1px solid var(--mq-border)" }}>
                <h3 className="text-base font-bold" style={{ color: "var(--mq-text)" }}>Новая история</h3>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setShowCreateModal(false)}
                  className="p-1 rounded-lg cursor-pointer"
                  style={{ color: "var(--mq-text-muted)" }}
                >
                  <X className="w-5 h-5" />
                </motion.button>
              </div>

              {/* Gradient picker */}
              <div className="p-4">
                <p className="text-xs mb-2" style={{ color: "var(--mq-text-muted)" }}>Фон</p>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {storyGradients.map((gradient, i) => (
                    <motion.button
                      key={i}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setSelectedGradient(i)}
                      className="w-10 h-10 rounded-full flex-shrink-0 cursor-pointer"
                      style={{
                        background: gradient,
                        border: selectedGradient === i ? "2px solid var(--mq-accent)" : "2px solid transparent",
                        outline: selectedGradient === i ? "2px solid var(--mq-bg)" : "none",
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Preview + text input */}
              <div
                className="mx-4 rounded-xl p-6 min-h-[200px] flex items-center justify-center"
                style={{ background: storyGradients[selectedGradient] }}
              >
                <textarea
                  ref={inputRef}
                  value={newStoryText}
                  onChange={(e) => setNewStoryText(e.target.value)}
                  placeholder="Что у вас нового?"
                  className="w-full bg-transparent text-white text-lg text-center resize-none outline-none placeholder-white/50 min-h-[120px]"
                  maxLength={500}
                />
              </div>

              {/* Post button */}
              <div className="p-4" style={{ borderTop: "1px solid var(--mq-border)" }}>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={createStory}
                  disabled={!newStoryText.trim()}
                  className="w-full py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 cursor-pointer"
                  style={{
                    backgroundColor: newStoryText.trim() ? "var(--mq-accent)" : "var(--mq-input-bg)",
                    color: "var(--mq-text)",
                  }}
                >
                  <Send className="w-4 h-4" />
                  Опубликовать
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
