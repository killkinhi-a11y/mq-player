/*
 * Custom window titlebar — real Windows chrome (§5): drag, minimize,
 * maximize/restore, close. The bar is part of the MQ glass system
 * (translucent, blur, hairline border), NOT a native-looking gray strip.
 * Tauri window APIs need the core:window permissions in capabilities.
 */
import { useEffect, useState } from "react";
import { Minus, Square, X, Copy } from "lucide-react";
import { isTauri } from "./env";

export default function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    let un: (() => void) | undefined;
    (async () => {
      const win = (await import("@tauri-apps/api/window")).getCurrentWindow();
      setMaximized(await win.isMaximized());
      const p = win.onResized(async () => setMaximized(await win.isMaximized()));
      un = () => {
        p.then((f) => f());
      };
    })();
    return () => un?.();
  }, []);

  if (!isTauri()) return null;

  const action = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <div className="mq-titlebar" role="toolbar" aria-label="Панель окна">
      <div className="mq-titlebar-brand" data-tauri-drag-region>
        <img src="/logo.svg" alt="" />
        <span>MQ Player</span>
      </div>
      <div className="mq-titlebar-drag" data-tauri-drag-region />
      <div className="mq-titlebar-actions">
        <button
          className="mq-titlebar-btn"
          title="Свернуть"
          aria-label="Свернуть"
          onClick={action(() => import("@tauri-apps/api/window").then((m) => m.getCurrentWindow().minimize()))}
        >
          <Minus size={15} strokeWidth={1.8} />
        </button>
        <button
          className="mq-titlebar-btn"
          title={maximized ? "Восстановить" : "Развернуть"}
          aria-label={maximized ? "Восстановить окно" : "Развернуть окно"}
          onClick={action(() => import("@tauri-apps/api/window").then((m) => m.getCurrentWindow().toggleMaximize()))}
        >
          {maximized ? <Copy size={12} strokeWidth={1.8} /> : <Square size={12} strokeWidth={1.8} />}
        </button>
        <button
          className="mq-titlebar-btn mq-titlebar-close"
          title="Закрыть"
          aria-label="Закрыть"
          onClick={action(() => import("@tauri-apps/api/window").then((m) => m.getCurrentWindow().close()))}
        >
          <X size={16} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}
