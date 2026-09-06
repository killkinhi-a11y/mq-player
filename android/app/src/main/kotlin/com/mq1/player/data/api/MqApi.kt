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

    // ── Friends ─────────────────────────────────────────────────────────────

    @GET("api/friends")
    suspend fun friends(): FriendsResponse

    @POST("api/friends")
    suspend fun addFriend(@Body body: AddFriendBody): Response<SimpleResult>

    @GET("api/users/search")
    suspend fun usersSearch(@Query("q") query: String, @Query("excludeId") excludeId: String = ""): UsersSearchResponse

    // ── Messages ────────────────────────────────────────────────────────────

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

    // ── Listener preferences / onboarding ───────────────────────────────────

    @GET("api/user/favorite-artists")
    suspend fun favoriteArtists(): FavoriteArtistsResponse

    @POST("api/user/favorite-artists")
    suspend fun saveFavoriteArtists(@Body body: SaveFavoriteArtistsBody): Response<SimpleResult>

    // ── Now playing ─────────────────────────────────────────────────────────

    @POST("api/user/now-playing")
    suspend fun nowPlaying(@Body body: Map<String, String>): SimpleResult
}
