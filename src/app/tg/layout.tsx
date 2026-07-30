export const metadata = {
  title: "mq — Telegram Mini App",
  description: "Музыкальный плеер mq прямо в Telegram",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover" as const,
  themeColor: "#0e0e0e",
};

// Telegram Mini App — disable SSR, run only on client
export const dynamic = "force-dynamic";

export default function TgLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Telegram WebApp SDK — MUST be synchronous (no async/defer) so it
          loads and sets window.Telegram.WebApp BEFORE React hydrates.
          With async, the SDK may not be ready when our useEffect runs,
          causing initData to be empty and showing the "open via bot" error. */}
      <script src="https://telegram.org/js/telegram-web-app.js" />
      {children}
    </>
  );
}
