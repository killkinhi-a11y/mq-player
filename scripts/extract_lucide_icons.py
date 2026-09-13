#!/usr/bin/env python3
"""Extract Lucide icon geometry from the web app's lucide-react package
(ISC license) into a Kotlin MqIcons.kt for the native Android client.

Source of truth: node_modules/lucide-react/dist/esm/icons/*.js — the EXACT
icons the web renders, so Android icon parity is byte-faithful.
"""
import re, os, sys

ICONS = "/home/z/my-project/node_modules/lucide-react/dist/esm/icons"

# lucide file name -> Kotlin name (semantic naming used by the Android UI)
WANTED = {
    "house": "Home",
    "search": "Search",
    "library": "Library",
    "message-circle": "MessageCircle",
    "user": "User",
    "play": "Play",
    "pause": "Pause",
    "skip-back": "SkipBack",
    "skip-forward": "SkipForward",
    "heart": "Heart",
    "music": "Music",
    "chevron-down": "ChevronDown",
    "chevron-up": "ChevronUp",
    "chevron-right": "ChevronRight",
    "chevron-left": "ChevronLeft",
    "more-horizontal": "MoreHorizontal",
    "x": "X",
    "shuffle": "Shuffle",
    "repeat": "Repeat",
    "repeat-1": "Repeat1",
    "thumbs-down": "ThumbsDown",
    "list-plus": "ListPlus",
    "mic-vocal": "Mic2",
    "list-music": "ListMusic",
    "history": "History",
    "share-2": "Share2",
    "volume-2": "Volume2",
    "gauge": "Gauge",
    "timer": "Timer",
    "sliders-horizontal": "SlidersHorizontal",
    "air-vent": "AirVent",
    "bell": "Bell",
    "palette": "Palette",
    "info": "Info",
    "cloud": "Cloud",
    "sparkles": "Sparkles",
    "trash-2": "Trash2",
    "download": "Download",
    "monitor": "Monitor",
    "apple": "Apple",
    "terminal": "Terminal",
    "smartphone": "Smartphone",
    "loader-circle": "LoaderCircle",
    "settings": "Settings",
    "users": "Users",
    "plus": "Plus",
    "send": "Send",
    "arrow-left": "ArrowLeft",
    "camera": "Camera",
    "log-out": "LogOut",
    "check": "Check",
    "image": "ImageIcon",
    "circle-check": "CircleCheck",
    "refresh-cw": "RefreshCw",
    "lock": "Lock",
    "mail": "Mail",
    "folder": "Folder",
    "plus-circle": "PlusCircle",
    "search-x": "SearchX",
    "arrow-up-right": "ArrowUpRight",
    "list": "List",
    "radio": "Radio",
    "flame": "Flame",
    "trending-up": "TrendingUp",
    "clock": "Clock",
    "headphones": "Headphones",
    "user-plus": "UserPlus",
    "user-check": "UserCheck",
    "message-square": "MessageSquare",
    "file-text": "FileText",
    "audio-lines": "AudioLines",
    "circle-pause": "CirclePause",
}

def parse_icon(fname: str):
    src = open(os.path.join(ICONS, fname + ".js")).read()
    # resolve re-export alias
    m = re.search(r"export \{ default \} from '\./([a-z0-9-]+)\.js'", src)
    if m:
        src = open(os.path.join(ICONS, m.group(1) + ".js")).read()
    nodes = []
    # element tuples: ["tag", { attrs }] — attrs values may be quoted or bare
    for tag, attrsrc in re.findall(r'\[\s*"(path|circle|line|rect|polygon|polyline)"\s*,\s*\{([^}]*)\}', src, re.S):
        attrs = dict(re.findall(r'(\w+):\s*("[^"]*"|[\d.\-]+)', attrsrc))
        def f(k):
            v = attrs.get(k, "0").strip('"')
            return float(v)
        if tag == "path":
            nodes.append(f'PathData("{attrs["d"].strip(chr(34))}")')
        elif tag == "circle":
            nodes.append(f"Circle({f('cx')}f, {f('cy')}f, {f('r')}f)")
        elif tag == "line":
            nodes.append(f"LineSeg({f('x1')}f, {f('y1')}f, {f('x2')}f, {f('y2')}f)")
        elif tag == "rect":
            nodes.append(f"RectSeg({f('x')}f, {f('y')}f, {f('width')}f, {f('height')}f, {f('rx')}f)")
        elif tag in ("polygon", "polyline"):
            pts = attrs["points"].strip(chr(34)).replace(",", " ").split()
            nums = [p for p in pts if p]
            d = ""
            for j in range(0, len(nums) - 1, 2):
                d += ("M" if j == 0 else "L") + nums[j] + " " + nums[j + 1] + " "
            if tag == "polygon":
                d += "Z"
            nodes.append(f'PathData("{d.strip()}")')
    return nodes

out = []
out.append("""package com.mq1.player.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * LUCIDE icon parity — geometry extracted verbatim from the web app's
 * lucide-react v0.525 (ISC license). The web draws these exact paths at
 * 24×24 with stroke 1.7–2.3, round caps/joins — the Android app renders
 * the SAME geometry so icon style is identical across platforms.
 *
 * This file is GENERATED by scripts/extract_lucide_icons.py — regenerate
 * (not hand-edit) if the web icon set changes.
 */
sealed interface SvgNode
data class PathData(val d: String) : SvgNode
data class Circle(val cx: Float, val cy: Float, val r: Float) : SvgNode
data class LineSeg(val x1: Float, val y1: Float, val x2: Float, val y2: Float) : SvgNode
data class RectSeg(val x: Float, val y: Float, val w: Float, val h: Float, val rx: Float) : SvgNode

class LucideIcon(val nodes: List<SvgNode>)

/** SVG path-data parser (M/L/H/V/C/S/Q/T/Z, absolute + relative). */
class SvgPathParser(private val d: String) {
    fun parse(): Path = Path().also { p ->
        var i = 0
        var cmd = ' '
        var cx = 0f; var cy = 0f   // current point
        var lastC = listOf(0f, 0f, 0f, 0f) // last cubic ctrl pair (for S/s)
        var lastQ = listOf(0f, 0f)          // last quad ctrl (for T/t)
        fun num(): Float {
            while (i < d.length && (d[i] == ' ' || d[i] == ',')) i++
            val start = i
            while (i < d.length && (d[i].isDigit() || d[i] in ".-+eE")) i++
            return d.substring(start, i).toFloat()
        }
        fun isNum(): Boolean {
            var j = i
            while (j < d.length && (d[j] == ' ' || d[j] == ',')) j++
            return j < d.length && (d[j].isDigit() || d[j] in ".-")
        }
        while (i < d.length) {
            while (i < d.length && (d[i] == ' ' || d[i] == ',')) i++
            if (i >= d.length) break
            val c = d[i]
            if (c.isLetter()) { cmd = c; i++ }
            when (cmd) {
                'M', 'm' -> {
                    val x = num(); val y = num()
                    cx = if (cmd == 'm') cx + x else x
                    cy = if (cmd == 'm') cy + y else y
                    p.moveTo(cx, cy)
                    // implicit lineto repeats
                    while (isNum()) {
                        val x2 = num(); val y2 = num()
                        cx = if (cmd == 'm') cx + x2 else x2
                        cy = if (cmd == 'm') cy + y2 else y2
                        p.lineTo(cx, cy)
                    }
                }
                'L', 'l' -> {
                    do {
                        val x = num(); val y = num()
                        cx = if (cmd == 'l') cx + x else x
                        cy = if (cmd == 'l') cy + y else y
                        p.lineTo(cx, cy)
                    } while (isNum())
                }
                'H', 'h' -> {
                    do {
                        val x = num()
                        cx = if (cmd == 'h') cx + x else x
                        p.lineTo(cx, cy)
                    } while (isNum())
                }
                'V', 'v' -> {
                    do {
                        val y = num()
                        cy = if (cmd == 'v') cy + y else y
                        p.lineTo(cx, cy)
                    } while (isNum())
                }
                'C', 'c' -> {
                    do {
                        val x1 = num(); val y1 = num(); val x2 = num(); val y2 = num(); val x = num(); val y = num()
                        val a1x = if (cmd == 'c') cx + x1 else x1; val a1y = if (cmd == 'c') cy + y1 else y1
                        val a2x = if (cmd == 'c') cx + x2 else x2; val a2y = if (cmd == 'c') cy + y2 else y2
                        val ax = if (cmd == 'c') cx + x else x; val ay = if (cmd == 'c') cy + y else y
                        p.cubicTo(a1x, a1y, a2x, a2y, ax, ay)
                        lastC = listOf(a1x, a1y, a2x, a2y)
                        cx = ax; cy = ay
                    } while (isNum())
                }
                'S', 's' -> {
                    do {
                        val x2 = num(); val y2 = num(); val x = num(); val y = num()
                        val a1x = 2 * cx - lastC[2]; val a1y = 2 * cy - lastC[3]
                        val a2x = if (cmd == 's') cx + x2 else x2; val a2y = if (cmd == 's') cy + y2 else y2
                        val ax = if (cmd == 's') cx + x else x; val ay = if (cmd == 's') cy + y else y
                        p.cubicTo(a1x, a1y, a2x, a2y, ax, ay)
                        lastC = listOf(a1x, a1y, a2x, a2y)
                        cx = ax; cy = ay
                    } while (isNum())
                }
                'Q', 'q' -> {
                    do {
                        val x1 = num(); val y1 = num(); val x = num(); val y = num()
                        val a1x = if (cmd == 'q') cx + x1 else x1; val a1y = if (cmd == 'q') cy + y1 else y1
                        val ax = if (cmd == 'q') cx + x else x; val ay = if (cmd == 'q') cy + y else y
                        p.quadraticBezierTo(a1x, a1y, ax, ay)
                        lastQ = listOf(a1x, a1y)
                        cx = ax; cy = ay
                    } while (isNum())
                }
                'T', 't' -> {
                    do {
                        val x = num(); val y = num()
                        val a1x = 2 * cx - lastQ[0]; val a1y = 2 * cy - lastQ[1]
                        val ax = if (cmd == 't') cx + x else x; val ay = if (cmd == 't') cy + y else y
                        p.quadraticBezierTo(a1x, a1y, ax, ay)
                        lastQ = listOf(a1x, a1y)
                        cx = ax; cy = ay
                    } while (isNum())
                }
                'A', 'a' -> {
                    // arc → cubic approximation (lucide uses arcs only for
                    // circles; approximation is visually indistinguishable)
                    do {
                        val rx = num(); val ry = num(); num() /*rot*/; val largeArc = num().toInt(); val sweep = num().toInt()
                        val x = num(); val y = num()
                        val ax = if (cmd == 'a') cx + x else x; val ay = if (cmd == 'a') cy + y else y
                        arcToCubic(p, cx, cy, rx, ry, largeArc, sweep, ax, ay)
                        cx = ax; cy = ay
                    } while (isNum())
                }
                'Z', 'z' -> { p.close() }
            }
        }
    }

    private fun arcToCubic(p: Path, x0: Float, y0: Float, rx0: Float, ry0: Float,
                           largeArc: Int, sweep: Int, x: Float, y: Float) {
        // Endpoint→center parameterization (SVG spec F.6.5, rotation=0 —
        // lucide never rotates), then split into ≤90° cubic segments.
        var rx = kotlin.math.abs(rx0).coerceAtLeast(0.01f)
        var ry = kotlin.math.abs(ry0).coerceAtLeast(0.01f)
        val x1p = (x0 - x) / 2f
        val y1p = (y0 - y) / 2f
        val lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
        if (lambda > 1f) {
            val s = kotlin.math.sqrt(lambda)
            rx *= s; ry *= s
        }
        val num = (rx * rx * ry * ry) - (rx * rx * y1p * y1p) - (ry * ry * x1p * x1p)
        val den = (rx * rx * y1p * y1p) + (ry * ry * x1p * x1p)
        var factor = kotlin.math.sqrt(kotlin.math.max(0f, num / den))
        if (largeArc == sweep) factor = -factor
        val cx0 = factor * rx * y1p / ry + (x0 + x) / 2f
        val cy0 = -factor * ry * x1p / rx + (y0 + y) / 2f
        val theta1 = Math.atan2(((y0 - cy0) / ry).toDouble(), ((x0 - cx0) / rx).toDouble())
        var dTheta = Math.atan2(((y - cy0) / ry).toDouble(), ((x - cx0) / rx).toDouble()) - theta1
        if (sweep == 0 && dTheta > 0) dTheta -= 2 * Math.PI
        else if (sweep == 1 && dTheta < 0) dTheta += 2 * Math.PI
        val segments = kotlin.math.ceil(kotlin.math.abs(dTheta) / (Math.PI / 2)).toInt().coerceAtLeast(1)
        val delta = dTheta / segments
        val t = 4.0 / 3.0 * kotlin.math.tan(delta / 4.0)
        var th = theta1
        var px = x0.toDouble(); var py = y0.toDouble()
        repeat(segments) {
            val th2 = th + delta
            val d1 = t * -kotlin.math.sin(th) * rx
            val d2 = t * kotlin.math.cos(th) * ry
            val d3 = t * -kotlin.math.sin(th2) * rx
            val d4 = t * kotlin.math.cos(th2) * ry
            val nx = cx0 + rx * kotlin.math.cos(th2)
            val ny = cy0 + ry * kotlin.math.sin(th2)
            p.cubicTo(
                (px - d1).toFloat(), (py - d2).toFloat(),
                (nx + d3).toFloat(), (ny + d4).toFloat(),
                nx.toFloat(), ny.toFloat()
            )
            px = nx; py = ny; th = th2
        }
    }
}

private object PathCache {
    private val cache = java.util.concurrent.ConcurrentHashMap<String, Path>()
    fun get(d: String): Path = cache.computeIfAbsent(d) { SvgPathParser(it).parse() }
}

/**
 * MQ icon — renders Lucide geometry exactly like the web: 24×24 viewBox
 * scaled to [size], [strokeWidth] dp stroke, round caps/joins.
 * [fill] renders the filled variant (web: fill="currentColor").
 */
@Composable
fun MqIcon(
    icon: LucideIcon,
    modifier: Modifier = Modifier,
    size: Dp = 24.dp,
    tint: Color = Color.Unspecified,
    strokeWidth: Dp = 2.dp,
    fill: Boolean = false,
) {
    val tintResolved = if (tint == Color.Unspecified) Color(0xFFB8B8B8) else tint
    Canvas(modifier.then(Modifier.size(size))) {
        val scale = this.size.width / 24f
        fun drawPath(p: Path) {
            val scaled = Path().apply { addPath(p, androidx.compose.ui.graphics.Matrix().apply { scale(scale, scale, 1f) }) }
            if (fill) drawPath(scaled, tintResolved, style = Fill)
            else drawPath(scaled, tintResolved, style = Stroke(width = strokeWidth.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
        icon.nodes.forEach { node ->
            when (node) {
                is PathData -> drawPath(PathCache.get(node.d))
                is Circle -> {
                    val p = Path().apply { addOval(Rect(node.cx - node.r, node.cy - node.r, node.cx + node.r, node.cy + node.r)) }
                    drawPath(p)
                }
                is LineSeg -> {
                    val p = Path().apply { moveTo(node.x1, node.y1); lineTo(node.x2, node.y2) }
                    drawPath(p)
                }
                is RectSeg -> {
                    val p = if (node.rx > 0f) Path().apply { addRoundRect(androidx.compose.ui.geometry.RoundRect(node.x, node.y, node.x + node.w, node.y + node.h, androidx.compose.ui.geometry.CornerRadius(node.rx, node.rx)) } }
                    else Path().apply { addRect(Rect(node.x, node.y, node.x + node.w, node.y + node.h)) }
                    drawPath(p)
                }
            }
        }
    }
}
""")

missing = []
for fname, kotlin_name in WANTED.items():
    path = os.path.join(ICONS, fname + ".js")
    if not os.path.exists(path):
        missing.append(fname)
        continue
    nodes = parse_icon(fname)
    if not nodes:
        missing.append(fname + " (no geometry)")
        continue
    out.append(f"val MqIcons.{kotlin_name} = LucideIcon(listOf(")
    out.append(",\n    ".join(nodes))
    out.append("))")

with open("/home/z/my-project/android/app/src/main/kotlin/com/mq1/player/ui/components/MqIcons.kt", "w") as f:
    f.write("\n".join(out) + "\n")

print("Generated MqIcons.kt with", len(WANTED) - len(missing), "icons")
if missing:
    print("MISSING:", missing)
