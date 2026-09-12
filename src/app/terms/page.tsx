import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Условия использования — mq",
  description:
    "Условия использования сервиса MQ Player: аккаунты, правила поведения в чатах, музыкальный контент и ограничения ответственности.",
  robots: { index: true, follow: true },
};

const LAST_UPDATED = "12 сентября 2026";

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="pt-6 mt-6" style={{ borderTop: "1px solid var(--mq-border-hairline)" }}>
      <h2 className="text-base font-semibold mb-3" style={{ color: "var(--mq-text)" }}>
        {title}
      </h2>
      <div className="text-sm leading-relaxed space-y-3" style={{ color: "var(--mq-text-muted)" }}>
        {children}
      </div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <main
      className="min-h-screen w-full flex flex-col items-center px-5 py-12"
      style={{ backgroundColor: "var(--mq-bg)" }}
    >
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="flex flex-col items-center text-center">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
            style={{ backgroundColor: "var(--mq-accent, #e03131)" }}
          >
            <span className="text-lg font-black text-white">mq</span>
          </div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--mq-text)" }}>
            Условия использования
          </h1>
          <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
            MQ Player · Последнее обновление: {LAST_UPDATED}
          </p>
        </div>

        <div className="mt-8 rounded-2xl p-6 sm:p-8" style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}>
          <p className="text-sm leading-relaxed" style={{ color: "var(--mq-text-muted)" }}>
            Настоящие условия регулируют использование сервиса MQ Player. Создавая аккаунт или
            входя в сервис любым способом (Google, Telegram, email), вы соглашаетесь с этими
            условиями. Если вы не согласны — пожалуйста, не используйте аккаунт-зависимые функции.
          </p>

          <Section id="service" title="1. О сервисе">
            <p>
              MQ Player — некоммерческий музыкальный плеер: рекомендации, плейлисты, эквалайзер,
              мессенджер и кастомные темы. Сервис предоставляется командой mq &laquo;как есть&raquo;
              и развивается в свободное время авторов.
            </p>
          </Section>

          <Section id="accounts" title="2. Аккаунты">
            <p>
              Вход доступен через Google (OpenID Connect), Telegram (официальный Login Widget или код
              от бота) или по email с паролем. Один внешний аккаунт (Google / Telegram) может быть
              связан только с одним аккаунтом MQ Player; при совпадении подтверждённого email
              сервис может связать вход с существующим аккаунтом — без создания дубликатов.
            </p>
            <p>
              Вы отвечаете за сохранность доступа к своим внешним аккаунтам и email. Действия,
              совершённые под вашей сессией, считаются совершёнными вами.
            </p>
          </Section>

          <Section id="rules" title="3. Правила использования">
            <p>Используя чаты, комментарии и прочие социальные функции, запрещается:</p>
            <p>
              — спам, флуд и массовые рассылки;<br />
              — публикация противоправного, оскорбительного или вредоносного контента;<br />
              — выдавать себя за других людей или за администрацию сервиса;<br />
              — обходить технические ограничения, пытаться взломать сервис или чужие аккаунты,
              использовать автоматизированный доступ к API, не предназначенный для пользователей.
            </p>
            <p>
              Нарушение правил может привести к ограничению функций или блокировке аккаунта.
            </p>
          </Section>

          <Section id="music" title="4. Музыкальный контент">
            <p>
              Воспроизведение организовано через публичные API внешних источников (SoundCloud и
              другие). Права на треки и обложки принадлежат их правообладателям. Сервис
              предназначен для персонального прослушивания; копирование, перераспределение или
              коммерческое использование контента не допускается. Доступность конкретных треков
              определяется источниками и может меняться.
            </p>
          </Section>

          <Section id="third-party" title="5. Сторонние сервисы">
            <p>
              Вход через Google и Telegram регулируется также условиями соответствующих платформ.
              Обработка данных при входе описана в нашей Политике конфиденциальности.
            </p>
          </Section>

          <Section id="termination" title="6. Блокировка и удаление аккаунта">
            <p>
              Мы можем приостановить или заблокировать аккаунт при нарушении этих условий. Вы можете
              в любой момент запросить удаление аккаунта и связанных с ним данных через встроенную
              поддержку.
            </p>
          </Section>

          <Section id="warranty" title="7. Отказ от гарантий">
            <p>
              Сервис предоставляется без гарантий доступности, непрерывности работы и отсутствия
              ошибок. Мы не отвечаем за содержание внешних источников и за действия сторонних
              платформ. В максимально допустимой законом мере команда mq не несёт ответственности
              за косвенные убытки, связанные с использованием сервиса.
            </p>
          </Section>

          <Section id="changes" title="8. Изменения условий">
            <p>
              Условия могут обновляться. Существенные изменения анонсируются в приложении; дата
              актуальной редакции всегда указана на этой странице.
            </p>
          </Section>

          <Section id="contact" title="9. Контакты">
            <p>
              Вопросы по условиям использования можно задать через встроенную поддержку в
              приложении (раздел &laquo;Помощь&raquo;).
            </p>
          </Section>
        </div>

        {/* Footer */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-2 text-sm">
          <Link
            href="/privacy"
            className="font-medium py-2 px-3 rounded-lg transition-[filter] hover:brightness-125"
            style={{ color: "var(--mq-text-muted)" }}
          >
            Политика конфиденциальности
          </Link>
          <span style={{ color: "var(--mq-text-muted)" }} className="hidden sm:inline">·</span>
          <Link
            href="/play"
            className="font-medium py-2 px-3 rounded-lg transition-[filter] hover:brightness-125"
            style={{ color: "var(--mq-text-muted)" }}
          >
            Вернуться в MQ Player
          </Link>
        </div>
      </div>
    </main>
  );
}
