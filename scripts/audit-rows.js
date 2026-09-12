// Generic track-row layout auditor v2.
// For each row: scrollIntoView, simulate hover (framer-motion onHoverStart via
// mouseenter/mousemove), then measure: actions visible / fixed-size / clickable
// (elementFromPoint), no horizontal overflow (row + page), no overlap with text,
// artwork fixed, row height consistency.

(() => {
  const VW = window.innerWidth;
  const report = {
    viewport: { w: VW, h: window.innerHeight },
    pageOverflowX: document.documentElement.scrollWidth > VW + 1,
    pageScrollW: document.documentElement.scrollWidth,
    rows: [],
    problems: [],
    summary: { rows: 0, rowsWithProblems: 0 },
  };

  const rowSet = new Set();
  document.querySelectorAll('div.group').forEach((el) => {
    if (el.querySelector('button[aria-label="Меню"], button[title="Меню"]') || el.querySelector('svg.lucide-heart, svg.lucide-trash-2')) rowSet.add(el);
  });
  document.querySelectorAll('svg.lucide-heart').forEach((p) => {
    const row = p.closest('div.group');
    if (row) rowSet.add(row);
  });

  const rows = [...rowSet].filter((r) => r.offsetParent !== null);
  report.summary.rows = rows.length;

  const likeSizes = new Set();
  const artSizes = new Set();
  const heights = new Set();

  rows.forEach((row, i) => {
    row.scrollIntoView({ block: 'center', behavior: 'instant' });
    // simulate hover to reveal desktop hover-only actions
    for (const t of ['mouseenter', 'mouseover', 'mousemove', 'pointerenter', 'pointerover', 'pointermove']) {
      try { row.dispatchEvent(new MouseEvent(t, { bubbles: t !== 'mouseenter' && t !== 'pointerenter' })); } catch {}
      try { row.dispatchEvent(new PointerEvent(t, { bubbles: t !== 'mouseenter' && t !== 'pointerenter', pointerType: 'mouse' })); } catch {}
    }

    const rRect = row.getBoundingClientRect();
    heights.add(Math.round(rRect.height));
    const entry = { i, rowRect: { y: Math.round(rRect.y), w: Math.round(rRect.width), h: Math.round(rRect.height) }, title: null, artist: null, actions: [], issues: [] };

    const info = row.querySelector('div.flex-1.min-w-0, [class*="flex-1"][class*="min-w-0"]');
    if (info) {
      const iRect = info.getBoundingClientRect();
      entry.info = { w: Math.round(iRect.width), right: Math.round(iRect.right) };
      [...info.querySelectorAll('p, span, button')].filter((t) => t.textContent.trim().length > 3 && !t.querySelector('svg')).forEach((t) => {
        const tr = t.getBoundingClientRect();
        // unconstrained growth: VISIBLE box (after ancestor clips) wider than info block
        let visRight = tr.right;
        let anc = t.parentElement;
        while (anc && anc !== row) {
          const as = getComputedStyle(anc);
          if (as.overflow !== 'visible' || as.overflowX === 'hidden') {
            const ar = anc.getBoundingClientRect();
            visRight = Math.min(visRight, ar.right);
          }
          anc = anc.parentElement;
        }
        if (visRight > iRect.right + 1) entry.issues.push('text-box-escapes-info:' + t.tagName);
        const rec = { tag: t.tagName, len: t.textContent.trim().length, boxW: Math.round(tr.width), clippedToInfo: tr.right <= iRect.right + 1 };
        if (t.tagName === 'P' && !entry.title) entry.title = rec;
        else if (t.tagName === 'BUTTON' && !entry.artist) entry.artist = rec;
      });
    }

    const art = row.querySelector('div.w-10, div[class*="w-10"][class*="h-10"], div[class*="aspect-square"], img[class*="object-cover"]');
    if (art) {
      const a = art.getBoundingClientRect();
      artSizes.add(Math.round(a.width) + 'x' + Math.round(a.height));
      entry.artwork = { w: Math.round(a.width), h: Math.round(a.height) };
    }

    const seen = new Set();
    [...row.querySelectorAll('button')].forEach((b) => {
      if (seen.has(b) || b.closest('div.flex-1, [class*="flex-1"][class*="min-w-0"]') === info && info && b.parentElement !== info) return;
      if (!b.querySelector('svg') && !b.textContent.trim()) return; // only icon buttons
      if (info && info.contains(b) && b.querySelector('svg') === null && b.textContent.trim().length > 3) return; // artist link, not an action
      seen.add(b);
      const br = b.getBoundingClientRect();
      if (br.width === 0) return;
      const style = getComputedStyle(b);
      const cx = br.x + br.width / 2, cy = br.y + br.height / 2;
      const hit = (cx >= 0 && cx <= VW && cy >= 0 && cy <= window.innerHeight) ? document.elementFromPoint(cx, cy) : null;
      const clickable = !!hit && (b === hit || b.contains(hit) || hit.contains(b));
      const act = {
        label: b.getAttribute('aria-label') || 'svg:' + ((b.querySelector('svg') || {}).classList || ['?'])[1] || b.textContent.trim().slice(0, 14),
        rect: { x: Math.round(br.x), w: Math.round(br.width), h: Math.round(br.height), right: Math.round(br.right) },
        opacity: style.opacity, clickable,
        visibleInViewport: br.right <= VW + 1 && br.x >= -1,
      };
      if (b.querySelector('svg.lucide-heart')) likeSizes.add(Math.round(br.width) + 'x' + Math.round(br.height));
      entry.actions.push(act);
      if (!act.visibleInViewport) entry.issues.push('action-outside-viewport:' + act.label);
      if (!act.clickable) entry.issues.push('action-not-clickable:' + act.label + '@op' + style.opacity);
      if (info) {
        const iRect = info.getBoundingClientRect();
        const overlap = !(br.x >= iRect.right - 1 || br.right <= iRect.x + 1 || br.y >= iRect.bottom - 1 || br.bottom <= iRect.y + 1);
        if (overlap) entry.issues.push('action-overlaps-text:' + act.label);
      }
    });

    if (rRect.right > VW + 1) entry.issues.push('row-overflows-viewport');
    if (row.scrollWidth > row.clientWidth + 2) entry.issues.push('row-internal-hscroll(sw' + row.scrollWidth + '>cw' + row.clientWidth + ')');

    // reset hover
    row.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
    row.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));

    if (entry.issues.length) report.problems.push({ i, issues: entry.issues });
    report.rows.push(entry);
  });

  report.summary.rowsWithProblems = report.problems.length;
  report.likeSizeConsistency = [...likeSizes];
  report.artworkSizeConsistency = [...artSizes];
  report.rowHeightConsistency = [...heights];
  return JSON.stringify(report);
})()
