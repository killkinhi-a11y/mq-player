package com.mq1.player

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import androidx.activity.ComponentActivity
import java.io.File
import com.mq1.player.ui.theme.MqTypography
import com.mq1.player.ui.theme.mqColorScheme
import com.mq1.player.ui.theme.LocalMqPalette
import com.mq1.player.ui.theme.paletteById

/**
 * SHARED visual-parity harness (used by all Parity*Test files):
 *  - deterministic local stub server on 127.0.0.1:8717
 *    (run tests with -PmqApiBase=http://127.0.0.1:8717)
 *  - Host: the REAL design system (Manrope + MqType + default palette)
 *  - capture: Robolectric-safe decorView rasterization at 375×844
 */
object ParityStub {

    /** Custom per-path stub response (auth runtime tests). */
    class StubResponse(
        val status: Int = 200,
        val body: String = "{}",
        val headers: List<String> = emptyList(), // raw "Set-Cookie: ..." lines
    )

    /** One captured request: method, path, Cookie header, body, all raw headers. */
    class CapturedRequest(
        val method: String,
        val path: String,
        val cookieHeader: String?,
        val body: String,
        val headers: List<Pair<String, String>> = emptyList(),
    )

    /** Path-suffix → custom response (checked BEFORE the defaults). */
    @JvmStatic
    val customResponses = java.util.concurrent.ConcurrentHashMap<String, StubResponse>()

    /** Every request the stub served (for request-shape assertions). */
    @JvmStatic
    val capturedRequests = java.util.concurrent.CopyOnWriteArrayList<CapturedRequest>()

    @JvmStatic
    fun startOnce() {
        try {
            val server = java.net.ServerSocket(8717, 16, java.net.InetAddress.getByName("127.0.0.1"))
            Thread({
                while (true) {
                    val sock = try { server.accept() } catch (e: Exception) { return@Thread }
                    Thread({
                        try {
                            sock.use { s ->
                            val raw = java.io.BufferedInputStream(s.getInputStream())
                            // read the request line + headers BYTE-wise (UTF-8
                            // bodies with multi-byte chars would deadlock a
                            // char-based reader — byte-exact is the only sound parse)
                            fun readLineBytes(): String? {
                                val out = java.io.ByteArrayOutputStream()
                                while (true) {
                                    val b = raw.read()
                                    if (b < 0) return if (out.size() == 0) null else out.toString(Charsets.UTF_8)
                                    if (b == '\n'.code) break
                                    if (b != '\r'.code) out.write(b)
                                }
                                return out.toString(Charsets.UTF_8)
                            }
                            val reqLine = readLineBytes() ?: return@Thread
                            var contentLength = 0
                            var cookieHeader: String? = null
                            val rawHeaders = mutableListOf<Pair<String, String>>()
                            while (true) {
                                val h = readLineBytes() ?: return@Thread
                                if (h.isEmpty()) break
                                val lc = h.lowercase()
                                if (lc.startsWith("content-length:")) contentLength = lc.substringAfter(":").trim().toInt()
                                if (lc.startsWith("cookie:")) cookieHeader = h.substringAfter(":").trim()
                                val idx = h.indexOf(':')
                                if (idx > 0) rawHeaders.add(h.substring(0, idx).trim() to h.substring(idx + 1).trim())
                            }
                            var bodyText = ""
                            if (contentLength > 0) {
                                val buf = ByteArray(contentLength)
                                var read = 0
                                while (read < contentLength) {
                                    val n = raw.read(buf, read, contentLength - read)
                                    if (n < 0) break
                                    read += n
                                }
                                bodyText = String(buf, 0, read, Charsets.UTF_8)
                            }
                                val method = reqLine.split(" ").getOrNull(0) ?: "GET"
                                val path = reqLine.split(" ").getOrNull(1) ?: "/"
                                capturedRequests.add(CapturedRequest(method, path, cookieHeader, bodyText, rawHeaders))
                                // match custom keys on the PATH ONLY (query
                                // strings differ per call) — full path stays captured
                                val pathNoQuery = path.substringBefore('?')
                                val custom = customResponses.entries.firstOrNull { (k, _) ->
                                    // Key: "path-suffix" OR "METHOD path-suffix" (method-aware).
                                    val parts = k.split(" ", limit = 2)
                                    if (parts.size == 2) parts[0] == method && pathNoQuery.endsWith(parts[1])
                                    else pathNoQuery.endsWith(k)
                                }?.value
                                val status = custom?.status ?: 200
                                val body = custom?.body ?: responseFor(path)
                                val extraHeaders = custom?.headers ?: emptyList()
                                val head = "HTTP/1.1 ${status} ${if (status == 200) "OK" else "Status"}\r\nContent-Type: application/json\r\n" +
                                    extraHeaders.joinToString("") { "$it\r\n" } +
                                    "Content-Length: ${body.toByteArray(Charsets.UTF_8).size}\r\nConnection: close\r\n\r\n"
                                s.getOutputStream().use { it.write((head + body).toByteArray(Charsets.UTF_8)); it.flush() }
                            }
                        } catch (e: Exception) { /* per-connection failure is fine */ }
                    }).start()
                }
            }).start()
        } catch (e: java.net.BindException) {
            // already started by another test class in the same JVM
        }
    }

    /** JSON response the stub returns (extend per test needs). */
    fun responseFor(path: String): String =
        if (path.endsWith("telegram-bot-name")) """{"configured":true,"botName":"MQPlayerBot"}""" else "{}"
}

/** Compose host with the production design system, default theme. */
@Composable
fun ParityHost(content: @Composable () -> Unit) {
    val palette = paletteById("default")
    androidx.compose.runtime.CompositionLocalProvider(LocalMqPalette provides palette) {
        MaterialTheme(
            colorScheme = mqColorScheme("default", "dark"),
            typography = MqTypography,
        ) {
            Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                Box(Modifier.fillMaxSize()) { content() }
            }
        }
    }
}

/**
 * Robolectric-safe PNG capture of the activity window at 375×844
 * (captureToImage's redraw sync does not work on the JVM — we rasterize
 * the decor view like Roborazzi does).
 */
fun <A : ComponentActivity> capture375x844(
    rule: androidx.compose.ui.test.junit4.AndroidComposeTestRule<*, A>,
    name: String,
) {
    rule.waitForIdle()
    val view = rule.activity.window.decorView
    if (view.width == 0 || view.height == 0) {
        view.measure(
            android.view.View.MeasureSpec.makeMeasureSpec(375, android.view.View.MeasureSpec.EXACTLY),
            android.view.View.MeasureSpec.makeMeasureSpec(844, android.view.View.MeasureSpec.EXACTLY),
        )
        view.layout(0, 0, 375, 844)
    }
    val bmp = android.graphics.Bitmap.createBitmap(375, 844, android.graphics.Bitmap.Config.ARGB_8888)
    val canvas = android.graphics.Canvas(bmp)
    view.draw(canvas)
    val f = File("/home/z/my-project/download/screens/parity", "android-$name-375.png")
    f.parentFile.mkdirs()
    f.outputStream().use { bmp.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
    println("PARITY SHOT ${f.absolutePath} ${bmp.width}x${bmp.height}")
}

/**
 * Scaffold host — screen + the REAL web-parity bottom dock (with mini
 * player), exactly like the web reference screenshots which include the
 * MobileDock. The mini player uses the (reflection-seeded) real
 * controller state.
 */
@Composable
fun ParityScaffoldHost(
    route: String,
    showDock: Boolean = true,
    content: @Composable () -> Unit,
) {
    val controller = com.mq1.player.di.ServiceLocator.playbackController
    val queue by controller.queue.collectAsState()
    val index by controller.currentIndex.collectAsState()
    val isPlaying by controller.isPlaying.collectAsState()
    val isBuffering by controller.isBuffering.collectAsState()
    val position by controller.positionMs.collectAsState()
    val duration by controller.durationMs.collectAsState()
    val favorites by com.mq1.player.di.ServiceLocator.localStore.favorites.collectAsState(initial = emptyList())
    val activeTrack = queue.getOrNull(index)

    Column(Modifier.fillMaxSize()) {
        Box(Modifier.weight(1f)) { content() }
        if (showDock) {
            com.mq1.player.ui.nav.MqDockHost(
                currentRoute = route,
                activeTrack = activeTrack,
                isPlaying = isPlaying,
                isBuffering = isBuffering,
                isLiked = activeTrack?.id in favorites.map { it.id },
                positionMs = position,
                durationMs = duration,
            )
        }
    }
}

/** Seed the real controller queue state (test-only reflection) so the dock
 *  mini player renders like the web shots. playQueue() is NOT used — it
 *  would try to connect the Media3 service (no ComponentName under
 *  Robolectric). */
fun seedNowPlaying(
    id: String = "t1",
    title: String = "Ambient Dreams",
    artist: String = "MQ Demo",
    durationMs: Long = 40000L,
    positionMs: Long = 17000L,
) {
    runCatching {
        val c = com.mq1.player.di.ServiceLocator.playbackController
        val t = com.mq1.player.data.api.Track(
            id = id, title = title, artist = artist,
            duration = (durationMs / 1000.0), cover = "", scTrackId = id.hashCode().toLong()
        )
        val fq = c.javaClass.getDeclaredField("_queue").apply { isAccessible = true }
        (fq.get(c) as kotlinx.coroutines.flow.MutableStateFlow<List<com.mq1.player.data.api.Track>>).value = listOf(t)
        val fi = c.javaClass.getDeclaredField("_currentIndex").apply { isAccessible = true }
        (fi.get(c) as kotlinx.coroutines.flow.MutableStateFlow<Int>).value = 0
        val fd = c.javaClass.getDeclaredField("_durationMs").apply { isAccessible = true }
        (fd.get(c) as kotlinx.coroutines.flow.MutableStateFlow<Long>).value = durationMs
        val fp = c.javaClass.getDeclaredField("_positionMs").apply { isAccessible = true }
        (fp.get(c) as kotlinx.coroutines.flow.MutableStateFlow<Long>).value = positionMs
        val fpl = c.javaClass.getDeclaredField("_isPlaying").apply { isAccessible = true }
        (fpl.get(c) as kotlinx.coroutines.flow.MutableStateFlow<Boolean>).value = true
    }
}
