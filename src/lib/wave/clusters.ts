/**
 * Cultural cluster detection (Wave V2 — language/cultural relevance, PART 8).
 *
 * PHILOSOPHY — this is NOT a blacklist. A cluster is only "foreign" when
 * THIS user has zero history with it (see relevance.ts). A user who listens
 * to Indian music daily keeps receiving Indian music — the same detector
 * that flags "indic" for a RU/EU user also certifies it for a desi user.
 *
 * Detection is structural, not editorial:
 *   1. SCRIPT ranges (Devanagari, Hangul, Kana, Han, Arabic, Thai, Hebrew,
 *      Greek, Cyrillic) — the strongest signal; transliteration can't fake
 *      it and it can't be "cleaned" by the uploader.
 *   2. GENRE tokens (bollywood, bhangra, k-pop, reggaeton, …) — catches
 *      Latin-script tracks whose genre already declares the cluster.
 *   3. TITLE tokens (hindi, punjabi, desi, kpop, ost, …) — weak tertiary.
 *
 * "latin" and "cyrillic" are returned as clusters too (so affinity can be
 * counted for them), but they are treated as the user's DEFAULT cultural
 * space by the relevance gate (see DEFAULT_CULTURAL_SPACE in relevance.ts)
 * — a Latin-script track is never rejected for its script alone.
 */

/** Non-null cluster ids (stable strings; countable in the profile). */
export type CulturalClusterId =
  | "indic"
  | "korean"
  | "japanese"
  | "cjk"
  | "arabic"
  | "thai"
  | "hebrew"
  | "greek"
  | "georgian"
  | "vietnamese"
  | "turkish"
  | "latin"
  | "latin_music" // Latin-American music genres (Spanish/Portuguese scene)
  | "cyrillic";

/** Script-range table — order matters (first hit wins on mixed text). */
const SCRIPT_RANGES: Array<{ re: RegExp; cluster: CulturalClusterId }> = [
  // Indic scripts: Devanagari, Bengali, Gurmukhi, Gujarati, Oriya, Tamil,
  // Telugu, Kannada, Malayalam, Sinhala
  { re: /[\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B00-\u0B7F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F\u0D80-\u0DFF]/, cluster: "indic" },
  { re: /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/, cluster: "korean" },
  { re: /[\u3040-\u30FF]/, cluster: "japanese" },
  { re: /[\u4E00-\u9FFF\u3400-\u4DBF]/, cluster: "cjk" },
  { re: /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/, cluster: "arabic" },
  { re: /[\u0E00-\u0E7F]/, cluster: "thai" },
  { re: /[\u0590-\u05FF]/, cluster: "hebrew" },
  { re: /[\u0370-\u03FF]/, cluster: "greek" },
  // Georgian (incl. Mtavruli) — used by zero-width-looking spam artist names.
  { re: /[\u10A0-\u10FF\u1C90-\u1CBF]/, cluster: "georgian" },
  // Latin-script languages with DISTINCTIVE diacritics — detectable before
  // the generic "latin" fallback. Vietnamese (Ơ Ư đ + the U+1EA0-1EF9
  // precomposed block) and Turkish (ğ ı ş İ). Personal, not editorial: a
  // user who listens to these builds cluster affinity and is unaffected.
  { re: /[\u01A0-\u01B0\u1EA0-\u1EF9]/, cluster: "vietnamese" },
  { re: /[\u011F\u0130\u0131\u015FĞİŞ]/, cluster: "turkish" },
  { re: /[\u0400-\u04FF]/, cluster: "cyrillic" },
  { re: /[A-Za-z\u00C0-\u024F]/, cluster: "latin" },
];

/** Genre tokens → cluster (lowercase, word-boundary matched). */
const GENRE_TOKENS: Array<{ re: RegExp; cluster: CulturalClusterId }> = [
  { re: /\b(bollywood|bhangra|punjabi|desi|hindi|tamil|telugu|gujarati|marathi|carnatic|hindustani)\b/, cluster: "indic" },
  { re: /\b(k-?pop|kpop|kdrama|korean|trot|k-?hip ?hop|k-?ballad)\b/, cluster: "korean" },
  { re: /\b(j-?pop|jpop|j-?rock|jrock|vocaloid|anime|city pop|japanese|enka)\b/, cluster: "japanese" },
  { re: /\b(mandopop|c-?pop|cantopop|chinese)\b/, cluster: "cjk" },
  { re: /\b(arabic|arabesk|middle eastern|shaabi|raï|rai)\b/, cluster: "arabic" },
  { re: /\b(thai)\b/, cluster: "thai" },
  { re: /\b(hebrew|israeli|klezmer)\b/, cluster: "hebrew" },
  { re: /\b(v-?pop|vpop|vietnamese|nhac tre|bolero|vietnam)\b/, cluster: "vietnamese" },
  { re: /\b(turkish|türkçe|arabesk|türkü|fantezi|otantik)\b/, cluster: "turkish" },
  { re: /\b(reggaeton|latin|salsa|bachata|cumbia|merengue|mariachi|banda|norte[ñn]o|corrido|mambo|bolero|ranchera|vallenato|perreo|dembow|latin pop|latin trap|latin jazz|bossa nova|samba|forró|sertanejo|funk br|brasil)\b/, cluster: "latin_music" },
];

/** Title tokens → cluster (tertiary; only unambiguous words). */
const TITLE_TOKENS: Array<{ re: RegExp; cluster: CulturalClusterId }> = [
  { re: /\b(hindi|punjabi|bollywood|bhangra|desi|tamil|telugu)\b/i, cluster: "indic" },
  // Romanized Hindi/Urdu PHRASES (bigrams — near-zero false positives) that
  // slip through with fake genre tags ("Achi Lagti Ho" tagged "classic rock").
  { re: /\b(achi lagti|dil ki|meri jaan|kya baat|tum se|tumse milne|pyar ki|pyaar ki|ishq ki|ishq mohabbat|sun raha|channa|zindagi|mohabbat|gaana)\b/i, cluster: "indic" },
  { re: /\b(kpop|k-pop|korean|kdrama|aespa|stray kids|bts)\b/i, cluster: "korean" },
  { re: /\b(jpop|j-pop|anime|op\/ed|opening theme)\b/i, cluster: "japanese" },
  { re: /\b(arabic|arabesk)\b/i, cluster: "arabic" },
  { re: /\b(reggaeton|perreo|bachata)\b/i, cluster: "latin_music" },
];

/**
 * Detect the cultural cluster of a track from its text (title + artist)
 * and genre tag. Returns null when nothing distinctive is found.
 */
export function detectCulturalCluster(
  title: string | undefined | null,
  artist: string | undefined | null,
  genre?: string | undefined | null,
): CulturalClusterId | null {
  const text = `${title || ""} ${artist || ""}`;
  // 1. Script signal — first distinctive non-Latin/non-Cyrillic range wins;
  //    latin/cyrillic only apply when no other script is present.
  let scriptCluster: CulturalClusterId | null = null;
  for (const { re, cluster } of SCRIPT_RANGES) {
    if (re.test(text)) {
      scriptCluster = cluster;
      break;
    }
  }
  // 2. Genre tokens (genre first — uploader-declared, most reliable token).
  const genreLower = (genre || "").toLowerCase();
  for (const { re, cluster } of GENRE_TOKENS) {
    if (genreLower && re.test(genreLower)) return cluster;
  }
  // 3. A distinctive script beats title tokens; title tokens beat latin/cyr.
  if (scriptCluster && scriptCluster !== "latin" && scriptCluster !== "cyrillic") {
    return scriptCluster;
  }
  for (const { re, cluster } of TITLE_TOKENS) {
    if (re.test(text)) return cluster;
  }
  return scriptCluster; // "latin" | "cyrillic" | null
}

/** Convenience: cluster of a WaveTrackMinimal-shaped object. */
export function trackCluster(track: {
  title?: string;
  artist?: string;
  genre?: string;
}): CulturalClusterId | null {
  return detectCulturalCluster(track.title, track.artist, track.genre);
}

/**
 * Count cluster occurrences across a corpus of texts (likes × likeWeight).
 * Used to build the personalized `profile.clusters` affinity map —
 * the "does THIS user actually listen to this culture" answer.
 */
export function countClusterAffinity(
  texts: Array<string | undefined | null>,
  likeWeight = 2,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const raw of texts) {
    if (!raw) continue;
    const text = String(raw).slice(0, 160);
    // Detect from raw text alone (no genre) — script + title tokens.
    let cluster: CulturalClusterId | null = null;
    for (const { re, cluster: c } of SCRIPT_RANGES) {
      if (re.test(text)) { cluster = c; break; }
    }
    if (!cluster || cluster === "latin" || cluster === "cyrillic") {
      for (const { re, cluster: c } of TITLE_TOKENS) {
        if (re.test(text)) { cluster = c; break; }
      }
    }
    if (!cluster) continue;
    counts[cluster] = (counts[cluster] || 0) + likeWeight;
  }
  return counts;
}

/**
 * The clusters every Wave user is assumed to be fine with unless their own
 * history says otherwise — the app's base cultural space. These are never
 * "foreign" for anyone, so they can't trigger the hard mismatch block.
 */
export const DEFAULT_CULTURAL_SPACE: ReadonlySet<string> = new Set(["latin", "cyrillic"]);
