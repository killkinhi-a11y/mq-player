#!/usr/bin/env python3
"""UX pass 2.3.5 — batch 2: Home header, Chats search height, Friends icons,
MyProfile row menus, Artist screen, dock semantics, online dot parity."""
import sys

def edit_file(path, edits):
    src = open(path, encoding='utf-8').read()
    applied = []
    for name, old, new in edits:
        if new in src:
            applied.append(name + ' (already)')
            continue
        if old not in src:
            print(f'FATAL [{path.split("/")[-1]}] {name}: old not found')
            sys.exit(1)
        src = src.replace(old, new, 1)
        applied.append(name)
    open(path, 'w', encoding='utf-8').write(src)
    print(path.split('/')[-1], '->', applied)

ROOT = 'app/src/main/kotlin/com/mq1/player/'

# ── 1. HomeScreen: header — Settings ALWAYS visible, WavePill only when playing
edit_file(ROOT + 'ui/screens/HomeScreen.kt', [(
    'header-stable',
    '''                    // Wave pill — hidden on phones while nothing plays
                    if (activeTrack != null) {
                        WavePill(onStartWave = onStartWave, compact = true)
                    } else {
                        IconButton44(onOpenSettings) {
                            MqIcon(
                                icon = MqIcons.Settings,
                                size = 22.dp,
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }''',
    '''                    // UX pass 2.3.5: STABLE header meaning — Settings is
                    // ALWAYS reachable from Home (previously the icon vanished
                    // whenever a track played: same slot, changing semantics,
                    // two hops to Settings mid-session). WavePill appears
                    // beside it only while something plays.
                    IconButton44(onOpenSettings) {
                        MqIcon(
                            icon = MqIcons.Settings,
                            size = 22.dp,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (activeTrack != null) {
                        WavePill(onStartWave = onStartWave, compact = true)
                    }''',
)])

# ── 2. ChatsScreen: search field 36 → 40dp (web h-10)
edit_file(ROOT + 'ui/screens/ChatsScreen.kt', [(
    'search-40',
    '''                            .height(36.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(chatsInputBg)''',
    '''                            // UX pass 2.3.5: 40dp (web h-10; was 36dp —
                            // the smallest text field in the app)
                            .height(40.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(chatsInputBg)''',
)])

# ── 3. FriendsScreen: wrong menu icons (PersonAdd for message / Check for profile)
src = open(ROOT + 'ui/screens/FriendsScreen.kt', encoding='utf-8').read()
import re
# find the action rows first
print('FriendsScreen menu icons region:')
for m in re.finditer(r'Написать сообщение|Профиль', src):
    start = src.rfind('\n', 0, m.start()-200)
    print(repr(src[max(0, m.start()-160):m.end()+40]))
    print('---')
