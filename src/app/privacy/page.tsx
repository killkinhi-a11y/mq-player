import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Политика конфиденциальности — mq",
  description:
    "Как MQ Player собирает, использует и защищает данные аккаунтов: вход через Google и Telegram, email, плейлисты, чаты и файлы cookie.",
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

export default function PrivacyPage() {
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
            Политика конфиденциальности
          </h1>
          <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
            MQ Player · Последнее обновление: {LAST_UPDATED}
          </p>
        </div>

        <div className="mt-8 rounded-2xl p-6 sm:p-8" style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}>
          <p className="text-sm leading-relaxed" style={{ color: "var(--mq-text-muted)" }}>
            Эта политика объясняет, какие данные собирает MQ Player (&laquo;сервис&raquo;), как они
            используются и защищаются. Продолжая пользоваться сервисом после входа в аккаунт, вы
            соглашаетесь с описанными здесь условиями обработки данных.
          </p>

          <Section id="data" title="1. Какие данные мы собираем">
            <p>
              <b style={{ color: "var(--mq-text)" }}>Данные аккаунта:</b> имя пользователя, адрес
              электронной почты, хэш пароля (bcrypt — сам пароль не хранится и никому не передаётся),
              ссылка на аватар и настройки оформления (тема, акцентный цвет).
            </p>
            <p>
              <b style={{ color: "var(--mq-text)" }}>Внешние идентификаторы входа:</b> если вы входите
              через Google или Telegram, мы сохраняем идентификатор аккаунта у провайдера, имя и
              (для Google) подтверждённый email — чтобы при следующем входе не создавать дубликат
              аккаунта.
            </p>
            <p>
              <b style={{ color: "var(--mq-text)" }}>Пользовательский контент:</b> плейлисты,
              избранное, история прослушиваний, лайки, а также сообщения, которые вы отправляете в
              личных и групповых чатах сервиса.
            </p>
            <p>
              <b style={{ color: "var(--mq-text)" }}>Технические данные:</b> ограниченный набор
              файлов cookie, необходимый для работы входа (см. раздел о cookie ниже).
            </p>
          </Section>

          <Section id="google" title="2. Вход через Google">
            <p>
              При входе через Google мы запрашиваем только базовый набор данных OpenID Connect:
              <b style={{ color: "var(--mq-text)" }}> openid, email, profile</b> — идентификатор
              аккаунта, имя, email и аватар. Мы не запрашиваем доступ к Gmail, Google Drive, Calendar
              и любым другим сервисам Google.
            </p>
            <p>
              Проверка данных Google выполняется на сервере: подпись токена удостоверяется по
              открытым ключам Google, а одноразовые токены доступа не сохраняются и не используются
              после завершения входа.
            </p>
          </Section>

          <Section id="telegram" title="3. Вход через Telegram">
            <p>
              Официальный виджет Login Widget передаёт нам идентификатор вашего Telegram-аккаунта,
              имя, @username и фото профиля. Подлинность этих данных проверяется на сервере по
              секретному ключу бота. Другие данные вашего Telegram-аккаунта (переписка, контакты,
              каналы) сервису недоступны.
            </p>
          </Section>

          <Section id="email" title="4. Email и коды подтверждения">
            <p>
              Для регистрации по email и восстановления пароля мы отправляем одноразовые коды
              подтверждения через почтового провайдера (Brevo / Resend). Эти письма используются
              только для доставки кода и не содержат рекламных рассылок.
            </p>
          </Section>

          <Section id="cookies" title="5. Файлы cookie">
            <p>
              Сервис использует два служебных cookie и не подключает рекламные или аналитические
              трекеры третьих сторон:
            </p>
            <p>
              <b style={{ color: "var(--mq-text)" }}>session</b> — HttpOnly-cookie с подписанным
              токеном сессии (7 дней), необходим для хранения входа;
              <b style={{ color: "var(--mq-text)" }}> mq_oauth_state</b> — короткоживущий cookie
              (10 минут), защищающий вход через Google от CSRF-атак и удаляемый сразу после входа.
            </p>
            <p>
              Вы можете удалить cookie в настройках браузера — это завершит текущую сессию, данные
              аккаунта при этом не теряются.
            </p>
          </Section>

          <Section id="storage" title="6. Где хранятся и обрабатываются данные">
            <p>
              Сервис работает на serverless-платформе Vercel; данные аккаунтов и контента — в
              управляемой базе данных (Turso / Neon Postgres). Для воспроизведения музыки сервис
              обращается к публичным API источников (SoundCloud и др.). Мы не продаём и не передаём
              ваши данные третьим лицам для их маркетинговых целей.
            </p>
          </Section>

          <Section id="rights" title="7. Ваши права">
            <p>
              Вы можете в любой момент изменить имя пользователя, email и пароль в настройках
              профиля. Чтобы экспортировать или удалить данные аккаунта, а также отвязать Google или
              Telegram от аккаунта, — напишите в поддержку через встроенный чат помощи в приложении.
              При удалении аккаунта связанные внешние идентификаторы удаляются вместе с ним.
            </p>
          </Section>

          <Section id="security" title="8. Безопасность">
            <p>
              Пароли хранятся только в виде bcrypt-хэшей, сессии подписаны серверным ключом и
              передаются исключительно по HTTPS в HttpOnly-cookie. Вход через внешних провайдеров
              проверяется на сервере по официальным алгоритмам (подпись, эмитент, аудитория, срок
              действия токенов).
            </p>
          </Section>

          <Section id="changes" title="9. Изменения политики">
            <p>
              Если политика существенно изменится, мы сообщим об этом в приложении перед вступлением
              изменений в силу. Актуальная редакция всегда доступна на этой странице.
            </p>
          </Section>

          <Section id="contact" title="10. Контакты">
            <p>
              Вопросы о приватности можно задать через встроенную поддержку в приложении
              (раздел &laquo;Помощь&raquo;). Мы отвечаем на русском и английском языках.
            </p>
          </Section>
        </div>

        {/* Footer */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-2 text-sm">
          <Link
            href="/terms"
            className="font-medium py-2 px-3 rounded-lg transition-[filter] hover:brightness-125"
            style={{ color: "var(--mq-text-muted)" }}
          >
            Условия использования
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
