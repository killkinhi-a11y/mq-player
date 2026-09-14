package com.mq1.player.data.api

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * MQ Player backend API (same REST surface the web app uses).
 * Auth rides on the httpOnly `session` cookie (SecureCookieJar persists it
 * encrypted across app restarts) — identical semantics to the web client.
 */
interface MqApi {

    // ── Auth ────────────────────────────────────────────────────────────────

    @GET("api/auth/telegram-bot-name")
    suspend fun telegramBotName(): BotNameResponse

    @POST("api/auth/telegram-verify")
    suspend fun telegramVerify(@Body body: Map<String, String>): Response<TelegramVerifyResponse>

    @GET("api/auth/me")
    suspend fun me(): Response<MeResponse>

    @POST("api/auth/logout")
    suspend fun logout(): SimpleResult

    // WEB PARITY auth methods (same endpoints as AuthView.tsx)
    @POST("api/auth/login")
    suspend fun loginEmail(@Body body: Map<String, String>): Response<TelegramVerifyResponse>

    @POST("api/auth/register")
    suspend fun registerEmail(@Body body: Map<String, String>): Response<RegisterResponse>

    @POST("api/auth/verify-code")
    suspend fun verifyEmailCode(@Body body: Map<String, String>): Response<TelegramVerifyResponse>

    // Google native login (Credential Manager) — same backend flow as the
    // web OAuth callback, native transport (id_token + nonce instead of code
    // + state). Client id comes from authProviders().
    @GET("api/auth/providers")
    suspend fun authProviders(): Response<AuthProvidersResponse>

    @GET("api/auth/google/native")
    suspend fun googleNativeNonce(): Response<GoogleNativeNonceResponse>

    @POST("api/auth/google/native")
    suspend fun googleNativeLogin(@Body body: Map<String, String>): Response<GoogleNativeLoginResponse>

    // ── Music ───────────────────────────────────────────────────────────────

    @GET("api/music/search")
    suspend fun search(@Query("q") query: String): SearchResponse

    @GET("api/music/soundcloud/stream")
    suspend fun stream(@Query("trackId") trackId: Long): StreamResponse

    @GET("api/music/artist-tracks")
    suspend fun artistTracks(
        @Query("q") artist: String,
        @Query("limit") limit: Int = 20
    ): ArtistTracksResponse

    // ── Lyrics (F8) — rate-limited, not auth-gated ─────────────────────────

    @GET("api/music/lyrics")
    suspend fun lyrics(
        @Query("artist") artist: String,
        @Query("title") title: String
    ): Response<LyricsResponse>

    // ── Wave / recommendations ──────────────────────────────────────────────

    @GET("api/music/recommendations")
    suspend fun recommendations(
        @Query("wave") wave: Int? = 1,
        @Query("genres") genres: String? = null,
        @Query("likedScIds") likedScIds: String? = null,
        @Query("historyScIds") historyScIds: String? = null,
        @Query("dislikedIds") dislikedIds: String? = null,
        @Query("count") count: Int = 15
    ): RecommendationsResponse

    // Web «Похожие треки» — same radio endpoint the web wave engine uses
    @GET("api/music/radio")
    suspend fun radio(
        @Query("scTrackId") scTrackId: Long? = null,
        @Query("seedArtist") seedArtist: String? = null,
        @Query("seedGenre") seedGenre: String? = null,
        @Query("historyScIds") historyScIds: String? = null,
        @Query("count") count: Int = 15
    ): SearchResponse

    // Web SearchView genre chips → GET /api/music/genre?genre=...
    @GET("api/music/genre")
    suspend fun genre(@Query("genre") genre: String): SearchResponse

    // Web MainView «Новое и в тренде» → GET /api/music/trending
    @GET("api/music/trending")
    suspend fun trending(@Query("limit") limit: Int = 50): SearchResponse

    @POST("api/music/recommendations/feedback")
    suspend fun recommendationFeedback(@Body body: Map<String, String>): SimpleResult

    // ── Playlists ───────────────────────────────────────────────────────────

    @GET("api/playlists")
    suspend fun playlists(
        @Query("search") search: String? = null,
        @Query("sort") sort: String = "popular",
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 50,
        @Query("myOnly") myOnly: Boolean = false
    ): PlaylistsResponse

    @POST("api/playlists")
    suspend fun createPlaylist(@Body body: PlaylistMutationBody): Response<PlaylistDto>

    @PUT("api/playlists")
    suspend fun updatePlaylist(@Body body: PlaylistMutationBody): Response<PlaylistDto>

    @DELETE("api/playlists")
    suspend fun deletePlaylist(@Query("id") id: String): Response<SimpleResult>

    @POST("api/playlists/like")
    suspend fun likePlaylist(@Body body: PlaylistLikeBody): Response<SimpleResult>

    // POST /api/music/import-playlist (web import dialog, URL mode) — the
    // server PARSES the URL; the client creates the playlist itself
    @POST("api/music/import-playlist")
    suspend fun importPlaylist(@Body body: Map<String, String>): Response<ImportPlaylistResponse>

    // GET /api/playlists/{id} — single playlist (public or own); used by
    // deep links: arbitrary ids are not in the list responses
    @GET("api/playlists/{id}")
    suspend fun playlistById(@Path("id") id: String): Response<PlaylistDtoResponse>

    // ── Friends ─────────────────────────────────────────────────────────────

    @GET("api/friends")
    suspend fun friends(): FriendsResponse

    @POST("api/friends")
    suspend fun addFriend(@Body body: AddFriendBody): Response<SimpleResult>

    @PUT("api/friends/{id}")
    suspend fun respondToFriendRequest(
        @Path("id") requestId: String,
        @Body body: FriendActionBody
    ): Response<SimpleResult>

    // Works for BOTH: removing an accepted friend (id = friendshipId) and
    // cancelling an outgoing request (id = requestId — same Friend row id).
    @DELETE("api/friends/{id}")
    suspend fun deleteFriend(@Path("id") id: String): Response<SimpleResult>

    @GET("api/users/search")
    suspend fun usersSearch(@Query("q") query: String, @Query("excludeId") excludeId: String = ""): UsersSearchResponse

    @GET("api/users/{id}")
    suspend fun userProfile(@Path("id") userId: String): Response<UserProfileResponse>

    @GET("api/users/status")
    suspend fun usersStatus(@Query("ids") ids: String): UsersStatusResponse

    // ── Messages ────────────────────────────────────────────────────────────

    @GET("api/messages/unread-count")
    suspend fun unreadCount(): UnreadCountResponse

    @GET("api/messages")
    suspend fun messages(
        @Query("receiverId") receiverId: String,
        @Query("since") since: String? = null
    ): MessagesResponse

    @POST("api/messages")
    suspend fun sendMessage(@Body body: SendMessageBody): Response<SendMessageResponse>

    // ── AI chat ─────────────────────────────────────────────────────────────

    @POST("api/ai/chat")
    suspend fun aiChat(@Body body: AiChatBody): Response<AiChatResponse>

    // ── Group chats (web MessengerView parity) ──────────────────────────────

    @GET("api/group-chats")
    suspend fun groupChats(): Response<GroupChatsResponse>

    @POST("api/group-chats")
    suspend fun createGroupChat(@Body body: CreateGroupBody): Response<GroupChatDto>

    @GET("api/group-chats/{id}/messages")
    suspend fun groupMessages(
        @Path("id") id: String,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int = 50
    ): Response<GroupMessagesResponse>

    @POST("api/group-chats/{id}/messages")
    suspend fun sendGroupMessage(
        @Path("id") id: String,
        @Body body: SendGroupMessageBody
    ): Response<GroupMessageDto>

    // ── Own profile (F9) — existing web endpoints, same contract ──────────

    @GET("api/user/profile")
    suspend fun myProfile(): Response<MyProfileResponse>

    @POST("api/user/avatar")
    suspend fun updateAvatar(@Body body: Map<String, String>): Response<AvatarUpdateResponse>

    @GET("api/auth/username-check")
    suspend fun usernameCheck(
        @Query("username") username: String,
        @Query("excludeId") excludeId: String = ""
    ): Response<UsernameCheckResponse>

    @POST("api/auth/update-username")
    suspend fun updateUsername(@Body body: Map<String, String>): Response<UpdateUsernameResponse>

    // ── Shared track resolution (F11 deep links; public) ──────────────────

    @GET("api/tracks/share")
    suspend fun sharedTrack(@Query("scTrackId") scTrackId: String): Response<SharedTrackResponse>

    // ── Listener preferences / onboarding ───────────────────────────────────

    @GET("api/user/favorite-artists")
    suspend fun favoriteArtists(): FavoriteArtistsResponse

    @POST("api/user/favorite-artists")
    suspend fun saveFavoriteArtists(@Body body: SaveFavoriteArtistsBody): Response<SimpleResult>

    // ── Now playing ─────────────────────────────────────────────────────────

    @POST("api/user/now-playing")
    suspend fun nowPlaying(@Body body: Map<String, String>): SimpleResult
}
