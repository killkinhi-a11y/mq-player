package com.mq1.player.data

/**
 * URL normalization for images/audio referenced by the MQ backend.
 *
 * ROOT-CAUSE FIX (P0 «обложки не работают»): the backend returns
 * ORIGIN-RELATIVE cover URLs, e.g.
 *   "/api/music/soundcloud/image-proxy?url=https%3A%2F%2Fi1.sndcdn.com%2F..."
 * A web browser resolves those against the page origin automatically;
 * Coil on Android does NOT — a scheme-less path string fails to load and
 * every artwork silently fell back to the gradient placeholder.
 *
 * The fix mirrors the browser: join relative paths onto API_BASE.
 * Absolute http(s)/data/content/file URLs pass through unchanged.
 */
object MqUrls {

    fun absolute(url: String?, base: String = com.mq1.player.BuildConfig.API_BASE): String? {
        if (url.isNullOrBlank()) return null
        return when {
            url.startsWith("http://") ||
                url.startsWith("https://") ||
                url.startsWith("data:") ||
                url.startsWith("content:") ||
                url.startsWith("file:") -> url

            url.startsWith("/") -> base.trimEnd('/') + url

            // Not a path we know how to resolve — hand through as-is and let
            // the loader surface its own error (never fabricate a fake URL).
            else -> url
        }
    }
}
