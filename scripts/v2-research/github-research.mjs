#!/usr/bin/env node
/**
 * MQ V2 — DEEP RESEARCH: GitHub projects that provide FULL Spotify track playback.
 *
 * Collects for each target repo:
 *   - metadata (stars, language, pushed_at, license, archived, description)
 *   - recent commits (last activity)
 *   - languages breakdown
 *   - README (truncated)
 *   - top-level file tree (to understand architecture)
 *
 * Saves everything to download/v2-research/<slug>.json
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = "/home/z/my-project/download/v2-research";
fs.mkdirSync(OUT_DIR, { recursive: true });

const TOKEN = execSync(
  "cd /home/z/my-project && git config --get remote.origin.url | sed -n 's|https://[^:]*:\\([^@]*\\)@.*|\\1|p'",
).toString().trim();

const HEADERS = {
  Authorization: `token ${TOKEN}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "mq-research",
};

const TARGETS = [
  { owner: "Kopuz-org", repo: "kopuz", slug: "kopuz" },
  { owner: "id-fant", repo: "apple-music-liquidglass", slug: "lumen-apple-music-liquidglass" },
  { owner: "YANIV3487", repo: "spotiamp", slug: "spotiamp" },
  { owner: "fdeox", repo: "spotiamp-plus", slug: "spotiamp-plus" },
  { owner: "spotify", repo: "spotify-web-playback-sdk-example", slug: "spotify-web-playback-sdk-example" },
  { owner: "librespot-org", repo: "librespot", slug: "librespot" },
  { owner: "aome510", repo: "spotify-player", slug: "spotify-player" },
  { owner: "devgianlu", repo: "go-librespot", slug: "go-librespot" },
];

async function gh(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
      if (res.status === 404) return { __404: true };
      if (res.status === 403) {
        await new Promise((r) => setTimeout(r, 5000 * attempt));
        continue;
      }
      if (!res.ok) return { __error: res.status };
      return await res.json();
    } catch (e) {
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  return { __error: "failed" };
}

async function fetchRaw(owner, repo, branch, file) {
  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${file}`,
      { signal: AbortSignal.timeout(15000) },
    );
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function pickReadmeBranch(meta) {
  if (meta?.default_branch) return meta.default_branch;
  return "main";
}

async function research(target) {
  const { owner, repo, slug } = target;
  console.log(`\n=== ${owner}/${repo} ===`);

  const meta = await gh(`https://api.github.com/repos/${owner}/${repo}`);
  if (meta.__404 || meta.__error) {
    console.log(`  !! metadata failed: ${JSON.stringify(meta)}`);
    fs.writeFileSync(path.join(OUT_DIR, `${slug}.json`), JSON.stringify({ target, meta }, null, 2));
    return;
  }

  const [commits, langs, readme] = await Promise.all([
    gh(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=3`),
    gh(`https://api.github.com/repos/${owner}/${repo}/languages`),
    fetchRaw(owner, repo, pickReadmeBranch(meta), "README.md") ||
      fetchRaw(owner, repo, pickReadmeBranch(meta), "readme.md"),
  ]);

  const branch = pickReadmeBranch(meta);
  const tree = await gh(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}`,
  );

  const summary = {
    target,
    name: meta.full_name,
    description: meta.description,
    stars: meta.stargazers_count,
    forks: meta.forks_count,
    openIssues: meta.open_issues_count,
    language: meta.language,
    topics: meta.topics,
    license: meta.license?.spdx_id || null,
    archived: meta.archived,
    disabled: meta.disabled,
    createdAt: meta.created_at,
    pushedAt: meta.pushed_at,
    defaultBranch: branch,
    homepage: meta.homepage,
    size: meta.size,
    languages: langs,
    recentCommits: Array.isArray(commits)
      ? commits.map((c) => ({
          sha: c.sha?.slice(0, 8),
          date: c.commit?.committer?.date,
          message: c.commit?.message?.split("\n")[0]?.slice(0, 100),
          author: c.commit?.author?.name,
        }))
      : null,
    topLevelTree: Array.isArray(tree?.tree)
      ? tree.tree.filter((t) => t.type === "tree" || t.type === "blob").map((t) => `${t.type === "tree" ? "d" : "f"} ${t.path}`)
      : null,
    readme: readme ? readme.slice(0, 12000) : null,
  };

  fs.writeFileSync(path.join(OUT_DIR, `${slug}.json`), JSON.stringify(summary, null, 2));
  console.log(
    `  stars=${summary.stars} lang=${summary.language} pushed=${summary.pushedAt} archived=${summary.archived} license=${summary.license}`,
  );
  console.log(`  last commit: ${summary.recentCommits?.[0]?.date} — ${summary.recentCommits?.[0]?.message}`);
}

const SEARCHES = [
  { q: "spotify+web+playback+sdk+player", label: "search-wps" },
  { q: "spotify+premium+web+player+next", label: "search-premium-web" },
  { q: "spotify+connect+web+client", label: "search-connect" },
  { q: "spotify+full+track+playback+web", label: "search-full" },
];

async function searchRepos() {
  const results = {};
  for (const s of SEARCHES) {
    const data = await gh(
      `https://api.github.com/search/repositories?q=${s.q}&sort=updated&order=desc&per_page=15`,
    );
    if (data?.items) {
      results[s.label] = data.items.map((r) => ({
        full_name: r.full_name,
        description: r.description,
        stars: r.stargazers_count,
        language: r.language,
        pushedAt: r.pushed_at,
        archived: r.archived,
      }));
      console.log(`search ${s.label}: ${data.items.length} results`);
    } else {
      results[s.label] = data;
      console.log(`search ${s.label}: FAILED ${JSON.stringify(data).slice(0, 100)}`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  fs.writeFileSync(path.join(OUT_DIR, "_search.json"), JSON.stringify(results, null, 2));
}

(async () => {
  for (const t of TARGETS) {
    await research(t);
  }
  await searchRepos();
  console.log("\nDONE — results in", OUT_DIR);
})();
