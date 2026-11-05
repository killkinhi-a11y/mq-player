// Extracted from SearchView.tsx (Stage III decomposition) — moved verbatim.

// ── V4.1 name matching for the Top Result hero (normalized, no diacritics/
//    punctuation noise; real strings only — never invents matches).
//    Strength ladder, all at word boundaries:
//      1. equality                     — "random access memories" = album
//      2. entity name starts with q    — "random acce…" still finds it
//      3. q starts with a LONG name    — "the dark side of the moon…" → album
//         (≥12 chars: a short "Faded" must NOT capture "faded alan walker")
//      4. q contains the name as words — ARTIST signal only:
//        "faded alan walker" → artist "Alan Walker" (albums never match
//        by containment — "Faded" must not capture the query) ──
export function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[\p{P}\p{S}]+/gu, " ").replace(/\s+/g, " ").trim();
}

export function nameMatchesQuery(name: string, normalizedQuery: string, allowContainment: boolean): boolean {
  const n = normalizeName(name);
  if (!n || n.length < 2) return false;
  if (n === normalizedQuery) return true;
  if (n.startsWith(normalizedQuery)) return true;
  if (normalizedQuery.startsWith(n) && n.length >= 12) return true;
  // Word containment is an ARTIST signal only ("faded alan walker" → the
  // artist Alan Walker). An album named "Faded" must NOT capture that
  // query — a track/artist query with a famous single stays track/artist.
  if (allowContainment) {
    const padded = ` ${normalizedQuery} `;
    return padded.includes(` ${n} `);
  }
  return false;
}
