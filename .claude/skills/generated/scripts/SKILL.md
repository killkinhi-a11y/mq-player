---
name: scripts
description: "Skill for the Scripts area of mq-player. 247 symbols across 38 files."
---

# Scripts

247 symbols | 38 files | Cohesion: 91%

## When to Use

- Working with code in `skills/`
- Understanding how paper_search_pro, paper_qa_search, paper_list_by_search_venue work
- Modifying scripts-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `skills/aminer-open-academic/scripts/aminer_client.py` | _request, _print, paper_search_pro, paper_qa_search, paper_list_by_search_venue (+34) |
| `skills/ppt/scripts/html2pptx.js` | extractTextContent, getElementLabel, getAdjustedTextPosition, checkElementBounds, checkVerticalBalance (+25) |
| `skills/pdf/scripts/pdf_qa.py` | error, add_info, check_punctuation, check_blank_pages, check_colors (+15) |
| `skills/ppt/scripts/inventory.py` | _is_valid_shape, _collect_shapes, _sort_by_position, _detect_overlaps, extract_text_inventory (+11) |
| `skills/storyboard-manager/scripts/timeline_tracker.py` | scan_directory, extract_characters_from_file, analyze_project, _group_events_by_time, _group_events_by_character (+8) |
| `skills/storyboard-manager/scripts/consistency_checker.py` | add_attribute, scan_directory, load_character_profile, load_all_characters, check_character_mentions (+6) |
| `skills/docx/scripts/add_toc_placeholders.py` | _extract_headings_from_docx, add_toc_placeholders, _fix_update_fields, _fix_heading_outline_levels, _fix_fld_char_structure (+5) |
| `skills/docx/scripts/utilities.py` | replace_node, insert_after, insert_before, append_to, _parse_fragment (+5) |
| `skills/pdf/scripts/html2pdf-next.js` | sleep, loadPlaywright, loadPdfLib, resolveChromium, prettyBytes (+4) |
| `skills/docx/scripts/postcheck.py` | to_dict, read_document_xml, check_image_aspect_ratio, check_toc, run_all_checks (+4) |

## Entry Points

Start here when exploring this area:

- **`paper_search_pro`** (Function) — `skills/aminer-open-academic/scripts/aminer_client.py:155`
- **`paper_qa_search`** (Function) — `skills/aminer-open-academic/scripts/aminer_client.py:168`
- **`paper_list_by_search_venue`** (Function) — `skills/aminer-open-academic/scripts/aminer_client.py:222`
- **`paper_list_by_keywords`** (Function) — `skills/aminer-open-academic/scripts/aminer_client.py:233`
- **`paper_detail_by_condition`** (Function) — `skills/aminer-open-academic/scripts/aminer_client.py:239`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `XMLEditor` | Class | `skills/docx/scripts/utilities.py` | 40 |
| `DocxXMLEditor` | Class | `skills/docx/scripts/document.py` | 85 |
| `paper_search_pro` | Function | `skills/aminer-open-academic/scripts/aminer_client.py` | 155 |
| `paper_qa_search` | Function | `skills/aminer-open-academic/scripts/aminer_client.py` | 168 |
| `paper_list_by_search_venue` | Function | `skills/aminer-open-academic/scripts/aminer_client.py` | 222 |
| `paper_list_by_keywords` | Function | `skills/aminer-open-academic/scripts/aminer_client.py` | 233 |
| `paper_detail_by_condition` | Function | `skills/aminer-open-academic/scripts/aminer_client.py` | 239 |
| `person_search` | Function | `skills/aminer-open-academic/scripts/aminer_client.py` | 253 |
| `person_patent_relation` | Function | `skills/aminer-open-academic/scripts/aminer_client.py` | 281 |
| `org_search` | Function | `skills/aminer-open-academic/scripts/aminer_client.py` | 295 |
| `org_detail` | Function | `skills/aminer-open-academic/scripts/aminer_client.py` | 300 |
| `org_person_relation` | Function | `skills/aminer-open-academic/scripts/aminer_client.py` | 305 |
| `org_paper_relation` | Function | `skills/aminer-open-academic/scripts/aminer_client.py` | 311 |
| `org_patent_relation` | Function | `skills/aminer-open-academic/scripts/aminer_client.py` | 317 |
| `org_disambiguate` | Function | `skills/aminer-open-academic/scripts/aminer_client.py` | 324 |
| `org_disambiguate_pro` | Function | `skills/aminer-open-academic/scripts/aminer_client.py` | 329 |
| `patent_search` | Function | `skills/aminer-open-academic/scripts/aminer_client.py` | 361 |
| `patent_info` | Function | `skills/aminer-open-academic/scripts/aminer_client.py` | 367 |
| `patent_detail` | Function | `skills/aminer-open-academic/scripts/aminer_client.py` | 372 |
| `workflow_org_analysis` | Function | `skills/aminer-open-academic/scripts/aminer_client.py` | 518 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Main → _is_valid_shape` | cross_community | 6 |
| `Main → _request` | cross_community | 4 |
| `Run → Create` | cross_community | 4 |
| `Html2pptx → RgbToHex` | cross_community | 4 |
| `Analyze_project → Add_attribute` | intra_community | 4 |
| `Main → _sort_by_position` | cross_community | 4 |
| `Main → _detect_overlaps` | cross_community | 4 |
| `Cli → Create` | cross_community | 4 |
| `Html2pptx → PxToInch` | cross_community | 3 |
| `Html2pptx → PxToPoints` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Hooks | 3 calls |
| [id] | 1 calls |

## How to Explore

1. `gitnexus_context({name: "paper_search_pro"})` — see callers and callees
2. `gitnexus_query({query: "scripts"})` — find related execution flows
3. Read key files listed above for implementation details
