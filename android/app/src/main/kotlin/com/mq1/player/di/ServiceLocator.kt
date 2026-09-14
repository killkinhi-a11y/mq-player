package com.mq1.player.di

import android.content.Context
import com.mq1.player.BuildConfig
import com.mq1.player.data.LocalStore
import com.mq1.player.data.SecureCookieJar
import com.mq1.player.data.SocialHub
import com.mq1.player.data.api.MqApi
import com.mq1.player.data.repo.AuthRepository
import com.mq1.player.data.repo.ChatRepository
import com.mq1.player.data.repo.MusicRepository
import com.mq1.player.data.repo.PlaylistRepository
import com.mq1.player.data.repo.SocialRepository
import com.mq1.player.data.repo.WaveRepository
import com.mq1.player.player.PlaybackController
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.serialization.json.Json
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.util.concurrent.TimeUnit

/**
 * Hand-rolled service locator (intentionally no DI framework — the graph is
 * small, fully static, and framework-free keeps the build lean & predictable).
 * Everything is created once in [init]; Android process restarts re-create it.
 */
object ServiceLocator {

    lateinit var appContext: Context
        private set

    val appScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
        explicitNulls = false
    }

    val cookieJar: SecureCookieJar by lazy { SecureCookieJar(appContext) }

    /** Demo-session marker — the backend serves demo group chats via the
     *  x-demo-user-id header (same mechanism the web demo uses). */
    @Volatile var demoUserId: String? = null
    @Volatile var demoUserName: String? = null

    /** Web-parity session-expiry bus: any authenticated API call returning
     *  401 (with a session cookie present, not in demo mode) emits here;
     *  MainActivity logs the user out with an honest message — exactly the
     *  web "сессия истекла" flow. */
    val sessionExpired = kotlinx.coroutines.flow.MutableSharedFlow<Unit>(
        replay = 0, extraBufferCapacity = 1
    )

    val okHttp: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .cookieJar(cookieJar)
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .addInterceptor(Interceptor { chain ->
                // Baseline headers accepted by the backend (parity with web).
                val builder = chain.request().newBuilder()
                    .header("Accept", "application/json")
                    .header("User-Agent", "MQ-Android/${BuildConfig.VERSION_NAME}")
                demoUserId?.let { builder.header("x-demo-user-id", it) }
                demoUserName?.let { builder.header("x-demo-user-name", it) }
                val response = chain.proceed(builder.build())
                // 401 on authenticated endpoints + a held session cookie + a
                // real (non-demo) session ⇒ session expired → honest logout.
                // Demo sessions hold no cookie and EXPECT 401s (web parity:
                // canPollProtected) — they never emit.
                if (response.code == 401 && demoUserId == null &&
                    cookieJar.hasSessionCookie &&
                    !chain.request().url.encodedPath.substringAfter("api/").startsWith("auth/")
                ) {
                    sessionExpired.tryEmit(Unit)
                }
                response
            })
            .apply {
                if (BuildConfig.DEBUG) {
                    // Redacted logging — bodies may contain auth material.
                    val logger = okhttp3.logging.HttpLoggingInterceptor().apply {
                        level = okhttp3.logging.HttpLoggingInterceptor.Level.BASIC
                    }
                    addInterceptor(logger)
                }
            }
            .build()
    }

    val api: MqApi by lazy {
        Retrofit.Builder()
            .baseUrl(BuildConfig.API_BASE.trimEnd('/') + "/")
            .client(okHttp)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(MqApi::class.java)
    }

    val localStore: LocalStore by lazy { LocalStore(appContext) }

    val authRepository: AuthRepository by lazy { AuthRepository(api, localStore) }
    val musicRepository: MusicRepository by lazy { MusicRepository(api, appScope) }
    val waveRepository: WaveRepository by lazy { WaveRepository(api, localStore) }
    val playlistRepository: PlaylistRepository by lazy { PlaylistRepository(api) }
    val socialRepository: SocialRepository by lazy { SocialRepository(api) }
    val chatRepository: ChatRepository by lazy { ChatRepository(api, localStore) }

    /** F9: own profile (account data, avatar/username editing). */
    val profileRepository: com.mq1.player.data.repo.ProfileRepository by lazy {
        com.mq1.player.data.repo.ProfileRepository(api)
    }

    /** F7: friends/requests/unread badges — one shared state holder. */
    val socialHub: SocialHub by lazy { SocialHub(socialRepository, localStore, appScope) }

    val playbackController: PlaybackController by lazy { PlaybackController(appContext) }

    /** F10: mixer DSP + params/meters state + persistence. */
    val mixerEngine: com.mq1.player.mixer.MixerEngine by lazy {
        com.mq1.player.mixer.MixerEngine(appContext, appScope)
    }

    fun init(context: Context) {
        appContext = context.applicationContext
    }
}
