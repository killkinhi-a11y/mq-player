---
name: templates
description: "Skill for the Templates area of mq-player. 29 symbols across 2 files."
---

# Templates

29 symbols | 2 files | Cohesion: 100%

## When to Use

- Working with code in `skills/`
- Understanding how get_palette, resolve_palette, resolve_palette_with_info work
- Modifying templates-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `skills/xlsx/templates/base.py` | font_header, fill_header, border_header, align_header, style_header_row (+18) |
| `skills/xlsx/templates/palettes.py` | _match_style_keywords, _infer_from_scene, get_palette, resolve_palette, resolve_palette_with_info (+1) |

## Entry Points

Start here when exploring this area:

- **`get_palette`** (Function) — `skills/xlsx/templates/palettes.py:449`
- **`resolve_palette`** (Function) — `skills/xlsx/templates/palettes.py:454`
- **`resolve_palette_with_info`** (Function) — `skills/xlsx/templates/palettes.py:465`
- **`detect_style`** (Function) — `skills/xlsx/templates/palettes.py:471`
- **`font_header`** (Function) — `skills/xlsx/templates/base.py:232`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `get_palette` | Function | `skills/xlsx/templates/palettes.py` | 449 |
| `resolve_palette` | Function | `skills/xlsx/templates/palettes.py` | 454 |
| `resolve_palette_with_info` | Function | `skills/xlsx/templates/palettes.py` | 465 |
| `detect_style` | Function | `skills/xlsx/templates/palettes.py` | 471 |
| `font_header` | Function | `skills/xlsx/templates/base.py` | 232 |
| `fill_header` | Function | `skills/xlsx/templates/base.py` | 330 |
| `border_header` | Function | `skills/xlsx/templates/base.py` | 342 |
| `align_header` | Function | `skills/xlsx/templates/base.py` | 354 |
| `style_header_row` | Function | `skills/xlsx/templates/base.py` | 402 |
| `font_subheader` | Function | `skills/xlsx/templates/base.py` | 236 |
| `fill_total` | Function | `skills/xlsx/templates/base.py` | 333 |
| `border_total` | Function | `skills/xlsx/templates/base.py` | 346 |
| `style_total_row` | Function | `skills/xlsx/templates/base.py` | 423 |
| `use_palette` | Function | `skills/xlsx/templates/base.py` | 117 |
| `use_palette_explicit` | Function | `skills/xlsx/templates/base.py` | 136 |
| `font_title` | Function | `skills/xlsx/templates/base.py` | 228 |
| `align_title` | Function | `skills/xlsx/templates/base.py` | 351 |
| `setup_sheet` | Function | `skills/xlsx/templates/base.py` | 381 |
| `font_body` | Function | `skills/xlsx/templates/base.py` | 240 |
| `fill_data_row` | Function | `skills/xlsx/templates/base.py` | 336 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Resolve_palette → _match_style_keywords` | intra_community | 3 |
| `Resolve_palette → _infer_from_scene` | intra_community | 3 |
| `Resolve_palette_with_info → _match_style_keywords` | intra_community | 3 |
| `Resolve_palette_with_info → _infer_from_scene` | intra_community | 3 |

## How to Explore

1. `gitnexus_context({name: "get_palette"})` — see callers and callees
2. `gitnexus_query({query: "templates"})` — find related execution flows
3. Read key files listed above for implementation details
