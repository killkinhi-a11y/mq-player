# Media3 / ExoPlayer
-keep class androidx.media3.** { *; }

# ── Google Credential Manager / googleid (HOTFIX 2.3.1) ──────────────────────
# REQUIRED by the official "Sign in with Google using Credential Manager"
# documentation for R8/ProGuard builds:
#   developer.android.com/identity/sign-in/credential-manager-gis
# ("If your project uses R8 with obfuscation, add this keep rule so the
#  Credential Manager flow works correctly" — googleid 1.1.1 ships NO
# consumer rules of its own beyond `-dontwarn module-info`, verified in the
# AAR). Without it, GetGoogleIdOption/GoogleIdTokenCredential are renamed
# and merged — the exact release-only breakage vector we are fixing.
-keep class com.google.android.libraries.identity.googleid.** { *; }
# androidx.credentials: exception TYPE strings and provider metadata are
# matched by name inside the library — keep the exceptions' identity too
# (narrow: only the exceptions package, not the whole library).
-keep class androidx.credentials.exceptions.** { *; }

# Retrofit + kotlinx-serialization
-keepattributes Signature, InnerClasses, EnclosingMethod, RuntimeVisibleAnnotations, RuntimeVisibleParameterAnnotations, AnnotationDefault
-keepclassmembers,allowshrinking,allowobfuscation interface * {
    @retrofit2.http.* <methods>;
}
-dontwarn kotlinx.serialization.**
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keepclasseswithmembers class com.mq1.player.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.mq1.player.**$$serializer { *; }

# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
