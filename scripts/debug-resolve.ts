/**
 * Debug script: trace the resolver scoring for a catalog track.
 * Usage: npx tsx scripts/debug-resolve.ts "Title" "Artist" [durationSec]
 */
import { searchSCTracks, searchAudiusTracks } from "../src/lib/soundcloud";
import { searchAudiusTracks as audiusSearch } from "../src/lib/audius";
import { scoreCandidate, type CatalogTrack, type PlaybackCandidate } from "../src/lib/playback/resolver";

async function main() {
  const [title, artist, durArg] = process.argv.slice(2);
  if (!title || !artist) {
    console.error("Usage: tsx scripts/debug-resolve.ts <title> <artist> [durationSec]");
    process.exit(1);
  }
  const catalog: CatalogTrack = {
    catalogId: "debug",
    title,
    artist,
    durationSec: durArg ? Number(durArg) : 0,
  };
  const query = `${artist} ${title}`.trim();
  const [sc, au] = await Promise.all([
    searchSCTracks(query, 12).catch(() => []),
    audiusSearch(query, 6).catch(() => []),
  ]);
  console.log(`SC results: ${sc.length} | Audius results: ${au.length}\n`);

  const candidates: PlaybackCandidate[] = [
    ...sc.map((t) => ({
      provider: "soundcloud" as const,
      sourceId: String(t.scTrackId),
      title: t.title,
      artist: t.artist,
      durationSec: t.duration,
      isPreview: t.scStreamPolicy === "SNIP",
      popularity: t.playbackCount || 0,
    })),
    ...au.map((t) => ({
      provider: "audius" as const,
      sourceId: t.id.replace(/^audius_/, ""),
      title: t.title,
      artist: t.artist,
      durationSec: t.duration,
      isPreview: false,
    })),
  ];

  const scored = candidates.map((c) => scoreCandidate(catalog, c)).sort((a, b) => b.score - a.score);
  for (const s of scored.slice(0, 8)) {
    const b = s.breakdown;
    console.log(
      `conf=${s.confidence.toFixed(2)} score=${String(s.score).padStart(4)} | ${s.provider.padEnd(10)} ` +
      `isrc=${b.isrc} title=${b.title} artist=${b.artist} dur=${b.duration} verB=${b.versionBonus} verP=${b.versionPenalty} ` +
      `| ${s.title.slice(0, 42).padEnd(44)} | ${s.artist.slice(0, 24)} | ver=${s.version} full=${s.isFullLength}`
    );
  }
}

main();
