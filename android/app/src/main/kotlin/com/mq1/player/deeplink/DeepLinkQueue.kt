package com.mq1.player.deeplink

/**
 * F11 — process-level pending deep link holder.
 *
 * CRITICAL AUTH FLOW (task book):
 *   user NOT authorized → opens a deep link → app launches → auth screen →
 *   login → automatically navigate to the ORIGINAL deep link destination.
 * The destination is never lost: it survives the Login/Onboarding screens
 * because it lives here, outside navigation state.
 *
 * Also serves the warm case: onNewIntent delivers a link while the app is
 * behind another screen → MainActivity parses it → NavHost observes the
 * counter → navigates from wherever it currently is.
 */
object DeepLinkQueue {

    private val _version = kotlinx.coroutines.flow.MutableStateFlow(0)

    /** Monotonic counter as StateFlow — NavHost collects it. */
    val version: kotlinx.coroutines.flow.StateFlow<Int> = _version

    @Volatile
    private var pending: DeepLink? = null

    /** Store a parsed destination (called from MainActivity). */
    @Synchronized
    fun offer(link: DeepLink) {
        pending = link
        _version.value += 1
    }

    /**
     * Take the pending destination for navigation. CONSUMES it — a link is
     * delivered exactly once (re-login loops must not replay old links).
     */
    @Synchronized
    fun take(): DeepLink? {
        val link = pending
        pending = null
        return link
    }

    /** Peek without consuming (diagnostics/tests). */
    fun peek(): DeepLink? = pending

    @Synchronized
    fun clear() {
        pending = null
    }
}
