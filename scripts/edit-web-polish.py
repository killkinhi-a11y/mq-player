#!/usr/bin/env python3
"""Batch 2 of web polish: token sweeps + component-specific cohesion fixes.
Every edit asserts its anchor so failures are loud, not silent."""
ROOT = "/home/z/my-project/src/components/mq/"


def edit(path, pairs):
    p = ROOT + path
    s = open(p).read()
    for i, (old, new) in enumerate(pairs, 1):
        assert old in s, f"{path} edit {i}: anchor NOT FOUND:\n{old[:120]}"
        s = s.replace(old, new, 1)
    open(p, "w").write(s)
    print(f"  {path}: {len(pairs)} edits")


# ── ArtistDetailView: hero button unification + tokens ──
edit("ArtistDetailView.tsx", [
    # play button: drop the only scale-hover in the app -> brightness hover
    ('className="flex items-center gap-2 h-12 px-7 rounded-full mq-t-section font-bold transition-all hover:scale-[1.02]"',
     'className="flex items-center gap-2 h-12 px-7 rounded-full mq-t-section font-bold transition-[filter,opacity] duration-150 hover:brightness-110"'),
    ('style={{ background: "var(--mq-accent)", color: "#fff", opacity: popular.length ? 1 : 0.4, boxShadow: "0 8px 28px color-mix(in srgb, var(--mq-accent) 34%, transparent)" }}',
     'style={{ background: "var(--mq-accent)", color: "var(--mq-text-on-accent, #fff)", opacity: popular.length ? 1 : 0.4, boxShadow: "var(--mq-shadow-accent)" }}'),
    # avatar shadow -> dramatic token (same shape: 24px 60px vs token 24px 64px)
    ('style={{ width: 288, height: 288, borderRadius: 22, boxShadow: "0 24px 60px rgba(0,0,0,0.55)" }}',
     'style={{ width: 288, height: 288, borderRadius: 22, boxShadow: "var(--mq-shadow-dramatic)" }}'),
    # track art 8px -> artwork token 10px (rest of app)
    ('borderRadius: 8,', 'borderRadius: "var(--mq-r-art)",'),
    # duplicate icon size classes
    ('className="w-4.5 h-4.5 w-[18px] h-[18px]"', 'className="w-[18px] h-[18px]"'),
    # secondary glass chips -> glass tokens (3 buttons: shuffle/fav/share)
    ('style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.16)", opacity: popular.length ? 1 : 0.4 }}',
     'style={{ background: "var(--mq-glass-bg)", border: "1px solid var(--mq-glass-border)", opacity: popular.length ? 1 : 0.4 }}'),
    ('className="h-12 w-12 rounded-full flex items-center justify-center transition-colors hover:bg-[rgba(255,255,255,0.14)]"\n                style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.16)" }}',
     'className="h-12 w-12 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--mq-glass-hover)]"\n                style={{ background: "var(--mq-glass-bg)", border: "1px solid var(--mq-glass-border)" }}'),
    ('style={{ background: isFav ? "color-mix(in srgb, var(--mq-accent) 22%, transparent)" : "rgba(255,255,255,0.08)", border: `1px solid ${isFav ? "color-mix(in srgb, var(--mq-accent) 40%, transparent)" : "rgba(255,255,255,0.16)"}` }}',
     'style={{ background: isFav ? "color-mix(in srgb, var(--mq-accent) 22%, transparent)" : "var(--mq-glass-bg)", border: `1px solid ${isFav ? "color-mix(in srgb, var(--mq-accent) 40%, transparent)" : "var(--mq-glass-border)"}` }}'),
])

# ── MessengerView: context menu cohesion (error token, taller rows, menu radius) ──
edit("MessengerView.tsx", [
    ('className="fixed z-50 min-w-[160px] rounded-xl overflow-hidden py-1"',
     'className="fixed z-50 min-w-[180px] rounded-[var(--mq-r-card)] overflow-hidden py-1"'),
    ('style={{ color: "#ef4444" }}', 'style={{ color: "var(--mq-error)" }}'),
])
# all four menu buttons get taller rows: px-3 py-2 -> px-3 py-2.5
s = open(ROOT + "MessengerView.tsx").read()
n = s.count('className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-[var(--mq-overlay-hover)]"')
s = s.replace('className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-[var(--mq-overlay-hover)]"',
              'className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-[var(--mq-overlay-hover)]"')
open(ROOT + "MessengerView.tsx", "w").write(s)
print(f"  MessengerView menu rows: {n} -> 40px")

# ── hover:bg-white/5 sweep (invisible on light theme) ──
for path in ["PlaylistView.tsx", "ProfileView.tsx", "NotificationPanel.tsx", "OnboardingTour.tsx"]:
    p = ROOT + path
    s = open(p).read()
    n = s.count("hover:bg-white/5")
    if n:
        s = s.replace("hover:bg-white/5", "hover:bg-[var(--mq-overlay-hover)]")
        open(p, "w").write(s)
    print(f"  {path}: {n} white/5 hovers tokenized")

# ── ShareSheet + EqualizerView sheet radius 24 -> 20 (unify with QueueView) ──
for path in ["ShareSheet.tsx", "EqualizerView.tsx"]:
    p = ROOT + path
    s = open(p).read()
    n = s.count("rounded-3xl")
    s = s.replace("rounded-3xl", "rounded-[20px]")
    open(p, "w").write(s)
    print(f"  {path}: {n} sheet radii 24->20")

# ── MainView: RecsSkeleton radius 24 -> 16 (match the real cards) ──
p = ROOT + "MainView.tsx"
s = open(p).read()
n = 0
if '<div className="h-4 w-2/3 rounded-3xl' in s or "rounded-3xl" in s:
    # only the skeleton instances (real cards keep rounded-2xl)
    import re
    s2, n = re.subn(r'(RecsSkeleton[\s\S]*?)rounded-3xl', r'\1rounded-2xl', s, count=8)
    if n:
        s = s2
        open(p, "w").write(s)
print(f"  MainView RecsSkeleton radii: {n} normalized")

# ── NavBar: badge text token + header radius token ──
edit("NavBar.tsx", [
    ('color: "white"', 'color: "var(--mq-text-on-accent)"'),
    ('color: "white"', 'color: "var(--mq-text-on-accent)"'),
    ('color: "white"', 'color: "var(--mq-text-on-accent)"'),
    ('borderRadius: 14,', 'borderRadius: "var(--mq-r-card-lg)",'),
])

# ── MobileDock: 99 -> 99+ overflow format + stroke parity with NavBar ──
p = ROOT + "MobileDock.tsx"
s = open(p).read()
if "99+" not in s:
    s = s.replace("{count > 99 ? \"99\" : count}", "{count > 99 ? \"99+\" : count}")
    s = s.replace("{unread > 99 ? \"99\" : unread}", "{unread > 99 ? \"99+\" : unread}")
s = s.replace("strokeWidth={active ? 2.3 : 1.7}", "strokeWidth={active ? 2.2 : 1.8}")
open(p, "w").write(s)
print("  MobileDock: badge 99+ / stroke parity")

# ── LibraryView: view title -> mq-t-page token ──
p = ROOT + "LibraryView.tsx"
s = open(p).read()
old_t = 'className="text-2xl font-bold tracking-tight"'
if old_t in s:
    s = s.replace(old_t, 'className="mq-t-page"', 1)
    open(p, "w").write(s)
    print("  LibraryView title -> mq-t-page")

# ── SearchView: radii tokens + status colors + focus border ──
edit("SearchView.tsx", [
    ('borderRadius: 14,', 'borderRadius: "var(--mq-r-card-lg)",'),
    ('className="flex items-center gap-2 px-3.5 py-2.5 rounded-[14px]', 'className="flex items-center gap-2 px-3.5 py-2.5 rounded-[var(--mq-r-card-lg)]'),
    ('style={{ color: "#4ade80" }}', 'style={{ color: "var(--mq-success)" }}'),
    ('style={{ color: "#fb923c" }}', 'style={{ color: "var(--mq-warning)" }}'),
])
s = open(ROOT + "SearchView.tsx").read()
n = s.count("#4ade80")
s = s.replace('"#4ade80"', '"var(--mq-success)"')
open(ROOT + "SearchView.tsx", "w").write(s)
print(f"  SearchView: extra #4ade80 swept: {n}")

# ── TrackCard: entrance ease -> premium; color tokens ──
edit("TrackCard.tsx", [
    ("ease: [0.25, 0.1, 0.25, 1]", "ease: [0.16, 1, 0.3, 1]"),
    ('style={{ color: "#fff" }}', 'style={{ color: "var(--mq-text-on-accent, #fff)" }}'),
    ('style={{ color: "#ef4444" }}', 'style={{ color: "var(--mq-like-color)" }}'),
])
s = open(ROOT + "TrackCard.tsx").read()
n = s.count('"#ef4444"')
s = s.replace('"#ef4444"', '"var(--mq-like-color)"')
open(ROOT + "TrackCard.tsx", "w").write(s)
print(f"  TrackCard: extra #ef4444 swept: {n}")

print("BATCH 2 DONE")
