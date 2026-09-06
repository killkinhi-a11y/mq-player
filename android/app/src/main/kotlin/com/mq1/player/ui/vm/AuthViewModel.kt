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

    fun restore() {
        viewModelScope.launch {
            _state.value = when (auth.restoreSession()) {
                is AuthRepository.AuthState.LoggedIn -> {
                    val onboarded = local.onboardingComplete.firstOrNull() ?: false
                    if (onboarded) Ui.Main else Ui.Onboarding
                }
                else -> Ui.Login
            }
        }
    }

    fun onLoggedIn(user: LocalStore.SessionUser) {
        viewModelScope.launch {
            val onboarded = local.onboardingComplete.firstOrNull() ?: false
            _state.value = if (onboarded) Ui.Main else Ui.Onboarding
        }
    }

    fun onOnboardingComplete() {
        _state.value = Ui.Main
    }

    fun logout(onDone: () -> Unit) {
        viewModelScope.launch {
            ServiceLocator.playbackController.stop()
            auth.logout()
            _state.value = Ui.Login
            onDone()
        }
    }
}
