package com.mq1.player.ui.screens

import android.Manifest
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import com.mq1.player.BuildConfig
import com.mq1.player.data.AppRelease
import com.mq1.player.data.LocalStore
import com.mq1.player.di.ServiceLocator
import com.mq1.player.ui.components.LucideIcon
import com.mq1.player.ui.components.MqIcon
import com.mq1.player.ui.components.MqIcons
import com.mq1.player.ui.components.WebPrimaryButton
import com.mq1.player.ui.theme.MqType
import com.mq1.player.ui.theme.mqThemes
import com.mq1.player.ui.vm.SettingsViewModel
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics

/**
 * Settings — exact port of the web SettingsView (mobile layout):
 * display header, pill tab bar, Card + CardTitle + SettingRow rows with
 * hairline separators, the 23-theme picker (collapsed row → grid) and the
 * «Скачать приложение» block with the REAL GitHub Releases URLs.
 *
 * The locked About/download block (SettingsDownloadTest) keeps its exact
 * wording + AppRelease.openDownload wiring on the default «Профиль» tab.
 */
@Composable
fun SettingsScreen(
    onLogout: () -> Unit,
    onBack: () -> Unit,
    onOpenProfile: () -> Unit = {},
    onOpenMixer: () -> Unit = {}
) {
    val vm: SettingsViewModel = viewModel()
    val appearance by vm.appearance.collectAsState(initial = LocalStore.Appearance())
    val sessionUser by vm.sessionUser.collectAsState(initial = null)
    val email by vm.email.collectAsState()
    val volumePercent by ServiceLocator.playbackController.volumePercent.collectAsState()
    val speed by ServiceLocator.playbackController.speed.collectAsState()
    val tasteGenres by ServiceLocator.localStore.tasteGenres.collectAsState(initial = emptySet())
    val context = LocalContext.current
    var notifGranted by remember { mutableStateOf(hasNotificationPermission(context)) }
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted -> notifGranted = granted }

    SettingsBody(
        appearance = appearance,
        username = sessionUser?.username,
        email = email,
        avatarUrl = sessionUser?.avatar,
        tasteGenres = tasteGenres,
        notificationsEnabled = notifGranted,
        volumePercent = volumePercent,
        speed = speed,
        onSetVolume = { ServiceLocator.playbackController.setVolume(it) },
        onSetSpeed = { ServiceLocator.playbackController.setPlaybackSpeed(it) },
        onOpenMixer = onOpenMixer,
        onSetTheme = vm::setTheme,
        onSetDarkMode = vm::setDarkMode,
        onSaveTaste = vm::saveTaste,
        onOpenProfile = onOpenProfile,
        onLogout = onLogout,
        onToggleNotifications = { enable ->
            if (enable) {
                if (Build.VERSION.SDK_INT >= 33) {
                    permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                } else {
                    notifGranted = true
                }
            } else {
                notifGranted = false
                runCatching {
                    context.startActivity(
                        Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                            .putExtra(
                                android.provider.Settings.EXTRA_APP_PACKAGE,
                                context.packageName
                            )
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    )
                }
            }
        },
        onDownloadApk = { AppRelease.openDownload(context) },
        onOpenUrl = { url -> openInBrowser(context, url) },
        onBack = onBack,
    )
}

private fun hasNotificationPermission(context: Context): Boolean =
    if (Build.VERSION.SDK_INT >= 33) {
        ContextCompat.checkSelfPermission(
            context, Manifest.permission.POST_NOTIFICATIONS
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED
    } else true

private fun openInBrowser(context: Context, url: String) {
    runCatching {
        context.startActivity(
            Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
    }
}

/** Web releases list («Все версии →»). */
private const val RELEASES_LIST_URL = "https://github.com/killkinhi-a11y/mq-player/releases"
private const val RELEASES_URL = "https://github.com/killkinhi-a11y/mq-player/releases"
private const val WINDOWS_SETUP_URL =
    "https://github.com/killkinhi-a11y/mq-player/releases/download/v1.0.1/MQ-Player-Setup.zip"

// ── SettingsBody — stateless (screenshot fixtures drive it directly) ───────

@Composable
internal fun SettingsBody(
    appearance: LocalStore.Appearance,
    username: String?,
    email: String? = null,
    avatarUrl: String?,
    tasteGenres: Set<String>,
    notificationsEnabled: Boolean,
    volumePercent: Float = 100f,
    speed: Float = 1f,
    onSetVolume: (Float) -> Unit = {},
    onSetSpeed: (Float) -> Unit = {},
    onOpenMixer: () -> Unit = {},
    onSetTheme: (String) -> Unit,
    onSetDarkMode: (String) -> Unit,
    onSaveTaste: (Set<String>) -> Unit,
    onOpenProfile: () -> Unit,
    onLogout: () -> Unit,
    onToggleNotifications: (Boolean) -> Unit,
    onDownloadApk: () -> Unit,
    onOpenUrl: (String) -> Unit,
    onBack: () -> Unit = {},
) {
    var tab by androidx.compose.runtime.saveable.rememberSaveable { mutableStateOf("account") }
    var selectedTaste by remember(tasteGenres) { mutableStateOf(tasteGenres) }
    var themeExpanded by androidx.compose.runtime.saveable.rememberSaveable { mutableStateOf(false) }

    Column(Modifier.fillMaxSize()) {
        Spacer(Modifier.height(52.dp))
        Column(Modifier.fillMaxSize().padding(horizontal = 12.dp)) {
            // ── Header row: back + title (web SettingsView is a tab without
            //    back; on Android Settings is a pushed detail route — UX pass
            //    2.3.4 wires the previously-dead onBack param into a visible
            //    affordance, same pattern as MyProfile) ────────────────────
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier
                        .size(44.dp)
                        .clip(CircleShape)
                        .clickable(onClick = onBack),
                    contentAlignment = Alignment.Center
                ) {
                    MqIcon(
                        icon = MqIcons.ArrowLeft, size = 22.dp,
                        tint = MaterialTheme.colorScheme.onBackground,
                        modifier = Modifier.semantics { contentDescription = "Назад" }
                    )
                }
                Spacer(Modifier.width(4.dp))
                Text(
                    "Настройки",
                    style = MqType.display.copy(fontSize = 26.sp),
                    color = MaterialTheme.colorScheme.onBackground
                )
            }
            Text(
                "Персонализируйте ваш mq",
                style = MqType.meta,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp, bottom = 16.dp)
            )

            // ── Mobile pill tab bar (web: p-1 r-card, wrap-content pills,
            //    horizontal scroll, min-h-44) ───────────────────────────────
            Row(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(MaterialTheme.colorScheme.background)
                    .border(1.dp, edgeBorder, RoundedCornerShape(12.dp))
                    .horizontalScroll(rememberScrollState())
                    .padding(4.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                SettingsTabs.forEach { t ->
                    val active = tab == t.id
                    Row(
                        Modifier
                            .height(44.dp)
                            .clip(CircleShape)
                            .background(if (active) MaterialTheme.colorScheme.primary else Color.Transparent)
                            .clickable { tab = t.id }
                            .semantics { contentDescription = t.label }
                            .padding(horizontal = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        MqIcon(
                            icon = t.icon,
                            size = 14.dp,
                            tint = if (active) MaterialTheme.colorScheme.onPrimary
                            else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Text(
                            t.label,
                            style = MqType.meta2.copy(fontWeight = FontWeight.W600),
                            color = if (active) MaterialTheme.colorScheme.onPrimary
                            else MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1
                        )
                    }
                }
            }

            // ── Tab content (scrollable under the pinned pill bar) ─────────
            Column(
                Modifier
                    .fillMaxSize()
                    .padding(top = 16.dp)
                    .verticalScroll(rememberScrollState())
            ) {
                when (tab) {
                    "account" -> AccountTab(
                        username = username,
                        email = email,
                        avatarUrl = avatarUrl,
                        onOpenProfile = onOpenProfile,
                        onLogout = onLogout,
                        onDownloadApk = onDownloadApk
                    )
                    "appearance" -> AppearanceTab(
                        appearance = appearance,
                        themeExpanded = themeExpanded,
                        onToggleThemeExpanded = { themeExpanded = !themeExpanded },
                        onSetTheme = onSetTheme,
                        onSetDarkMode = onSetDarkMode
                    )
                    "sound" -> SoundTab(
                        volumePercent = volumePercent,
                        speed = speed,
                        onSetVolume = onSetVolume,
                        onSetSpeed = onSetSpeed,
                        onOpenMixer = onOpenMixer
                    )
                    "notifications" -> NotificationsTab(
                        enabled = notificationsEnabled,
                        onToggle = onToggleNotifications
                    )
                    else -> MoreTab(
                        tasteGenres = tasteGenres,
                        selectedTaste = selectedTaste,
                        onToggleTaste = { g ->
                            selectedTaste =
                                if (g in selectedTaste) selectedTaste - g else selectedTaste + g
                        },
                        canSaveTaste = selectedTaste != tasteGenres,
                        onSaveTaste = { onSaveTaste(selectedTaste) },
                        onDownloadApk = onDownloadApk,
                        onOpenUrl = onOpenUrl
                    )
                }
                Spacer(Modifier.height(24.dp))
            }
        }
    }
}

private data class SettingsTab(val id: String, val label: String, val icon: LucideIcon)

/** Web TABS (labelShort form) — «Звук» is REAL now (громкость/скорость/эквалайзер). */
private val SettingsTabs = listOf(
    SettingsTab("account", "Профиль", MqIcons.User),
    SettingsTab("appearance", "Тема", MqIcons.Palette),
    SettingsTab("sound", "Звук", MqIcons.Volume2),
    SettingsTab("notifications", "Уведом.", MqIcons.Bell),
    SettingsTab("more", "Ещё", MqIcons.MoreHorizontal),
)

// ── Shared web-parity primitives ───────────────────────────────────────────

/** Web Card: r12, surface-2 bg + edge border. */
@Composable
private fun MqCard(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Column(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .border(1.dp, edgeBorder, RoundedCornerShape(12.dp))
    ) {
        content()
    }
}

/** Web CardTitle: 16px icon (muted) + mq-t-meta-2 bold uppercase wide-tracked. */
@Composable
private fun CardTitle(icon: LucideIcon, title: String) {
    Row(
        Modifier.fillMaxWidth().padding(start = 12.dp, end = 12.dp, top = 12.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        MqIcon(icon = icon, size = 16.dp, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(
            title,
            style = MqType.label,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun Hairline(modifier: Modifier = Modifier) {
    Box(
        modifier
            .fillMaxWidth()
            .height(1.dp)
            .background(hairlineColor)
    )
}

private val hairlineColor
    @Composable get() = MaterialTheme.colorScheme.outline.copy(alpha = 0.22f)
private val edgeBorder
    @Composable get() = MaterialTheme.colorScheme.outline.copy(alpha = 0.36f)

/**
 * Web SettingRow: 32dp r12 icon chip (surface-2 + edge; danger variant),
 * 14/500 label + meta2 subtitle, glass value chip, chevron when clickable.
 * ≥44dp row height (web: py-3 + 32dp chip = 56dp).
 */
@Composable
private fun SettingRow(
    icon: LucideIcon,
    label: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    value: String? = null,
    onClick: (() -> Unit)? = null,
    danger: Boolean = false,
    topDivider: Boolean = false,
    trailing: (@Composable () -> Unit)? = null,
) {
    Column(modifier) {
        if (topDivider) Hairline()
        Row(
            Modifier
                .fillMaxWidth()
                // UX pass 2.3.4: ripple stays inside the row bounds — a bare
                // clickable painted a square flash over the r12 card corners
                .then(
                    if (onClick != null)
                        Modifier.clip(RoundedCornerShape(10.dp)).clickable(onClick = onClick)
                    else Modifier
                )
                .heightIn(min = 56.dp)
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            val dangerColor = MaterialTheme.colorScheme.error
            Box(
                Modifier
                    .size(32.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(
                        if (danger) dangerColor.copy(alpha = 0.08f)
                        else MaterialTheme.colorScheme.surfaceVariant
                    )
                    .border(
                        1.dp,
                        if (danger) dangerColor.copy(alpha = 0.15f) else hairlineColor,
                        RoundedCornerShape(12.dp)
                    ),
                contentAlignment = Alignment.Center
            ) {
                MqIcon(
                    icon = icon,
                    size = 16.dp,
                    tint = if (danger) dangerColor else MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Column(Modifier.weight(1f)) {
                Text(
                    label,
                    style = MqType.body.copy(fontSize = 14.sp),
                    color = if (danger) dangerColor else MaterialTheme.colorScheme.onBackground,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                if (subtitle != null) {
                    Text(
                        subtitle,
                        style = MqType.meta2,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(top = 2.dp)
                    )
                }
            }
            if (value != null) {
                Box(
                    Modifier
                        .clip(RoundedCornerShape(50))
                        .background(MaterialTheme.colorScheme.onBackground.copy(alpha = 0.06f))
                        .padding(horizontal = 8.dp, vertical = 4.dp)
                ) {
                    Text(
                        value,
                        style = MqType.meta,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            trailing?.invoke()
            if (onClick != null && trailing == null) {
                MqIcon(
                    icon = MqIcons.ChevronRight,
                    size = 16.dp,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

/** Web SettingToggle icon chip reacts to the value (accent@12%/22%). */
@Composable
private fun SettingToggle(
    icon: LucideIcon,
    label: String,
    subtitle: String?,
    value: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Column {
        Hairline()
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 56.dp)
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            val accent = MaterialTheme.colorScheme.primary
            Box(
                Modifier
                    .size(32.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(
                        if (value) accent.copy(alpha = 0.12f)
                        else MaterialTheme.colorScheme.surfaceVariant
                    )
                    .border(
                        1.dp,
                        if (value) accent.copy(alpha = 0.22f) else hairlineColor,
                        RoundedCornerShape(12.dp)
                    ),
                contentAlignment = Alignment.Center
            ) {
                MqIcon(
                    icon = icon,
                    size = 16.dp,
                    tint = if (value) accent else MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Column(Modifier.weight(1f)) {
                Text(
                    label,
                    style = MqType.body.copy(fontSize = 14.sp),
                    color = MaterialTheme.colorScheme.onBackground
                )
                if (subtitle != null) {
                    Text(
                        subtitle,
                        style = MqType.meta2,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 2.dp)
                    )
                }
            }
            MqSwitch(checked = value, onCheckedChange = onCheckedChange)
        }
    }
}

/** Web LiquidGlassToggle (sm): 40×22 track, 16dp knob, accent when on.
 *  UX pass 2.3.4: wrapped in a 48dp touch box — the track itself is web
 *  parity and stays 40×22, but the hit area was only the track. */
@Composable
private fun MqSwitch(checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Box(
        Modifier
            .size(48.dp)
            .clickable { onCheckedChange(!checked) }
            .semantics { contentDescription = if (checked) "Включено" else "Выключено" },
        contentAlignment = Alignment.Center
    ) {
        Box(
            Modifier
                .width(40.dp)
                .height(22.dp)
                .clip(CircleShape)
                .background(
                    if (checked) MaterialTheme.colorScheme.primary
                    else MaterialTheme.colorScheme.onBackground.copy(alpha = 0.12f)
                ),
            contentAlignment = if (checked) Alignment.CenterEnd else Alignment.CenterStart
        ) {
            Box(
                Modifier
                    .padding(3.dp)
                    .size(16.dp)
                    .clip(CircleShape)
                    .background(Color.White)
            )
        }
    }
}

// ── ACCOUNT tab ─────────────────────────────────────────────────────────────

@Composable
private fun AccountTab(
    username: String?,
    email: String?,
    avatarUrl: String?,
    onOpenProfile: () -> Unit,
    onLogout: () -> Unit,
    onDownloadApk: () -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        // Профиль card (web: avatar + name + email + Открыть)
        MqCard {
            CardTitle(icon = MqIcons.User, title = "ПРОФИЛЬ")
            Hairline()
            Row(
                Modifier.fillMaxWidth().padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                SettingsAvatar(name = username ?: "?", url = avatarUrl)
                Column(Modifier.weight(1f)) {
                    Text(
                        username ?: "User",
                        style = MqType.section.copy(fontSize = 16.sp, fontWeight = FontWeight.W700),
                        color = MaterialTheme.colorScheme.onBackground,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        email?.takeIf { it.isNotBlank() } ?: "нет",
                        style = MqType.meta,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 2.dp)
                    )
                }
                // web: px-3 py-2 r-card, accent@12% bg, accent text
                Box(
                    Modifier
                        .height(36.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f))
                        .clickable(onClick = onOpenProfile)
                        .padding(horizontal = 12.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        "Открыть",
                        style = MqType.meta.copy(fontWeight = FontWeight.W600),
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }
        }

        // Данные card (web: Выйти — danger row)
        MqCard {
            CardTitle(icon = MqIcons.Cloud, title = "ДАННЫЕ")
            SettingRow(
                icon = MqIcons.LogOut,
                label = "Выйти",
                subtitle = "До встречи",
                onClick = onLogout,
                danger = true
            )
        }

        // О приложении — REGRESSION-LOCKED download block (PART 1/16):
        // exact wording + AppRelease.openDownload + ≥44dp touch target.
        MqCard {
            CardTitle(icon = MqIcons.Info, title = "О ПРИЛОЖЕНИИ")
            SettingRow(
                icon = MqIcons.Info,
                label = "MQ Player для Android",
                subtitle = "Версия ${BuildConfig.VERSION_NAME} · нативный клиент MQ (mq1.vercel.app)"
            )
            Hairline()
            Row(
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = 48.dp)
                    .clickable(onClick = onDownloadApk)
                    .padding(horizontal = 12.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Box(
                    Modifier
                        .size(32.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .border(1.dp, hairlineColor, RoundedCornerShape(12.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    MqIcon(
                        icon = MqIcons.Download,
                        size = 16.dp,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Text(
                    "Скачать Android-приложение",
                    style = MqType.body.copy(fontSize = 14.sp),
                    color = MaterialTheme.colorScheme.onBackground
                )
            }
            Hairline()
            Text(
                "Актуальный APK с официальной страницы релизов GitHub",
                style = MqType.meta,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(12.dp)
            )
        }
    }
}

/** Web profile avatar: 56dp round, image or accent + bold initial. */
@Composable
private fun SettingsAvatar(name: String, url: String?) {
    Box(
        Modifier
            .size(56.dp)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.primary),
        contentAlignment = Alignment.Center
    ) {
        if (!url.isNullOrBlank()) {
            AsyncImage(
                model = url,
                contentDescription = name,
                modifier = Modifier.size(56.dp).clip(CircleShape),
                contentScale = androidx.compose.ui.layout.ContentScale.Crop
            )
        } else {
            Text(
                name.firstOrNull()?.uppercase() ?: "U",
                style = MqType.section.copy(fontSize = 20.sp, fontWeight = FontWeight.W700),
                color = MaterialTheme.colorScheme.onPrimary
            )
        }
    }
}

// ── APPEARANCE tab ──────────────────────────────────────────────────────────

@Composable
private fun AppearanceTab(
    appearance: LocalStore.Appearance,
    themeExpanded: Boolean,
    onToggleThemeExpanded: () -> Unit,
    onSetTheme: (String) -> Unit,
    onSetDarkMode: (String) -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        // Тема card — collapsed row + expandable 23-theme grid (§K picker)
        MqCard {
            ThemeHeaderRow(
                currentId = appearance.themeId,
                expanded = themeExpanded,
                onToggle = onToggleThemeExpanded
            )
            if (themeExpanded) {
                Hairline()
                Column(Modifier.padding(12.dp)) {
                    mqThemes.chunked(3).forEach { chunk ->
                        Row(
                            Modifier.fillMaxWidth().padding(bottom = 8.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            chunk.forEach { palette ->
                                ThemeSwatch(
                                    name = palette.name,
                                    background = palette.background,
                                    card = palette.surface,
                                    accent = palette.accent,
                                    text = palette.text,
                                    active = appearance.themeId == palette.id,
                                    onClick = { onSetTheme(palette.id) },
                                    modifier = Modifier.weight(1f)
                                )
                            }
                            repeat(3 - chunk.size) { Spacer(Modifier.weight(1f)) }
                        }
                    }
                }
            }
        }

        // Режим card — dark mode selector (web playback-rate pill style)
        MqCard {
            // Moon Lucide glyph not extracted — SlidersHorizontal (settings)
            CardTitle(icon = MqIcons.SlidersHorizontal, title = "РЕЖИМ")
            Hairline()
            Column(Modifier.padding(12.dp)) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.onBackground.copy(alpha = 0.06f))
                        .padding(4.dp)
                ) {
                    listOf(
                        "system" to "Системный",
                        "light" to "Светлый",
                        "dark" to "Тёмный"
                    ).forEach { (mode, label) ->
                        val active = appearance.darkMode == mode
                        Box(
                            Modifier
                                .weight(1f)
                                .height(38.dp)
                                .clip(CircleShape)
                                .background(
                                    if (active) MaterialTheme.colorScheme.primary
                                    else Color.Transparent
                                )
                                .clickable { onSetDarkMode(mode) },
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                label,
                                style = MqType.meta.copy(fontWeight = FontWeight.W600),
                                color = if (active) MaterialTheme.colorScheme.onPrimary
                                else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }
        }
    }
}

/** Web collapsed theme row: 44dp mini preview + Тема + current name + chevron. */
@Composable
private fun ThemeHeaderRow(currentId: String, expanded: Boolean, onToggle: () -> Unit) {
    val palette = com.mq1.player.ui.theme.paletteById(currentId)
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .clickable(onClick = onToggle)
            .padding(horizontal = 12.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // web mini preview: 44dp, theme bg + edge + card block + accent bar/dot
        Box(
            Modifier
                .size(44.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(palette.background)
                .border(1.dp, edgeBorder, RoundedCornerShape(12.dp))
        ) {
            Box(
                Modifier
                    .align(Alignment.TopStart)
                    .padding(start = 6.dp, top = 8.dp)
                    .size(width = 12.dp, height = 28.dp)
                    .clip(RoundedCornerShape(3.dp))
                    .background(palette.surface)
            )
            Box(
                Modifier
                    .align(Alignment.BottomStart)
                    .padding(start = 6.dp, bottom = 8.dp)
                    .size(width = 12.dp, height = 3.dp)
                    .clip(RoundedCornerShape(50))
                    .background(palette.accent)
            )
            Box(
                Modifier
                    .align(Alignment.CenterEnd)
                    .padding(end = 8.dp)
                    .size(5.dp)
                    .clip(CircleShape)
                    .background(palette.accent)
            )
        }
        Column(Modifier.weight(1f)) {
            Text(
                "Тема",
                style = MqType.body.copy(fontSize = 14.sp, fontWeight = FontWeight.W600),
                color = MaterialTheme.colorScheme.onBackground
            )
            Text(
                palette.name,
                style = MqType.meta,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 2.dp)
            )
        }
        MqIcon(
            icon = if (expanded) MqIcons.ChevronUp else MqIcons.ChevronDown,
            size = 16.dp,
            tint = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

/**
 * Web mq-swatch cell: p-2 r12, 44dp mini-UI preview (theme bg/card block/
 * accent bar + dot + two text lines), meta2 name, active check badge.
 */
@Composable
private fun ThemeSwatch(
    name: String,
    background: Color,
    card: Color,
    accent: Color,
    text: Color,
    active: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val primary = MaterialTheme.colorScheme.primary
    Box(
        modifier
            .clip(RoundedCornerShape(12.dp))
            .background(
                if (active) primary.copy(alpha = 0.10f)
                else MaterialTheme.colorScheme.onBackground.copy(alpha = 0.05f)
            )
            .border(
                1.dp,
                if (active) primary.copy(alpha = 0.25f) else hairlineColor,
                RoundedCornerShape(12.dp)
            )
            .clickable(onClick = onClick)
    ) {
        Column(
            Modifier.padding(8.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(44.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(background)
                    .border(1.dp, text.copy(alpha = 0.08f), RoundedCornerShape(8.dp))
            ) {
                // card block: left 6, top 8, bottom 8, w14, r3
                Box(
                    Modifier
                        .align(Alignment.TopStart)
                        .padding(start = 6.dp, top = 8.dp)
                        .size(width = 14.dp, height = 28.dp)
                        .clip(RoundedCornerShape(3.dp))
                        .background(card)
                )
                // accent bar: left 6, bottom 8, w14 h3
                Box(
                    Modifier
                        .align(Alignment.BottomStart)
                        .padding(start = 6.dp, bottom = 8.dp)
                        .size(width = 14.dp, height = 3.dp)
                        .clip(RoundedCornerShape(50))
                        .background(accent)
                )
                // accent dot: right 8, centered, 6dp
                Box(
                    Modifier
                        .align(Alignment.CenterEnd)
                        .padding(end = 8.dp)
                        .size(6.dp)
                        .clip(CircleShape)
                        .background(accent)
                )
                // text line 1: left 22, top 10, w16 h3, text@55%
                Box(
                    Modifier
                        .align(Alignment.TopStart)
                        .padding(start = 22.dp, top = 10.dp)
                        .size(width = 16.dp, height = 3.dp)
                        .clip(RoundedCornerShape(50))
                        .background(text.copy(alpha = 0.55f))
                )
                // text line 2: left 22, top 18, w10 h2, text@30%
                Box(
                    Modifier
                        .align(Alignment.TopStart)
                        .padding(start = 22.dp, top = 18.dp)
                        .size(width = 10.dp, height = 2.dp)
                        .clip(RoundedCornerShape(50))
                        .background(text.copy(alpha = 0.30f))
                )
            }
            Spacer(Modifier.height(6.dp))
            Text(
                name,
                style = MqType.meta2,
                color = if (active) MaterialTheme.colorScheme.onBackground
                else MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.fillMaxWidth()
            )
        }
        if (active) {
            Box(
                Modifier
                    .align(Alignment.TopEnd)
                    .padding(4.dp)
                    .size(16.dp)
                    .clip(CircleShape)
                    .background(primary),
                contentAlignment = Alignment.Center
            ) {
                MqIcon(icon = MqIcons.Check, size = 10.dp, tint = MaterialTheme.colorScheme.onPrimary)
            }
        }
    }
}

// ── SOUND tab (web «Звук»: громкость · скорость · эквалайзер) ───────────────

@Composable
private fun SoundTab(
    volumePercent: Float,
    speed: Float,
    onSetVolume: (Float) -> Unit,
    onSetSpeed: (Float) -> Unit,
    onOpenMixer: () -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        MqCard {
            CardTitle(icon = MqIcons.Volume2, title = "ГРОМКОСТЬ")
            Hairline()
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                MqIcon(icon = MqIcons.Volume2, size = 18.dp, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                Slider(
                    value = volumePercent,
                    onValueChange = onSetVolume,
                    valueRange = 0f..100f,
                    modifier = Modifier
                        .weight(1f)
                        .padding(horizontal = 10.dp)
                        .semantics { contentDescription = "Громкость" }
                )
                Text(
                    "${volumePercent.toInt()}%",
                    style = MqType.num,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        MqCard {
            CardTitle(icon = MqIcons.Gauge, title = "СКОРОСТЬ ВОСПРОИЗВЕДЕНИЯ")
            Hairline()
            Column(Modifier.padding(horizontal = 12.dp, vertical = 10.dp)) {
                Text(
                    "Воспроизведение треков (тон не меняется)",
                    style = MqType.meta2,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf(0.75f, 1f, 1.25f, 1.5f, 2f).forEach { s ->
                        val selected = kotlin.math.abs(speed - s) < 0.01f
                        Text(
                            if (s == 1f) "1×" else "${s}×",
                            style = MqType.meta.copy(fontWeight = FontWeight.W600),
                            color = if (selected) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier
                                .clip(RoundedCornerShape(50))
                                .background(
                                    if (selected) MaterialTheme.colorScheme.primary.copy(alpha = 0.14f)
                                    else MaterialTheme.colorScheme.onBackground.copy(alpha = 0.05f)
                                )
                                .clickable { onSetSpeed(s) }
                                .padding(horizontal = 14.dp, vertical = 10.dp)
                        )
                    }
                }
            }
        }

        MqCard {
            CardTitle(icon = MqIcons.SlidersHorizontal, title = "КАЧЕСТВО")
            Hairline()
            Row(
                Modifier
                    .fillMaxWidth()
                    .clickable(onClick = onOpenMixer)
                    .padding(horizontal = 12.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        "Эквалайзер",
                        style = MqType.section.copy(fontSize = 15.sp, fontWeight = FontWeight.W600),
                        color = MaterialTheme.colorScheme.onBackground
                    )
                    Text(
                        "10-полосный с пресетами · лимитер · измерители",
                        style = MqType.meta2,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                MqIcon(icon = MqIcons.ChevronRight, size = 16.dp, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

// ── NOTIFICATIONS tab ───────────────────────────────────────────────────────

@Composable
private fun NotificationsTab(enabled: Boolean, onToggle: (Boolean) -> Unit) {
    MqCard {
        CardTitle(icon = MqIcons.Bell, title = "PUSH-УВЕДОМЛЕНИЯ")
        SettingToggle(
            icon = MqIcons.Bell,
            label = "Уведомления",
            subtitle = "Новые сообщения, обновления",
            value = enabled,
            onCheckedChange = onToggle
        )
    }
}

// ── MORE tab ────────────────────────────────────────────────────────────────

private val AllGenres = listOf(
    "Hip Hop", "Trap", "House", "Techno", "Drum & Bass", "Ambient",
    "Rock", "Indie Rock", "Metal", "Pop", "Lo-Fi", "Jazzhop",
    "Jazz", "Soul", "Funk", "R&B", "Classical", "Trip Hop"
)

@Composable
private fun MoreTab(
    tasteGenres: Set<String>,
    selectedTaste: Set<String>,
    onToggleTaste: (String) -> Unit,
    canSaveTaste: Boolean,
    onSaveTaste: () -> Unit,
    onDownloadApk: () -> Unit,
    onOpenUrl: (String) -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        // О приложении (web more: Версия / Сервер rows)
        MqCard {
            CardTitle(icon = MqIcons.Info, title = "О ПРИЛОЖЕНИИ")
            SettingRow(
                icon = MqIcons.Info,
                label = "Версия",
                value = "v${BuildConfig.VERSION_NAME}",
                topDivider = true
            )
            SettingRow(
                icon = MqIcons.Cloud,
                label = "Сервер",
                value = "mq1.vercel.app",
                topDivider = true
            )
        }

        // Музыкальные предпочтения (real taste store — Wave/recommendations)
        MqCard {
            CardTitle(icon = MqIcons.ListMusic, title = "МУЗЫКАЛЬНЫЕ ПРЕДПОЧТЕНИЯ")
            Hairline()
            Column(Modifier.padding(12.dp)) {
                Text(
                    "Жанры — основа для Волны и рекомендаций",
                    style = MqType.meta,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(8.dp))
                // web-style chip rows (two per row at 375dp)
                AllGenres.chunked(2).forEach { pair ->
                    Row(
                        Modifier.fillMaxWidth().padding(vertical = 2.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        pair.forEach { genre ->
                            val selected = genre in selectedTaste
                            Box(
                                Modifier
                                    .weight(1f)
                                    .height(38.dp)
                                    .clip(CircleShape)
                                    .background(
                                        if (selected) MaterialTheme.colorScheme.primary
                                        else MaterialTheme.colorScheme.onBackground.copy(alpha = 0.06f)
                                    )
                                    .border(
                                        1.dp,
                                        if (selected) MaterialTheme.colorScheme.primary
                                        else hairlineColor,
                                        CircleShape
                                    )
                                    .clickable { onToggleTaste(genre) },
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    genre,
                                    style = MqType.meta,
                                    color = if (selected) MaterialTheme.colorScheme.onPrimary
                                    else MaterialTheme.colorScheme.onBackground,
                                    maxLines = 1
                                )
                            }
                        }
                        if (pair.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
                Spacer(Modifier.height(12.dp))
                WebPrimaryButton(onClick = onSaveTaste, enabled = canSaveTaste) {
                    Text(
                        "Сохранить предпочтения",
                        style = MqType.btn,
                        color = MaterialTheme.colorScheme.onPrimary
                    )
                }
            }
        }

        // Скачать приложение (web more: 2×2 platform grid + footer)
        MqCard {
            CardTitle(icon = MqIcons.Download, title = "СКАЧАТЬ ПРИЛОЖЕНИЕ")
            Hairline()
            Column(Modifier.padding(12.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    DownloadCell(
                        label = "Windows",
                        icon = MqIcons.Monitor,
                        color = Color(0xFF3B82F6),
                        modifier = Modifier.weight(1f),
                        onClick = { onOpenUrl(WINDOWS_SETUP_URL) }
                    )
                    DownloadCell(
                        label = "macOS",
                        icon = MqIcons.Apple,
                        color = Color(0xFFA855F7),
                        modifier = Modifier.weight(1f),
                        onClick = { onOpenUrl(RELEASES_URL) }
                    )
                }
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    DownloadCell(
                        label = "Linux",
                        icon = MqIcons.Terminal,
                        color = Color(0xFFEAB308),
                        modifier = Modifier.weight(1f),
                        onClick = { onOpenUrl(RELEASES_URL) }
                    )
                    DownloadCell(
                        label = "Android APK",
                        icon = MqIcons.Smartphone,
                        color = Color(0xFF3DDC84),
                        modifier = Modifier.weight(1f),
                        onClick = onDownloadApk
                    )
                }
                Spacer(Modifier.height(12.dp))
                Hairline()
                Spacer(Modifier.height(12.dp))
                Row(
                    Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        "APK обновляется автоматически при каждом релизе",
                        style = MqType.meta2,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.weight(1f)
                    )
                    Text(
                        "Все версии →",
                        style = MqType.meta2.copy(fontWeight = FontWeight.W600),
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .clickable(onClick = { onOpenUrl(RELEASES_LIST_URL) })
                            .padding(horizontal = 10.dp, vertical = 10.dp)
                    )
                }
            }
        }
    }
}

/** Web mq-dl-link cell: column, icon 20 (platform color) + meta2 600 label. */
@Composable
private fun DownloadCell(
    label: String,
    icon: LucideIcon,
    color: Color,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Column(
        modifier
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.onBackground.copy(alpha = 0.05f))
            .clickable(onClick = onClick)
            .padding(vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        MqIcon(icon = icon, size = 20.dp, tint = color)
        Text(
            label,
            style = MqType.meta2.copy(fontWeight = FontWeight.W600),
            color = if (label == "Android APK") Color(0xFF3DDC84)
            else MaterialTheme.colorScheme.onBackground,
            maxLines = 1
        )
    }
}
