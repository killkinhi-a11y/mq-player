/**
 * Track version detection — pure functions, zero network.
 *
 * The PlaybackResolver uses this to penalize SoundCloud/Audius candidates
 * that are alternate VERSIONS of the catalog track (live / remix / karaoke /
 * slowed + reverb / sped up / cover / instrumental / …). A catalog track
 * "Goosebumps" (3:46) must never resolve to "Goosebumps - LIVE" (8:41).
 *
 * Detection is intentionally conservative: a tag is only reported when its
 * marker appears as a clearly delimited token (parentheses, brackets,
 * hyphen-separated suffix, standalone word) — not as a substring of an
 * ordinary word ("Edit" inside "Edition" must not fire "edit").
 */

export type TrackVersion =
  | "original"
  | "remaster"
  | "live"
  | "acoustic"
  | "radio_edit"
  | "extended"
  | "instrumental"
  | "remix"
  | "slowed"
  | "reverb"
  | "sped_up"
  | "karaoke"
  | "cover"
  | "ai_cover"
  | "reaction"
  | "edit";

export interface VersionInfo {
  /** Detected version; "original" when no alternate-version markers found. */
  version: TrackVersion;
  /** True when any non-original version was detected. */
  isAlternate: boolean;
  /** All markers matched (lowercased, in detection order). */
  markers: string[];
}

/** Marker → version mapping. Ordered: first match wins per group. */
const MARKERS: ReadonlyArray<{ version: TrackVersion; patterns: RegExp[] }> = [
  {
    version: "karaoke",
    patterns: [/\bkaraoke\b/i, /\bkareoke\b/i, /\binstrumental karaoke\b/i, /\bno vocals\b/i, /\bsingalong\b/i],
  },
  {
    // V3 §5: AI-generated covers are a hard reject (-100) — synthetic voices
    // masquerading as the artist. Markers cover the common spellings.
    version: "ai_cover",
    patterns: [/\bai (cover|song|version|vocals|singing)\b/i, /\bcover ai\b/i, /\bsuno\b/i, /\budio\b/i, /\bripper x\b/i, /\b_AI\b/],
  },
  {
    // V3 §5: reaction videos / commentary — never the music alone (-100).
    version: "reaction",
    patterns: [/\breaction\b/i, /\breacts?\b/i, /\bfirst time hearing\b/i, /\blistening to\b.*\bfirst\b/i],
  },
  {
    version: "live",
    patterns: [/\blive\b/i, /\bin concert\b/i, /\btour edition\b/i, /\bconcert version\b/i],
  },
  {
    version: "remix",
    patterns: [/\bremix(es)?\b/i, /\bre-?mix(ed)?\b/i, /\bflip\b/i, /\bmashup\b/i, /\bbootleg\b/i, /\bvip mix\b/i],
  },
  {
    version: "slowed",
    patterns: [/\bslowed\b/i, /\bslow version\b/i, /\bhalfspeed\b/i, /\bhalf speed\b/i],
  },
  {
    version: "reverb",
    patterns: [/\breverb(ed)?\b/i, /\becho version\b/i],
  },
  {
    version: "sped_up",
    patterns: [/\bsped up\b/i, /\bspeed ?up\b/i, /\bfast version\b/i, /\bspedup\b/i, /\bnightcore\b/i],
  },
  {
    version: "acoustic",
    patterns: [/\bacoustic\b/i, /\bunplugged\b/i, /\bstripped( version)?\b/i],
  },
  {
    version: "instrumental",
    patterns: [/\binstrumental\b/i, /\binst\.?\b/i, /\bbacking track\b/i, /\bminus one\b/i, /\bplayback version\b/i],
  },
  {
    version: "cover",
    patterns: [/\bcover( version)?\b/i, /\bcovered by\b/i, /\btribute\b/i, /\bremake\b/i, /\bredone by\b/i],
  },
  {
    version: "radio_edit",
    patterns: [/\bradio edit\b/i, /\bradio version\b/i, /\bradio cut\b/i, /\bclean version\b/i, /\bclean edit\b/i],
  },
  {
    version: "remaster",
    patterns: [/\bre-?master(ed)?\b/i, /\bremasterization\b/i, /\banniversary edition\b/i, /\bdeluxe( edition)?\b/i],
  },
  {
    version: "extended",
    patterns: [/\bextended( mix| version| edit)?\b/i, /\b12["” ]?(inch|version|mix)\b/i, /\blong version\b/i, /\bfull version\b/i],
  },
  {
    version: "edit",
    patterns: [/\bedit\b/i, /\bcut\b/i, /\bshort version\b/i],
  },
];

/**
 * Detect the version of a track from its title.
 * Album name is also scanned — SoundCloud uploaders often put
 * "(Live at …)" only in the album/description field.
 */
export function detectVersion(title: string, album?: string): VersionInfo {
  const haystack = `${title || ""} ${album || ""}`;
  const markers: string[] = [];
  const found = new Set<TrackVersion>();

  for (const { version, patterns } of MARKERS) {
    for (const re of patterns) {
      const m = haystack.match(re);
      if (m) {
        found.add(version);
        markers.push(m[0].toLowerCase());
        break; // one marker per version group is enough
      }
    }
  }

  if (found.size === 0) {
    return { version: "original", isAlternate: false, markers: [] };
  }

  // Priority when multiple tags present: the most "different from original"
  // wins, because that is what the resolver must penalize hardest.
  // e.g. "Slowed + Reverb" → slowed (also matches reverb — same penalty tier).
  const PRIORITY: TrackVersion[] = [
    "karaoke",
    "ai_cover",
    "reaction",
    "cover",
    "slowed",
    "reverb",
    "sped_up",
    "live",
    "remix",
    "instrumental",
    "acoustic",
    "radio_edit",
    "remaster",
    "extended",
    "edit",
  ];
  let version: TrackVersion = "original";
  for (const v of PRIORITY) {
    if (found.has(v)) {
      version = v;
      break;
    }
  }

  return { version, isAlternate: true, markers };
}

/**
 * Normalize a track title / artist name for exactness matching:
 * lowercase, strip diacritics, punctuation, "(feat. …)", "[…]" bracket
 * qualifiers, ampersand normalization, collapse whitespace.
 *
 * "Goosebumps (feat. Kendrick Lamar)" ≡ "goosebumps"
 * "Travis $cott" ≡ "travis scott"
 */
export function normalizeText(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // diacritics
    .replace(/\(.*?\)|\[.*?\]/g, " ") // bracket qualifiers (feat., remix tags…)
    .replace(/\b(feat|ft|featuring|with|prod|x)\b[.\s]/g, " ")
    .replace(/\$/g, "s") // travis $cott → travis scott
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9а-яё\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Token-set similarity (Jaccard) on normalized words — resistant to
 * "Artist - Title" vs "Title - Artist" reordering and small additions.
 */
export function tokenSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeText(a).split(" ").filter(Boolean));
  const tb = new Set(normalizeText(b).split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.max(ta.size, tb.size);
}

/** True when both titles normalize to the same string. */
export function exactTitle(a: string, b: string): boolean {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return false;
  return na === nb;
}
