package com.mq1.player.ui.screens

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mq1.player.data.LocalStore
import com.mq1.player.data.api.RegisterResponse
import com.mq1.player.data.api.Track
import com.mq1.player.di.ServiceLocator
import com.mq1.player.ui.components.MqIcon
import com.mq1.player.ui.components.MqIcons
import com.mq1.player.ui.theme.LocalMqPalette
import com.mq1.player.ui.theme.MqType
import kotlinx.coroutines.launch

/**
 * WEB PARITY — exact port of the web AuthView "telegram" landing
 * (src/components/mq/AuthView.tsx), 375×844 reference:
 *
 *  page: bg + theme radial gradient + 6 telegram glow blobs (3–8%)
 *  card: bg card, 1dp border, r16, p24, max 448dp, centered
 *   ├ 64×64 accent r16 logo, "mq" 24/800 white
 *   ├ "Вход в MQ Player" 20/600
 *   ├ subtitle 14/400 muted
 *   ├ Google button: white bg, #1F2937 text, #E5E7EB border, r12, 44dp
 *   ├ hairline ─ Telegram section
 *   │   header: Send 16 telegram + "Вход через Telegram" 14/500
 *   │   helper 12/400 muted
 *   │   "Открыть бота в Telegram": telegram@15% bg + @30% border, r12
 *   │   6 OTP boxes 44×56 r12 (border: telegram filled / red error)
 *   │   "Подтвердить": telegram bg, white, r12, 44dp
 *   ├ "Продолжить с Email": inputBg + border, r12, Mail 16
 *   ├ hairline ─ "Демо-режим" (muted) | "Регистрация" (text 14/500)
 *   └ hairline ─ legal 12/400 muted underline
 *
 * Telegram flow = the existing native bot-code login (unchanged logic).
 * Email / Регистрация / confirm = the same API endpoints the web uses.
 * Демо-режим = local demo session + public demo tracks (web semantics).
 */
private val Telegram = Color(0xFF2AABEE)          // --mq-telegram

@Composable
fun LoginScreen(onLoggedIn: (LocalStore.SessionUser) -> Unit) {
    var step by remember { mutableStateOf("landing") } // landing | email | register | confirm
    var registerEmail by remember { mutableStateOf("") }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        // theme radial gradient + telegram glow blobs (web background)
        Box(
            Modifier
                .fillMaxSize()
                .background(
                    Brush.radialGradient(
                        listOf(Color.Transparent, Color.Transparent),
                        radius = 900f
                    )
                )
        )
        AuthGlowBlobs()

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            when (step) {
                "email" -> EmailLoginCard(
                    onBack = { step = "landing" },
                    onLoggedIn = onLoggedIn,
                    onNeedConfirm = { step = "confirm" }
                )
                "register" -> RegisterCard(
                    email = registerEmail,
                    onEmail = { registerEmail = it },
                    onBack = { step = "landing" },
                    onRegistered = { step = "confirm" }
                )
                "confirm" -> ConfirmCard(
                    email = registerEmail,
                    onConfirmed = onLoggedIn,
                    onBack = { step = "register" }
                )
                else -> AuthLandingCard(
                    onEmail = { step = "email" },
                    onRegister = { step = "register" },
                    onLoggedIn = onLoggedIn,
                    onDemo = { user ->
                        // web demo semantics: local session + demo queue
                        ServiceLocator.playbackController.playQueue(DemoTracks, 0)
                        onLoggedIn(user)
                    }
                )
            }
        }
    }
}

/** Web DEMO_TRACKS — public CC0 samples served by the production host. */
val DemoTracks = listOf(
    demoTrack("demo-1", "Ambient Dreams", "ambient", 40, 1),
    demoTrack("demo-2", "Electronic Pulse", "electronic", 40, 2),
    demoTrack("demo-3", "Jazz Evening", "jazz", 40, 3),
    demoTrack("demo-4", "Rock Energy", "rock", 40, 4),
)

private fun demoTrack(id: String, title: String, genre: String, duration: Int, n: Int) = Track(
    id = id, title = title, artist = "MQ Demo", album = "Demo Collection",
    duration = duration.toDouble(), cover = "https://mq1.vercel.app/icon-512.png",
    genre = genre, source = "demo",
    audioUrl = "https://mq1.vercel.app/demo/song$n.mp3"
)

// ── background decorations ─────────────────────────────────────────────────

@Composable
private fun AuthGlowBlobs() {
    val positions = listOf(10 to 20, 25 to 40, 40 to 60, 55 to 20, 70 to 40, 85 to 60)
    positions.forEachIndexed { i, (x, y) ->
        Box(
            Modifier
                .padding(start = (x * 3.75).dp, top = (y * 8.44).dp)
                .size((100 + i * 60).dp)
                .background(
                    Brush.radialGradient(
                        listOf(Telegram.copy(alpha = 0.05f + i * 0.01f), Color.Transparent)
                    )
                )
        )
    }
}

// ── shared web-parity primitives ───────────────────────────────────────────

@Composable
private fun AuthCard(content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(16.dp))
            .padding(24.dp)
    ) { content() }
}

@Composable
private fun WebButton(
    text: String,
    modifier: Modifier = Modifier,
    bg: Color = LocalMqPalette.current.inputBg,
    border: Color = MaterialTheme.colorScheme.outline,
    textColor: Color = MaterialTheme.colorScheme.onBackground,
    icon: (@Composable () -> Unit)? = null,
    enabled: Boolean = true,
    loading: Boolean = false,
    onClick: () -> Unit
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(44.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(if (enabled) bg else bg.copy(alpha = 0.5f))
            .border(1.dp, border, RoundedCornerShape(12.dp))
            .clickable(enabled = enabled && !loading, onClick = onClick),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (loading) {
            CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = textColor)
        } else {
            icon?.invoke()
            if (icon != null) Spacer(Modifier.width(10.dp))
            Text(text, style = MqType.body.copy(fontSize = 14.sp), color = textColor)
        }
    }
}

/** Google "G" logo — EXACT official multicolor SVG paths from AuthView.tsx (48×48 viewBox). */
@Composable
private fun GoogleLogo() {
    androidx.compose.foundation.Canvas(Modifier.size(18.dp)) {
        val s = size.width / 48f
        fun p(d: String, color: Color) {
            val path = com.mq1.player.ui.components.SvgPathParser(d).parse()
            withTransform({ scale(s, s, pivot = androidx.compose.ui.geometry.Offset.Zero) }) {
                drawPath(path, color, style = androidx.compose.ui.graphics.drawscope.Fill)
            }
        }
        p("M43.611,20.083H42V20H24v8h11.307c-1.646,4.646-6.07,8-11.307,8c-6.627,0-12-5.373-12-12s5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.514,6.757,29.604,4,24,4C12.955,4,4,12.955,4,24s8.955,20,20,20s20-8.955,20-20C44,22.659,43.862,21.335,43.611,20.083z", Color(0xFFFFC107))
        p("M6.306,14.691l6.571,4.835C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.514,6.757,29.604,4,24,4C16.318,4,9.656,8.336,6.306,14.691z", Color(0xFFFF3D00))
        p("M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.236,0-9.657-3.347-11.307-7.99l-6.534,5.046C9.505,39.556,16.228,44,24,44z", Color(0xFF4CAF50))
        p("M43.611,20.083H42V20H24v8h11.307c-0.792,2.237-2.231,4.166-4.087,5.571l6.19,5.238C39.36,33.131,44,27.417,44,24C44,22.659,43.862,21.335,43.611,20.083z", Color(0xFF1976D2))
    }
}

// ── landing card (web authStep "telegram") ─────────────────────────────────

@Composable
private fun AuthLandingCard(
    onEmail: () -> Unit,
    onRegister: () -> Unit,
    onLoggedIn: (LocalStore.SessionUser) -> Unit,
    onDemo: (LocalStore.SessionUser) -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val auth = ServiceLocator.authRepository

    var botName by remember { mutableStateOf<String?>(null) }
    var botConfigured by remember { mutableStateOf<Boolean?>(null) }
    var code by remember { mutableStateOf("") }
    var username by remember { mutableStateOf("") }
    var needsUsername by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var demoBusy by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        val name = auth.botName()
        botConfigured = name != null
        botName = name
    }

    AuthCard {
        // header
        Box(
            modifier = Modifier
                .size(64.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(MaterialTheme.colorScheme.primary),
            contentAlignment = Alignment.Center
        ) {
            Text("mq", style = MqType.display.copy(fontSize = 24.sp), color = Color.White)
        }
        Spacer(Modifier.height(16.dp))
        Text(
            "Вход в MQ Player",
            style = MqType.page.copy(fontSize = 20.sp, fontWeight = FontWeight.W600),
            color = MaterialTheme.colorScheme.onBackground,
            modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center
        )
        Text(
            "Музыка, плейлисты и чаты синхронизированы между устройствами",
            style = MqType.body.copy(fontSize = 14.sp, fontWeight = FontWeight.W400),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(24.dp))

        // Google (browser OAuth — same flow the web starts at /api/auth/google)
        WebButton(
            text = "Продолжить с Google",
            bg = Color.White,
            border = Color(0xFFE5E7EB),
            textColor = Color(0xFF1F2937),
            icon = { GoogleLogo() }
        ) {
            runCatching {
                context.startActivity(
                    Intent(Intent.ACTION_VIEW, android.net.Uri.parse("https://mq1.vercel.app/api/auth/google"))
                )
            }
        }

        // Telegram section
        Spacer(Modifier.height(16.dp))
        Box(Modifier.fillMaxWidth().height(1.dp).background(MaterialTheme.colorScheme.outline.copy(alpha = 0.22f)))
        Spacer(Modifier.height(16.dp))

        Row(horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
            MqIcon(icon = MqIcons.Send, size = 16.dp, tint = Telegram)
            Spacer(Modifier.width(8.dp))
            Text("Вход через Telegram", style = MqType.body.copy(fontSize = 14.sp, fontWeight = FontWeight.W500), color = MaterialTheme.colorScheme.onBackground)
        }
        Spacer(Modifier.height(12.dp))
        Text(
            "Откройте бота в Telegram и отправьте любое сообщение. Бот пришлёт 6-значный код подтверждения",
            style = MqType.meta.copy(fontSize = 12.sp),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(12.dp))

        if (botConfigured == true && botName != null) {
            WebButton(
                text = "Открыть бота в Telegram",
                bg = Telegram.copy(alpha = 0.15f),
                border = Telegram.copy(alpha = 0.3f),
                textColor = Telegram,
                icon = { MqIcon(icon = MqIcons.Send, size = 16.dp, tint = Telegram) }
            ) {
                runCatching {
                    context.startActivity(
                        Intent(Intent.ACTION_VIEW, android.net.Uri.parse("https://t.me/$botName?start=code"))
                    )
                }
            }
            Spacer(Modifier.height(16.dp))
        }

        OtpBoxes(
            code = code,
            error = error != null,
            onCode = { code = it }
        )
        if (needsUsername) {
            Spacer(Modifier.height(12.dp))
            WebInput(
                value = username,
                onValue = { if (it.length <= 20) username = it },
                placeholder = "Имя пользователя (латиница)"
            )
        }
        Spacer(Modifier.height(16.dp))

        error?.let {
            Text(
                it,
                style = MqType.body.copy(fontSize = 14.sp),
                color = Color(0xFFFF6B6B),
                modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
                textAlign = TextAlign.Center
            )
        }

        WebButton(
            text = "Подтвердить",
            bg = Telegram,
            border = Telegram,
            textColor = Color.White,
            enabled = code.length == 6 && !busy,
            loading = busy
        ) {
            if (code.length != 6 || (needsUsername && username.isBlank())) return@WebButton
            busy = true
            error = null
            scope.launch {
                val result = auth.verifyCode(code, username.takeIf { needsUsername })
                busy = false
                when {
                    result == null -> error = "Сеть недоступна. Проверьте подключение."
                    result.error != null -> error = result.error
                    result.isNewUser && !needsUsername -> {
                        needsUsername = true
                        error = "Новый пользователь — выберите имя"
                    }
                    result.userId != null -> onLoggedIn(
                        LocalStore.SessionUser(
                            userId = result.userId ?: "",
                            username = result.username ?: username,
                            role = result.role ?: "user",
                            avatar = result.avatar
                        )
                    )
                    else -> error = result.message ?: "Не удалось войти"
                }
            }
        }

        Spacer(Modifier.height(16.dp))
        WebButton(
            text = "Продолжить с Email",
            icon = { MqIcon(icon = MqIcons.Mail, size = 16.dp) }
        ) { onEmail() }

        // bottom links
        Spacer(Modifier.height(24.dp))
        Box(Modifier.fillMaxWidth().height(1.dp).background(MaterialTheme.colorScheme.outline.copy(alpha = 0.22f)))
        Spacer(Modifier.height(16.dp))
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                if (demoBusy) "Загрузка…" else "Демо-режим",
                style = MqType.body.copy(fontSize = 14.sp, fontWeight = FontWeight.W400),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.clickable(enabled = !demoBusy) {
                    demoBusy = true
                    onDemo(
                        LocalStore.SessionUser(
                            userId = "demo-user-id", username = "Демо", role = "user",
                            avatar = null
                        )
                    )
                }
            )
            Text(
                "Регистрация",
                style = MqType.body.copy(fontSize = 14.sp, fontWeight = FontWeight.W500),
                color = MaterialTheme.colorScheme.onBackground,
                modifier = Modifier.clickable { onRegister() }
            )
        }

        // legal
        Spacer(Modifier.height(16.dp))
        Box(Modifier.fillMaxWidth().height(1.dp).background(MaterialTheme.colorScheme.outline.copy(alpha = 0.22f)))
        Spacer(Modifier.height(16.dp))
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.Center
        ) {
            LegalLink("Политика конфиденциальности", "https://mq1.vercel.app/privacy")
            Spacer(Modifier.width(8.dp))
            LegalLink("Условия использования", "https://mq1.vercel.app/terms")
        }
    }
}

@Composable
private fun LegalLink(text: String, url: String) {
    val context = LocalContext.current
    Text(
        text,
        style = MqType.meta.copy(fontSize = 12.sp),
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        textDecoration = TextDecoration.Underline,
        modifier = Modifier.clickable {
            runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url))) }
        }
    )
}

/** 6 single-digit boxes — web 44×56 r12, filled border telegram / error red. */
@Composable
private fun OtpBoxes(code: String, error: Boolean, onCode: (String) -> Unit) {
    val inputBg = LocalMqPalette.current.inputBg
    val outline = MaterialTheme.colorScheme.outline
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        repeat(6) { i ->
            val ch = code.getOrNull(i)?.toString() ?: ""
            val borderColor = when {
                error -> Color(0xFFEF4444)
                ch.isNotEmpty() -> Telegram
                else -> outline
            }
            BasicTextField(
                value = ch,
                onValueChange = { v ->
                    if (v.length <= 1 && (v.isEmpty() || v[0].isDigit())) {
                        onCode(code.take(i) + v + code.drop(i + 1))
                    }
                },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                singleLine = true,
                textStyle = MqType.display.copy(
                    fontSize = 20.sp, fontWeight = FontWeight.W700,
                    textAlign = TextAlign.Center
                ).let { it.copy(color = MaterialTheme.colorScheme.onBackground) },
                modifier = Modifier
                    .width(44.dp)
                    .height(56.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(inputBg)
                    .border(2.dp, borderColor, RoundedCornerShape(12.dp))
            )
        }
    }
}

/** Web-style form input (inputBg, hairline border, r12, 44dp). */
@Composable
internal fun WebInput(
    value: String,
    onValue: (String) -> Unit,
    placeholder: String,
    password: Boolean = false,
    keyboardType: KeyboardType = KeyboardType.Text
) {
    BasicTextField(
        value = value,
        onValueChange = onValue,
        singleLine = true,
        visualTransformation = if (password) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        textStyle = MqType.body.copy(color = MaterialTheme.colorScheme.onBackground),
        decorationBox = { inner ->
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(44.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(LocalMqPalette.current.inputBg)
                    .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(12.dp))
                    .padding(horizontal = 14.dp),
                contentAlignment = Alignment.CenterStart
            ) {
                if (value.isEmpty()) {
                    Text(placeholder, style = MqType.body.copy(fontSize = 14.sp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                inner()
            }
        }
    )
}

// ── email login card (web authStep "login") ───────────────────────────────

@Composable
private fun EmailLoginCard(
    onBack: () -> Unit,
    onLoggedIn: (LocalStore.SessionUser) -> Unit,
    onNeedConfirm: () -> Unit
) {
    val scope = rememberCoroutineScope()
    val auth = ServiceLocator.authRepository
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    AuthCard {
        BackHeader("Вход по email", onBack)
        Spacer(Modifier.height(16.dp))
        WebInput(email, { email = it }, "email@example.com", keyboardType = KeyboardType.Email)
        Spacer(Modifier.height(12.dp))
        WebInput(password, { password = it }, "Пароль", password = true)
        error?.let {
            Spacer(Modifier.height(12.dp))
            Text(it, style = MqType.body, color = Color(0xFFFF6B6B), modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
            if (it.contains("подтверд", ignoreCase = true)) {
                Spacer(Modifier.height(8.dp))
                Text(
                    "Подтвердить почту", style = MqType.body.copy(fontWeight = FontWeight.W500),
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier
                        .align(Alignment.CenterHorizontally)
                        .clickable { onNeedConfirm() }
                )
            }
        }
        Spacer(Modifier.height(16.dp))
        WebButton(
            text = "Войти", bg = MaterialTheme.colorScheme.primary,
            border = MaterialTheme.colorScheme.primary, textColor = MaterialTheme.colorScheme.onPrimary,
            enabled = email.isNotBlank() && password.isNotBlank() && !busy,
            loading = busy
        ) {
            busy = true; error = null
            scope.launch {
                val result = auth.loginWithEmail(email, password)
                busy = false
                when {
                    result == null -> error = "Ошибка соединения. Проверьте интернет."
                    result.userId != null -> onLoggedIn(
                        LocalStore.SessionUser(
                            userId = result.userId ?: "", username = result.username ?: "",
                            role = result.role ?: "user", avatar = result.avatar
                        )
                    )
                    else -> error = result.error ?: result.message ?: "Ошибка входа"
                }
            }
        }
    }
}

// ── register card (web authStep "register") ───────────────────────────────

@Composable
private fun RegisterCard(
    email: String,
    onEmail: (String) -> Unit,
    onBack: () -> Unit,
    onRegistered: () -> Unit
) {
    val scope = rememberCoroutineScope()
    val auth = ServiceLocator.authRepository
    var username by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    AuthCard {
        BackHeader("Регистрация", onBack)
        Spacer(Modifier.height(16.dp))
        WebInput(username, { username = it }, "Имя пользователя")
        Spacer(Modifier.height(12.dp))
        WebInput(email, { onEmail(it) }, "email@example.com", keyboardType = KeyboardType.Email)
        Spacer(Modifier.height(12.dp))
        WebInput(password, { password = it }, "Пароль (мин. 6 символов)", password = true)
        error?.let {
            Spacer(Modifier.height(12.dp))
            Text(it, style = MqType.body, color = Color(0xFFFF6B6B), modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
        }
        Spacer(Modifier.height(16.dp))
        WebButton(
            text = "Создать аккаунт", bg = MaterialTheme.colorScheme.primary,
            border = MaterialTheme.colorScheme.primary, textColor = MaterialTheme.colorScheme.onPrimary,
            enabled = username.isNotBlank() && email.isNotBlank() && password.length >= 6 && !busy,
            loading = busy
        ) {
            busy = true; error = null
            scope.launch {
                val result = auth.registerEmail(username, email, password)
                busy = false
                if (result == null) {
                    error = "Ошибка соединения. Проверьте интернет."
                } else if (result.devCode != null || result.error == null) {
                    onRegistered()
                } else {
                    error = result.error ?: "Ошибка регистрации"
                }
            }
        }
    }
}

// ── confirm card (web authStep "confirm") ─────────────────────────────────

@Composable
private fun ConfirmCard(
    email: String,
    onConfirmed: (LocalStore.SessionUser) -> Unit,
    onBack: () -> Unit
) {
    val scope = rememberCoroutineScope()
    val auth = ServiceLocator.authRepository
    var code by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    AuthCard {
        BackHeader("Подтвердите почту", onBack)
        Spacer(Modifier.height(16.dp))
        Text(
            "Введите 6-значный код из письма",
            style = MqType.body, color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(16.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
            OtpBoxes(code, error != null) { code = it }
        }
        error?.let {
            Spacer(Modifier.height(12.dp))
            Text(it, style = MqType.body, color = Color(0xFFFF6B6B), modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
        }
        Spacer(Modifier.height(16.dp))
        WebButton(
            text = "Подтвердить", bg = Telegram, border = Telegram, textColor = Color.White,
            enabled = code.length == 6 && !busy, loading = busy,
            modifier = Modifier.fillMaxWidth()
        ) {
            busy = true; error = null
            scope.launch {
                val result = if (email.isBlank()) null else auth.confirmEmailCode(email, code)
                busy = false
                when {
                    result == null -> error = "Не указан email. Начните регистрацию заново."
                    result.userId != null -> onConfirmed(
                        LocalStore.SessionUser(
                            userId = result.userId ?: "", username = result.username ?: "",
                            role = result.role ?: "user", avatar = result.avatar
                        )
                    )
                    else -> error = result.error ?: result.message ?: "Неверный код"
                }
            }
        }
    }
}

@Composable
private fun BackHeader(title: String, onBack: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier
                .size(32.dp)
                .clip(RoundedCornerShape(8.dp))
                .clickable(onClick = onBack),
            contentAlignment = Alignment.Center
        ) {
            MqIcon(icon = MqIcons.ChevronLeft, size = 20.dp)
        }
        Spacer(Modifier.width(10.dp))
        Text(
            title,
            style = MqType.page.copy(fontSize = 20.sp, fontWeight = FontWeight.W600),
            color = MaterialTheme.colorScheme.onBackground
        )
    }
}
