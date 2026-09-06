package com.mq1.player.data.repo

import com.mq1.player.data.api.AddFriendBody
import com.mq1.player.data.api.AiChatBody
import com.mq1.player.data.api.AiChatMessage
import com.mq1.player.data.api.FriendsResponse
import com.mq1.player.data.api.MqApi
import com.mq1.player.data.api.MessageDto
import com.mq1.player.data.api.SendMessageBody
import com.mq1.player.data.api.Track
import com.mq1.player.data.api.UserDto
import kotlinx.coroutines.flow.firstOrNull

class SocialRepository(private val api: MqApi) {

    suspend fun friends(): FriendsResponse? =
        runCatching { api.friends() }.getOrNull()

    suspend fun searchUsers(query: String): List<UserDto> =
        runCatching { api.usersSearch(query).users }.getOrElse { emptyList() }

    suspend fun addFriend(userId: String): Result<Unit> = runCatching {
        val response = api.addFriend(AddFriendBody(userId))
        if (!response.isSuccessful) error(response.errorBody()?.string()?.substringBefore('\n') ?: "Не удалось отправить запрос")
    }

    suspend fun messages(peerId: String, since: String? = null): List<MessageDto> =
        runCatching { api.messages(receiverId = peerId, since = since).messages }.getOrElse { emptyList() }

    suspend fun send(peerId: String, content: String): MessageDto? =
        runCatching { api.sendMessage(SendMessageBody(receiverId = peerId, content = content)).body()?.message }
            .getOrNull()
}

/** AI chat (MQ assistant) with taste-profile context, same as web. */
class ChatRepository(
    private val api: MqApi,
    private val local: com.mq1.player.data.LocalStore
) {
    private val history = mutableListOf<AiChatMessage>()
    private var sessionId: String = java.util.UUID.randomUUID().toString()

    fun resetSession() {
        history.clear()
        sessionId = java.util.UUID.randomUUID().toString()
    }

    val messages: List<AiChatMessage> get() = history.toList()

    suspend fun ask(userMessage: String): Pair<String, List<Track>>? {
        history.add(AiChatMessage("user", userMessage))
        val taste = local.tasteGenres.firstOrNull() ?: emptySet()
        val response = runCatching {
            api.aiChat(
                AiChatBody(
                    messages = history.toList(),
                    tasteProfile = taste.associateWith { "60" },
                    sessionId = sessionId
                )
            )
        }.getOrNull() ?: return null
        val body = response.body() ?: return null
        if (body.reply.isNotBlank()) history.add(AiChatMessage("assistant", body.reply))
        return body.reply to body.tracks
    }
}
