const { app, BrowserWindow, shell } = require("electron");
const path = require("path");

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

// ─────────────────────────────────────────────────────────────────────────────
// HONESTY NOTE (M1 / Honesty Pass)
//
// MQ Player Remote is a thin desktop wrapper that loads the web app at
// APP_URL. It is NOT a bundled/offline-capable build: the Next.js bundle is
// not packaged into the Electron binary. If APP_URL is unreachable (server
// down, no internet), the window will show a connection error.
//
// For a real offline-capable desktop build, you would need to:
//   1. Run `next build && next start` inside the Electron main process
//      (bundle .next/standalone into the Electron app).
//   2. Change `mainWindow.loadURL(APP_URL)` → `mainWindow.loadURL('http://localhost:PORT')`.
//   3. Update package.json build.files to include `.next/standalone/**/*`
//      and `.next/static/**/*`.
//
// Tracked as future work; for now, this is "MQ Player Remote".
// ─────────────────────────────────────────────────────────────────────────────

const APP_URL = process.env.MQ_PLAYER_URL || "https://mq1.vercel.app";
const PRELOAD_PATH = path.join(__dirname, "preload.js");

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: "MQ Player Remote",
    icon: path.join(__dirname, "..", "public", "icon-512.png"),
    backgroundColor: "#0e0e0e",
    show: false,
    autoHideMenuBar: false,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadURL(APP_URL);
  mainWindow.setMenuBarVisibility(false);

  // Show window when ready to prevent flash
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Handle connection failures gracefully — show a basic error page instead
  // of a blank window, so the user understands the app requires internet.
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
    if (errorCode === -3 || errorCode === -105 || errorCode === -106) {
      // ABORTED / NAME_NOT_RESOLVED / INTERNET_DISCONNECTED
      mainWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(`
        <!doctype html><html lang="ru"><head><meta charset="utf-8">
        <title>MQ Player Remote — нет соединения</title>
        <style>
          body{margin:0;display:flex;align-items:center;justify-content:center;
               height:100vh;background:#0e0e0e;color:#fff;font-family:system-ui,sans-serif;text-align:center}
          .c{max-width:480px;padding:32px}
          h1{font-size:18px;margin:0 0 12px;color:#e03131}
          p{font-size:14px;line-height:1.5;color:#999;margin:8px 0}
          code{background:#1a1a1a;padding:2px 6px;border-radius:4px;color:#ccc;font-size:12px}
        </style></head>
        <body><div class="c">
          <h1>Нет соединения с сервером</h1>
          <p>MQ Player Remote загружает веб-версию плеера с сервера
             <code>${APP_URL}</code>, но сервер недоступен.</p>
          <p>Проверьте интернет-соединение и попробуйте снова.</p>
        </div></body></html>
      `));
    }
  });

  // Open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});
