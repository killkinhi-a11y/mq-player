import java.util.Properties
import java.io.FileInputStream

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

// Release signing: NEVER committed. Create android/keystore.properties locally:
//   storeFile=/absolute/path/to/release.keystore
//   storePassword=...
//   keyAlias=...
//   keyPassword=...
// Without this file, `assembleRelease` produces an unsigned APK (see README).
val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().apply {
    if (keystorePropsFile.exists()) load(FileInputStream(keystorePropsFile))
}

val mqApiBase: String = (project.findProperty("mqApiBase") as String?) ?: "https://mq1.vercel.app"

android {
    namespace = "com.mq1.player"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.mq1.player"
        minSdk = 26
        targetSdk = 35
        // 2.0.0 = native-app milestone (Kotlin/Compose/Media3 rewrite complete:
        // F2-F11). Old GitHub android-v1.0.x releases were the wrapper-era
        // builds; 2.0.0 cleanly separates the native line.
        // 2.2.0 = auth fixes: login crash (SessionUser @Serializable — every
        // login crashed on session persist), demo queue playback (real URLs,
        // no autoplay), Google native login (Credential Manager →
        // /api/auth/google/native).
        // 2.3.1 = P0 HOTFIX: Google login two-pass Credential Manager flow
        // (filter=true → NoCredentialException → fallback filter=false →
        // account picker), full Google error taxonomy, official googleid R8
        // keep rules, crash diagnostics (MqCrash — logged + persisted, never
        // masked), SecureCookieJar.hasSessionCookie restored on restart.
        versionCode = 12
        versionName = "2.3.5"

        buildConfigField("String", "API_BASE", "\"$mqApiBase\"")
        vectorDrawables { useSupportLibrary = true }
    }

    signingConfigs {
        if (keystorePropsFile.exists()) {
            create("release") {
                storeFile = file(keystoreProps["storeFile"] as String)
                storePassword = keystoreProps["storePassword"] as String
                keyAlias = keystoreProps["keyAlias"] as String
                keyPassword = keystoreProps["keyPassword"] as String
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            if (keystorePropsFile.exists()) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlin {
        compilerOptions {
            jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
            // Media3 marks large stable-in-practice surfaces as @UnstableApi.
            freeCompilerArgs.addAll("-opt-in=androidx.media3.common.util.UnstableApi")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }

    testOptions {
        unitTests.isIncludeAndroidResources = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.core.splashscreen)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.datastore.preferences)
    // Google native login (Credential Manager → backend id_token bridge)
    implementation(libs.androidx.credentials)
    implementation(libs.google.id)
    debugImplementation(libs.androidx.compose.ui.tooling)
    implementation(libs.androidx.compose.ui.tooling.preview)

    implementation(libs.media3.exoplayer)
    implementation(libs.media3.session)
    implementation(libs.media3.common)
    // F8: HLS media source (incl. Widevine SAMPLE-AES-CTR encrypted variants)
    implementation(libs.media3.exoplayer.hls)

    implementation(libs.retrofit)
    implementation(libs.retrofit.kotlinx.serialization)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.coil.compose)

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation("org.robolectric:robolectric:4.13")
    // Regression pin for the Demo-tap crash: OkHttp's header validator
    // (IllegalArgumentException on non-ASCII values) must stay on the
    // unit-test classpath — see DemoHeaderSafetyTest.
    testImplementation(libs.okhttp)
    testImplementation("androidx.compose.ui:ui-test-junit4")
    testImplementation("androidx.test.ext:junit:1.2.1")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
