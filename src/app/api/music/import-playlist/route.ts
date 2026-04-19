import { NextRequest, NextResponse } from 'next/server';
import { searchSCTracks } from '@/lib/soundcloud';

export async function POST(req: NextRequest) {
  try {
    const { url, vkToken } = await req.json();
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL не указана' }, { status: 400 });
    }

    // Normalize URL
    const normalizedUrl = url.trim().replace(/\/$/, '');

    // Detect platform
    const platform = detectPlatform(normalizedUrl);

    if (!platform) {
      return NextResponse.json({
        error: 'Неподдерживаемый сервис. Поддерживаются: ВКонтакте, Яндекс.Музыка, Spotify, YouTube Music, Apple Music, SoundCloud, Deezer, Boom, Zvuk.',
        tracks: [],
      });
    }

    // For VK, require a token
    if (platform === 'ВКонтакте' && !vkToken) {
      return NextResponse.json({
        error: 'VK требует API-токен для доступа к плейлистам.',
        hint: 'Как получить токен:\n1. Откройте https://vk.com/dev/audio.getPlaylistById\n2. Нажмите «Попробовать» (Try it)\n3. Скопируйте access_token из адресной строки\n4. Вставьте токен в поле «VK токен» ниже',
        tracks: [],
        needVkToken: true,
      });
    }

    // Try to extract tracks
    let playlistName = '';
    let trackNames: { title: string; artist: string }[] = [];

    try {
      const result = await extractTracks(normalizedUrl, platform, vkToken);
      playlistName = result.name;
      trackNames = result.tracks;
    } catch (e) {
      console.error(`[${platform}] Import error:`, e);
    }

    // If we found tracks, search them on SoundCloud
    if (trackNames.length > 0) {
      const foundTracks: any[] = [];
      for (const track of trackNames.slice(0, 50)) {
        try {
          const query = `${track.artist} ${track.title}`;
          const results = await searchSCTracks(query, 1);
          if (results && results.length > 0) {
            foundTracks.push({
              title: track.title,
              artist: track.artist,
              cover: results[0].cover || '',
              duration: results[0].duration || 0,
              album: results[0].album || '',
              genre: results[0].genre || '',
              audioUrl: results[0].audioUrl || '',
              scTrackId: results[0].scTrackId || null,
              scIsFull: results[0].scIsFull || false,
            });
          } else {
            foundTracks.push({
              title: track.title,
              artist: track.artist,
              cover: '',
              duration: 0,
              album: '',
              genre: '',
            });
          }
        } catch {
          foundTracks.push({ title: track.title, artist: track.artist, cover: '', duration: 0, album: '', genre: '' });
        }
      }

      if (foundTracks.length > 0) {
        return NextResponse.json({ source: platform, name: playlistName, tracks: foundTracks });
      }
    }

    // Platform-specific fallback messages
    const fallbackMessages: Record<string, { error: string; hint: string }> = {
      'ВКонтакте': {
        error: 'Не удалось загрузить треки из VK. Проверьте токен и попробуйте снова.',
        hint: 'Убедитесь, что токен получен на странице https://vk.com/dev/audio.getPlaylistById и не истёк. Токены VK временные — обновите его и попробуйте снова.',
      },
      'Яндекс.Музыка': {
        error: 'Не удалось загрузить треки из Яндекс.Музыки.',
        hint: 'Попробуйте: откройте плейлист → скопируйте названия треков → используйте «Импорт текстом».',
      },
      'Spotify': {
        error: 'Spotify требует авторизации для доступа к плейлистам.',
        hint: 'Альтернатива: скопируйте названия треков из Spotify и вставьте в «Импорт текстом».',
      },
      'YouTube Music': {
        error: 'YouTube Music требует авторизации.',
        hint: 'Альтернатива: скопируйте названия треков и вставьте в «Импорт текстом».',
      },
      'Apple Music': {
        error: 'Apple Music требует авторизации.',
        hint: 'Альтернатива: скопируйте названия треков и вставьте в «Импорт текстом».',
      },
      'SoundCloud': {
        error: 'Не удалось загрузить треки из SoundCloud.',
        hint: 'Попробуйте скопировать названия треков и использовать «Импорт текстом».',
      },
      'Deezer': {
        error: 'Deezer требует авторизации.',
        hint: 'Альтернатива: скопируйте названия треков и вставьте в «Импорт текстом».',
      },
      'Boom': {
        error: 'Boom требует авторизации.',
        hint: 'Альтернатива: скопируйте названия треков и вставьте в «Импорт текстом».',
      },
    };

    const fallback = fallbackMessages[platform] || {
      error: 'Не удалось загрузить треки.',
      hint: 'Скопируйте названия треков и используйте «Импорт текстом».',
    };

    return NextResponse.json({
      error: fallback.error,
      source: platform,
      tracks: [],
      name: playlistName || `${platform} Плейлист`,
      hint: fallback.hint,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Ошибка при импорте' }, { status: 500 });
  }
}

type Platform = 'ВКонтакте' | 'Яндекс.Музыка' | 'Spotify' | 'YouTube Music' | 'Apple Music' | 'SoundCloud' | 'Deezer' | 'Boom';

function detectPlatform(url: string): Platform | null {
  if (/vk\.com|m\.vk\.com/.test(url)) return 'ВКонтакте';
  if (/music\.yandex|yandex\.ru\/music|ya\.ru\/music/.test(url)) return 'Яндекс.Музыка';
  if (/open\.spotify\.com|spotify\.com/.test(url)) return 'Spotify';
  if (/youtube\.com|youtu\.be|music\.youtube\.com/.test(url)) return 'YouTube Music';
  if (/music\.apple\.com|itunes\.apple\.com/.test(url)) return 'Apple Music';
  if (/soundcloud\.com/.test(url)) return 'SoundCloud';
  if (/deezer\.com/.test(url)) return 'Deezer';
  if (/boom\.ru/.test(url)) return 'Boom';
  return null;
}

async function extractTracks(url: string, platform: Platform, vkToken?: string): Promise<{ name: string; tracks: { title: string; artist: string }[] }> {
  const name = '';
  const tracks: { title: string; artist: string }[] = [];

  switch (platform) {
    case 'ВКонтакте':
      return await extractVK(url, vkToken);
    case 'Яндекс.Музыка':
      return await extractYandex(url);
    case 'SoundCloud':
      return await extractSoundCloud(url);
    case 'Spotify':
      return await extractSpotify(url);
    case 'YouTube Music':
      return await extractYouTube(url);
    default:
      return await extractGeneric(url, platform);
  }
}

async function fetchPage(url: string, timeout = 15000): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeout),
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
    },
  });
  return res.ok ? res.text() : '';
}

// ── VK ───────────────────────────────────────────────────
async function extractVK(url: string, vkToken?: string): Promise<{ name: string; tracks: { title: string; artist: string }[] }> {
  let playlistName = 'VK Плейлист';
  const tracks: { title: string; artist: string }[] = [];

  // Parse VK playlist URL: https://vk.com/music/playlist/{owner_id}_{playlist_id}_{access_hash}
  const urlMatch = url.match(/vk\.com\/music\/playlist\/(-?\d+)_(\d+)(?:_(\w+))?/) ||
                   url.match(/vk\.com\/audio_playlist(-?\d+)_(\d+)_(\w+)/) ||
                   url.match(/vk\.com\/audio\?act=audio_playlist(-?\d+)_(\d+)/);

  if (!urlMatch) {
    return { name: playlistName, tracks };
  }

  const ownerId = parseInt(urlMatch[1]);
  const playlistId = parseInt(urlMatch[2]);
  const accessHash = urlMatch[3] || '';

  if (!vkToken) {
    return { name: playlistName, tracks };
  }

  // Use VK API to get playlist
  try {
    const apiParams = new URLSearchParams({
      owner_id: String(ownerId),
      playlist_id: String(playlistId),
      access_token: vkToken,
      v: '5.194',
    });
    if (accessHash) {
      apiParams.set('access_hash', accessHash);
    }

    const apiRes = await fetch(`https://api.vk.com/method/audio.getPlaylistById?${apiParams}`, {
      signal: AbortSignal.timeout(15000),
    });

    const apiData = await apiRes.json();

    if (apiData.error) {
      console.error('VK API error:', apiData.error);
      throw new Error(apiData.error.error_msg || 'VK API error');
    }

    const response = apiData.response;
    if (!response) {
      return { name: playlistName, tracks };
    }

    // Extract playlist name
    const playlist = response.playlist || response;
    if (playlist.title) {
      playlistName = playlist.title;
    }

    // Extract tracks from the response
    // VK API returns tracks in different formats depending on the version
    const items = response.items || response.tracks || playlist.tracks || [];
    const trackArray = Array.isArray(items) ? items : [];

    for (const item of trackArray.slice(0, 50)) {
      const title = item.title || item.name || '';
      const artist = item.artist || (item.main_artists && item.main_artists[0]?.name) || '';
      if (title && artist) {
        tracks.push({ title: title.trim(), artist: artist.trim() });
      }
    }

    // If no items field, try to find tracks in nested structures
    if (tracks.length === 0) {
      const allTracks = findTracksInObject(response, 'tracks') || findTracksInObject(response, 'items');
      if (Array.isArray(allTracks)) {
        for (const item of allTracks.slice(0, 50)) {
          if (typeof item !== 'object' || !item) continue;
          const title = item.title || item.name || '';
          const artist = item.artist || '';
          if (title && artist) {
            tracks.push({ title: String(title).trim(), artist: String(artist).trim() });
          }
        }
      }
    }

  } catch (e: any) {
    console.error('VK API extraction error:', e);
    // Return error info so the frontend can show it
    throw new Error(e.message || 'Не удалось загрузить плейлист из VK');
  }

  return { name: playlistName, tracks };
}

// ── Яндекс.Музыка ────────────────────────────────────────
async function extractYandex(url: string): Promise<{ name: string; tracks: { title: string; artist: string }[] }> {
  let playlistName = 'Яндекс.Музыка Плейлист';
  const tracks: { title: string; artist: string }[] = [];

  try {
    const html = await fetchPage(url);
    if (!html) return { name: playlistName, tracks };

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/);
    if (titleMatch) {
      const t = titleMatch[1].replace(/ — Яндекс Музыка.*$/, '').replace(/Яндекс Музыка.*/, '').trim();
      if (t) playlistName = t;
    }

    // Pattern 1: __INITIAL_STATE__ JSON
    const stateMatch = html.match(/__INITIAL_STATE__\s*=\s*([\s\S]*?);?\s*<\/script>/);
    if (stateMatch) {
      try {
        const stateJson = stateMatch[1].replace(/undefined/g, 'null');
        const state = JSON.parse(stateJson);
        // Navigate to find tracks
        const trackList = findTracksInObject(state, 'tracks');
        if (trackList && Array.isArray(trackList)) {
          for (const t of trackList.slice(0, 100)) {
            if (typeof t === 'object' && t !== null) {
              const title = t.title || t.name || '';
              const artists = t.artists || t.artistsNames || [];
              const artist = Array.isArray(artists) ? (artists[0]?.name || artists[0] || '') : String(artists);
              if (title) tracks.push({ title: String(title), artist: String(artist) });
            }
          }
        }
      } catch {}
    }

    // Pattern 2: JSON-LD structured data
    if (tracks.length === 0) {
      const ldMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/);
      if (ldMatch) {
        try {
          const jsonData = JSON.parse(ldMatch[1]);
          const trackList = jsonData.track || jsonData.tracks || [];
          const trackArray = Array.isArray(trackList) ? trackList : [trackList];
          for (const t of trackArray) {
            if (t.name) {
              const artist = Array.isArray(t.byArtist) ? t.byArtist[0]?.name : t.byArtist?.name;
              if (artist) tracks.push({ title: t.name, artist });
            }
          }
        } catch {}
      }
    }

    // Pattern 3: Regex patterns in page HTML
    if (tracks.length === 0) {
      const trackPattern = /"name"\s*:\s*"([^"]+)"[^}]*?"artists"\s*:\s*\[\s*\{\s*"name"\s*:\s*"([^"]+)"/g;
      let m;
      while ((m = trackPattern.exec(html)) !== null) {
        tracks.push({ title: m[1], artist: m[2] });
      }
    }

    // Pattern 4: Meta description
    if (tracks.length === 0) {
      const descMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i);
      if (descMatch && descMatch[1].includes('трек')) {
        const dashPattern = /([^,•—–]+?)\s*[—–-]\s*([^,•—–]+)/g;
        let dm;
        while ((dm = dashPattern.exec(descMatch[1])) !== null) {
          tracks.push({ artist: dm[1].trim(), title: dm[2].trim() });
        }
      }
    }

  } catch (e) {
    console.error('Yandex extraction error:', e);
  }

  return { name: playlistName, tracks };
}

// ── SoundCloud ───────────────────────────────────────────
async function extractSoundCloud(url: string): Promise<{ name: string; tracks: { title: string; artist: string }[] }> {
  const match = url.match(/soundcloud\.com\/([^/]+)\/sets\/([^/]+)/) || url.match(/soundcloud\.com\/([^/]+\/[^/]+)/);
  if (!match) return { name: 'SoundCloud', tracks: [] };

  const artistName = match[1].split('/')[0].replace(/-/g, ' ');
  let playlistName = match[2] ? match[2].replace(/-/g, ' ') : artistName;

  try {
    const results = await searchSCTracks(artistName, 20);
    if (results && results.length > 0) {
      const tracks = results.slice(0, 15).map(t => ({
        title: t.title || '',
        artist: t.artist || artistName,
        cover: t.cover || '',
        duration: t.duration || 0,
        album: t.album || '',
        genre: t.genre || '',
        audioUrl: t.audioUrl || '',
        scTrackId: t.scTrackId || null,
        scIsFull: t.scIsFull || false,
      }));
      return { name: playlistName, tracks };
    }
  } catch {}

  return { name: playlistName, tracks: [] };
}

// ── Spotify ──────────────────────────────────────────────
async function extractSpotify(url: string): Promise<{ name: string; tracks: { title: string; artist: string }[] }> {
  let playlistName = 'Spotify Плейлист';

  try {
    // Try oEmbed for playlist name
    const oembedRes = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(10000),
      headers: { 'Accept': 'application/json' },
    });
    if (oembedRes.ok) {
      const oembed = await oembedRes.json();
      playlistName = oembed.title || playlistName;
    }

    // Try scraping for track data
    const html = await fetchPage(url, 10000);
    if (html) {
      // Spotify embeds data in __NEXT_DATA__ or script tags
      const nextData = html.match(/__NEXT_DATA__\s*=\s*([\s\S]*?)\s*;?\s*<\/script>/);
      if (nextData) {
        try {
          const data = JSON.parse(nextData[1]);
          const trackList = findTracksInObject(data, 'trackList') || findTracksInObject(data, 'items');
          if (Array.isArray(trackList)) {
            const tracks: { title: string; artist: string }[] = [];
            for (const item of trackList.slice(0, 100)) {
              if (typeof item === 'object' && item !== null) {
                const track = item.track || item;
                if (track.name) {
                  const artists = track.artists || [];
                  const artist = Array.isArray(artists) ? (artists[0]?.name || '') : '';
                  if (artist) tracks.push({ title: track.name, artist });
                }
              }
            }
            if (tracks.length > 0) return { name: playlistName, tracks };
          }
        } catch {}
      }

      // Fallback: regex for "title" and "artist" patterns
      const titlePattern = /"name"\s*:\s*"([^"]+)"[^}]{0,100}"artists"\s*:\s*\[\s*\{\s*"name"\s*:\s*"([^"]+)"/g;
      let m;
      const tracks: { title: string; artist: string }[] = [];
      while ((m = titlePattern.exec(html)) !== null) {
        tracks.push({ title: m[1], artist: m[2] });
      }
      if (tracks.length > 0) return { name: playlistName, tracks };
    }
  } catch {}

  return { name: playlistName, tracks: [] };
}

// ── YouTube Music ────────────────────────────────────────
async function extractYouTube(url: string): Promise<{ name: string; tracks: { title: string; artist: string }[] }> {
  let playlistName = 'YouTube Плейлист';

  try {
    // Get title via oEmbed
    const oembedRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, {
      signal: AbortSignal.timeout(10000),
    });
    if (oembedRes.ok) {
      const oembed = await oembedRes.json();
      playlistName = oembed.title || playlistName;
    }

    // Try to scrape for track data
    const html = await fetchPage(url, 10000);
    if (html) {
      // YouTube Music stores data in ytInitialData
      const initData = html.match(/ytInitialData\s*=\s*([\s\S]*?);?\s*<\/script>/);
      if (initData) {
        try {
          const data = JSON.parse(initData[1]);
          // Try to find playlist content
          const contents = findTracksInObject(data, 'contents');
          if (Array.isArray(contents)) {
            const tracks: { title: string; artist: string }[] = [];
            for (const item of contents.slice(0, 100)) {
              if (typeof item !== 'object' || !item) continue;
              const runs = item.title?.runs || item.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;
              if (Array.isArray(runs) && runs.length >= 2) {
                const title = runs[0]?.text || '';
                const artist = runs[1]?.text || '';
                if (title && artist) tracks.push({ title: title.trim(), artist: artist.trim() });
              }
            }
            if (tracks.length > 0) return { name: playlistName, tracks };
          }
        } catch {}
      }

      // Fallback: look for "title" and "byline" patterns
      const titlePattern = /"title"\s*:\s*\{\s*"runs"\s*:\s*\[\s*\{\s*"text"\s*:\s*"([^"]+)"/g;
      const artistPattern = /"byline"\s*:\s*\{\s*"runs"\s*:\s*\[\s*\{\s*"text"\s*:\s*"([^"]+)"/g;
      const titles: string[] = [];
      const artists: string[] = [];
      let m;
      while ((m = titlePattern.exec(html)) !== null) titles.push(m[1]);
      while ((m = artistPattern.exec(html)) !== null) artists.push(m[1]);
      const tracks: { title: string; artist: string }[] = [];
      for (let i = 0; i < Math.min(titles.length, artists.length); i++) {
        if (titles[i] && artists[i]) tracks.push({ title: titles[i].trim(), artist: artists[i].trim() });
      }
      if (tracks.length > 0) return { name: playlistName, tracks };
    }
  } catch {}

  return { name: playlistName, tracks: [] };
}

// ── Generic fallback (Apple Music, Deezer, Boom, etc.) ──
async function extractGeneric(url: string, platform: string): Promise<{ name: string; tracks: { title: string; artist: string }[] }> {
  let playlistName = `${platform} Плейлист`;

  try {
    const html = await fetchPage(url, 10000);
    if (!html) return { name: playlistName, tracks: [] };

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/);
    if (titleMatch) {
      const t = titleMatch[1].split(/\s*[|–—-]\s*/)[0].trim();
      if (t) playlistName = t;
    }

    // Try JSON-LD
    const ldMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/);
    if (ldMatch) {
      try {
        const jsonData = JSON.parse(ldMatch[1]);
        const trackList = jsonData.track || jsonData.tracks || [];
        const trackArray = Array.isArray(trackList) ? trackList : [trackList];
        const tracks: { title: string; artist: string }[] = [];
        for (const t of trackArray) {
          if (t.name) {
            const artist = Array.isArray(t.byArtist) ? t.byArtist[0]?.name : t.byArtist?.name;
            if (artist) tracks.push({ title: t.name, artist });
          }
        }
        if (tracks.length > 0) return { name: playlistName, tracks };
      } catch {}
    }

    // Try __INITIAL_STATE__ or similar JSON blocks
    const statePatterns = [
      /__INITIAL_STATE__\s*=\s*([\s\S]*?)\s*;?\s*<\/script>/,
      /__NEXT_DATA__\s*=\s*([\s\S]*?)\s*;?\s*<\/script>/,
      /window\.__data\s*=\s*([\s\S]*?)\s*;?\s*<\/script>/,
    ];
    for (const pattern of statePatterns) {
      const match = html.match(pattern);
      if (match) {
        try {
          const data = JSON.parse(match[1].replace(/undefined/g, 'null'));
          const trackList = findTracksInObject(data, 'tracks') || findTracksInObject(data, 'items') || findTracksInObject(data, 'trackList');
          if (Array.isArray(trackList) && trackList.length > 0) {
            const tracks: { title: string; artist: string }[] = [];
            for (const item of trackList.slice(0, 100)) {
              if (typeof item !== 'object' || !item) continue;
              const title = item.title || item.name || '';
              const artist = (Array.isArray(item.artists) ? item.artists[0]?.name : item.artist || item.artists) || '';
              if (title) tracks.push({ title: String(title), artist: String(artist) });
            }
            if (tracks.length > 0) return { name: playlistName, tracks };
          }
        } catch {}
      }
    }

    // Last resort: "Artist - Title" pattern in meta tags
    const descMatch = html.match(/<meta[^>]*content="([^"]{50,})"/i);
    if (descMatch) {
      const content = descMatch[1];
      const dashPattern = /([^-—–]+?)\s*[—–-]\s*([^,.\n]+)/g;
      const tracks: { title: string; artist: string }[] = [];
      let dm;
      while ((dm = dashPattern.exec(content)) !== null) {
        const a = dm[1].trim();
        const t = dm[2].trim();
        if (a.length > 2 && t.length > 2 && a.length < 60 && t.length < 80) {
          tracks.push({ artist: a, title: t });
        }
      }
      if (tracks.length >= 2) return { name: playlistName, tracks };
    }

  } catch (e) {
    console.error(`[${platform}] Generic extraction error:`, e);
  }

  return { name: playlistName, tracks: [] };
}

// ── Utility: recursively find array values by key in nested object ──
function findTracksInObject(obj: any, key: string, depth = 5): any[] | null {
  if (depth <= 0 || !obj || typeof obj !== 'object') return null;

  if (Array.isArray(obj)) {
    // Check if this array looks like a track list (has objects with title/name + artist)
    if (obj.length > 0 && typeof obj[0] === 'object') {
      const first = obj[0];
      if ((first.title || first.name) && (first.artist || first.artists || first.performer)) {
        return obj;
      }
    }
    // Search within array items
    for (const item of obj.slice(0, 10)) {
      const result = findTracksInObject(item, key, depth - 1);
      if (result && result.length > 0) return result;
    }
    return null;
  }

  for (const [k, v] of Object.entries(obj)) {
    if (k === key && Array.isArray(v) && v.length > 0) {
      return v;
    }
    if (typeof v === 'object' && v !== null) {
      const result = findTracksInObject(v, key, depth - 1);
      if (result && result.length > 0) return result;
    }
  }
  return null;
}
