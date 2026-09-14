package com.mq1.player

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.viewmodel.compose.viewModel
import com.mq1.player.di.ServiceLocator
import com.mq1.player.ui.nav.MqAppNavHost
import com.mq1.player.ui.nav.Routes
import com.mq1.player.ui.screens.LoginScreen
import com.mq1.player.ui.screens.OnboardingScreen
import com.mq1.player.ui.theme.LocalMqPalette
import com.mq1.player.ui.theme.MqTypography
import com.mq1.player.ui.theme.currentMqPalette
import com.mq1.player.ui.theme.mqColorScheme
import com.mq1.player.ui.vm.AuthViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    private val notificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* playback works regardless; notification hidden until granted */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        Log.i("MqBoot", "MainActivity.onCreate begin")
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        Log.i("MqBoot", "MainActivity.onCreate — connecting playback service")
        ServiceLocator.playbackController.connect()
        maybeRequestNotificationPermission()
        handleDeepLink(intent)

        setContent {
            RootContent()
        }
        Log.i("MqBoot", "MainActivity.onCreate end — content set")
    }

    override fun onStart() {
        super.onStart()
        // F7: resume social sync (friends/requests/unread badges) in foreground
        ServiceLocator.socialHub.start()
    }

    override fun onStop() {
        super.onStop()
        // Web parity: pause polling while backgrounded (document.hidden)
        ServiceLocator.socialHub.stop()
    }

    /** Warm deep-link delivery (singleTask → existing instance gets onNewIntent). */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleDeepLink(intent)
    }

    /**
     * F11: mqplayer://track|artist|playlist/{id}, App Links
     * https://mq1.vercel.app/track|play, and the legacy mq://player.
     * Cold start AND warm relaunch take the same path: the parsed
     * destination lands in DeepLinkQueue; the NavHost navigates to it as
     * soon as the user is authenticated (Login/Onboarding finish first —
     * the destination is never dropped).
     */
    private fun handleDeepLink(intent: Intent?) {
        val data = intent?.data ?: return
        val link = com.mq1.player.deeplink.DeepLinkParser.parse(data)
        when (link) {
            is com.mq1.player.deeplink.DeepLink.Player ->
                // legacy behavior — direct player open (no auth dependency)
                ServiceLocator.playbackController.requestOpenPlayer()
            is com.mq1.player.deeplink.DeepLink ->
                com.mq1.player.deeplink.DeepLinkQueue.offer(link)
            null -> Unit // unknown link → just bring the app forward
        }
    }

    private fun maybeRequestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED
        ) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
}

@Composable
private fun RootContent() {
    val auth: AuthViewModel = viewModel()
    val appearance by ServiceLocator.localStore.appearance
        .collectAsState(initial = com.mq1.player.data.LocalStore.Appearance())
    val context = androidx.compose.ui.platform.LocalContext.current

    // Web-parity session-expiry handling: a 401 on an authenticated endpoint
    // (session cookie held, not a demo session) logs the user out with the
    // same honest message the web shows ("сессия истекла — войдите снова").
    androidx.compose.runtime.LaunchedEffect(Unit) {
        ServiceLocator.sessionExpired.collect {
            android.widget.Toast.makeText(
                context,
                "Сессия истекла — войдите снова",
                android.widget.Toast.LENGTH_LONG
            ).show()
            auth.logout { }
        }
    }

    val palette = currentMqPalette(appearance.themeId, appearance.darkMode)
    androidx.compose.runtime.CompositionLocalProvider(LocalMqPalette provides palette) {
    MaterialTheme(
        colorScheme = mqColorScheme(appearance.themeId, appearance.darkMode),
        // MQ visual parity: the WHOLE app renders with the web type scale
        // (Manrope 400–800, mq-t-* → MqType). No Material default fonts.
        typography = MqTypography,
    ) {
        Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            when (val state = auth.state.collectAsState().value) {
                AuthViewModel.Ui.Loading -> Unit // splash covers this window
                AuthViewModel.Ui.Login -> {
                    val scope = rememberCoroutineScope()
                    LoginScreen(onLoggedIn = { user ->
                        scope.launch(Dispatchers.IO) {
                            ServiceLocator.localStore.setSessionUser(user)
                        }
                        auth.onLoggedIn(user)
                    })
                }
                AuthViewModel.Ui.Onboarding -> {
                    OnboardingScreen(onDone = { auth.onOnboardingComplete() })
                }
                AuthViewModel.Ui.Main -> {
                    MainEntry(onLogout = { auth.logout { } })
                }
            }
        }
    }
    }
}

@Composable
private fun MainEntry(onLogout: () -> Unit) {
    MqAppNavHost(startDestination = Routes.HOME, onLogout = onLogout)
}
