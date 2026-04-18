import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// Bot knowledge base — auto-answers for common questions
const botResponses: { keywords: string[]; response: string }[] = [
  {
    keywords: ["привет", "здравствуйте", "добрый день", "добрый вечер", "доброе утро", "хай", "hello", "hi"],
    response: "Здравствуйте! Добро пожаловать в поддержку MQ Player. Чем могу помочь? Опишите вашу проблему, и я постараюсь помочь или передам вас специалисту.",
  },
  {
    keywords: ["не работает", "ошибка", "не воспроизводит", "не играет", "крашится", "зависает", "вылетает", "баг", "bug", "glitch"],
    response: "Понимаю, что у вас техническая проблема. Попробуйте следующие шаги:\n\n1. Обновите страницу (Ctrl+Shift+R)\n2. Очистите кэш браузера\n3. Проверьте подключение к интернету\n4. Попробуйте другой браузер\n\nЕсли проблема сохраняется, опишите подробнее — какой трек, какое действие приводит к ошибке? Я передам информацию разработчикам.",
  },
  {
    keywords: ["не воспроизводится", "не проигрывается", "нет звука", "без звука", "тихо", "громкость", "volume"],
    response: "Проблемы со звуком? Проверьте:\n\n1. Громкость в приложении (Настройки → Громкость)\n2. Громкость системы/устройства\n3. Не выключён ли звук в браузере (иконка в адресной строке Chrome)\n4. Попробуйте другой трек\n\nЕсли звук пропал только в MQ Player — напишите, какой трек не воспроизводится, мы проверим.",
  },
  {
    keywords: ["регистрация", "зарегистрироваться", "аккаунт", "забыл пароль", "не могу войти", "логин", "пароль", "вход"],
    response: "По вопросам аккаунта:\n\n• Забыли пароль — используйте восстановление на странице входа\n• Не приходит код подтверждения — проверьте папку Спам\n• Не можете зарегистрироваться — убедитесь, что email не используется\n\nЕсли ничего не помогло, передам ваш вопрос администратору.",
  },
  {
    keywords: ["плейлист", "создать плейлист", "импорт", "экспорт", "добавить трек", "удалить трек", "playlist"],
    response: "Работа с плейлистами:\n\n• Создание: раздел Плейлисты → кнопка «Создать»\n• Добавление трека: правый клик по треку → «Добавить в плейлист»\n• Импорт: кнопка «Импорт» → по ссылке или текстом\n• Поддержка: VK, Яндекс.Музыка, Spotify, YouTube, Apple Music\n\nКакой именно шаг вызывает затруднения?",
  },
  {
    keywords: ["тема", "оформление", "цвет", "тёмная", "светлая", "дизайн", "theme", "dark mode"],
    response: "Настроить тему можно в Настройках → Тема оформления. Доступно 16 тем:\n\n• Obsidian, Abyss, Magenta, Ember, Borealis\n• Neon City, Retro, Eclipse, AMOLED\n• Liquid Glass, Sakura, Frost, Volcano\n• Arctic, Phantom, Daylight\n\nТакже можно настроить кастомный цвет акцента!",
  },
  {
    keywords: ["premium", "подписка", "оплата", "деньги", "платный", "бесплатно", "цена", "стоимость"],
    response: "MQ Player — полностью бесплатный сервис! Никаких подписок и скрытых платежей. Все функции доступны всем пользователям без ограничений.",
  },
  {
    keywords: ["удалить аккаунт", "удалить данные", "конфиденциальность", "privacy", "мои данные"],
    response: "Ваши права на данные:\n\n• Право на удаление — можно запросить полное удаление аккаунта\n• Мы не продаём и не передаём ваши данные третьим лицам\n• Все сообщения зашифрованы AES-256-GCM\n\nДля удаления аккаунта свяжитесь с администратором через этот чат.",
  },
  {
    keywords: ["спасибо", "благодарю", "thanks", "thank you"],
    response: "Пожалуйста! Если у вас возникнут ещё вопросы — не стесняйтесь писать. Хорошего дня и приятного прослушивания!",
  },
  {
    keywords: ["пока", "до свидания", "bye", "goodbye", "всё", "всё понятно"],
    response: "До свидания! Хорошего дня и приятного прослушивания в MQ Player. Возвращайтесь, если понадобится помощь!",
  },
];

function findBotResponse(userMessage: string): string {
  const lower = userMessage.toLowerCase();

  for (const entry of botResponses) {
    for (const keyword of entry.keywords) {
      if (lower.includes(keyword)) {
        return entry.response;
      }
    }
  }

  return "Спасибо за ваше обращение! Я обработал ваш запрос. Если мой ответ не помог — администратор увидит ваше сообщение и ответит лично. Обычно это занимает несколько минут в рабочее время.";
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionsFlag = searchParams.get("sessions");
    const sessionId = searchParams.get("sessionId");

    if (sessionsFlag === "true") {
      const sessions = await db.supportChatSession.findMany({
        orderBy: { updatedAt: "desc" },
      });
      return NextResponse.json({ sessions });
    }

    if (sessionId) {
      const messages = await db.supportChatMessage.findMany({
        where: { sessionId },
        orderBy: { createdAt: "asc" },
      });
      return NextResponse.json({ messages });
    }

    return NextResponse.json({ error: "Укажите sessions=true или sessionId" }, { status: 400 });
  } catch (error) {
    console.error("Admin support chat error:", error);
    return NextResponse.json({ error: "Ошибка загрузки чата поддержки" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, role, content } = body;

    if (!sessionId || !role || !content) {
      return NextResponse.json({ error: "sessionId, role и content обязательны" }, { status: 400 });
    }

    // Check session exists
    const session = await db.supportChatSession.findUnique({ where: { sessionId } });
    if (!session) {
      return NextResponse.json({ error: "Сессия не найдена" }, { status: 404 });
    }

    // Create message
    const message = await db.supportChatMessage.create({
      data: {
        sessionId,
        role,
        content,
      },
    });

    // Update session
    await db.supportChatSession.update({
      where: { sessionId },
      data: {
        lastMessage: content.length > 100 ? content.substring(0, 100) + "..." : content,
        messageCount: { increment: 1 },
        updatedAt: new Date(),
      },
    });

    // If the message is from a user (not admin/bot), generate bot auto-response
    let botMessage = null;
    if (role === "user") {
      const botReply = findBotResponse(content);
      botMessage = await db.supportChatMessage.create({
        data: {
          sessionId,
          role: "bot",
          content: botReply,
        },
      });

      await db.supportChatSession.update({
        where: { sessionId },
        data: {
          lastMessage: botReply.length > 100 ? botReply.substring(0, 100) + "..." : botReply,
          messageCount: { increment: 1 },
          updatedAt: new Date(),
        },
      });
    }

    return NextResponse.json({ message, botMessage });
  } catch (error) {
    console.error("Admin support chat message error:", error);
    return NextResponse.json({ error: "Ошибка отправки сообщения" }, { status: 500 });
  }
}
