---
Task ID: design-completion-pass
Agent: main (Super Z)
Task: MQ FINAL DESIGN COMPLETION PASS — card system rebuild + Liquid Glass rebuild + living NORMAL background + red rarity + per-tab polish + mobile recomposition (production mq-build-bc4f826a baseline)

Work Log:
- Read user reference images (VLM): desktop = premium Discover/Artist concept (huge editorial
  typography, hero imagery, dark solid action bar, clean tracklist, floating pill player);
  small = red volume slider complaint (already fixed in bc4f826a — verified code + prod).
- BEFORE capture from production (scripts/design-completion/01*, 20 shots): desktop home/
  wave/search/library/chats/settings/fullplayer/queue/contextmenu/artist/playlists +
  mobile home/home-full/wave/search/artist/library/chats/settings/profile/fullplayer.
  Fixed capture bugs: [data-mq-dock] attr no longer exists in code (use :visible aria
  selectors); demo session clears on every reload (in-app navigation only); mobile full
  player opens via "Открыть плеер" hero button, NOT .mq-mini (that class is also on like
  button); desktop playlist detail via library → Плейлисты tab → .group.rounded-2xl tile.
- VLM brutal audit (scripts/design-completion/02-vlm-audit.sh, 17 screens read):
  scores 3–5.5/10. MASTER HIT LIST:
  A. RED ACCENT = DEFAULT EVERYWHERE (worst offender): search focus border (thick red stroke
     "CSS error look"), primary CTAs (Искать музыку / Найти друзей / Слушать всё), library
     tab counts + active tab, likes/dislikes segmented control, queue Текущий трек red bg
     chip, red progress bar, Закреплён pill, rename save btn, red M placeholder artwork.
  B. BACKGROUND READS FLAT BLACK on home/search/artist/chats/settings/mobile (ambient too
     subtle to register visually); WAVE reads "flat muddy gradient" in stills.
  C. BOX-IN-BOX: wave artwork glass bezel = "double border beginner mistake"; chats 4-level
     nesting (bg→container→sidebar→player, rounded-3xl 24px); library empty state has
     search input INSIDE container; settings card-inside-card; home hero mini-player-in-card;
     mobile nav heavy top highlight.
  D. CARDS: same-card-x20 uniformity (identical rows/surfaces), no sm/md/feature/hero
     hierarchy; tracklist rows "monotonous wall"; chats 24px radius; empty states look
     like placeholder mockups.
  E. CONTROLS: FullTrackView play button "gradient-filled circle 2012 gloss"; PlayerBar
     capsule "cheap heavy glassmorphism"; secondary circles "placeholder look".
  F. TYPOGRAPHY: muddy hierarchy — section headers (ТРЕКИ/АРТИСТЫ) too small/light, header
     vs track title weights too similar.
  G. DENSITY: dead zones (home featured right side, chats center, wave padding), oversized
     artist search bar, full player raw keyboard-shortcut footer "debug menu".

Stage Summary:
- BEFORE evidence complete: download/qa-design-completion/before/ (20 shots) +
  before-vlm-summary.md (full audits). Production baseline = mq-build-bc4f826a.
- Next: code audit of materials/tokens/components, then implement card system, glass
  rebuild, living ambient, red rarity, per-tab + mobile recomposition.
