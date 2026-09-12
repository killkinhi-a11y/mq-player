#!/bin/sh
# QA session reset: purge SW+caches, reload, enter demo, navigate to the long-title playlist.
# Usage: scripts/qa-reset-playlist.sh
cd /home/z/my-project/mq-player
agent-browser eval "(async()=>{const r=await navigator.serviceWorker.getRegistration();if(r)await r.unregister();const ks=await caches.keys();await Promise.all(ks.map(k=>caches.delete(k)));return 'purged';})" >/dev/null 2>&1
agent-browser eval "location.reload()" >/dev/null 2>&1
sleep 8
agent-browser find text "Демо-режим" click >/dev/null 2>&1
sleep 3
agent-browser find role button click --name "Библиотека" >/dev/null 2>&1
sleep 1.5
agent-browser find role button click --name "Плейлисты" >/dev/null 2>&1
sleep 1
agent-browser find role button click --name "Открыть плейлист" >/dev/null 2>&1
sleep 2
agent-browser eval "document.querySelector('h1.line-clamp-3') ? 'PLAYLIST OPEN' : 'NOT OPEN'"
