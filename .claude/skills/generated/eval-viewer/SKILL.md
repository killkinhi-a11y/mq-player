---
name: eval-viewer
description: "Skill for the Eval-viewer area of mq-player. 10 symbols across 1 files."
---

# Eval-viewer

10 symbols | 1 files | Cohesion: 90%

## When to Use

- Working with code in `skills/`
- Understanding how find_runs, load_previous_iteration, generate_html work
- Modifying eval-viewer-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `skills/skill-creator/eval-viewer/generate_review.py` | find_runs, load_previous_iteration, generate_html, _kill_port, do_GET (+5) |

## Entry Points

Start here when exploring this area:

- **`find_runs`** (Function) — `skills/skill-creator/eval-viewer/generate_review.py:59`
- **`load_previous_iteration`** (Function) — `skills/skill-creator/eval-viewer/generate_review.py:212`
- **`generate_html`** (Function) — `skills/skill-creator/eval-viewer/generate_review.py:249`
- **`do_GET`** (Function) — `skills/skill-creator/eval-viewer/generate_review.py:331`
- **`main`** (Function) — `skills/skill-creator/eval-viewer/generate_review.py:386`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `find_runs` | Function | `skills/skill-creator/eval-viewer/generate_review.py` | 59 |
| `load_previous_iteration` | Function | `skills/skill-creator/eval-viewer/generate_review.py` | 212 |
| `generate_html` | Function | `skills/skill-creator/eval-viewer/generate_review.py` | 249 |
| `do_GET` | Function | `skills/skill-creator/eval-viewer/generate_review.py` | 331 |
| `main` | Function | `skills/skill-creator/eval-viewer/generate_review.py` | 386 |
| `get_mime_type` | Function | `skills/skill-creator/eval-viewer/generate_review.py` | 51 |
| `build_run` | Function | `skills/skill-creator/eval-viewer/generate_review.py` | 84 |
| `embed_file` | Function | `skills/skill-creator/eval-viewer/generate_review.py` | 148 |
| `_kill_port` | Function | `skills/skill-creator/eval-viewer/generate_review.py` | 287 |
| `_find_runs_recursive` | Function | `skills/skill-creator/eval-viewer/generate_review.py` | 67 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Main → Get_mime_type` | cross_community | 7 |
| `Do_GET → Get_mime_type` | cross_community | 6 |

## How to Explore

1. `gitnexus_context({name: "find_runs"})` — see callers and callees
2. `gitnexus_query({query: "eval-viewer"})` — find related execution flows
3. Read key files listed above for implementation details
