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

// ── API endpoints per configuration (Stage V, task G) ───────────────────────
// release : always PRODUCTION_API_BASE (override only with the explicit
//           -PmqAllowReleaseApiOverride=true, for staging builds);
// debug   : -PmqApiBase=… or production (developer app talks to real backend);
// tests   : unit tests get mq.testEnv=true + mq.apiBase=<mqTestApiBase>
//           (default: unreachable local address), instrumentation tests run
//           through MqTestRunner which sets the same properties. A production
//           URL as the test base fails the build at configuration time.
// Keep PRODUCTION_API_BASE equal to MqEnv.PRODUCTION_API_BASE (checked by tests).
val PRODUCTION_API_BASE = "https://mq1.vercel.app"
val PRODUCTION_HOSTS = setOf("mq1.vercel.app")
val mqApiBase: String = (project.findProperty("mqApiBase") as String?)?.takeIf { it.isNotBlank() } ?: PRODUCTION_API_BASE
val mqTestApiBase: String = (project.findProperty("mqTestApiBase") as String?)?.takeIf { it.isNotBlank() } ?: "http://127.0.0.1:8717"
val allowReleaseApiOverride = (project.findProperty("mqAllowReleaseApiOverride") as String?) == "true"
fun hostOfUrl(url: String): String =
    url.substringAfter("://").substringBefore('/').substringBefore(':').lowercase()
if (PRODUCTION_HOSTS.any { hostOfUrl(mqTestApiBase) == it || hostOfUrl(mqTestApiBase).endsWith(".$it") }) {
    throw GradleException("mqTestApiBase=$mqTestApiBase points at production — tests must use a local/fake server")
}
val releaseApiBase: String = if (allowReleaseApiOverride) mqApiBase else PRODUCTION_API_BASE

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

        buildConfigField("String", "PRODUCTION_API_BASE", "\"$PRODUCTION_API_BASE\"")
        testInstrumentationRunner = "com.mq1.player.MqTestRunner"
        testInstrumentationRunnerArguments["mqApiBase"] = mqTestApiBase
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
            buildConfigField("String", "API_BASE", "\"$releaseApiBase\"")
        }
        debug {
            buildConfigField("String", "API_BASE", "\"$mqApiBase\"")
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

    // Shared web/Android contracts and fixtures (repo-root shared/) are test
    // resources: classpath paths "contracts/…" and "test-fixtures/…".
    sourceSets {
        getByName("test") {
            resources.srcDir("../../shared")
        }
    }

    testOptions {
        unitTests.isIncludeAndroidResources = true
        // Parity screenshots (Robolectric) are written next to the web
        // references in <repo>/download/screens/parity.
        unitTests.all {
            // Test isolation: never production (see MqEnv / TestEnvironmentIsolationTest).
            it.systemProperty("mq.testEnv", "true")
            it.systemProperty("mq.apiBase", mqTestApiBase)
            it.systemProperty("mq.parityDir", rootProject.file("../download/screens/parity").absolutePath)
        }
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
    testImplementation(libs.okhttp.mockwebserver)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation("org.robolectric:robolectric:4.13")
    // Regression pin for the Demo-tap crash: OkHttp's header validator
    // (IllegalArgumentException on non-ASCII values) must stay on the
    // unit-test classpath — see DemoHeaderSafetyTest.
    testImplementation(libs.okhttp)
    testImplementation("androidx.compose.ui:ui-test-junit4")
    testImplementation("androidx.test.ext:junit:1.2.1")
    // Instrumentation: MqTestRunner (test env isolation) + smoke test.
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}

// ── Release endpoint guard (Stage V, task G) ────────────────────────────────
// Reads the GENERATED release BuildConfig and fails unless the shipped app
// talks to production. Run: ./gradlew :app:checkReleaseApiConfig (CI: android job).
val checkReleaseApiConfig by tasks.registering {
    group = "verification"
    description = "Verifies that the release variant's API_BASE is the production endpoint."
    dependsOn("generateReleaseBuildConfig")
    val buildConfigFile = layout.buildDirectory.file("generated/source/buildConfig/release/com/mq1/player/BuildConfig.java")
    val expected = PRODUCTION_API_BASE
    val overrideAllowed = allowReleaseApiOverride
    doLast {
        val src = buildConfigFile.get().asFile.readText()
        val apiBase = Regex("""String API_BASE = "([^"]*)"""").find(src)?.groupValues?.get(1)
            ?: throw GradleException("API_BASE not found in release BuildConfig")
        val isDebug = Regex("""boolean DEBUG = (\w+)""").find(src)?.groupValues?.get(1)
        if (isDebug != "false") throw GradleException("release BuildConfig.DEBUG must be false, was $isDebug")
        if (apiBase != expected && !overrideAllowed) {
            throw GradleException("release API_BASE=$apiBase, expected production $expected")
        }
        println("release API_BASE=$apiBase (production=${apiBase == expected}), DEBUG=$isDebug")
    }
}
