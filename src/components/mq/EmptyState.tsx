"use client";

import { motion } from "framer-motion";
import {
  Music,
  ListMusic,
  Search,
  Heart,
  Clock,
  MessageCircle,
} from "lucide-react";

interface EmptyStateProps {
  type:
    | "playlists"
    | "search"
    | "favorites"
    | "history"
    | "messages"
    | "tracks"
    | "generic";
  title?: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

const emptyStateConfig: Record<
  string,
  { icon: typeof Music; defaultTitle: string; defaultDescription: string }
> = {
  playlists: {
    icon: ListMusic,
    defaultTitle: "Нет плейлистов",
    defaultDescription:
      "Создайте свой первый плейлист, чтобы организовать музыку",
  },
  search: {
    icon: Search,
    defaultTitle: "Ничего не найдено",
    defaultDescription:
      "Попробуйте изменить поисковый запрос или выбрать другой жанр",
  },
  favorites: {
    icon: Heart,
    defaultTitle: "Нет избранных треков",
    defaultDescription: "Нажмите ♡ на треке, чтобы добавить его в избранное",
  },
  history: {
    icon: Clock,
    defaultTitle: "История пуста",
    defaultDescription: "Здесь появятся треки, которые вы прослушали",
  },
  messages: {
    icon: MessageCircle,
    defaultTitle: "Нет сообщений",
    defaultDescription: "Начните общение, отправив первое сообщение",
  },
  tracks: {
    icon: Music,
    defaultTitle: "Треков пока нет",
    defaultDescription: "Найдите музыку через поиск или добавьте свои файлы",
  },
  generic: {
    icon: Music,
    defaultTitle: "Пусто",
    defaultDescription: "Здесь пока ничего нет",
  },
};

export function EmptyState({ type, title, description, action }: EmptyStateProps) {
  const config = emptyStateConfig[type] || emptyStateConfig.generic;
  const Icon = config.icon;

  // Phase 4B: unified quiet empty state — one pattern app-wide.
  // Static icon, serif headline, meta hint, one action. No breathing.
  return (
    <motion.div
      className="mq-empty"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Icon className="w-7 h-7" style={{ color: "var(--mq-text-muted)" }} />
      <h3 className="mq-empty-title">
        {title || config.defaultTitle}
      </h3>
      <p className="mq-empty-hint">
        {description || config.defaultDescription}
      </p>
      {action && (
        <button
          className="mt-2 px-4 py-2 rounded-full text-sm font-semibold"
          style={{ backgroundColor: "var(--mq-accent)", color: "#fff" }}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}
    </motion.div>
  );
}
