package com.mq1.player

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
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
import com.mq1.player.ui.theme.mqColorScheme
import com.mq1.player.ui.vm.AuthViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    private val notificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* playback works regardless; notification hidden until granted */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        ServiceLocator.playbackController.connect()
        maybeRequestNotificationPermission()

        setContent {
            RootContent()
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

    MaterialTheme(
        colorScheme = mqColorScheme(appearance.themeId, appearance.darkMode)
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

@Composable
private fun MainEntry(onLogout: () -> Unit) {
    MqAppNavHost(startDestination = Routes.HOME, onLogout = onLogout)
}
