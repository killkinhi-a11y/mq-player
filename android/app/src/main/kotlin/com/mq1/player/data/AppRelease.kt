package com.mq1.player.data

import android.content.Context
import android.content.Intent
import android.net.Uri

/**
 * Distribution info for the native Android app (release task PART 1/16/17).
 *
 * APK_DOWNLOAD_URL is the PERMANENT GitHub Releases link: it always resolves
 * to the `MQPlayer.apk` asset of the newest non-draft release
 * (HTTP 200, content-type application/vnd.android.package-archive).
 *
 * The URL is production-only — no localhost, no sandbox paths, no fake
 * handlers. Opening it launches the external browser and hands off to the
 * STANDARD Android download + package-installer flow (explicit user action;
 * the app never auto-installs or silently downloads anything).
 */
object AppRelease {
    /** Stable "latest" link — survives every future release upload. */
    const val APK_DOWNLOAD_URL =
        "https://github.com/killkinhi-a11y/mq-player/releases/latest/download/MQPlayer.apk"

    /** Human-readable releases page (shown in Settings as the source). */
    const val RELEASES_PAGE_URL =
        "https://github.com/killkinhi-a11y/mq-player/releases/latest"

    /** Opens the APK download in the external browser. */
    fun openDownload(context: Context) {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(APK_DOWNLOAD_URL))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }
}
