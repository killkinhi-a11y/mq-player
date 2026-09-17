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
import com.mq1.player.data.api.Friend
import com.mq1.player.data.api.OutgoingRequest
import com.mq1.player.data.api.PendingRequest
import com.mq1.player.data.api.PlaylistDto
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

    /**
     * @Serializable is LOAD-BEARING: without the compile-time plugin
     * serializer, Json.encodeToString falls back to runtime reflection
     * (noCompiledSerializer) which THROWS `SerializationException: Serializer
     * for class 'SessionUser' is not found` — an unhandled coroutine
     * exception that crashed the app on EVERY login (Demo/Email/Telegram)
     * the moment the session was persisted.
     */
    @kotlinx.serialization.Serializable
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
        // Web-parity library lists (FavoritesView «Не понравившиеся» / «Подписки»)
        val disliked = stringPreferencesKey("disliked_tracks")
        val dislikedScIds = stringSetPreferencesKey("disliked_sc_ids")
        val favoriteArtists = stringSetPreferencesKey("favorite_artists")
        // Web parity: recent searches persist in localStorage (max 15)
        val recentSearches = stringPreferencesKey("recent_searches")
        // F7: social snapshot — instant render after process restart, then re-sync
        val socialSnapshot = stringPreferencesKey("social_snapshot_v1")
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

    // ── Disliked tracks (web FavoritesView «Не понравившиеся») ────────────

    val disliked: Flow<List<Track>> = context.dataStore.data.map { p ->
        p[Keys.disliked]?.let { runCatching { json.decodeFromString<List<Track>>(it) }.getOrNull() } ?: emptyList()
    }

    /** @return true when the track became disliked (web addDislike semantics). */
    suspend fun toggleDisliked(track: Track): Boolean {
        var added = false
        context.dataStore.edit { p ->
            val current = p[Keys.disliked]?.let {
                runCatching { json.decodeFromString<List<Track>>(it) }.getOrNull()
            } ?: emptyList()
            val key = track.scTrackId?.toString() ?: track.id
            val next = if (current.any { it.id == track.id }) {
                current.filterNot { it.id == track.id }
            } else {
                added = true
                (listOf(track) + current).take(100) // web cap
            }
            p[Keys.disliked] = json.encodeToString(next)
            val ids = p[Keys.dislikedScIds] ?: emptySet()
            p[Keys.dislikedScIds] = if (added) ids + key else ids - key
            // A track cannot be liked AND disliked at once (web parity).
            if (added) {
                val favs = p[Keys.favorites]?.let {
                    runCatching { json.decodeFromString<List<Track>>(it) }.getOrNull()
                } ?: emptyList()
                if (favs.any { it.id == track.id }) {
                    p[Keys.favorites] = json.encodeToString(favs.filterNot { it.id == track.id })
                    p[Keys.likedScIds] = (p[Keys.likedScIds] ?: emptySet()) - key
                }
            }
        }
        return added
    }

    val dislikedScIds: Flow<Set<String>> =
        context.dataStore.data.map { it[Keys.dislikedScIds] ?: emptySet() }

    // ── Favorite artists / subscriptions (web «Подписки» + store sync) ────

    val favoriteArtists: Flow<List<String>> = context.dataStore.data.map { p ->
        (p[Keys.favoriteArtists] ?: emptySet()).toList()
    }

    /** @return true when subscribed (web addFavoriteArtist semantics). */
    suspend fun toggleFavoriteArtist(artist: String): Boolean {
        var added = false
        context.dataStore.edit { p ->
            val current = p[Keys.favoriteArtists] ?: emptySet()
            added = artist !in current
            p[Keys.favoriteArtists] = if (added) current + artist else current - artist
        }
        return added
    }

    // ── Recent searches (web localStorage "mq-search-history", max 15) ────

    val recentSearches: Flow<List<String>> = context.dataStore.data.map { p ->
        p[Keys.recentSearches]?.let { runCatching { json.decodeFromString<List<String>>(it) }.getOrNull() } ?: emptyList()
    }

    suspend fun pushRecentSearch(query: String) {
        val q = query.trim()
        if (q.isEmpty()) return
        context.dataStore.edit { p ->
            val current = p[Keys.recentSearches]?.let {
                runCatching { json.decodeFromString<List<String>>(it) }.getOrNull()
            } ?: emptyList()
            p[Keys.recentSearches] = json.encodeToString((listOf(q) + current.filterNot { it.equals(q, ignoreCase = true) }).take(15))
        }
    }

    suspend fun removeRecentSearch(query: String) {
        context.dataStore.edit { p ->
            val current = p[Keys.recentSearches]?.let {
                runCatching { json.decodeFromString<List<String>>(it) }.getOrNull()
            } ?: emptyList()
            p[Keys.recentSearches] = json.encodeToString(current.filterNot { it.equals(query, ignoreCase = true) })
        }
    }

    suspend fun clearRecentSearches() {
        context.dataStore.edit { it.remove(Keys.recentSearches) }
    }

    // ── Demo-local playlists (web demo parity: zustand-local playlists) ────

    private val demoPlaylistKey = stringPreferencesKey("demo_playlists")

    val demoPlaylists: Flow<List<PlaylistDto>> = context.dataStore.data.map { p ->
        p[demoPlaylistKey]?.let {
            runCatching { json.decodeFromString<List<PlaylistDto>>(it) }.getOrNull()
        } ?: emptyList()
    }

    suspend fun setDemoPlaylists(list: List<PlaylistDto>) {
        context.dataStore.edit { p ->
            if (list.isEmpty()) p.remove(demoPlaylistKey)
            else p[demoPlaylistKey] = json.encodeToString(list)
        }
    }

    // ── History (local, parity with web) ────────────────────────────────────

    val history: Flow<List<Track>> = context.dataStore.data.map { p ->
        p[Keys.history]?.let { runCatching { json.decodeFromString<List<Track>>(it) }.getOrNull() } ?: emptyList()
    }

    // UX pass 2.3.4: per-entry playedAt timestamps, index-aligned with
    // [history] (web parity — the web store keeps {track, playedAt} and its
    // «Сегодня» stat filters playedAt >= start of today). Older installs
    // without the key degrade to 0L (epoch) — counted as "not today".
    private val historyPlayedAtKey = stringPreferencesKey("history_played_at")

    val historyPlayedAt: Flow<List<Long>> = context.dataStore.data.map { p ->
        p[historyPlayedAtKey]?.let {
            runCatching { json.decodeFromString<List<Long>>(it) }.getOrNull()
        } ?: emptyList()
    }

    suspend fun pushHistory(track: Track) {
        context.dataStore.edit { p ->
            val current = p[Keys.history]?.let {
                runCatching { json.decodeFromString<List<Track>>(it) }.getOrNull()
            } ?: emptyList()
            val playedAt = p[historyPlayedAtKey]?.let {
                runCatching { json.decodeFromString<List<Long>>(it) }.getOrNull()
            } ?: List(current.size) { 0L }
            val tsById = current.indices.associate { i -> current[i].id to playedAt.getOrElse(i) { 0L } }
            val kept = current.filterNot { it.id == track.id }
            val next = (listOf(track) + kept).take(200)
            val nextPlayedAt = (listOf(System.currentTimeMillis()) +
                kept.map { tsById[it.id] ?: 0L }).take(next.size)
            p[Keys.history] = json.encodeToString(next)
            p[historyPlayedAtKey] = json.encodeToString(nextPlayedAt)
            // historyScIds drive Wave diversity — track separately
            val histIds = p[stringSetPreferencesKey("history_sc_ids")] ?: emptySet()
            p[stringSetPreferencesKey("history_sc_ids")] = histIds + (track.scTrackId?.toString() ?: track.id)
        }
    }

    /** Web HistoryView «Очистить историю» — wipes the list, ids and times. */
    suspend fun clearHistory() {
        context.dataStore.edit { p ->
            p.remove(Keys.history)
            p.remove(historyPlayedAtKey)
            p.remove(stringSetPreferencesKey("history_sc_ids"))
        }
    }

    val historyScIds: Flow<Set<String>> =
        context.dataStore.data.map { it[stringSetPreferencesKey("history_sc_ids")] ?: emptySet() }

    val likedScIds: Flow<Set<String>> =
        context.dataStore.data.map { it[Keys.likedScIds] ?: emptySet() }

    // ── Social snapshot (F7: friends + requests + unread, survives restart) ─

    /** Persisted social state (online presence is deliberately NOT persisted). */
    @kotlinx.serialization.Serializable
    data class SocialSnapshot(
        val friends: List<Friend> = emptyList(),
        val incoming: List<PendingRequest> = emptyList(),
        val outgoing: List<OutgoingRequest> = emptyList(),
        val unreadCounts: Map<String, Int> = emptyMap(),
        val lastMessageId: String? = null
    )

    val socialSnapshot: Flow<SocialSnapshot?> = context.dataStore.data.map { p ->
        p[Keys.socialSnapshot]?.let { runCatching { json.decodeFromString<SocialSnapshot>(it) }.getOrNull() }
    }

    suspend fun setSocialSnapshot(snapshot: SocialSnapshot?) {
        context.dataStore.edit { p ->
            if (snapshot == null) p.remove(Keys.socialSnapshot)
            else p[Keys.socialSnapshot] = json.encodeToString(snapshot)
        }
    }

    // ── Full logout wipe ────────────────────────────────────────────────────

    suspend fun wipe() {
        context.dataStore.edit { it.clear() }
    }
}
