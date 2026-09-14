package com.mq1.player.data.repo

import com.mq1.player.data.api.MqApi
import com.mq1.player.data.api.PlaylistDto
import com.mq1.player.data.api.PlaylistMutationBody
import com.mq1.player.data.api.Track
import com.mq1.player.di.ServiceLocator
import kotlinx.coroutines.flow.first

/**
 * Playlist repository with TWO honest modes (web parity):
 *
 *  REAL session  →  server API (`/api/playlists`), same as the web client.
 *  DEMO session  →  device-local playlists in DataStore. The WEB demo also
 *                   keeps playlists purely in the client store (zustand
 *                   localStorage) — demo users have no server rows. Local
 *                   demo playlists behave identically to server ones for
 *                   every repository operation.
 *
 * P0 fix: failures now SURFACE. The old version collapsed every error into
 * emptyList()/null, so a broken session looked exactly like "no playlists".
 * Methods that matter to the Library UI return Result and the ViewModel
 * maps failures to an honest error state.
 */
class PlaylistRepository(private val api: MqApi) {

    private suspend fun isDemo(): Boolean =
        ServiceLocator.localStore.sessionUser.first()?.userId == "demo-user-id"

    // ── Demo-local playlist storage (delegated to LocalStore) ───────────

    private suspend fun readDemo(): List<PlaylistDto> =
        ServiceLocator.localStore.demoPlaylists.first()

    private suspend fun writeDemo(list: List<PlaylistDto>) {
        ServiceLocator.localStore.setDemoPlaylists(list)
    }

    private fun nextDemoId(existing: List<PlaylistDto>): String =
        "demo-pl-" + ((existing.maxOfOrNull { it.id.removePrefix("demo-pl-").toIntOrNull() ?: 0 } ?: 0) + 1)

    // ── Public API ───────────────────────────────────────────────────────────

    suspend fun myPlaylists(): Result<List<PlaylistDto>> =
        if (isDemo()) {
            Result.success(readDemo().sortedByDescending { it.createdAt })
        } else {
            runCatching { api.playlists(myOnly = true, limit = 100).playlists }
        }

    suspend fun publicPlaylists(search: String? = null): List<PlaylistDto> =
        if (isDemo()) {
            // demo has no access to the public feed — honest empty (web demo
            // shows the user's own local playlists on the home rail instead)
            emptyList()
        } else {
            runCatching { api.playlists(search = search?.takeIf { it.isNotBlank() }, limit = 100).playlists }
                .getOrElse { emptyList() }
        }

    suspend fun playlist(id: String): PlaylistDto? =
        if (isDemo()) readDemo().firstOrNull { it.id == id }
        else runCatching { api.playlists(search = null).playlists.firstOrNull { it.id == id } }.getOrNull()

    /** F11: deep links need ARBITRARY playlist ids (not only listed ones). */
    suspend fun playlistById(id: String): PlaylistDto? =
        if (isDemo()) playlist(id)
        else runCatching { api.playlistById(id).body()?.playlist }.getOrNull()

    suspend fun create(name: String, description: String = "", isPublic: Boolean = true): Result<PlaylistDto> =
        if (isDemo()) {
            val current = readDemo()
            val now = java.time.Instant.now().toString()
            val pl = PlaylistDto(
                id = nextDemoId(current),
                userId = "demo-user-id",
                username = "Демо",
                name = name,
                description = description,
                isPublic = isPublic,
                createdAt = now,
                updatedAt = now
            )
            writeDemo(current + pl)
            Result.success(pl)
        } else {
            runCatching {
                api.createPlaylist(PlaylistMutationBody(name = name, description = description, isPublic = isPublic))
                    .body() ?: error("Сервер отклонил создание плейлиста")
            }
        }

    suspend fun updateTracks(id: String, playlist: PlaylistDto, tracks: List<Track>): Result<PlaylistDto> =
        if (isDemo()) {
            val current = readDemo()
            val updated = playlist.copy(tracks = tracks, trackCount = tracks.size, updatedAt = java.time.Instant.now().toString())
            writeDemo(current.map { if (it.id == id) updated else it })
            Result.success(updated)
        } else {
            runCatching {
                api.updatePlaylist(
                    PlaylistMutationBody(
                        id = id,
                        name = playlist.name,
                        description = playlist.description,
                        cover = playlist.cover,
                        isPublic = playlist.isPublic,
                        tags = playlist.tags,
                        tracks = tracks
                    )
                ).body() ?: error("Не удалось обновить плейлист")
            }
        }

    /** Web PlaylistView rename (inline ✓ edit). */
    suspend fun rename(id: String, newName: String, newDescription: String? = null): Result<PlaylistDto> =
        if (isDemo()) {
            val current = readDemo()
            val target = current.firstOrNull { it.id == id } ?: return Result.failure(IllegalArgumentException("Плейлист не найден"))
            val updated = target.copy(
                name = newName,
                description = newDescription ?: target.description,
                updatedAt = java.time.Instant.now().toString()
            )
            writeDemo(current.map { if (it.id == id) updated else it })
            Result.success(updated)
        } else {
            val target = playlist(id) ?: return Result.failure(IllegalArgumentException("Плейлист не найден"))
            runCatching {
                api.updatePlaylist(
                    PlaylistMutationBody(
                        id = id,
                        name = newName,
                        description = newDescription ?: target.description,
                        cover = target.cover,
                        isPublic = target.isPublic,
                        tags = target.tags,
                        tracks = target.tracks
                    )
                ).body() ?: error("Не удалось переименовать плейлист")
            }
        }

    suspend fun delete(id: String): Result<Boolean> =
        if (isDemo()) {
            writeDemo(readDemo().filterNot { it.id == id })
            Result.success(true)
        } else {
            runCatching { api.deletePlaylist(id).isSuccessful }
        }

    suspend fun like(id: String): Boolean =
        runCatching { api.likePlaylist(com.mq1.player.data.api.PlaylistLikeBody(id)).isSuccessful }
            .getOrDefault(false)

    suspend fun addTrack(playlist: PlaylistDto, track: Track): Result<PlaylistDto> =
        updateTracks(playlist.id, playlist, playlist.tracks + track)

    suspend fun removeTrack(playlist: PlaylistDto, trackId: String): Result<PlaylistDto> =
        updateTracks(playlist.id, playlist, playlist.tracks.filterNot { it.id == trackId })
}
