#!/usr/bin/env python3
"""Replace fixed 52dp fake-status-bar spacers with real statusBarsPadding.
Per-screen exact patterns (v2). Idempotent."""
import re

ROOT = 'app/src/main/kotlin/com/mq1/player/ui/screens/'

EDITS = {
    'HomeScreen.kt': [(
        '            Column(Modifier.padding(horizontal = 16.dp)) {\n                Spacer(Modifier.height(52.dp))\n',
        '            // UX pass 2.3.5: real status-bar inset (was fixed 52dp fake)\n            Column(Modifier.statusBarsPadding().padding(horizontal = 16.dp)) {\n',
    )],
    'ChatsScreen.kt': [(
        '    Column(Modifier.fillMaxSize()) {\n        Spacer(Modifier.height(52.dp))\n',
        '    // UX pass 2.3.5: real status-bar inset (was fixed 52dp fake)\n    Column(Modifier.fillMaxSize().statusBarsPadding()) {\n',
    )],
    'FriendsScreen.kt': [(
        '    Column(Modifier.fillMaxSize()) {\n        Spacer(Modifier.height(52.dp))\n',
        '    // UX pass 2.3.5: real status-bar inset (was fixed 52dp fake)\n    Column(Modifier.fillMaxSize().statusBarsPadding()) {\n',
    )],
    'MyProfileScreen.kt': [(
        '        // ── Header ──────────────────────────────────────────────\n        Spacer(Modifier.height(52.dp))\n',
        '        // ── Header ──────────────────────────────────────────────\n        // UX pass 2.3.5: real status-bar inset (was fixed 52dp fake)\n        Spacer(Modifier.statusBarsPadding())\n',
    )],
    'UserProfileScreen.kt': [(
        '        Column(Modifier.fillMaxSize()) {\n            Spacer(Modifier.height(52.dp))\n',
        '        // UX pass 2.3.5: real status-bar inset (was fixed 52dp fake)\n        Column(Modifier.fillMaxSize().statusBarsPadding()) {\n',
    )],
}

for fname, edits in EDITS.items():
    path = ROOT + fname
    src = open(path, encoding='utf-8').read()
    changed = False
    for old, new in edits:
        if new in src:
            continue
        if old not in src:
            print(f'{fname}: PATTERN NOT FOUND — manual check needed')
            continue
        src = src.replace(old, new, 1)
        changed = True
    if 'statusBarsPadding()' in src and 'import androidx.compose.foundation.layout.statusBarsPadding' not in src:
        anchor = 'import androidx.compose.foundation.layout.Arrangement\n'
        if anchor in src:
            src = src.replace(anchor, anchor + 'import androidx.compose.foundation.layout.statusBarsPadding\n', 1)
            changed = True
        else:
            m = re.search(r'(^import [^\n]+\n)', src, re.M)
            if m:
                src = src.replace(m.group(1), m.group(1) + 'import androidx.compose.foundation.layout.statusBarsPadding\n', 1)
                changed = True
    if changed:
        open(path, 'w', encoding='utf-8').write(src)
        print(f'{fname}: UPDATED')
    else:
        print(f'{fname}: no change')
