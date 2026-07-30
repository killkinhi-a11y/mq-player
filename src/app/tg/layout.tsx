import Script from "next/script";

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
      {/* Telegram WebApp SDK — must load BEFORE React hydrates so that
          window.Telegram.WebApp.initData is available in useEffect.
          next/script with beforeInteractive guarantees this.
          Regular <script async> or <script defer> does NOT. */}
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="beforeInteractive"
      />
      {children}
    </>
  );
}
