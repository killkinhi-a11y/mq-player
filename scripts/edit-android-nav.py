#!/usr/bin/env python3
"""Android animation pass — MqAppNavHost.kt:
1. Dock tab indicator slides between tabs (was teleporting if(active) Box)
2. Mini player appears/disappears with expand+fade (was instant 63dp jump)
3. FullPlayer slide tightened: spring(400) ~500ms -> tween 320ms FastOutSlowIn
"""
P = "/home/z/my-project/android/app/src/main/kotlin/com/mq1/player/ui/nav/MqAppNavHost.kt"
s = open(P).read()

# ── 1. Imports ──
old = """import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically"""
new = """import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.BoxWithConstraints"""
assert old in s, "imports anchor"
s = s.replace(old, new, 1)

# ── 2. FullPlayer slide: 320ms FastOutSlowIn (was default spring ~500ms) ──
old = """                composable(
                    Routes.FULL_PLAYER,
                    enterTransition = {
                        slideInVertically(initialOffsetY = { it }) + androidx.compose.animation.fadeIn()
                    },
                    exitTransition = {
                        slideOutVertically(targetOffsetY = { it }) + androidx.compose.animation.fadeOut()
                    }
                ) {"""
new = """                composable(
                    Routes.FULL_PLAYER,
                    // Animation pass: default slide springs (stiffness 400)
                    // read as ~500ms for a full-height slide. 320ms
                    // FastOutSlowIn keeps the expressive slide but snappy.
                    enterTransition = {
                        slideInVertically(
                            animationSpec = tween(320, easing = FastOutSlowInEasing),
                            initialOffsetY = { it }
                        ) + androidx.compose.animation.fadeIn(tween(320, easing = FastOutSlowInEasing))
                    },
                    exitTransition = {
                        slideOutVertically(
                            animationSpec = tween(320, easing = FastOutSlowInEasing),
                            targetOffsetY = { it }
                        ) + androidx.compose.animation.fadeOut(tween(280, easing = FastOutSlowInEasing))
                    }
                ) {"""
assert old in s, "fullplayer anchor"
s = s.replace(old, new, 1)

# ── 3. Mini player AnimatedVisibility ──
old = """        if (activeTrack != null) {
            MiniPlayerBar(
                title = activeTrack.title,
                artist = activeTrack.artist,
                artwork = activeTrack.cover,
                isPlaying = isPlaying,
                isLiked = isLiked,
                isBuffering = isBuffering,
                positionMs = position,
                durationMs = duration,
                progress = if (duration > 0) position.toFloat() / duration else 0f,
                onToggle = onTogglePlay,
                onToggleLike = onToggleLike,
                onOpen = onOpenPlayer,
            )
        }"""
new = """        // Animation pass: the first track starting previously made the
        // dock (and the Scaffold content padding) JUMP by 63dp. Expand+fade
        // grows the slot smoothly — Scaffold re-measures per frame, so the
        // content follows. Never blocks the play control itself.
        AnimatedVisibility(
            visible = activeTrack != null,
            enter = expandVertically(
                animationSpec = tween(220, easing = FastOutSlowInEasing)
            ) + fadeIn(tween(220, easing = FastOutSlowInEasing)),
            exit = shrinkVertically(
                animationSpec = tween(180, easing = FastOutSlowInEasing)
            ) + fadeOut(tween(120))
        ) {
            activeTrack?.let { track ->
                MiniPlayerBar(
                    title = track.title,
                    artist = track.artist,
                    artwork = track.cover,
                    isPlaying = isPlaying,
                    isLiked = isLiked,
                    isBuffering = isBuffering,
                    positionMs = position,
                    durationMs = duration,
                    progress = if (duration > 0) position.toFloat() / duration else 0f,
                    onToggle = onTogglePlay,
                    onToggleLike = onToggleLike,
                    onOpen = onOpenPlayer,
                )
            }
        }"""
assert old in s, "miniplayer anchor"
s = s.replace(old, new, 1)

# ── 4. Sliding dock indicator ──
# 4a. wrap the Row in a Box (find Row .. height(56.dp) and its closing)
old = """        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {"""
new = """        val dockAccent = MaterialTheme.colorScheme.primary
        Box(Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {"""
assert old in s, "row anchor"
s = s.replace(old, new, 1)

# 4b. remove the teleporting per-tab indicator
old = """                    // active accent hairline at tab top (web ::before)
                    if (active) {
                        Box(
                            modifier = Modifier
                                .align(Alignment.TopCenter)
                                .width(22.dp)
                                .height(2.5.dp)
                                .background(accent, RoundedCornerShape(bottomStart = 3.dp, bottomEnd = 3.dp))
                        )
                    }
                    Column("""
new = """                    // The accent hairline is drawn ONCE above the Row and
                    // slides between tabs (see BoxWithConstraints below).
                    Column("""
assert old in s, "old indicator anchor"
s = s.replace(old, new, 1)

# 4c. after the Row closes, add the overlay indicator + close the wrapper Box.
# The Row's closing brace is followed by the Column's closing "}" of the dock.
old = """                        Text(
                            tab.label,
                            style = MqType.nav.copy(fontSize = 10.sp),
                            color = if (active) accent else textMuted.copy(alpha = 0.61f),  // web: muted@72% × label opacity .85
                            maxLines = 1
                        )
                    }
                }
            }
        }
    }
}"""
new = """                        Text(
                            tab.label,
                            style = MqType.nav.copy(fontSize = 10.sp),
                            color = if (active) accent else textMuted.copy(alpha = 0.61f),  // web: muted@72% × label opacity .85
                            maxLines = 1
                        )
                    }
                }
            }
        }

        // Sliding tab indicator (web ::before parity): ONE accent hairline
        // that travels between tab slots instead of teleporting. Plain Box
        // overlays are not hit-testable, so taps pass through to the tabs.
        BoxWithConstraints(Modifier.matchParentSize()) {
            val slot = maxWidth / tabs.size.toFloat()
            val activeIndex = tabs.indexOfFirst { currentRoute == it.route }.coerceAtLeast(0)
            val indicatorX by animateDpAsState(
                targetValue = slot * activeIndex,
                animationSpec = tween(220, easing = FastOutSlowInEasing),
                label = "dockIndicatorX"
            )
            Box(
                Modifier
                    .offset(x = indicatorX)
                    .width(slot)
            ) {
                Box(
                    Modifier
                        .align(Alignment.TopCenter)
                        .width(22.dp)
                        .height(2.5.dp)
                        .background(dockAccent, RoundedCornerShape(bottomStart = 3.dp, bottomEnd = 3.dp))
                )
            }
        }
        }
    }
}"""
assert old in s, "indicator overlay anchor"
s = s.replace(old, new, 1)

open(P, "w").write(s)
print("MqAppNavHost: 4 animation edits applied")
