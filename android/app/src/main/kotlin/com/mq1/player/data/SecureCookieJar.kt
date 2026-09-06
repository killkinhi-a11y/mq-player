package com.mq1.player.data

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Log
import java.security.KeyStore
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl

/**
 * Persistent cookie jar for the httpOnly `session` JWT cookie.
 *
 * Security model (matches P20.9 "не хранить секреты в plaintext"):
 * 1. An AES-256-GCM key lives in AndroidKeyStore (hardware-backed where
 *    available, never exportable).
 * 2. Cookie values are sealed with that key (random 96-bit IV per write).
 * 3. Sealed values live in an ordinary SharedPreferences file — a plain-file
 *    read (root backup, adb backup, forensic dump) yields only ciphertext.
 *
 * Cookie semantics: the server sets `session` with maxAge ~30 days; we honor
 * expiry from the Set-Cookie header and drop it when it lapses.
 */
class SecureCookieJar(context: Context) : CookieJar {

    private val prefs = context.getSharedPreferences("mq_session_v1", Context.MODE_PRIVATE)
    private val tag = "SecureCookieJar"

    private fun obtainKey(): SecretKey? = runCatching {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(SELF, null) as? SecretKey) ?: run {
            val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
            gen.init(
                KeyGenParameterSpec.Builder(SELF, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .build()
            )
            gen.generateKey()
        }
    }.getOrElse {
        Log.e(tag, "keystore unavailable: ${it.message}")
        null
    }

    private fun seal(plain: String): String? {
        val key = obtainKey() ?: return null
        return runCatching {
            val cipher = Cipher.getInstance(TRANSFORM)
            cipher.init(Cipher.ENCRYPT_MODE, key)
            val iv = cipher.iv
            val ct = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
            Base64.getEncoder().encodeToString(iv) + ":" + Base64.getEncoder().encodeToString(ct)
        }.getOrNull()
    }

    private fun unseal(sealed: String): String? = runCatching {
        val (ivB64, ctB64) = sealed.split(':', limit = 2)
        val key = obtainKey() ?: return@runCatching null
        val cipher = Cipher.getInstance(TRANSFORM)
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, Base64.getDecoder().decode(ivB64)))
        String(cipher.doFinal(Base64.getDecoder().decode(ctB64)), Charsets.UTF_8)
    }.getOrNull()

    // Serialized cookie cache: "domain|name" -> sealed(value|expiresAt)
    private fun keyFor(cookie: Cookie) = "${cookie.domain}|${cookie.name}"

    @Synchronized
    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        for (cookie in cookies) {
            if (cookie.name != SESSION_COOKIE) continue
            if (cookie.value.isBlank() || !cookie.persistent) {
                prefs.edit().remove(keyFor(cookie)).apply()
                hasSessionCookie = false
                continue
            }
            val expiresAt = if (cookie.expiresAt == Long.MAX_VALUE)
                System.currentTimeMillis() + 365L * 24 * 3600 * 1000
            else cookie.expiresAt
            val payload = "${cookie.value}|$expiresAt"
            val sealedValue = seal(payload)
            if (sealedValue != null) {
                prefs.edit().putString(keyFor(cookie), sealedValue).apply()
                hasSessionCookie = true
            }
        }
    }

    @Synchronized
    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        val result = mutableListOf<Cookie>()
        for ((key, sealedValue) in prefs.all) {
            if (key !is String || sealedValue !is String) continue
            val domain = key.substringBefore('|')
            val name = key.substringAfter('|')
            if (name != SESSION_COOKIE) continue
            if (!url.host.endsWith(domain.removePrefix("."))) continue
            val plain = unseal(sealedValue) ?: continue
            val value = plain.substringBeforeLast('|')
            val expiresAt = plain.substringAfterLast('|').toLongOrNull() ?: 0L
            if (expiresAt < System.currentTimeMillis()) {
                prefs.edit().remove(key).apply()
                hasSessionCookie = false
                continue
            }
            runCatching {
                Cookie.Builder()
                    .name(name)
                    .value(value)
                    .domain(url.host)
                    .path("/")
                    .expiresAt(expiresAt)
                    .secure()
                    .build()
            }.getOrNull()?.let { result.add(it) }
        }
        return result
    }

    fun clear() {
        prefs.edit().clear().apply()
        hasSessionCookie = false
    }

    companion object {
        private const val SELF = "mq_session_seal"
        private const val TRANSFORM = "AES/GCM/NoPadding"
        private const val SESSION_COOKIE = "session"

        @Volatile
        var hasSessionCookie: Boolean = false
            private set
    }
}
