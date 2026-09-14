package com.mq1.player.ui.vm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mq1.player.data.LocalStore
import com.mq1.player.data.api.Track
import com.mq1.player.data.repo.AuthRepository
import com.mq1.player.di.ServiceLocator
import com.mq1.player.player.PlaybackController
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** Auth + session state — drives Login vs Onboarding vs Main routing. */
class AuthViewModel : ViewModel() {
    private val auth: AuthRepository = ServiceLocator.authRepository
    private val local: LocalStore = ServiceLocator.localStore

    companion object {
        /** Web-parity demo sentinel (useAppStore: userId === "demo-user-id"). */
        const val DEMO_USER_ID = "demo-user-id"
    }

    sealed interface Ui {
        data object Loading : Ui
        data object Login : Ui
        data object Onboarding : Ui
        data object Main : Ui
    }

    private val _state = MutableStateFlow<Ui>(Ui.Loading)
    val state: StateFlow<Ui> = _state

    val sessionUser: StateFlow<LocalStore.SessionUser?> =
        local.sessionUser.stateIn(viewModelScope, SharingStarted.Eagerly, null)

    init { restore() }

    /** Demo header gate (group chats API serves demo data via x-demo-user-id). */
    private fun applyDemoHeaders(user: LocalStore.SessionUser?) {
        if (user != null && user.userId == DEMO_USER_ID) {
            ServiceLocator.demoUserId = user.userId
            ServiceLocator.demoUserName = user.username.ifBlank { "Демо" }
        } else {
            ServiceLocator.demoUserId = null
            ServiceLocator.demoUserName = null
        }
    }

    fun restore() {
        viewModelScope.launch {
            _state.value = when (auth.restoreSession()) {
                is AuthRepository.AuthState.LoggedIn -> {
                    applyDemoHeaders(local.sessionUser.firstOrNull())
                    val onboarded = local.onboardingComplete.firstOrNull() ?: false
                    if (onboarded) Ui.Main else Ui.Onboarding
                }
                else -> Ui.Login
            }
        }
    }

    fun onLoggedIn(user: LocalStore.SessionUser) {
        applyDemoHeaders(user)
        ServiceLocator.socialHub.start()
        viewModelScope.launch {
            // Web parity (useAppStore.setAuth): demo sessions are local-only —
            // no server round-trips, onboarding marked complete, straight to Main.
            if (user.userId == DEMO_USER_ID) {
                local.setOnboardingComplete(true)
                _state.value = Ui.Main
                return@launch
            }
            val onboarded = local.onboardingComplete.firstOrNull() ?: false
            _state.value = if (onboarded) Ui.Main else Ui.Onboarding
        }
    }

    fun onOnboardingComplete() {
        _state.value = Ui.Main
    }

    fun logout(onDone: () -> Unit) {
        viewModelScope.launch {
            applyDemoHeaders(null)
            ServiceLocator.playbackController.stop()
            ServiceLocator.socialHub.clear()
            auth.logout()
            _state.value = Ui.Login
            onDone()
        }
    }
}
