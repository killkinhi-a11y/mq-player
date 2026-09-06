package com.mq1.player.data.api

import kotlinx.serialization.Serializable

// ─────────────────────────────────────────────────────────────────────────────
// API models — field names match the MQ web backend JSON exactly (camelCase).
// kotlinx-serialization ignores unknown keys by default, so additive backend
// changes don't crash the app.
// ─────────────────────────────────────────────────────────────────────────────

@Serializable
data class Track(
    val id: String = "",
    val title: String = "",
    val artist: String = "",
    val album: String = "",
    val duration: Double = 0.0,
    val cover: String = "",
    val genre: String = "",
    val audioUrl: String = "",
    val previewUrl: String? = null,
    val source: String = "soundcloud",
    val scTrackId: Long? = null,
    val scStreamPolicy: String? = null,
    val scIsFull: Boolean? = null,
    val _reason: String? = null,
    val _seedArtist: String? = null
) {
    val durationInt: Int get() = duration.toInt().coerceAtLeast(0)
    val reason: String? get() = _reason
}

@Serializable
data class SearchResponse(val tracks: List<Track> = emptyList())

@Serializable
data class RecommendationsResponse(
    val tracks: List<Track> = emptyList(),
    val categories: List<RecommendationCategory> = emptyList()
)

@Serializable
data class RecommendationCategory(
    val id: String = "",
    val title: String = "",
    val tracks: List<Track> = emptyList()
)

@Serializable
data class StreamFallback(
    val url: String = "",
    val protocol: String = "",
    val isHls: Boolean = false,
    val isEncrypted: Boolean = false,
    val quality: String = ""
)

@Serializable
data class StreamResponse(
    val url: String? = null,
    val resolveUrl: String? = null,
    val isHls: Boolean = false,
    val isEncrypted: Boolean = false,
    val protocol: String = "",
    val quality: String = "",
    val isPreview: Boolean? = null,
    val duration: Double? = null,
    val fullDuration: Double? = null,
    val trackAuthorization: String? = null,
    val licenseUrl: String? = null,
    val fallbackStreams: List<StreamFallback> = emptyList(),
    val error: String? = null
)

@Serializable
data class ArtistInfo(
    val id: Long = 0,
    val username: String = "",
    val avatar: String = "",
    val followers: Long = 0,
    val genre: String = "",
    val trackCount: Long = 0
)

@Serializable
data class ArtistTracksResponse(
    val tracks: List<Track> = emptyList(),
    val artist: ArtistInfo? = null
)

// ── Auth ─────────────────────────────────────────────────────────────────────

@Serializable
data class BotNameResponse(
    val configured: Boolean = false,
    val botName: String? = null
)

@Serializable
data class TelegramVerifyResponse(
    val message: String? = null,
    val userId: String? = null,
    val username: String? = null,
    val role: String? = null,
    val avatar: String? = null,
    val telegramUsername: String? = null,
    val isNewUser: Boolean = false,
    val linked: Boolean? = null,
    val error: String? = null
)

@Serializable
data class MeResponse(
    val authenticated: Boolean = false,
    val userId: String? = null,
    val username: String? = null,
    val email: String? = null,
    val role: String? = null,
    val avatar: String? = null,
    val telegramUsername: String? = null,
    val theme: String? = null,
    val accent: String? = null,
    val confirmed: Boolean? = null
)

// ── Playlists ────────────────────────────────────────────────────────────────

@Serializable
data class PlaylistDto(
    val id: String = "",
    val userId: String = "",
    val username: String = "",
    val name: String = "",
    val description: String = "",
    val cover: String = "",
    val isPublic: Boolean = false,
    val tags: List<String> = emptyList(),
    val tracks: List<Track> = emptyList(),
    val trackCount: Int = 0,
    val likeCount: Int = 0,
    val playCount: Int = 0,
    val createdAt: String = "",
    val updatedAt: String = ""
)

@Serializable
data class PlaylistsResponse(
    val playlists: List<PlaylistDto> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val limit: Int = 20
)

@Serializable
data class PlaylistMutationBody(
    val id: String? = null,
    val name: String,
    val description: String = "",
    val cover: String = "",
    val isPublic: Boolean = false,
    val tags: List<String> = emptyList(),
    val tracks: List<Track> = emptyList()
)

@Serializable
data class PlaylistLikeBody(val playlistId: String)

@Serializable
data class SimpleResult(val ok: Boolean = true, val error: String? = null)

// ── Friends ──────────────────────────────────────────────────────────────────

@Serializable
data class Friend(
    val id: String = "",
    val username: String = "",
    val avatar: String = "",
    val addedAt: String = ""
)

@Serializable
data class PendingRequest(
    val id: String = "",
    val username: String = "",
    val requestId: String = ""
)

@Serializable
data class FriendsResponse(
    val friends: List<Friend> = emptyList(),
    val pendingRequests: List<PendingRequest> = emptyList()
)

@Serializable
data class UserDto(
    val id: String = "",
    val username: String = "",
    val avatar: String? = null
)

@Serializable
data class UsersSearchResponse(val users: List<UserDto> = emptyList())

@Serializable
data class AddFriendBody(val addresseeId: String)

// ── Messages / chats ─────────────────────────────────────────────────────────

@Serializable
data class MessageDto(
    val id: String = "",
    val content: String = "",
    val senderId: String = "",
    val receiverId: String = "",
    val createdAt: String = "",
    val messageType: String = "text",
    val read: Boolean = false
)

@Serializable
data class MessagesResponse(val messages: List<MessageDto> = emptyList())

@Serializable
data class SendMessageBody(
    val receiverId: String,
    val content: String,
    val encrypted: Boolean = false
)

@Serializable
data class SendMessageResponse(val message: MessageDto? = null)

// ── AI chat ──────────────────────────────────────────────────────────────────

@Serializable
data class AiChatMessage(val role: String, val content: String)

@Serializable
data class AiChatBody(
    val messages: List<AiChatMessage>,
    val tasteProfile: Map<String, String> = emptyMap(),
    val sessionId: String = ""
)

@Serializable
data class AiChatResponse(
    val reply: String = "",
    val tracks: List<Track> = emptyList(),
    val queries: List<String> = emptyList()
)

// ── Favorite artists / onboarding ────────────────────────────────────────────

@Serializable
data class FavoriteArtistsResponse(
    val artists: List<String> = emptyList(),
    val onboardingComplete: Boolean = false
)

@Serializable
data class SaveFavoriteArtistsBody(
    val artists: List<String>,
    val completeOnboarding: Boolean = true
)
