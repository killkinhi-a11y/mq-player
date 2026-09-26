(() => {
  const bar = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Добавить в любимые');
  if (!bar) return 'no-bar';
  let root = bar;
  for (let i = 0; i < 10 && root.parentElement; i++) {
    root = root.parentElement;
    if (root.className && root.className.toString().includes('capsule')) break;
  }
  const r = root.getBoundingClientRect();
  const openBtn = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Открыть полный плеер');
  const info = {
    capsule: root.className.toString().slice(0, 50),
    rect: { y: Math.round(r.y), h: Math.round(r.height), w: Math.round(r.width) },
    openBtnFound: !!openBtn,
    openBtnRect: openBtn ? { y: Math.round(openBtn.getBoundingClientRect().y), w: Math.round(openBtn.getBoundingClientRect().width) } : null,
    openBtnVisible: openBtn ? getComputedStyle(openBtn).display : null
  };
  if (openBtn) { openBtn.click(); info.clicked = true; }
  return JSON.stringify(info);
})()
