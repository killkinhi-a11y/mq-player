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
  // SDK is loaded dynamically by ensureTelegramSDK() in page.tsx.
  // We don't use next/script here because beforeInteractive only works
  // in the root layout, and afterInteractive loads too late for our
  // useEffect. Dynamic injection with async=false is the most reliable
  // approach across mobile/desktop Telegram WebView.
  return <>{children}</>;
}
