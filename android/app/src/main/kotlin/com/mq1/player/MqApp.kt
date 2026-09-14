package com.mq1.player

import android.app.Application
import android.util.Log
import com.mq1.player.di.ServiceLocator

class MqApp : Application() {
    override fun onCreate() {
        super.onCreate()
        // HOTFIX 2.3.1: crash diagnostics FIRST — every uncaught exception on
        // ANY thread is logged (MqCrash tag) + persisted to files/crash/, then
        // re-thrown to the platform handler. The app still crashes — nothing
        // is masked; the trace becomes retrievable.
        CrashDiagnostics.install(this)
        Log.i("MqBoot", "Application.onCreate — service locator init")
        ServiceLocator.init(this)
        // NOTE: the MediaController connection intentionally happens in
        // MainActivity.onCreate (not here): process-start binding breaks under
        // Robolectric UI tests and costs cold-start time before first frame.
    }
}
