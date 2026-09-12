package com.mq1.player.di

import android.content.Context
import com.mq1.player.BuildConfig
import com.mq1.player.data.LocalStore
import com.mq1.player.data.SecureCookieJar
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

    val okHttp: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .cookieJar(cookieJar)
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .addInterceptor(Interceptor { chain ->
                // Baseline headers accepted by the backend (parity with web).
                val req = chain.request().newBuilder()
                    .header("Accept", "application/json")
                    .header("User-Agent", "MQ-Android/${BuildConfig.VERSION_NAME}")
                    .build()
                chain.proceed(req)
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

    val playbackController: PlaybackController by lazy { PlaybackController(appContext) }

    fun init(context: Context) {
        appContext = context.applicationContext
    }
}
