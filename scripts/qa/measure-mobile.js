(() => {
  const dlg = document.querySelector('[role="dialog"][aria-label^="Полноэкранный"]');
  if (!dlg) return "no-dialog";
  const out = {};
  const q = (s) => dlg.querySelector(s);
  const size = (el) => { if (!el) return "n/a"; const r = el.getBoundingClientRect(); return Math.round(r.width) + "x" + Math.round(r.height); };
  out.play = size(q("[data-mq-playbtn]"));
  out.prev = size(q('[aria-label="Предыдущий трек"]'));
  out.next = size(q('[aria-label="Следующий трек"]'));
  out.shuffle = size(q('[aria-label="Перемешать"]'));
  out.repeat = size(q('[aria-label="Повтор"]'));
  out.like = size(q("button[aria-pressed]"));
  out.vol = size(q("[data-mq-volbtn]"));
  out.close = size(q('button[aria-label="Закрыть"]'));
  const seek = q(".mq-ft-seek-input");
  out.seek = size(seek);
  if (seek) { const cs = getComputedStyle(seek); out.seekH = cs.height; out.touchAction = cs.touchAction; }
  const bar = q("[data-mq-playerbar]");
  if (bar) { const r = bar.getBoundingClientRect(); out.bar = Math.round(r.width) + "x" + Math.round(r.height) + "@" + Math.round(r.x) + "," + Math.round(r.y); }
  out.secondary = [...dlg.querySelectorAll("[data-mq-secondary] button")].map((b) => size(b));
  return JSON.stringify(out);
})()
