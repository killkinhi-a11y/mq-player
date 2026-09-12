package com.mq1.player.data.repo

import com.mq1.player.data.api.MqApi
import com.mq1.player.data.api.PlaylistDto
import com.mq1.player.data.api.PlaylistMutationBody
import com.mq1.player.data.api.Track

class PlaylistRepository(private val api: MqApi) {

    suspend fun myPlaylists(): List<PlaylistDto> =
        runCatching { api.playlists(myOnly = true, limit = 100).playlists }.getOrElse { emptyList() }

    suspend fun publicPlaylists(search: String? = null): List<PlaylistDto> =
        runCatching { api.playlists(search = search?.takeIf { it.isNotBlank() }, limit = 100).playlists }
            .getOrElse { emptyList() }

    suspend fun playlist(id: String): PlaylistDto? =
        runCatching { api.playlists(search = null).playlists.firstOrNull { it.id == id } }
            .getOrNull()

    suspend fun create(name: String, description: String = "", isPublic: Boolean = true): PlaylistDto? =
        runCatching { api.createPlaylist(PlaylistMutationBody(name = name, description = description, isPublic = isPublic)) }
            .getOrNull()?.body()

    suspend fun updateTracks(id: String, playlist: PlaylistDto, tracks: List<Track>): PlaylistDto? =
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
            )
        }.getOrNull()?.body()

    suspend fun delete(id: String): Boolean =
        runCatching { api.deletePlaylist(id).isSuccessful }.getOrDefault(false)

    suspend fun like(id: String): Boolean =
        runCatching { api.likePlaylist(com.mq1.player.data.api.PlaylistLikeBody(id)).isSuccessful }
            .getOrDefault(false)

    suspend fun addTrack(playlist: PlaylistDto, track: Track): PlaylistDto? =
        updateTracks(playlist.id, playlist, playlist.tracks + track)

    suspend fun removeTrack(playlist: PlaylistDto, trackId: String): PlaylistDto? =
        updateTracks(playlist.id, playlist, playlist.tracks.filterNot { it.id == trackId })
}
