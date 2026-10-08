# Spotiamp

A retro Winamp-styled player that controls real Spotify playback in your browser (Authorization Code + PKCE, no server/secret needed).

## Requirements

- **Spotify Premium** — the Web Playback SDK refuses to stream for free accounts.
- A Spotify Developer app (free to create).
- Any static file server (this is plain HTML/CSS/JS, no build step).

## Setup

No file editing is required — the app asks for a Spotify Client ID the first time it loads and remembers it in that browser's `localStorage` from then on. This is what makes a single deployment (your own machine or a hosted URL) reusable by anyone with their own Spotify account:

1. Serve this folder over `http://` (not `file://` — Spotify's OAuth redirect requires it), e.g.:
   ```
   npx serve -l 5500
   ```
   or deploy it to any static host (GitHub Pages, Netlify, Vercel, …) — see "Sharing / hosting" below.
2. Open the page. It shows the exact **Redirect URI** to register (computed from wherever you're serving it) — go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard), create an app, and add that URI under its settings.
3. Copy that app's **Client ID** into the page's input box and click **Save**.
4. Click **Connect to Spotify** and log in.

(Optional local convenience: copy `js/config.example.js` to `js/config.js` — gitignored — and set `CLIENT_ID` there to skip step 3 on your own machine. Entirely optional; the app works with no config file at all.)

## Sharing / hosting

Because the Client ID lives in the visitor's own browser storage, not in the code, you can put this on any static host and hand out one link:

1. Push this repo to GitHub and enable **GitHub Pages** (Settings → Pages → deploy from branch), or deploy to Netlify/Vercel/Cloudflare Pages by pointing them at this folder — no build step needed.
2. Send people the resulting URL.
3. **Each person needs their own Spotify Developer app** (their own Client ID) with that exact hosted URL registered as its Redirect URI — Client IDs aren't secret, but the app they belong to controls who's allowed to authenticate. Spotify apps start in **Development Mode**, which caps logins to ~25 explicitly-added Spotify accounts (under the app's "Users and Access" tab in the dashboard) — each person adds their *own* account to their *own* app, so this only matters if someone else tries to use *your* Client ID instead of creating their own.

## Using it

- **EQ** / **PL** / **LYR** (next to the volume slider) open the graphic equalizer, Playlist/Search, and Lyrics windows. Search failures (expired token, no active device yet, etc.) are reported as text under the search box instead of failing silently. Lyrics load automatically for whatever's currently playing.
- The eject button (▲, bottom row) opens the Playlist/Search window and focuses the search box.
- Transport buttons, seek bar, and volume behave like classic Winamp; the balance slider is present for looks (see limitations below).
- **SHUFFLE** / the loop-icon button toggle Spotify's shuffle and repeat (off → context → track) modes.
- The orange circle button shades the main window (collapses it to just the titlebar).
- Drag any window by its titlebar.
- **X** on the main window logs you out.

## Known limitations

- The visualizer bars and the equalizer are both stylized, not real audio processing — Spotify's Web Playback SDK streams DRM-protected audio through a sandboxed decoder and never exposes raw samples or an insertable Web Audio node. The visualizer bars react to play/pause state instead of an FFT, and moving the EQ sliders doesn't change the actual sound.
- Lyrics come from a free third-party lookup ([lyrics.ovh](https://lyrics.ovh)), not Spotify — Spotify's own API doesn't expose lyrics to any third-party app. They're plain text (not synced to playback position) and matched by artist/title, so some tracks (rare songs, live/remix versions, non-English titles) won't be found.
- The kbps/kHz readout shows `—` rather than real numbers — Spotify doesn't expose per-track bitrate or sample rate to any web app, official or third-party. The balance slider is decorative for the same reason (no stereo-pan API).
- Access tokens are stored in `localStorage` and refreshed automatically; logging out clears them.
- This app only controls playback on **this** browser tab's Spotify Connect device — switching devices from the Spotify app elsewhere will move playback away from it.
