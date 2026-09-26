(async () => {
  const btns = () => [...document.querySelectorAll('button')];
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  // 1. demo mode if on auth screen
  const demo = btns().find(b => b.textContent.includes('Демо'));
  if (demo) { demo.click(); await sleep(2500); }
  // 2. play a track
  const listen = btns().find(b => (b.getAttribute('aria-label') || '').includes('Слушать'));
  if (listen) { listen.click(); await sleep(2500); }
  // 3. open full player (mini capsule)
  let open = btns().find(b => b.getAttribute('aria-label') === 'Открыть полный плеер');
  if (!open) {
    const mini = document.querySelector('.mq-mini');
    if (mini) { mini.click(); await sleep(1500); }
  } else { open.click(); await sleep(1500); }
  const vb = btns().find(b => (b.getAttribute('aria-label') || '').startsWith('Громкость:'));
  return JSON.stringify({
    demo: !!demo, listened: !!listen,
    playerOpen: !!vb,
    spatial: document.querySelectorAll('[data-mq-spatial]').length,
  });
})()
