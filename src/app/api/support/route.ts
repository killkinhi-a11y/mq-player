import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getSession } from "@/lib/get-session";

// Bot knowledge base — auto-answers for common questions (shared with admin chat)
const botResponses: { keywords: string[]; response: string }[] = [
  {
    keywords: ["привет", "здравствуйте", "добрый день", "добрый вечер", "доброе утро", "хай", "hello", "hi"],
    response: "Здравствуйте! Добро пожаловать в поддержку MQ Player. Чем могу помочь? Опишите вашу проблему, и я постараюсь помочь или передам вас специалисту.",
  },
  {
    keywords: ["не работает", "ошибка", "не воспроизводит", "не играет", "крашится", "зависает", "вылетает", "баг", "bug"],
    response: "Понимаю, что у вас техническая проблема. Попробуйте следующие шаги:\n\n1. Обновите страницу (Ctrl+Shift+R)\n2. Очистите кэш браузера\n3. Проверьте подключение к интернету\n4. Попробуйте другой браузер\n\nЕсли проблема сохраняется, опишите подробнее — какой трек, какое действие приводит к ошибке? Я передам информацию разработчикам.",
  },
  {
    keywords: ["не воспроизводится", "не проигрывается", "нет звука", "без звука", "тихо", "громкость", "volume"],
    response: "Проблемы со звуком? Проверьте:\n\n1. Громкость в приложении (Настройки → Громкость)\n2. Громкость системы/устройства\n3. Не выключён ли звук в браузере (иконка в адресной строке Chrome)\n4. Попробуйте другой трек\n\nЕсли звук пропал только в MQ Player — напишите, какой трек не воспроизводится, мы проверим.",
  },
  {
    keywords: ["регистрация", "зарегистрироваться", "аккаунт", "забыл пароль", "не могу войти", "логин", "пароль", "вход"],
    response: "По вопросам аккаунта:\n\n• Забыли пароль — используйте кнопку «Забыли пароль?» на странице входа\n• Не приходит код подтверждения — проверьте папку Спам\n• Не можете зарегистрироваться — убедитесь, что email не используется\n\nЕсли ничего не помогло, администратор увидит ваше сообщение и ответит лично.",
  },
  {
    keywords: ["плейлист", "создать плейлист", "импорт", "экспорт", "добавить трек", "удалить трек", "playlist"],
    response: "Работа с плейлистами:\n\n• Создание: раздел Плейлисты → кнопка «Создать»\n• Добавление трека: правый клик по треку → «Добавить в плейлист»\n• Импорт: кнопка «Импорт» → по ссылке или текстом\n• Поддержка: VK, Яндекс.Музыка, Spotify, YouTube, Apple Music\n\nКакой именно шаг вызывает затруднения?",
  },
  {
    keywords: ["тема", "оформление", "цвет", "тёмная", "светлая", "дизайн", "theme"],
    response: "Настроить тему можно в Настройках → Тема оформления. Доступно 16+ тем и 8 сезонных. Также можно настроить кастомный цвет акцента!",
  },
  {
    keywords: ["premium", "подписка", "оплата", "деньги", "платный", "бесплатно", "цена"],
    response: "MQ Player — полностью бесплатный сервис! Никаких подписок и скрытых платежей. Все функции доступны всем пользователям без ограничений.",
  },
  {
    keywords: ["удалить аккаунт", "удалить данные", "конфиденциальность", "privacy"],
    response: "Ваши права на данные:\n\n• Право на удаление — можно запросить полное удаление аккаунта\n• Мы не продаём и не передаём ваши данные третьим лицам\n• Все сообщения зашифрованы AES-256-GCM\n\nДля удаления аккаунта напишите об этом администратору.",
  },
  {
    keywords: ["спасибо", "благодарю", "thanks"],
    response: "Пожалуйста! Если у вас возникнут ещё вопросы — не стесняйтесь писать. Хорошего дня и приятного прослушивания!",
  },
  {
    keywords: ["пока", "до свидания", "bye", "всё", "всё понятно"],
    response: "До свидания! Хорошего дня и приятного прослушивания в MQ Player!",
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

    // Find or create a support chat session for this user
    let supportSession = await db.supportChatSession.findFirst({
      where: userId ? { userId } : { sessionId: `guest_${Date.now()}` },
      orderBy: { updatedAt: "desc" },
    });

    // If session exists but is closed, create a new one
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

    // Create user message
    const message = await db.supportChatMessage.create({
      data: {
        sessionId: supportSession.sessionId,
        role: "user",
        content: content.trim(),
      },
    });

    // Generate bot auto-response
    const botReply = findBotResponse(content);
    const botMessage = await db.supportChatMessage.create({
      data: {
        sessionId: supportSession.sessionId,
        role: "bot",
        content: botReply,
      },
    });

    // Update session
    await db.supportChatSession.update({
      where: { sessionId: supportSession.sessionId },
      data: {
        lastMessage: botReply.length > 100 ? botReply.substring(0, 100) + "..." : botReply,
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

    // Rate limit: 30 reads per minute per IP
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

    // Find session
    const supportSession = await db.supportChatSession.findFirst({
      where: sessionId
        ? { sessionId }
        : userId
        ? { userId }
        : undefined,
      orderBy: { updatedAt: "desc" },
    });

    if (!supportSession) {
      return NextResponse.json({ messages: [], sessionId: null });
    }

    // IDOR check: user can only access their own support sessions
    if (supportSession.userId && supportSession.userId !== userId) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }
    // For guest sessions, verify the sessionId matches expected pattern
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
