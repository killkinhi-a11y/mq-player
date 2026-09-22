/*
 * Windows media controls (SMTC) — §23.
 *
 * One dedicated thread owns the souvlaki MediaControls instance and
 * receives SmtcUpdate commands over a channel. System button presses
 * (Windows media overlay, hardware media keys, SMTC seek bar) are
 * forwarded to the WebView as `smtc://event`, where the JS integration
 * layer routes them into the SAME zustand actions the on-screen player
 * uses — one playback truth (§37).
 *
 * souvlaki 0.8 API notes (verified against source):
 *  - MediaControlEvent::{Play, Pause, Toggle, Next, Previous, Stop,
 *    Seek(SeekDirection), SeekBy(SeekDirection, Duration),
 *    SetPosition(MediaPosition), …}
 *  - MediaPlayback is an enum: Playing{progress}/Paused{progress}/Stopped
 *  - MediaMetadata fields are Options; cover_url → SMTC thumbnail.
 */
use souvlaki::{
    MediaControlEvent, MediaControls, MediaMetadata, MediaPlayback, MediaPosition,
    PlatformConfig, SeekDirection,
};
use std::sync::mpsc::{channel, Sender, TryRecvError};
use std::time::Duration;
use tauri::{Emitter, Manager};

#[derive(Debug, Clone)]
pub struct SmtcUpdate {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub artwork_path: String,
    pub duration_sec: f64,
    pub position_sec: f64,
    pub playing: bool,
    pub has_track: bool,
}

enum Cmd {
    Update(SmtcUpdate),
}

static CHANNEL: std::sync::OnceLock<Sender<Cmd>> = std::sync::OnceLock::new();

pub fn init(app: tauri::AppHandle) -> Result<(), String> {
    if CHANNEL.get().is_some() {
        return Ok(());
    }

    // The main window HWND — SMTC attaches to it. Stored as an integer
    // (HWND is not Send; the raw pointer crosses a thread boundary here).
    let hwnd = {
        let window = app
            .get_webview_window("main")
            .ok_or("no main window for SMTC")?;
        window.hwnd().map_err(|e| format!("hwnd: {e}"))?.0 as isize
    };

    let (tx, rx) = channel::<Cmd>();
    let _ = CHANNEL.set(tx);

    let app_for_events = app.clone();
    std::thread::Builder::new()
        .name("mq-smtc".into())
        .spawn(move || {
            // WinRT apartment for this thread.
            let _ = unsafe {
                windows::Win32::System::Com::CoInitializeEx(
                    None,
                    windows::Win32::System::Com::COINIT_MULTITHREADED,
                )
            };

            let config = PlatformConfig {
                dbus_name: "mq-player",
                display_name: "MQ Player",
                hwnd: Some(hwnd as *mut std::ffi::c_void),
            };

            let mut controls = match MediaControls::new(config) {
                Ok(c) => c,
                Err(e) => {
                    log::error!("[smtc] init failed: {e:?}");
                    return;
                }
            };

            let attached = controls.attach(move |event| {
                let app = app_for_events.clone();
                match event {
                    MediaControlEvent::Play => {
                        let _ = app.emit("smtc://event", serde_json::json!({"kind":"play"}));
                    }
                    MediaControlEvent::Pause | MediaControlEvent::Stop => {
                        let _ = app.emit("smtc://event", serde_json::json!({"kind":"pause"}));
                    }
                    MediaControlEvent::Toggle => {
                        let _ = app.emit("smtc://event", serde_json::json!({"kind":"playpause"}));
                    }
                    MediaControlEvent::Next => {
                        let _ = app.emit("smtc://event", serde_json::json!({"kind":"next"}));
                    }
                    MediaControlEvent::Previous => {
                        let _ = app.emit("smtc://event", serde_json::json!({"kind":"previous"}));
                    }
                    MediaControlEvent::Seek(dir) => {
                        // ±10s step from current position.
                        let step = match dir {
                            SeekDirection::Forward => 10.0,
                            SeekDirection::Backward => -10.0,
                        };
                        let _ = app.emit(
                            "smtc://event",
                            serde_json::json!({"kind":"seekby","deltaSec": step}),
                        );
                    }
                    MediaControlEvent::SeekBy(dir, d) => {
                        let step = match dir {
                            SeekDirection::Forward => d.as_secs_f64(),
                            SeekDirection::Backward => -(d.as_secs_f64()),
                        };
                        let _ = app.emit(
                            "smtc://event",
                            serde_json::json!({"kind":"seekby","deltaSec": step}),
                        );
                    }
                    MediaControlEvent::SetPosition(pos) => {
                        let _ = app.emit(
                            "smtc://event",
                            serde_json::json!({"kind":"seek","positionSec": pos.0.as_secs_f64()}),
                        );
                    }
                    _ => {}
                }
            });

            if let Err(e) = attached {
                log::error!("[smtc] attach failed: {e:?}");
                return;
            }

            let mut last_meta_key = String::new();

            loop {
                match rx.try_recv() {
                    Ok(Cmd::Update(u)) => {
                        let meta_key = format!("{}|{}|{}", u.title, u.artist, u.artwork_path);
                        if u.has_track && meta_key != last_meta_key {
                            last_meta_key = meta_key;
                            let artwork_url = if u.artwork_path.is_empty() {
                                None
                            } else if u.artwork_path.starts_with('/') {
                                Some(format!("{}{}", crate::proxy::API_BASE, u.artwork_path))
                            } else {
                                Some(u.artwork_path.clone())
                            };
                            let _ = controls.set_metadata(MediaMetadata {
                                title: Some(&u.title),
                                artist: Some(&u.artist),
                                album: Some(&u.album),
                                duration: (u.duration_sec > 0.0)
                                    .then(|| Duration::from_secs_f64(u.duration_sec)),
                                cover_url: artwork_url.as_deref(),
                            });
                        }
                        let playback = if !u.has_track {
                            MediaPlayback::Stopped
                        } else {
                            let progress = Some(MediaPosition(Duration::from_secs_f64(
                                u.position_sec.max(0.0),
                            )));
                            if u.playing {
                                MediaPlayback::Playing { progress }
                            } else {
                                MediaPlayback::Paused { progress }
                            }
                        };
                        let _ = controls.set_playback(playback);
                    }
                    Err(TryRecvError::Empty) => {
                        // Idle: SMTC stays interactive; light sleep.
                        std::thread::sleep(Duration::from_millis(60));
                    }
                    Err(TryRecvError::Disconnected) => break,
                }
            }
        })
        .map_err(|e| format!("smtc thread: {e}"))?;

    Ok(())
}

pub fn update(u: SmtcUpdate) {
    if let Some(tx) = CHANNEL.get() {
        let _ = tx.send(Cmd::Update(u));
    }
}
