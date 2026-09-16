#!/usr/bin/env bash
# Repo hygiene before pushing local main to origin (2.3.3-RC acceptance):
#  1. untrack sandbox tool-results/ + gitignore it
#  2. restore the 76 skills/ppt files lost in the sandbox re-sync (from origin/main)
#  3. normalize file modes to origin/main values (kills the 644->755 re-sync noise)
#     new (HEAD-only) files: scripts/* executable convention, everything else 644
#  4. print a post-cleanup verification summary
set -euo pipefail
cd /home/z/my-project

echo "== 1. untrack tool-results/ =="
git rm -r -q --cached tool-results/ 2>/dev/null || true
if ! grep -q "^tool-results/" .gitignore; then
  printf '\n# Sandbox internal artifacts (never publish)\ntool-results/\n' >> .gitignore
  echo "gitignore: added tool-results/"
else
  echo "gitignore: already covers tool-results/"
fi

echo "== 2. restore re-sync-lost skills from origin/main =="
git checkout origin/main -- skills/
git status --short -- skills/ | head -5
echo "restored: $(git status --short -- skills/ | wc -l) paths"

echo "== 3. normalize modes to origin/main =="
git ls-tree -r origin/main -z |
while IFS=$'\t' read -r -d '' meta path; do
  mode="${meta%% *}"
  [ -f "$path" ] && chmod "${mode:3}" "$path" || true
done
echo "origin-mode files done"

# HEAD-only files: apply repo conventions
git ls-files -z |
while IFS= read -r -d '' f; do
  if ! git cat-file -e "origin/main:$f" 2>/dev/null; then
    case "$f" in
      scripts/*.sh|scripts/*.py|scripts/*.js|scripts/*.mjs) chmod 755 "$f" || true ;;
      *) chmod 644 "$f" || true ;;
    esac
  fi
done
echo "new-file conventions done"

echo "== 4. verification =="
echo "-- worktree status (expect only staged restorations/untracks):"
git status --short | head -20
echo "-- staged/unstaged counts:"
echo "staged: $(git diff --cached --name-only | wc -l), unstaged: $(git diff --name-only | wc -l)"
echo "-- delta vs origin after cleanup (summary):"
git diff origin/main..HEAD --name-status | awk '{print $1}' | sort | uniq -c || true
echo "-- remaining mode-only noise vs origin (expect 0):"
git diff --summary origin/main..HEAD | grep -c "mode change" || true
