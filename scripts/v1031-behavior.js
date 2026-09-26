(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const q = (s) => document.querySelector(s);
  const btns = () => [...document.querySelectorAll('button')];
  const vb = () => btns().find(b => (b.getAttribute('aria-label') || '').startsWith('Громкость:'));
  const popup = () => q('[data-mq-volpopup]');
  const R = {};

  // 0. close the More menu if open
  const menu = q('.mq-menu-surface');
  if (menu) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(300); }

  // 1. open popup
  vb().click(); await sleep(400);
  R.open = { popup: !!popup(), expanded: vb().getAttribute('aria-expanded') };

  // 2. slider click at 40% → volume 40, popup STAYS open
  const inp = popup().querySelector('input');
  const setVal = (el, v) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  setVal(inp, 40); await sleep(350);
  R.slider = { label: vb().getAttribute('aria-label'), popupStays: !!popup() };

  // 3. mute via popup icon → 0; unmute → restores 40
  const mute = [...popup().querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '').includes('звук'));
  mute.click(); await sleep(300);
  R.mute = { label: vb().getAttribute('aria-label'), muteBtn: mute.getAttribute('aria-label') };
  const mute2 = [...popup().querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '').includes('звук'));
  mute2.click(); await sleep(300);
  R.unmute = { label: vb().getAttribute('aria-label') };

  // 4. Escape WITH slider focused → popup closes, player stays
  inp.focus();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await sleep(400);
  R.escapeSlider = { popupGone: !popup(), expanded: vb()?.getAttribute('aria-expanded'), playerOpen: !!vb() };

  // 5. outside click on the artwork/stage → closes
  vb().click(); await sleep(400);
  const opened = !!popup();
  const stage = q('[data-mq-spatial="stage"]') || q('main') || document.body;
  stage.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  await sleep(400);
  R.outsideClick = { opened, closed: !popup() };

  // 6. keyboard M (global) → mute; M again → restore
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', code: 'KeyM', key_code: 77, bubbles: true }));
  await sleep(300);
  R.mKey = { labelAfterM: vb().getAttribute('aria-label') };
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', code: 'KeyM', bubbles: true }));
  await sleep(300);
  R.mKey.labelAfterM2 = vb().getAttribute('aria-label');

  // 7. toggle: open then click button again → closes
  vb().click(); await sleep(300);
  const wasOpen = !!popup();
  vb().click(); await sleep(400);
  R.toggle = { wasOpen, nowClosed: !popup() };

  return JSON.stringify(R, null, 1);
})()
