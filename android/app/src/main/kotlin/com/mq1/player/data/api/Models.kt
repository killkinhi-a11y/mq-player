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
    val quality: String = "",
    val licenseUrl: String? = null,
    val licenseAuthToken: String? = null
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
    // F8: JWE token — MUST reach the license proxy (same contract as web EME)
    val licenseAuthToken: String? = null,
    val fallbackStreams: List<StreamFallback> = emptyList(),
    val error: String? = null
)

// ── Lyrics (F8) ──────────────────────────────────────────────────────────────

@Serializable
data class LyricLine(
    val time: Double = 0.0,
    val text: String = ""
)

@Serializable
data class LyricsResponse(
    val lyrics: List<LyricLine> = emptyList(),
    val plainText: String = "",
    val synced: Boolean = false,
    val source: String? = null
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
data class RegisterResponse(
    val message: String? = null,
    val devCode: String? = null,
    val error: String? = null
)

// ── Google native login (Credential Manager → backend bridge) ───────────────

/** GET api/auth/providers — availability probe (+ PUBLIC web client id). */
@Serializable
data class AuthProvidersResponse(
    val google: Boolean = false,
    // Public OAuth web client id — required by GetGoogleIdOption. The client
    // SECRET never leaves the backend; this value is public by design.
    val googleClientId: String? = null,
    val telegramWidget: Boolean = false,
    val telegramBot: Boolean = false,
    val telegramBotName: String? = null,
    val email: Boolean = true,
    val emailDelivery: Boolean = false
)

/** GET api/auth/google/native — one-time nonce for GetGoogleIdOption. */
@Serializable
data class GoogleNativeNonceResponse(
    val nonce: String? = null,
    val error: String? = null
)

/** POST api/auth/google/native — session outcome (cookie rides the response). */
@Serializable
data class GoogleNativeLoginResponse(
    val authenticated: Boolean = false,
    val userId: String? = null,
    val username: String? = null,
    val email: String? = null,
    val role: String? = null,
    val avatar: String? = null,
    val linked: Boolean? = null,
    val created: Boolean? = null,
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

// GET /api/playlists/{id} → {playlist: {...}}
@Serializable
data class PlaylistDtoResponse(val playlist: PlaylistDto? = null)

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

// POST /api/music/import-playlist → {source, name, tracks} | {error, hint}
@Serializable
data class ImportPlaylistResponse(
    val source: String = "",
    val name: String = "",
    val tracks: List<Track> = emptyList(),
    val error: String? = null,
    val hint: String? = null,
    val imported: Int = 0
)

// ── Group chats (web MessengerView parity) ─────────────────────────────

@Serializable
data class GroupChatDto(
    val id: String = "",
    val name: String = "",
    val description: String = "",
    val avatar: String = "",
    val createdBy: String = "",
    val createdAt: String = "",
    val updatedAt: String = "",
    val memberCount: Int = 0,
    val lastMessage: GroupLastMessage? = null
)

@Serializable
data class GroupLastMessage(
    val id: String = "",
    val content: String = "",
    val messageType: String = "text",
    val createdAt: String = "",
    val sender: GroupSender = GroupSender()
)

@Serializable
data class GroupSender(
    val id: String = "",
    val username: String = "",
    val avatar: String = ""
)

@Serializable
data class GroupChatsResponse(val groupChats: List<GroupChatDto> = emptyList())

@Serializable
data class CreateGroupBody(
    val name: String,
    val description: String = "",
    val memberIds: List<String> = emptyList()
)

@Serializable
data class GroupMessageDto(
    val id: String = "",
    val content: String = "",
    val messageType: String = "text",
    val replyToId: String? = null,
    val createdAt: String = "",
    val sender: GroupSender = GroupSender()
)

@Serializable
data class GroupMessagesResponse(
    val messages: List<GroupMessageDto> = emptyList(),
    val nextCursor: String? = null
)

@Serializable
data class SendGroupMessageBody(val content: String, val messageType: String = "text")

@Serializable
data class SimpleResult(val ok: Boolean = true, val error: String? = null)

// ── Friends ──────────────────────────────────────────────────────────────────

@Serializable
data class Friend(
    val id: String = "",
    val username: String = "",
    val avatar: String = "",
    val addedAt: String = "",
    // F7: Friend row id — DELETE /api/friends/{id} operates on this, not the user id
    val friendshipId: String = ""
)

@Serializable
data class PendingRequest(
    val id: String = "",
    val username: String = "",
    val requestId: String = "",
    val avatar: String = ""
)

@Serializable
data class OutgoingRequest(
    val id: String = "",
    val username: String = "",
    val requestId: String = "",
    val avatar: String = "",
    val createdAt: String = ""
)

@Serializable
data class FriendsResponse(
    val friends: List<Friend> = emptyList(),
    val pendingRequests: List<PendingRequest> = emptyList(),
    // F7: requests we sent (cancel via DELETE /api/friends/{requestId})
    val outgoingRequests: List<OutgoingRequest> = emptyList()
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

@Serializable
data class FriendActionBody(val action: String)

// GET /api/users/[id] — public profile + caller-relative friendship state
@Serializable
data class UserProfileResponse(
    val user: UserDto = UserDto(),
    val online: Boolean = false,
    val lastSeen: String? = null,
    val friendship: FriendshipState = FriendshipState()
)

@Serializable
data class FriendshipState(
    // none | self | friends | incoming | outgoing
    val status: String = "none",
    val requestId: String? = null,
    val friendshipId: String? = null
)

// GET /api/users/status?ids=… — batch online presence (5-min threshold server-side)
@Serializable
data class UserStatusEntry(val online: Boolean = false, val lastSeen: String? = null)

@Serializable
data class UsersStatusResponse(val statuses: Map<String, UserStatusEntry> = emptyMap())

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

// GET /api/messages/unread-count — returns only the LATEST incoming message
// (new-message detection); total unread is tracked client-side (SocialHub),
// same model as the web app's unreadCounts.
@Serializable
data class UnreadCountResponse(val latestMessage: LatestMessage? = null)

@Serializable
data class LatestMessage(
    val id: String = "",
    val content: String = "",
    val senderId: String = "",
    val senderUsername: String = "",
    val senderAvatar: String = "",
    val createdAt: String = ""
)

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

// ── Own profile (F9) — existing backend surface, no new endpoints ────────────

// GET /api/user/profile → {id, username, email, avatar, role, createdAt}
@Serializable
data class MyProfileResponse(
    val id: String = "",
    val username: String = "",
    val email: String? = null,
    val avatar: String? = null,
    val role: String = "user",
    val createdAt: String? = null
)

// GET /api/auth/username-check?username=X&excludeId=Y → {available, error}
@Serializable
data class UsernameCheckResponse(
    val available: Boolean = false,
    val error: String? = null
)

// POST /api/auth/update-username {username} → {message, username}
@Serializable
data class UpdateUsernameResponse(
    val message: String? = null,
    val username: String? = null
)

// POST /api/user/avatar {avatar: dataUrl} → {message, avatar}
@Serializable
data class AvatarUpdateResponse(
    val message: String? = null,
    val avatar: String? = null
)

// ── Shared track (F11 deep links) — /api/tracks/share?scTrackId= ─────────────
// Public (no auth) — resolves a share link's track into playable metadata.
@Serializable
data class SharedTrackResponse(
    val title: String = "",
    val artist: String = "",
    val cover: String = "",
    val duration: Double = 0.0,
    val genre: String = "",
    val scTrackId: Long = 0,
    val description: String? = null
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
