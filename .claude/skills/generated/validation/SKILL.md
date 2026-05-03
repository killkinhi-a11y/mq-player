---
name: validation
description: "Skill for the Validation area of mq-player. 21 symbols across 4 files."
---

# Validation

21 symbols | 4 files | Cohesion: 100%

## When to Use

- Working with code in `skills/`
- Understanding how validate, validate_whitespace_preservation, validate_deletions work
- Modifying validation-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `skills/ppt/ooxml/scripts/validation/docx.py` | validate, validate_whitespace_preservation, validate_deletions, count_paragraphs_in_unpacked, count_paragraphs_in_original (+3) |
| `skills/ppt/ooxml/scripts/validation/pptx.py` | validate, validate_uuid_ids, _looks_like_uuid, validate_slide_layout_ids, validate_no_duplicate_slide_layouts (+2) |
| `skills/ppt/ooxml/scripts/validation/redlining.py` | validate, _generate_detailed_diff, _get_git_word_diff, _remove_zai_tracked_changes, _extract_text_content |
| `skills/ppt/ooxml/scripts/validation/base.py` | BaseSchemaValidator |

## Entry Points

Start here when exploring this area:

- **`validate`** (Function) — `skills/ppt/ooxml/scripts/validation/docx.py:23`
- **`validate_whitespace_preservation`** (Function) — `skills/ppt/ooxml/scripts/validation/docx.py:71`
- **`validate_deletions`** (Function) — `skills/ppt/ooxml/scripts/validation/docx.py:123`
- **`count_paragraphs_in_unpacked`** (Function) — `skills/ppt/ooxml/scripts/validation/docx.py:172`
- **`count_paragraphs_in_original`** (Function) — `skills/ppt/ooxml/scripts/validation/docx.py:191`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `PPTXSchemaValidator` | Class | `skills/ppt/ooxml/scripts/validation/pptx.py` | 11 |
| `DOCXSchemaValidator` | Class | `skills/ppt/ooxml/scripts/validation/docx.py` | 13 |
| `BaseSchemaValidator` | Class | `skills/ppt/ooxml/scripts/validation/base.py` | 12 |
| `validate` | Function | `skills/ppt/ooxml/scripts/validation/docx.py` | 23 |
| `validate_whitespace_preservation` | Function | `skills/ppt/ooxml/scripts/validation/docx.py` | 71 |
| `validate_deletions` | Function | `skills/ppt/ooxml/scripts/validation/docx.py` | 123 |
| `count_paragraphs_in_unpacked` | Function | `skills/ppt/ooxml/scripts/validation/docx.py` | 172 |
| `count_paragraphs_in_original` | Function | `skills/ppt/ooxml/scripts/validation/docx.py` | 191 |
| `validate_insertions` | Function | `skills/ppt/ooxml/scripts/validation/docx.py` | 215 |
| `compare_paragraph_counts` | Function | `skills/ppt/ooxml/scripts/validation/docx.py` | 262 |
| `validate` | Function | `skills/ppt/ooxml/scripts/validation/pptx.py` | 29 |
| `validate_uuid_ids` | Function | `skills/ppt/ooxml/scripts/validation/pptx.py` | 78 |
| `validate_slide_layout_ids` | Function | `skills/ppt/ooxml/scripts/validation/pptx.py` | 127 |
| `validate_no_duplicate_slide_layouts` | Function | `skills/ppt/ooxml/scripts/validation/pptx.py` | 200 |
| `validate_notes_slide_references` | Function | `skills/ppt/ooxml/scripts/validation/pptx.py` | 238 |
| `validate` | Function | `skills/ppt/ooxml/scripts/validation/redlining.py` | 21 |
| `_looks_like_uuid` | Function | `skills/ppt/ooxml/scripts/validation/pptx.py` | 120 |
| `_generate_detailed_diff` | Function | `skills/ppt/ooxml/scripts/validation/redlining.py` | 113 |
| `_get_git_word_diff` | Function | `skills/ppt/ooxml/scripts/validation/redlining.py` | 138 |
| `_remove_zai_tracked_changes` | Function | `skills/ppt/ooxml/scripts/validation/redlining.py` | 216 |

## How to Explore

1. `gitnexus_context({name: "validate"})` — see callers and callees
2. `gitnexus_query({query: "validation"})` — find related execution flows
3. Read key files listed above for implementation details
