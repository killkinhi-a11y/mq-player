/**
 * LIVE smoke: FullLengthSourceResolver against real SoundCloud + Audius.
 * Run: npx tsx scripts/free-mode-research/live-resolve-check.mts
 */
import { resolvePlaybackSources, candidateToTrack } from "../../src/lib/freeMode/resolver";

const cases = [
  { title: "Goosebumps", artist: "Travis Scott", durationSec: 226, catalogProvider: "spotify" as const },
  { title: "Blinding Lights", artist: "The Weeknd", durationSec: 200, catalogProvider: "spotify" as const },
  { title: "Между нами тает лёд", artist: "Грибы", durationSec: 190, catalogProvider: "deezer" as const },
  { title: "Never Gonna Give You Up", artist: "Rick Astley", durationSec: 213, catalogProvider: "deezer" as const },
];

for (const c of cases) {
  const t0 = Date.now();
  const res = await resolvePlaybackSources(c, { noCache: true });
  const ms = Date.now() - t0;
  console.log(`\n=== ${c.artist} — ${c.title} (${ms}ms) ===`);
  console.log(`  best: ${res.best ? `${res.best.playbackProvider}:${res.best.playbackId} conf=${res.best.confidence.toFixed(2)} dur=${res.best.duration}s` : "NONE"}`);
  console.log(`  needsChoice=${res.needsChoice} candidates=${res.candidates.length}`);
  for (const cand of res.candidates.slice(0, 4)) {
    console.log(`   - [${cand.playbackProvider}] "${cand.title}" / ${cand.artist} | ${cand.durationSec}s | score=${cand.score} | full=${cand.isFullLength}${cand.rejectionReason ? " REJECT:" + cand.rejectionReason : ""} | policy=${cand.streamPolicy || "-"}`);
  }
  if (res.best) {
    const bestCand = res.candidates.find((x) => x.playbackId === res.best!.playbackId)!;
    const track = candidateToTrack(c, bestCand);
    console.log(`  → Track: source=${track.source} scTrackId=${track.scTrackId} catalog=${track.catalogProvider} playback=${track.playbackProvider} conf=${track.matchConfidence?.toFixed(2)}`);
  }
}
process.exit(0);
