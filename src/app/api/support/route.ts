import { NextRequest, NextResponse } from "next/server";
import { isTurso, getTursoClient } from "@/lib/database";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";

// Bot knowledge base — auto-answers for common questions (shared with admin chat)
const botResponses: { keywords: string[]; response: string }[] = [
  {
    keywords: ["привет", "здравствуйте", "добрый день", "добрый вечер", "доброе утро", "хай", "hello", "hi"],
    response: "Здравствуйте! Добро пожаловать в поддержку mq. Чем могу помочь? Опишите вашу проблему, и я постараюсь помочь или передам вас специалисту.",
  },
  {
    keywords: ["не работает", "ошибка", "не воспроизводит", "не играет", "крашится", "зависает", "вылетает", "баг", "bug"],
    response: "Понимаю, что у вас техническая проблема. Попробуйте следующие шаги:\n\n1. Обновите страницу (Ctrl+Shift+R)\n2. Очистите кэш браузера\n3. Проверьте подключение к интернету\n4. Попробуйте другой браузер\n\nЕсли проблема сохраняется, опишите подробнее — какой трек, какое действие приводит к ошибке? Я передам информацию разработчикам.",
  },
  {
    keywords: ["не воспроизводится", "не проигрывается", "нет звука", "без звука", "тихо", "громкость", "volume"],
    response: "Проблемы со звуком? Проверьте:\n\n1. Громкость в приложении (Настройки → Громкость)\n2. Громкость системы/устройства\n3. Не выключён ли звук в браузере (иконка в адресной строке Chrome)\n4. Попробуйте другой трек\n\nЕсли звук пропал только в mq — напишите, какой трек не воспроизводится, мы проверим.",
  },
  {
    keywords: ["регистрация", "зарегистрироваться", "аккаунт", "забыл пароль", "не могу войти", "логин", "пароль", "вход"],
    response: "По вопросам аккаунта:\n\n• Забыли пароль — используйте кнопку «Забыли пароль?» на странице входа\n• Не приходит код подтверждения — проверьте папку Спам\n• Не можете зарегистрироваться — убедитесь, что email не используется\n\nЕсли ничего не помогло, администратор увидит ваше сообщение и ответит лично.",
  },
  {
    keywords: ["плейлист", "создать плейлист", "импорт", "экспорт", "добавить трек", "удалить трек", "playlist"],
    response: "Работа с плейлистами:\n\n• Создание: раздел Плейлисты → кнопка «Создать»\n• Добавление трека: правый клик по треку → «Добавить в плейлист»\n• Импорт: кнопка «Импорт» → по ссылке или текстом\n• Поддержка: VK, Яндекс.Музыка, YouTube, Apple Music\n\nКакой именно шаг вызывает затруднения?",
  },
  {
    keywords: ["тема", "оформление", "цвет", "тёмная", "светлая", "дизайн", "theme"],
    response: "Настроить тему можно в Настройках → Тема оформления. Доступно 16+ тем и 8 сезонных. Также можно настроить кастомный цвет акцента!",
  },
  {
    keywords: ["premium", "подписка", "оплата", "деньги", "платный", "бесплатно", "цена"],
    response: "mq — полностью бесплатный сервис! Никаких подписок и скрытых платежей. Все функции доступны всем пользователям без ограничений.",
  },
  {
    keywords: ["удалить аккаунт", "удалить данные", "конфиденциальность", "privacy"],
    response: "Ваши права на данные:\n\n• Право на удаление — можно запросить полное удаление аккаунта\n• Мы не продаём и не передаём ваши данные третьим лицам\n• Сообщения передаются по защищённому HTTPS-соединению (TLS)\n\nДля удаления аккаунта напишите об этом администратору.",
  },
  {
    keywords: ["спасибо", "благодарю", "thanks"],
    response: "Пожалуйста! Если у вас возникнут ещё вопросы — не стесняйтесь писать. Хорошего дня и приятного прослушивания!",
  },
  {
    keywords: ["пока", "до свидания", "bye", "всё", "всё понятно"],
    response: "До свидания! Хорошего дня и приятного прослушивания в mq!",
  },
];

function findBotResponse(userMessage: string): string {
  const lower = userMessage.toLowerCase();
  for (const entry of botResponses) {
    for (const keyword of entry.keywords) {
      if (lower.includes(keyword)) return entry.response;
    }
  }
  return "Спасибо за ваше обращение! Я обработал ваш запрос. Если мой ответ не помог — администратор увидит ваше сообщение и ответит лично. Обычно это занимает несколько минут в рабочее время.";
}

// POST /api/support — send a message as user to support chat (no email)
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);

    // Rate limit: 10 messages per minute per IP
    const { success, resetIn } = rateLimit({ ip, limit: 10, window: 60, key: "support-post" });
    if (!success) {
      return NextResponse.json(
        { error: "Слишком много сообщений. Подождите немного.", retryAfter: resetIn },
        { status: 429 }
      );
    }

    const session = await getSession();
    const userId = session?.userId || null;
    const { userName, content } = await req.json();

    if (!content || !content.trim()) {
      return NextResponse.json({ error: "Сообщение не может быть пустым" }, { status: 400 });
    }
    if (content.length > 2000) {
      return NextResponse.json({ error: "Сообщение слишком длинное (макс. 2000 символов)" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const truncated = (s: string) => s.length > 100 ? s.substring(0, 100) + "..." : s;

    if (isTurso()) {
      const t = getTursoClient();

      // Find or create support session
      let sessionId: string;
      if (userId) {
        const existingResult = await t.execute({
          sql: "SELECT sessionId, status FROM SupportChatSession WHERE userId = ? ORDER BY updatedAt DESC LIMIT 1",
          args: [userId],
        });
        if (existingResult.rows.length > 0) {
          const row = existingResult.rows[0] as Record<string, unknown>;
          if (String(row.status ?? "open") !== "closed") {
            sessionId = String(row.sessionId ?? "");
          } else {
            // Create new — old one is closed
            sessionId = `user_${userId}_${Date.now()}`;
            await t.execute({
              sql: "INSERT INTO SupportChatSession (id, sessionId, userId, userName, status, lastMessage, messageCount, createdAt, updatedAt) VALUES (?, ?, ?, ?, 'open', '', 0, ?, ?)",
              args: [`c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`, sessionId, userId, userName || null, now, now],
            });
          }
        } else {
          sessionId = `user_${userId}`;
          await t.execute({
            sql: "INSERT INTO SupportChatSession (id, sessionId, userId, userName, status, lastMessage, messageCount, createdAt, updatedAt) VALUES (?, ?, ?, ?, 'open', '', 0, ?, ?)",
            args: [`c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`, sessionId, userId, userName || null, now, now],
          });
        }
      } else {
        sessionId = `guest_${Date.now()}`;
        await t.execute({
          sql: "INSERT INTO SupportChatSession (id, sessionId, userId, userName, status, lastMessage, messageCount, createdAt, updatedAt) VALUES (?, ?, NULL, ?, 'open', '', 0, ?, ?)",
          args: [`c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`, sessionId, userName || null, now, now],
        });
      }

      // Insert user message
      const userMsgId = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
      await t.execute({
        sql: "INSERT INTO SupportChatMessage (id, sessionId, role, content, createdAt) VALUES (?, ?, 'user', ?, ?)",
        args: [userMsgId, sessionId, content.trim(), now],
      });

      // Generate + insert bot response
      const botReply = findBotResponse(content);
      const botMsgId = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
      const botNow = new Date().toISOString();
      await t.execute({
        sql: "INSERT INTO SupportChatMessage (id, sessionId, role, content, createdAt) VALUES (?, ?, 'bot', ?, ?)",
        args: [botMsgId, sessionId, botReply, botNow],
      });

      // Update session
      await t.execute({
        sql: "UPDATE SupportChatSession SET lastMessage = ?, messageCount = messageCount + 2, updatedAt = ? WHERE sessionId = ?",
        args: [truncated(botReply), botNow, sessionId],
      });

      return NextResponse.json({
        success: true,
        sessionId,
        userMessage: { id: userMsgId, sessionId, role: "user", content: content.trim(), createdAt: now },
        botMessage: { id: botMsgId, sessionId, role: "bot", content: botReply, createdAt: botNow },
      });
    }

    // Prisma fallback
    const { db } = await import("@/lib/db");
    let supportSession = await db.supportChatSession.findFirst({
      where: userId ? { userId } : { sessionId: `guest_${Date.now()}` },
      orderBy: { updatedAt: "desc" },
    });
    if (supportSession && supportSession.status === "closed") {
      supportSession = null;
    }
    if (!supportSession) {
      supportSession = await db.supportChatSession.create({
        data: {
          sessionId: userId ? `user_${userId}` : `guest_${Date.now()}`,
          userId: userId || null,
          userName: userName || null,
          status: "open",
          lastMessage: "",
          messageCount: 0,
        },
      });
    }
    const message = await db.supportChatMessage.create({
      data: { sessionId: supportSession.sessionId, role: "user", content: content.trim() },
    });
    const botReply = findBotResponse(content);
    const botMessage = await db.supportChatMessage.create({
      data: { sessionId: supportSession.sessionId, role: "bot", content: botReply },
    });
    await db.supportChatSession.update({
      where: { sessionId: supportSession.sessionId },
      data: {
        lastMessage: truncated(botReply),
        messageCount: { increment: 2 },
        updatedAt: new Date(),
      },
    });
    return NextResponse.json({
      success: true,
      sessionId: supportSession.sessionId,
      userMessage: message,
      botMessage: botMessage,
    });
  } catch (error) {
    console.error("Support chat error:", error);
    return NextResponse.json({ error: "Ошибка при отправке сообщения" }, { status: 500 });
  }
}

// GET /api/support?sessionId=xxx — get messages for a user session
export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const { success } = rateLimit({ ip, limit: 30, window: 60, key: "support-get" });
    if (!success) {
      return NextResponse.json({ error: "Слишком много запросов" }, { status: 429 });
    }

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");
    const session = await getSession();
    const userId = session?.userId || null;

    if (!sessionId && !userId) {
      return NextResponse.json({ error: "Укажите sessionId" }, { status: 400 });
    }

    if (isTurso()) {
      const t = getTursoClient();
      const sessionResult = sessionId
        ? await t.execute({ sql: "SELECT * FROM SupportChatSession WHERE sessionId = ? ORDER BY updatedAt DESC LIMIT 1", args: [sessionId] })
        : await t.execute({ sql: "SELECT * FROM SupportChatSession WHERE userId = ? ORDER BY updatedAt DESC LIMIT 1", args: [userId] });

      if (sessionResult.rows.length === 0) {
        return NextResponse.json({ messages: [], sessionId: null });
      }
      const sRow = sessionResult.rows[0] as Record<string, unknown>;
      const sUserId = sRow.userId != null ? String(sRow.userId) : null;
      const sSessionId = String(sRow.sessionId ?? "");

      // IDOR check
      if (sUserId && sUserId !== userId) {
        return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
      }
      if (!sUserId && !sessionId) {
        return NextResponse.json({ messages: [], sessionId: null });
      }

      const msgsResult = await t.execute({
        sql: "SELECT * FROM SupportChatMessage WHERE sessionId = ? ORDER BY createdAt ASC",
        args: [sSessionId],
      });
      const messages = msgsResult.rows.map((r) => {
        const row = r as Record<string, unknown>;
        return {
          id: String(row.id ?? ""),
          sessionId: String(row.sessionId ?? ""),
          role: String(row.role ?? "user"),
          content: String(row.content ?? ""),
          createdAt: String(row.createdAt ?? ""),
        };
      });
      return NextResponse.json({ messages, sessionId: sSessionId });
    }

    const { db } = await import("@/lib/db");
    const supportSession = await db.supportChatSession.findFirst({
      where: sessionId ? { sessionId } : userId ? { userId } : undefined,
      orderBy: { updatedAt: "desc" },
    });
    if (!supportSession) {
      return NextResponse.json({ messages: [], sessionId: null });
    }
    if (supportSession.userId && supportSession.userId !== userId) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }
    if (!supportSession.userId && !sessionId) {
      return NextResponse.json({ messages: [], sessionId: null });
    }
    const messages = await db.supportChatMessage.findMany({
      where: { sessionId: supportSession.sessionId },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ messages, sessionId: supportSession.sessionId });
  } catch (error) {
    console.error("Support chat fetch error:", error);
    return NextResponse.json({ error: "Ошибка загрузки чата" }, { status: 500 });
  }
}
