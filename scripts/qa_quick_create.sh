#!/bin/bash
# Quick-create a playlist from a track (named after its artist, per app flow)
set -e
TRACK="$1"
agent-browser eval "(() => {
  const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('aria-label') || '').startsWith('Действия: $TRACK'));
  if (!b) return 'NO TRACK BUTTON: $TRACK';
  b.click(); return 'menu-open';
})()"
agent-browser wait 400
agent-browser eval "(() => {
  const items = [...document.querySelectorAll('[role=menuitem]')].filter(e => e.textContent.trim() === 'Добавить в плейлист');
  const it = items[items.length - 1];
  if (!it) return 'NO MENUITEM';
  it.click(); return 'subpage';
})()"
agent-browser wait 400
agent-browser eval "(() => {
  const items = [...document.querySelectorAll('[role=menuitem]')].filter(e => e.textContent.trim() === 'Новый плейлист');
  const it = items[items.length - 1];
  if (!it) return 'NO NEW-PL ITEM';
  it.click(); return 'created';
})()"
agent-browser wait 500
agent-browser eval "JSON.stringify(JSON.parse(localStorage.getItem('mq-store-v8')).state.playlists.map(p=>({n:p.name,t:p.tracks.length})))"
