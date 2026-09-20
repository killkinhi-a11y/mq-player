#!/usr/bin/env python3
"""Robust multi-edit for SearchScreen.kt (dash-count tolerant replacements).
Idempotent: skips already-applied edits."""
import re, sys

P = 'app/src/main/kotlin/com/mq1/player/ui/screens/SearchScreen.kt'
src = open(P, encoding='utf-8').read()
applied, skipped = [], []

def edit(name, old, new):
    global src
    if new in src:
        skipped.append(name + " (already)")
        return
    if old not in src:
        print(f"FATAL: [{name}] old_str not found"); sys.exit(1)
    src = src.replace(old, new, 1)
    applied.append(name)

# 1. imports
edit("imports",
     "import androidx.compose.foundation.text.BasicTextField\n",
     "import androidx.compose.foundation.text.BasicTextField\n"
     "import androidx.compose.foundation.text.KeyboardActions\n"
     "import androidx.compose.foundation.text.KeyboardOptions\n"
     "import androidx.compose.foundation.layout.imePadding\n"
     "import androidx.compose.foundation.layout.statusBarsPadding\n")

# 2. LazyColumn imePadding + header statusBarsPadding (dash-tolerant via regex)
m = re.search(r'    LazyColumn\(\n        modifier = Modifier\.fillMaxSize\(\),\n        contentPadding = PaddingValues\(bottom = 16\.dp\)\n    \) \{\n(        // ── page header[^\n]*\n)        item \{\n            Column\(Modifier\.padding\(horizontal = 16\.dp\)\) \{\n                Spacer\(Modifier\.height\(52\.dp\)\)\n', src)
if m:
    src = src[:m.start()] + (
        '    LazyColumn(\n'
        '        modifier = Modifier.fillMaxSize().imePadding(),\n'
        '        contentPadding = PaddingValues(bottom = 16.dp)\n'
        '    ) {\n' + m.group(1) +
        '        item {\n'
        '            Column(Modifier.statusBarsPadding().padding(horizontal = 16.dp)) {\n'
    ) + src[m.end():]
    applied.append("header+imePadding")
else:
    if 'statusBarsPadding().padding(horizontal = 16.dp)' in src:
        skipped.append("header+imePadding (already)")
    else:
        print("FATAL: header block not found"); sys.exit(1)

# 3. clear button 40dp
edit("clear40",
     """            if (value.isNotEmpty()) {
                Box(
                    modifier = Modifier
                        .size(28.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.onBackground.copy(alpha = 0.08f))
                        .clickable { onValueChange("") },
                    contentAlignment = Alignment.Center
                ) {
                    MqIcon(
                        icon = MqIcons.X, size = 14.dp,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }""",
     """            if (value.isNotEmpty()) {
                // UX pass 2.3.5: 40dp touch target (was 28dp — the only
                // clear button missed by the 2.3.4 pass), 24dp visual.
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(CircleShape)
                        .clickable { onValueChange("") },
                    contentAlignment = Alignment.Center
                ) {
                    Box(
                        modifier = Modifier
                            .size(24.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.onBackground.copy(alpha = 0.08f)),
                        contentAlignment = Alignment.Center
                    ) {
                        MqIcon(
                            icon = MqIcons.X, size = 14.dp,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }""")

# 4. QuickPickCard modifier param
edit("quickpick-param",
     """private fun QuickPickCard(track: Track, onPlay: () -> Unit) {
    Row(
        modifier = Modifier
            .width(167.dp)
            .clip(RoundedCornerShape(12.dp))""",
     """private fun QuickPickCard(track: Track, onPlay: () -> Unit, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))""")

# 5. call site weight(1f)
edit("quickpick-call",
     """                                QuickPickCard(
                                    track = track,
                                    onPlay = { onPlayQueue(quickPicks, quickPicks.indexOf(track)) },
                                )""",
     """                                QuickPickCard(
                                    track = track,
                                    onPlay = { onPlayQueue(quickPicks, quickPicks.indexOf(track)) },
                                    modifier = Modifier.weight(1f),
                                )""")

# 6. ФАЙЛЫ icon: Download → Upload
edit("files-icon",
     "                            icon = MqIcons.Download, size = 16.dp,",
     "                            icon = MqIcons.Upload, size = 16.dp,")

# 7. search field: IME search action + keyboard dismiss
edit("ime-search",
     """                    modifier = Modifier.fillMaxWidth()
                )
                if (value.isEmpty()) {""",
     """                    singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = androidx.compose.ui.text.input.ImeAction.Search),
                    keyboardActions = KeyboardActions(onSearch = {
                        androidx.compose.ui.platform.LocalFocusManager.current.clearFocus()
                    }),
                    modifier = Modifier.fillMaxWidth()
                )
                if (value.isEmpty()) {""")
# dedupe singleLine if the block already had singleLine before modifier
src = src.replace(
    """                    singleLine = true,
                    textStyle = TextStyle(
                        fontFamily = MqType.section.fontFamily,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Medium,
                        color = MaterialTheme.colorScheme.onBackground,
                    ),
                    singleLine = true,
                    keyboardOptions""",
    """                    singleLine = true,
                    textStyle = TextStyle(
                        fontFamily = MqType.section.fontFamily,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Medium,
                        color = MaterialTheme.colorScheme.onBackground,
                    ),
                    keyboardOptions""", 1)

open(P, 'w', encoding='utf-8').write(src)
print("APPLIED:", applied)
print("SKIPPED:", skipped)
