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
      {/* Telegram WebApp SDK — loaded before React hydrates */}
      <script
        src="https://telegram.org/js/telegram-web-app.js"
        async
      />
      {children}
    </>
  );
}
