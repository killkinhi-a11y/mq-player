/*
 * releaseNotes — human-language "Что нового" for the WEB app update flow
 * (task §20). NO version-commit jargon ("v2.3.4 — 17 commits" is banned):
 * a normal user must understand what changed at a glance.
 *
 * Consumed by: UpdateBanner (expandable panel) and SettingsView (About).
 * The optional technical line goes behind «Подробнее».
 */

export interface ReleaseNote {
  /** One short user-facing phrase — what got better. */
  text: string;
}

export const WEB_RELEASE_NOTES: ReleaseNote[] = [
  { text: "Обновили внешний вид плеера — теперь как отдельное приложение" },
  { text: "Улучшили управление музыкой и очередью воспроизведения" },
  { text: "Сделали библиотеку удобнее — навигация всегда под рукой" },
  { text: "Добавили QR-коды для быстрого обмена треками" },
  { text: "Оживили фон — он подстраивается под музыку" },
  { text: "Улучшили анимации и плавность интерфейса" },
  { text: "Исправили ошибки авторизации" },
];

/** Optional deep-dive for the «Подробнее» expander — still user-friendly. */
export const WEB_RELEASE_NOTES_DETAIL: string[] = [
  "Новая боковая панель навигации на компьютере",
  "Плеер внизу экрана стал отдельной «плавающей» панелью",
  "Полноэкранный плеер: эффект «живого» названия трека",
  "Страницы артистов и плейлистов перерисованы",
  "QR-коды проходят проверку реальным сканером",
  "Ссылки «Поделиться» стали короче и всегда работают",
];
