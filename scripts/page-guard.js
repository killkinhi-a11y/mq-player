// Generic page-layout guard for card/grid views (Home, Artist, Wave, Chats, Onboarding).
// Checks: page horizontal overflow; elements visually escaping viewport width;
// interactive elements (buttons/links) partially off-screen; text escaping
// nearest overflow-clipped ancestor.

(() => {
  const VW = window.innerWidth;
  const problems = { pageOverflowX: document.documentElement.scrollWidth > VW + 1, offscreen: [], textEscape: [], btnCutoff: [] };
  const els = document.querySelectorAll('body *');
  let checked = 0;
  for (const el of els) {
    if (el.closest('[aria-hidden="true"]')) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    checked++;
    // visible box (respect ancestor clips)
    let visL = r.left, visR = r.right;
    let anc = el.parentElement;
    while (anc && anc !== document.body) {
      const acs = getComputedStyle(anc);
      if (acs.overflow !== 'visible' || acs.overflowX === 'hidden') {
        const ar = anc.getBoundingClientRect();
        visL = Math.max(visL, ar.left); visR = Math.min(visR, ar.right);
      }
      anc = anc.parentElement;
    }
    // element escapes viewport (visible part)
    if (visR > VW + 2 || visL < -2) {
      if (problems.offscreen.length < 12) problems.offscreen.push(el.tagName + '.' + String(el.className).slice(0, 40) + ' r=' + Math.round(visR));
    }
    // text content escaping clipped box
    if (el.children.length === 0 && el.textContent.trim().length > 20 && (cs.overflow !== 'hidden') ) {
      // find nearest clip ancestor
      let clipR = Infinity;
      let a2 = el.parentElement;
      while (a2 && a2 !== document.body) {
        const acs2 = getComputedStyle(a2);
        if (acs2.overflow !== 'visible' || acs2.overflowX === 'hidden') { clipR = Math.min(clipR, a2.getBoundingClientRect().right); break; }
        a2 = a2.parentElement;
      }
      const tRect = el.getBoundingClientRect();
      if (tRect.right > Math.min(clipR, VW) + 2 && problems.textEscape.length < 10) {
        problems.textEscape.push(el.tagName + '.' + String(el.className).slice(0, 36) + ' "' + el.textContent.trim().slice(0, 18) + '" r=' + Math.round(tRect.right));
      }
    }
    // buttons/links cut off by viewport edge
    if ((el.tagName === 'BUTTON' || el.tagName === 'A' || el.getAttribute('role') === 'button') && !el.disabled) {
      if ((r.right > VW + 1 || r.x < -1) && r.width > 4) {
        if (problems.btnCutoff.length < 10) problems.btnCutoff.push((el.getAttribute('aria-label') || el.textContent.trim().slice(0, 16)) + ' x=' + Math.round(r.x) + ' r=' + Math.round(r.right));
      }
    }
  }
  return JSON.stringify({ vw: VW, checked, pageOverflowX: problems.pageOverflowX, offscreen: problems.offscreen, textEscape: problems.textEscape, btnCutoff: problems.btnCutoff });
})()
