/**
 * Normalize a string for lyrics search.
 * Removes common noise from track titles and artist names.
 *
 * @example
 * normalizeQuery("Song (feat. Someone) [Official Video]") → "song"
 * normalizeQuery("Artist1, Artist2") → "artist1"
 */
export function normalizeQuery(s: string): string {
  return s
    // Remove (feat. ...), [feat. ...], (ft. ...), (featuring ...)
    .replace(/\s*[\(\[]\s*(feat|ft|featuring)\.?\s+[^)\]]+[\)\]]/gi, "")
    // Remove (official video/audio/lyrics), [HD], (4K), etc.
    .replace(/\s*[\(\[]\s*(official\s+(music\s+)?video|official\s+audio|official\s+lyrics?|lyrics?|audio|music\s+video|visualizer|hd|hq|4k|explicit|clean|bonus|deluxe|extended|radio\s+edit|club\s+mix|dirty|clean\s+version)\w*\s*[\)\]]/gi, "")
    // Remove (remix/mix/edit/slowed/sped up/nightcore/reverb/bass boosted)
    .replace(/\s*[\(\[]\s*(remix|mix|edit|remaster\w*|slowed|sped\s+up|nightcore|reverb|bass\s+boosted)\w*\s*[\)\]]/gi, "")
    // Remove " - Remix" / " - Slowed" / " - Live" suffixes
    .replace(/\s*-\s*(remix|mix|edit|remaster\w*|radio\s+edit|club\s+mix|instrumental|acoustic|live|cover|bootleg|slowed|sped\s+up|nightcore|reverb|bass\s+boosted|single|deluxe)\b.*$/i, "")
    // Remove " - Topic" suffix (YouTube Music auto-generated)
    .replace(/\s*-\s*topic\s*$/i, "")
    // Remove "Official" prefix
    .replace(/^official\s+/i, "")
    // Take only first artist (before comma, " & ", " feat ")
    .split(/[,，]|\s+[&＆]\s+|\s+(?:feat|ft|featuring)\.?\s+/i)[0]
    // Collapse whitespace
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Extract first artist from a multi-artist string.
 * "Artist1, Artist2" → "Artist1"
 * "Artist1 & Artist2" → "Artist1"
 * "Artist1 feat. Artist2" → "Artist1"
 */
export function firstArtist(s: string): string {
  return s
    .split(/[,，]|\s+[&＆]\s+|\s+(?:feat|ft|featuring)\.?\s+/i)[0]
    .trim();
}
