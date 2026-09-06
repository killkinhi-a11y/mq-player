package com.mq1.player.data

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import com.mq1.player.data.api.Track

private val Context.dataStore by preferencesDataStore(name = "mq_local_v1")

/**
 * Device-local state, mirroring the web app's localStorage-persisted store:
 * favorites, history, taste genres (onboarding), theme, session user.
 * Favorites/history live locally BY DESIGN — the web client does the same
 * (they are per-device in the product today, not server-synced).
 */
class LocalStore(private val context: Context) {

    private val json = Json { ignoreUnknownKeys = true }

    // ── Session user (cached; the cookie is the source of truth for auth) ───

    data class SessionUser(
        val userId: String = "",
        val username: String = "",
        val role: String = "user",
        val avatar: String? = null
    )

    private object Keys {
        val sessionUser = stringPreferencesKey("session_user")
        val themeId = stringPreferencesKey("theme_id")
        val darkMode = stringPreferencesKey("dark_mode") // system | light | dark
        val onboardingComplete = booleanPreferencesKey("onboarding_complete")
        val tasteGenres = stringSetPreferencesKey("taste_genres")
        val favorites = stringPreferencesKey("favorite_tracks")
        val history = stringPreferencesKey("history_tracks")
        val likedScIds = stringSetPreferencesKey("liked_sc_ids")
    }

    val sessionUser: Flow<SessionUser?> = context.dataStore.data.map { p ->
        p[Keys.sessionUser]?.let { runCatching { json.decodeFromString<SessionUser>(it) }.getOrNull() }
    }

    suspend fun setSessionUser(user: SessionUser?) {
        context.dataStore.edit { p ->
            if (user == null) p.remove(Keys.sessionUser)
            else p[Keys.sessionUser] = json.encodeToString(user)
        }
    }

    // ── Theme / appearance ──────────────────────────────────────────────────

    data class Appearance(
        val themeId: String = "default",
        val darkMode: String = "system" // system | light | dark
    )

    val appearance: Flow<Appearance> = context.dataStore.data.map { p ->
        Appearance(
            themeId = p[Keys.themeId] ?: "default",
            darkMode = p[Keys.darkMode] ?: "system"
        )
    }

    suspend fun setThemeId(id: String) {
        context.dataStore.edit { it[Keys.themeId] = id }
    }

    suspend fun setDarkMode(mode: String) {
        context.dataStore.edit { it[Keys.darkMode] = mode }
    }

    // ── Onboarding / taste ──────────────────────────────────────────────────

    val onboardingComplete: Flow<Boolean> =
        context.dataStore.data.map { it[Keys.onboardingComplete] ?: false }

    val tasteGenres: Flow<Set<String>> =
        context.dataStore.data.map { it[Keys.tasteGenres] ?: emptySet() }

    suspend fun setTasteGenres(genres: Set<String>) {
        context.dataStore.edit { p ->
            p[Keys.tasteGenres] = genres
            if (genres.isNotEmpty()) p[Keys.onboardingComplete] = true
        }
    }

    suspend fun setOnboardingComplete(complete: Boolean) {
        context.dataStore.edit { it[Keys.onboardingComplete] = complete }
    }

    // ── Favorites (local, parity with web) ──────────────────────────────────

    val favorites: Flow<List<Track>> = context.dataStore.data.map { p ->
        p[Keys.favorites]?.let { runCatching { json.decodeFromString<List<Track>>(it) }.getOrNull() } ?: emptyList()
    }

    suspend fun toggleFavorite(track: Track): Boolean {
        var added = false
        context.dataStore.edit { p ->
            val current = p[Keys.favorites]?.let {
                runCatching { json.decodeFromString<List<Track>>(it) }.getOrNull()
            } ?: emptyList()
            val next = if (current.any { it.id == track.id }) {
                current.filterNot { it.id == track.id }
            } else {
                added = true
                (listOf(track) + current).take(500)
            }
            p[Keys.favorites] = json.encodeToString(next)
            val ids = p[Keys.likedScIds] ?: emptySet()
            p[Keys.likedScIds] = if (added) ids + (track.scTrackId?.toString() ?: track.id)
                                 else ids - (track.scTrackId?.toString() ?: track.id)
        }
        return added
    }

    suspend fun isFavorite(trackId: String): Boolean =
        favorites.first().any { it.id == trackId }

    // ── History (local, parity with web) ────────────────────────────────────

    val history: Flow<List<Track>> = context.dataStore.data.map { p ->
        p[Keys.history]?.let { runCatching { json.decodeFromString<List<Track>>(it) }.getOrNull() } ?: emptyList()
    }

    suspend fun pushHistory(track: Track) {
        context.dataStore.edit { p ->
            val current = p[Keys.history]?.let {
                runCatching { json.decodeFromString<List<Track>>(it) }.getOrNull()
            } ?: emptyList()
            val next = (listOf(track) + current.filterNot { it.id == track.id }).take(200)
            p[Keys.history] = json.encodeToString(next)
            // historyScIds drive Wave diversity — track separately
            val histIds = p[stringSetPreferencesKey("history_sc_ids")] ?: emptySet()
            p[stringSetPreferencesKey("history_sc_ids")] = histIds + (track.scTrackId?.toString() ?: track.id)
        }
    }

    val historyScIds: Flow<Set<String>> =
        context.dataStore.data.map { it[stringSetPreferencesKey("history_sc_ids")] ?: emptySet() }

    val likedScIds: Flow<Set<String>> =
        context.dataStore.data.map { it[Keys.likedScIds] ?: emptySet() }

    // ── Full logout wipe ────────────────────────────────────────────────────

    suspend fun wipe() {
        context.dataStore.edit { it.clear() }
    }
}
