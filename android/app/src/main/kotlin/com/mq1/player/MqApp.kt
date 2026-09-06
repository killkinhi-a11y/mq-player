package com.mq1.player

import android.app.Application
import com.mq1.player.di.ServiceLocator

class MqApp : Application() {
    override fun onCreate() {
        super.onCreate()
        ServiceLocator.init(this)
        // NOTE: the MediaController connection intentionally happens in
        // MainActivity.onCreate (not here): process-start binding breaks under
        // Robolectric UI tests and costs cold-start time before first frame.
    }
}
