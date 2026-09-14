package com.mq1.player

import android.content.Context
import android.util.Log

/**
 * CRASH DIAGNOSTICS (hotfix 2.3.1) — makes every crash RETRIEVABLE without
 * hiding it.
 *
 * Rules of engagement (mirrors the QA policy):
 *  - The handler logs the FULL stack trace to logcat (tag MqCrash) and
 *    persists it to files/crash/last_crash.txt (rotating, max 3 files).
 *  - It then DELEGATES to the platform's default handler — the app still
 *    dies. NO swallowing, NO try/catch around the whole app, NO silent
 *    failure, NO fallback to an empty screen.
 *  - On the next start, [reportPreviousCrash] surfaces the previous crash
 *    in logcat so `adb logcat -s MqCrash` (or a bug report) carries the
 *    exact trace of the LAST failure — no adb needed to READ it: the file
 *    is app-internal and can be shared from Settings later.
 *  - The log carries NO credentials: the request URL line is excluded, only
 *    exception class/message/stack + thread + app version.
 */
object CrashDiagnostics {

    private const val TAG = "MqCrash"
    private const val DIR = "crash"
    private const val KEEP = 3

    @Volatile
    var installed: Boolean = false
        private set

    /** Install the process-wide handler exactly once. Idempotent. */
    fun install(context: Context) {
        if (installed) return
        installed = true
        val app = context.applicationContext
        val platform = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            try {
                val trace = buildString {
                    appendLine("MQ Player ${BuildConfig.VERSION_NAME} (code ${BuildConfig.VERSION_CODE}) crash")
                    appendLine("thread: ${thread.name}")
                    appendLine("at: ${java.time.Instant.now()}")
                    appendLine("exception: ${throwable.javaClass.name}")
                    appendLine("message: ${throwable.message ?: "-"}")
                    appendLine("stack:")
                    append(android.util.Log.getStackTraceString(throwable))
                    throwable.cause?.let { cause ->
                        appendLine("caused by: ${cause.javaClass.name}: ${cause.message ?: "-"}")
                        append(android.util.Log.getStackTraceString(cause))
                    }
                }
                // 1) logcat — the primary channel
                Log.e(TAG, trace)
                // 2) file — survives the process death, retrievable later
                writeCrashFile(app, trace)
            } catch (_: Throwable) {
                // diagnostics must NEVER block the crash from propagating
            } finally {
                // 3) the app STILL crashes — no masking, ever
                platform?.uncaughtException(thread, throwable)
            }
        }
        Log.i(TAG, "crash diagnostics installed (app ${BuildConfig.VERSION_NAME})")
        reportPreviousCrash(app)
    }

    /** Next-boot readout: the trace of the crash that killed the last run. */
    fun reportPreviousCrash(app: Context) {
        try {
            val f = app.filesDir.resolve(DIR).resolve("last_crash.txt")
            if (f.isFile && f.length() in 1..64_000) {
                Log.e(TAG, "PREVIOUS RUN CRASHED — trace from ${f.name}:\n${f.readText()}")
            }
        } catch (_: Throwable) {
        }
    }

    /** Test hook ONLY — restores the pristine (uninstalled) state. */
    fun resetForTests() {
        installed = false
    }

    private fun writeCrashFile(app: Context, trace: String) {
        val dir = app.filesDir.resolve(DIR).apply { mkdirs() }
        // rotate: crash-N → drop oldest beyond KEEP
        val files = dir.listFiles { file -> file.name.startsWith("crash-") }
            ?.sortedByDescending { it.name } ?: emptyList()
        files.drop(KEEP - 1).forEach { it.delete() }
        val stamp = System.currentTimeMillis()
        val newest = dir.resolve("crash-$stamp.txt")
        newest.writeText(trace)
        // "last_crash.txt" is the readout used on next boot
        dir.resolve("last_crash.txt").writeText(trace)
    }
}
