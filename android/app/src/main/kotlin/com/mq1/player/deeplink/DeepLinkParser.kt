package com.mq1.player.deeplink

import android.net.Uri

/**
 * F11 — deep link destination model + parsing.
 *
 * Supported inputs (production URLs the app actually owns):
 *   mqplayer://track/{scTrackId}      → play the track, open Full Player
 *   mqplayer://artist/{name}          → artist screen (name URL-encoded)
 *   mqplayer://playlist/{id}          → playlist screen
 *   mq://player                       → legacy: open Full Player (kept for
 *                                      existing notification/launcher paths)
 *   https://mq1.vercel.app/track/{id} → App Link: same as mqplayer://track
 *   https://mq1.vercel.app/play?pl={id}    → App Link: playlist
 *   https://mq1.vercel.app/play?artist={n} → App Link: artist
 *
 * Everything else → null (the app opens on Home; NO invented destinations).
 */
sealed interface DeepLink {
    /** Track by SoundCloud id — resolve via public /api/tracks/share. */
    data class Track(val scTrackId: Long) : DeepLink

    /** Artist by name (the artist id in this product IS the name). */
    data class Artist(val name: String) : DeepLink

    /** Playlist by backend id. */
    data class Playlist(val id: String) : DeepLink

    /** Legacy mq://player — just open the Full Player. */
    data object Player : DeepLink
}

object DeepLinkParser {

    const val WEB_HOST = "mq1.vercel.app"

    /** Parse any VIEW intent URI into a destination, or null. */
    fun parse(uri: Uri?): DeepLink? {
        uri ?: return null
        val scheme = uri.scheme?.lowercase() ?: return null
        return when (scheme) {
            "mqplayer" -> parseCustom(uri)
            "mq" -> if (uri.host?.lowercase() == "player") DeepLink.Player else null
            "http", "https" -> parseWeb(uri)
            else -> null
        }
    }

    private fun parseCustom(uri: Uri): DeepLink? {
        // host carries the entity: track / artist / playlist
        return when (uri.host?.lowercase()) {
            "track" -> {
                val id = uri.pathSegments.firstOrNull()?.toLongOrNull() ?: return null
                DeepLink.Track(id)
            }
            "artist" -> {
                val name = uri.pathSegments.firstOrNull()?.trim() ?: return null
                if (name.isBlank()) null else DeepLink.Artist(name)
            }
            "playlist" -> {
                val id = uri.pathSegments.firstOrNull() ?: return null
                if (id.isBlank()) null else DeepLink.Playlist(id)
            }
            else -> null
        }
    }

    private fun parseWeb(uri: Uri): DeepLink? {
        if (uri.host?.lowercase() != WEB_HOST) return null
        val segments = uri.pathSegments
        return when {
            // /track/{id} — the real public track page
            segments.size == 2 && segments[0] == "track" -> {
                val id = segments[1].toLongOrNull() ?: return null
                DeepLink.Track(id)
            }
            // /play — the app shell URL carrying ?pl= / ?artist=
            segments.size == 1 && segments[0] == "play" -> {
                val pl = uri.getQueryParameter("pl")
                val artist = uri.getQueryParameter("artist")
                when {
                    !pl.isNullOrBlank() -> DeepLink.Playlist(pl)
                    !artist.isNullOrBlank() -> DeepLink.Artist(artist.trim())
                    else -> null // plain /play → let the app open Home
                }
            }
            else -> null
        }
    }

    /** Share URLs — REAL public HTTPS links (no custom-scheme sharing). */
    fun shareTrackUrl(scTrackId: Long?, trackId: String): String =
        "https://$WEB_HOST/track/" + (scTrackId ?: trackId)

    fun sharePlaylistUrl(playlistId: String): String =
        "https://$WEB_HOST/play?pl=$playlistId"

    fun shareArtistUrl(artistName: String): String =
        "https://$WEB_HOST/play?artist=" + Uri.encode(artistName)
}
