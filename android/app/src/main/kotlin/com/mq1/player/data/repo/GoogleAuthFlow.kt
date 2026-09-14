package com.mq1.player.data.repo

import android.content.Context
import android.util.Log
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.GetCredentialProviderConfigurationException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * GOOGLE NATIVE LOGIN — the runtime flow, isolated for testability.
 *
 * Implements the CURRENT official Android Credential Manager sequence:
 *
 *   1st request  GetGoogleIdOption
 *                  .setFilterByAuthorizedAccounts(true)   ← library default
 *                  .setAutoSelectEnabled(true)            ← one-tap for returning users
 *                  .setServerClientId(WEB_CLIENT_ID)
 *                  .setNonce(one-time nonce from backend)
 *
 *   NoCredentialException  →  2nd request (THE fallback the old code lacked):
 *                  .setFilterByAuthorizedAccounts(false)  ← ALL device accounts
 *                  .setServerClientId(WEB_CLIENT_ID)      ← nonce reused: it is
 *                  .setNonce(same nonce)                     still unspent — the
 *                                                            token is issued once
 *
 * NoCredentialException on the FIRST pass does NOT mean "no Google account on
 * the device" — it means "no account previously authorized with THIS app".
 * Showing a "Google-аккаунт не найден" error there (the 2.3.0 behavior) made
 * first-time login impossible for every user. This class fixes that.
 *
 * Everything that can fail is mapped to a distinct [GoogleAuthResult] with its
 * own user-facing message and diagnostic log tag — no fake success, no
 * swallowed errors, cancellation is NOT an error.
 */
object GoogleAuthFlow {

    /** Credential source — the real one wraps Credential Manager; tests inject fakes. */
    interface GoogleCredentialSource {
        /**
         * @param filterByAuthorizedAccounts true = only accounts previously used
         *        with this app; false = every Google account on the device.
         * @param autoSelectEnabled one-tap auto-sign-in for a single returning user.
         * @return the id_token issued by Google, or null (see exceptions).
         */
        @Throws(
            GetCredentialCancellationException::class,
            NoCredentialException::class,
            GetCredentialProviderConfigurationException::class,
            GetCredentialException::class
        )
        suspend fun fetchGoogleIdToken(
            activityContext: Context,
            serverClientId: String,
            nonce: String,
            filterByAuthorizedAccounts: Boolean,
            autoSelectEnabled: Boolean
        ): String?
    }

    /** Real device implementation — Credential Manager → Google ID token. */
    class CredentialManagerSource : GoogleCredentialSource {

        override suspend fun fetchGoogleIdToken(
            activityContext: Context,
            serverClientId: String,
            nonce: String,
            filterByAuthorizedAccounts: Boolean,
            autoSelectEnabled: Boolean
        ): String? = withContext(Dispatchers.Main) {
            val option = GetGoogleIdOption.Builder()
                .setFilterByAuthorizedAccounts(filterByAuthorizedAccounts)
                .setAutoSelectEnabled(autoSelectEnabled)
                .setServerClientId(serverClientId)
                .setNonce(nonce)
                .build()
            val request = GetCredentialRequest.Builder()
                .addCredentialOption(option)
                .build()
            // CredentialManager.create() accepts the Activity context — the
            // system account-picker UI is launched from it. The context must
            // stay alive across the await: LoginScreen keeps it in composition
            // for the whole flow (singleTask activity, configChanges handled).
            val credentialManager = CredentialManager.create(activityContext)
            val response = credentialManager.getCredential(activityContext, request)
            if (response.credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                Log.w(
                    "MqAuth",
                    "provider=google step=credential_manager status=unexpected_type " +
                        "type=${response.credential.type}"
                )
                return@withContext null
            }
            // Parsing is a SEPARATE failure mode from the token being absent —
            // GoogleIdTokenParsingException has its own message below.
            try {
                GoogleIdTokenCredential.createFrom(response.credential.data).idToken
            } catch (e: GoogleIdTokenParsingException) {
                Log.w(
                    "MqAuth",
                    "provider=google step=credential_parse status=malformed class=${e.javaClass.simpleName}"
                )
                null
            }
        }
    }

    /** Every distinct outcome of the Google flow — one message per failure mode. */
    sealed interface GoogleAuthResult {
        /** id_token obtained — caller MUST still POST it to the backend. */
        data class TokenObtained(val idToken: String, val viaFallbackPicker: Boolean) : GoogleAuthResult

        /** The user closed the Google account picker. NOT an error — no message. */
        data object CancelledByUser : GoogleAuthResult

        /** Server has no Google login configured / client id unavailable. */
        data class NotConfigured(val message: String = "Google вход не настроен на сервере") : GoogleAuthResult

        /** Transport problem reaching the nonce endpoint. */
        data class NetworkError(val message: String = "Сеть недоступна. Проверьте подключение.") : GoogleAuthResult

        /** Both Credential Manager passes ran and no account was picked. */
        data class NoAccountPicked(val message: String = "Аккаунт не выбран. Попробуйте ещё раз.") : GoogleAuthResult

        /** The returned credential could not be parsed into an id_token. */
        data class TokenParseFailed(val message: String = "Не удалось прочитать Google-токен. Попробуйте ещё раз.") : GoogleAuthResult

        /** Play Services / Credential Manager unavailable on the device. */
        data class ProviderUnavailable(val message: String = "Google Play Services недоступен на устройстве") : GoogleAuthResult

        /** Any other Credential Manager failure (both passes). */
        data class CredentialManagerError(val message: String = "Google вход не выполнен. Попробуйте ещё раз.") : GoogleAuthResult

        /** Backend rejected the token — reason carried verbatim. */
        data class BackendRejected(val backendError: String?, val httpStatus: Int?) : GoogleAuthResult

        /** Transport failure POSTing the token. */
        data class BackendUnreachable(val message: String = "Сервер недоступен. Проверьте подключение.") : GoogleAuthResult

        /** Backend accepted → session cookie landed → session user resolved. */
        data class Success(val user: com.mq1.player.data.LocalStore.SessionUser) : GoogleAuthResult
    }

    /**
     * Runs the full chain: providers → nonce → credential (2 passes) → backend.
     * Pure orchestration — every side effect goes through [source]/[auth] so the
     * whole machine is unit-testable end-to-end.
     */
    suspend fun login(
        activityContext: Context,
        auth: AuthRepository,
        source: GoogleCredentialSource = CredentialManagerSource()
    ): GoogleAuthResult {
        // 1. Web client id — the PUBLIC one the backend verifies `aud` against.
        val clientId = auth.googleClientId()
            ?: return GoogleAuthResult.NotConfigured()

        // 2. One-time nonce (HttpOnly cookie captured by SecureCookieJar).
        val nonce = auth.issueGoogleNativeNonce()
            ?: return GoogleAuthResult.NetworkError()

        // 3. Credential Manager — pass 1: authorized accounts + auto-select.
        var idToken: String? = null
        var viaFallback = false
        try {
            idToken = source.fetchGoogleIdToken(
                activityContext, clientId, nonce,
                filterByAuthorizedAccounts = true,
                autoSelectEnabled = true
            )
            if (idToken == null) return GoogleAuthResult.TokenParseFailed()
        } catch (e: GetCredentialCancellationException) {
            Log.d("MqAuth", "provider=google step=credential_manager status=cancelled pass=1")
            return GoogleAuthResult.CancelledByUser
        } catch (e: NoCredentialException) {
            // ⚠ THE fix: NoCredentialException means "no account previously
            // authorized with THIS app" — NOT "no Google account on the
            // device". Retry with every device account (account picker).
            Log.d(
                "MqAuth",
                "provider=google step=credential_manager status=no_authorized_account pass=1 " +
                    "class=${e.javaClass.simpleName} action=fallback_all_accounts"
            )
        } catch (e: GetCredentialProviderConfigurationException) {
            Log.w(
                "MqAuth",
                "provider=google step=credential_manager status=provider_unavailable " +
                    "class=${e.javaClass.simpleName}"
            )
            return GoogleAuthResult.ProviderUnavailable()
        } catch (e: GetCredentialException) {
            Log.w(
                "MqAuth",
                "provider=google step=credential_manager status=error pass=1 " +
                    "type=${e.type} class=${e.javaClass.simpleName}"
            )
            return GoogleAuthResult.CredentialManagerError()
        }

        // 4. Pass 2 — the account picker over ALL Google accounts.
        if (idToken == null) {
            try {
                idToken = source.fetchGoogleIdToken(
                    activityContext, clientId, nonce,
                    filterByAuthorizedAccounts = false,
                    autoSelectEnabled = false
                )
                if (idToken == null) return GoogleAuthResult.TokenParseFailed()
                viaFallback = true
                Log.d("MqAuth", "provider=google step=credential_manager status=token_obtained pass=2 picker=all_accounts")
            } catch (e: GetCredentialCancellationException) {
                Log.d("MqAuth", "provider=google step=credential_manager status=cancelled pass=2")
                return GoogleAuthResult.CancelledByUser
            } catch (e: NoCredentialException) {
                // Now it IS real: no Google account exists on the device.
                Log.w(
                    "MqAuth",
                    "provider=google step=credential_manager status=no_credentials pass=2 " +
                        "class=${e.javaClass.simpleName}"
                )
                return GoogleAuthResult.NoAccountPicked(
                    "Google-аккаунт не найден на устройстве. Добавьте аккаунт в настройках и повторите."
                )
            } catch (e: GetCredentialProviderConfigurationException) {
                Log.w(
                    "MqAuth",
                    "provider=google step=credential_manager status=provider_unavailable pass=2 " +
                        "class=${e.javaClass.simpleName}"
                )
                return GoogleAuthResult.ProviderUnavailable()
            } catch (e: GetCredentialException) {
                Log.w(
                    "MqAuth",
                    "provider=google step=credential_manager status=error pass=2 " +
                        "type=${e.type} class=${e.javaClass.simpleName}"
                )
                return GoogleAuthResult.CredentialManagerError()
            }
        }

        // 5. Token → backend → session (the web-identical verification chain).
        val response = auth.googleNativeLogin(idToken!!)
            ?: return GoogleAuthResult.BackendUnreachable()
        if (response.error != null || !response.authenticated || response.userId == null) {
            Log.w(
                "MqAuth",
                "provider=google step=native_login status=rejected " +
                    "error=${response.error}"
            )
            return GoogleAuthResult.BackendRejected(response.error, null)
        }
        return GoogleAuthResult.Success(
            com.mq1.player.data.LocalStore.SessionUser(
                userId = response.userId ?: "",
                username = response.username ?: "Google user",
                role = response.role ?: "user",
                avatar = response.avatar
            )
        )
    }
}
