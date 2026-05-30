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

  return (
    <motion.div
      className="flex flex-col items-center justify-center py-16 px-6 text-center"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <motion.div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
        style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      >
        <Icon
          className="w-8 h-8"
          style={{ color: "var(--mq-text-muted)" }}
        />
      </motion.div>
      <h3
        className="text-lg font-semibold mb-2"
        style={{ color: "var(--mq-text)" }}
      >
        {title || config.defaultTitle}
      </h3>
      <p
        className="text-sm max-w-xs"
        style={{ color: "var(--mq-text-muted)" }}
      >
        {description || config.defaultDescription}
      </p>
      {action && (
        <motion.button
          className="mt-4 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ backgroundColor: "var(--mq-accent)", color: "#fff" }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={action.onClick}
        >
          {action.label}
        </motion.button>
      )}
    </motion.div>
  );
}
