(() => {
  const q = (sel) => document.querySelector(sel);
  const btns = [...document.querySelectorAll('button')];
  const listen = btns.find(x => (x.getAttribute('aria-label') || '').includes('Слушать'));
  if (listen) { listen.click(); return 'listen-clicked'; }
  return 'listen-not-found: ' + location.pathname;
})()
