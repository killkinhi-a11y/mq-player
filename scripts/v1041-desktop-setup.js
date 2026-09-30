// V10.4.1 PHASE 1 — desktop session setup: demo login, spatial mode, play, open player.
(async () => {
  const btns = () => [...document.querySelectorAll('button')];
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const out = { steps: [] };

  // 1. demo mode if on auth screen
  const demo = btns().find(b => b.textContent.includes('Демо'));
  if (demo) { demo.click(); await sleep(3000); out.steps.push('demo-login'); }

  // 2. persist spatial mode for this store (matches Settings toggle)
  try {
    const raw = JSON.parse(localStorage.getItem('mq-store-v8') || '{}');
    raw.state = raw.state || {};
    raw.state.fullPlayerMode = 'spatial';
    localStorage.setItem('mq-store-v8', JSON.stringify(raw));
    out.steps.push('ls-spatial-set');
  } catch (e) { out.steps.push('ls-error:' + e.message); }

  // 3. play a track if none is current
  let vb = btns().find(b => (b.getAttribute('aria-label') || '').startsWith('Громкость:'));
  if (!vb) {
    const listen = btns().find(b => (b.getAttribute('aria-label') || '').includes('Слушать'));
    if (listen) { listen.click(); await sleep(3000); out.steps.push('play-track'); }
  } else out.steps.push('already-playing');

  // 4. open the full player from the mini bar
  const open = btns().find(b => b.getAttribute('aria-label') === 'Открыть полный плеер');
  if (open) { open.click(); await sleep(1800); out.steps.push('open-fullplayer'); }

  out.spatialMarks = document.querySelectorAll('[data-mq-spatial]').length;
  out.volBtn = !!btns().find(b => (b.getAttribute('aria-label') || '').startsWith('Громкость:'));
  return JSON.stringify(out);
})()
