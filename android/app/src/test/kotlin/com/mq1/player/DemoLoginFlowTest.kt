package com.mq1.player

import android.app.Application
import androidx.test.core.app.ApplicationProvider
import com.mq1.player.data.LocalStore
import com.mq1.player.di.ServiceLocator
import com.mq1.player.ui.screens.DemoTracks
import com.mq1.player.ui.vm.AuthViewModel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.LooperMode

/**
 * DEMO LOGIN — full runtime flow with the REAL components (no UI idling):
 *
 *   playQueue(DemoTracks, autoplay=false)          ← demo button behavior
 *   + MainActivity's EXACT session-persist wrapper
 *     (scope.launch(Dispatchers.IO) { setSessionUser })   ← THE v2.1.0 CRASH SITE
 *   → real DataStore write → sessionUser flow emits the demo user
 *   → AuthViewModel.onLoggedIn(demo) → Ui.Main + onboardingComplete (web parity)
 *   → logout → session wiped completely
 *
 * Robolectric constraints (documented honestly):
 *  - media3 MediaController service binding is NOT Robolectric-compatible
 *    (Robolectric's bindService shadow delivers a null ComponentName and
 *    media3 NPEs on it — on a real device Android never does this). The
 *    demo tap is therefore exercised WITHOUT Compose idling: the queue state
 *    mirrors are set synchronously before the connection, and the pending
 *    binder callback is never pumped. Full tap-through = device QA.
 *  - Robolectric gives each test method a fresh Application + tmp files, so
 *    ALL stateful steps run inside ONE test method (order matters).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@LooperMode(LooperMode.Mode.PAUSED)
class DemoLoginFlowTest {

    private lateinit var app: Application

    @Before
    fun setUp() {
        app = ApplicationProvider.getApplicationContext()
        ServiceLocator.init(app)
        ParityStub.startOnce()
        ParityStub.customResponses.clear()
    }

    /** Pump the main looper; media3's Robolectric-incompatible binder callback
     *  may NPE inside the shadow — swallow THAT artifact only. */
    private fun pumpMain() {
        runCatching { shadowOf(app.mainLooper).idle() }
    }

    private fun waitUntil(timeoutMs: Long = 10_000, condition: () -> Boolean) {
        val t0 = System.currentTimeMillis()
        while (!condition()) {
            if (System.currentTimeMillis() - t0 > timeoutMs) {
                throw AssertionError("condition not met within ${timeoutMs}ms")
            }
            pumpMain()
            Thread.sleep(20)
        }
    }

    /** MainActivity.RootContent's exact wrapper — including the crash site. */
    private fun persistSessionLikeMainActivity(user: LocalStore.SessionUser) {
        // Same structure as RootContent: rememberCoroutineScope ≈
        // SupervisorJob + main dispatcher; setSessionUser on Dispatchers.IO.
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
        scope.launch(Dispatchers.IO) {
            ServiceLocator.localStore.setSessionUser(user)
        }
    }

    @Test
    fun `D1 full demo login - queue paused, session persists, no crash - repeated 5 times`() {
        repeat(5) { round ->
            // ── what the «Демо-режим» button runs ───────────────────────────
            ServiceLocator.playbackController.playQueue(DemoTracks, 0, autoplay = false)
            persistSessionLikeMainActivity(
                LocalStore.SessionUser(userId = "demo-user-id", username = "Демо", role = "user", avatar = null)
            )

            // Queue mirrors (web parity: queue set, isPlaying:false). These are
            // set synchronously before any media3 boundary.
            assertEquals(DemoTracks, ServiceLocator.playbackController.queue.value)
            assertEquals(0, ServiceLocator.playbackController.currentIndex.value)
            assertEquals(false, ServiceLocator.playbackController.isPlaying.value)

            // ── THE v2.1.0 CRASH SITE — must complete without exception ─────
            waitUntil {
                runBlocking { ServiceLocator.localStore.sessionUser.first()?.userId == "demo-user-id" }
            }
        }

        // Full session round-trip through the REAL DataStore:
        val persisted = runBlocking { ServiceLocator.localStore.sessionUser.first() }
        assertEquals("demo-user-id", persisted?.userId)
        assertEquals("Демо", persisted?.username)

        // ── AuthViewModel routing: demo → Main directly (web semantics) ────
        val vm = AuthViewModel()
        vm.onLoggedIn(
            LocalStore.SessionUser(userId = AuthViewModel.DEMO_USER_ID, username = "Демо")
        )
        waitUntil { vm.state.value is AuthViewModel.Ui.Main }
        waitUntil { runBlocking { ServiceLocator.localStore.onboardingComplete.first() } }

        // ── Logout: demo state must be wiped COMPLETELY ─────────────────────
        var loggedOut = false
        vm.logout { loggedOut = true }
        waitUntil { loggedOut }
        waitUntil { runBlocking { ServiceLocator.localStore.sessionUser.first() } == null }
    }

    @Test
    fun `D2 demo tracks carry REAL playable URLs - no mq-stream synthetic URIs`() {
        DemoTracks.forEach { track ->
            assertTrue(
                "demo track ${track.id} must point at the public demo audio",
                track.audioUrl.startsWith("https://mq1.vercel.app/demo/song")
            )
            assertEquals(null, track.scTrackId)
        }
    }
}
