#!/bin/bash
# Add a track (by aria-label prefix) to an existing playlist (by name) via the
# real context-menu flow. Args: $1 = track action-button label prefix, $2 = playlist name
set -e
TRACK="$1"
PL="$2"
agent-browser eval "(() => {
  const btns = [...document.querySelectorAll('button')];
  const b = btns.find(x => (x.getAttribute('aria-label') || x.textContent).startsWith('Действия: $TRACK'));
  if (!b) return 'NO TRACK BUTTON: $TRACK';
  b.click(); return 'menu-open';
})()"
agent-browser wait 400
agent-browser eval "(() => {
  const items = [...document.querySelectorAll('[role=menuitem], [role=menu] *')].filter(e => e.textContent.trim() === 'Добавить в плейлист' && e.closest('[role=menu]'));
  const it = items[items.length - 1];
  if (!it) return 'NO MENUITEM';
  it.click(); return 'subpage';
})()"
agent-browser wait 400
agent-browser eval "(() => {
  const menu = [...document.querySelectorAll('[role=menu]')].pop() || document.body;
  const items = [...menu.querySelectorAll('[role=menuitem]')];
  const it = items.find(e => e.textContent.trim().startsWith('$PL'));
  if (!it) return 'NO PLAYLIST ITEM: ' + items.map(e=>e.textContent.trim()).join(' | ');
  it.click(); return 'added';
})()"
agent-browser wait 500
