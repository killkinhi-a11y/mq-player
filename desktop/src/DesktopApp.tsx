/*
 * MQ Player Desktop — application root.
 *
 * The ENTIRE web /play shell (AppShell and every view: Home, Search,
 * Library, Artist, Album, Playlist, Full Player with liquid title +
 * lyrics, Messenger, Settings, QR share…) is reused verbatim from
 * ../src — same components, same zustand store, same design tokens.
 * Desktop-only chrome (titlebar) and integrations (SMTC, tray,
 * notifications, deep links, updater) mount around it.
 */
import AppShell from "@/components/mq/AppShell";
import { Toaster } from "@/components/ui/toaster";
import { isTauri } from "./desktop/env";
import TitleBar from "./desktop/titlebar";
import DesktopIntegration from "./desktop/integration";

export default function DesktopApp() {
  const tauri = isTauri();
  return (
    <>
      {tauri && <TitleBar />}
      <AppShell />
      <Toaster />
      {tauri && <DesktopIntegration />}
    </>
  );
}
