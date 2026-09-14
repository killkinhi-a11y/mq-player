package com.mq1.player.data.repo

import android.graphics.BitmapFactory
import com.mq1.player.di.ServiceLocator
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.net.URL

/**
 * Web PlaylistView «Импорт» dialog parity:
 *  - URL mode  → POST /api/music/import-playlist {url} (server-side parse)
 *  - Text mode → per-line "Исполнитель — Название" → /api/music/search
 *                (web paces at 60 ms/line; we run sequentially too)
 * Plus «Сменить обложку» (web: local base64 cover; Android: downscale to
 * 512×512 JPEG data URL, stored via the playlist mutation endpoint).
 */
object PlaylistImport {

    suspend fun importFromUrl(url: String): String = withContext(Dispatchers.IO) {
        val trimmed = url.trim()
        if (trimmed.isBlank()) return@withContext "Вставьте ссылку на плейлист"
        runCatching {
            // web flow: server parses the URL and returns {name, tracks};
            // the CLIENT creates the playlist from those tracks
            val response = ServiceLocator.api.importPlaylist(mapOf("url" to trimmed))
            val body = response.body()
            if (!response.isSuccessful || body == null || body.tracks.isEmpty()) {
                return@withContext body?.error ?: "Импорт не удался — проверьте ссылку"
            }
            val repo = ServiceLocator.playlistRepository
            val pl = repo.create(body.name.ifBlank { "Импортированный плейлист" }).getOrThrow()
            repo.updateTracks(pl.id, pl, body.tracks).getOrThrow()
            "Плейлист импортирован · ${body.tracks.size} треков"
        }.getOrElse { "Импорт не удался — проверьте соединение" }
    }

    suspend fun importFromText(text: String): String = withContext(Dispatchers.IO) {
        val lines = text.lines()
            .map { it.trim() }
            .filter { it.isNotBlank() }
        if (lines.isEmpty()) {
            return@withContext "Вставьте хотя бы один трек в формате «Исполнитель — Название»."
        }
        var found = 0
        val tracks = mutableListOf<com.mq1.player.data.api.Track>()
        for (line in lines) {
            val results = ServiceLocator.musicRepository.search(line)
            results.firstOrNull()?.let {
                tracks.add(it)
                found++
            }
            kotlinx.coroutines.delay(60) // web pacing parity
        }
        if (tracks.isEmpty()) {
            return@withContext "Ничего не найдено — проверьте формат «Исполнитель — Название»."
        }
        val name = "Импорт ${lines.size} трек(ов)"
        runCatching {
            val repo = ServiceLocator.playlistRepository
            val pl = repo.create(name).getOrThrow()
            repo.updateTracks(pl.id, pl, tracks).getOrThrow()
        }.fold(
            onSuccess = { "Плейлист импортирован · $found треков" },
            onFailure = { "Не удалось сохранить плейлист" }
        )
    }

    /** 512×512 JPEG data URL (web: center-crop cover, base64 local). */
    suspend fun updateCover(playlistId: String, bytes: ByteArray): String =
        withContext(Dispatchers.IO) {
            val dataUrl = bytesToCoverDataUrl(bytes)
                ?: return@withContext "Не удалось прочитать изображение"
            runCatching {
                val repo = ServiceLocator.playlistRepository
                val pl = repo.playlist(playlistId) ?: error("Плейлист не найден")
                val body = com.mq1.player.data.api.PlaylistMutationBody(
                    id = pl.id,
                    name = pl.name,
                    description = pl.description,
                    cover = dataUrl,
                    isPublic = pl.isPublic,
                    tags = pl.tags,
                    tracks = pl.tracks
                )
                ServiceLocator.api.updatePlaylist(body)
                "Обложка установлена"
            }.getOrElse { "Не удалось обновить обложку" }
        }

    private fun bytesToCoverDataUrl(bytes: ByteArray): String? {
        return runCatching {
            val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return null
            val side = minOf(bmp.width, bmp.height)
            val x = (bmp.width - side) / 2
            val y = (bmp.height - side) / 2
            val cropped = android.graphics.Bitmap.createBitmap(bmp, x, y, side, side)
            val scaled = if (side > 512) {
                android.graphics.Bitmap.createScaledBitmap(cropped, 512, 512, true)
            } else cropped
            val out = ByteArrayOutputStream()
            scaled.compress(android.graphics.Bitmap.CompressFormat.JPEG, 82, out)
            "data:image/jpeg;base64," + android.util.Base64.encodeToString(
                out.toByteArray(), android.util.Base64.NO_WRAP
            )
        }.getOrNull()
    }
}
