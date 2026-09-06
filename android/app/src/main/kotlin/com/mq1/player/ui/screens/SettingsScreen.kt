package com.mq1.player.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.mq1.player.di.ServiceLocator
import com.mq1.player.ui.theme.mqThemes

/**
 * Settings with proper Android navigation hierarchy:
 * Account / Appearance (theme + mode, real previews) / Listener preferences /
 * About + Logout.
 */
@Composable
fun SettingsScreen(onLogout: () -> Unit, onBack: () -> Unit) {
    val vm: com.mq1.player.ui.vm.SettingsViewModel = viewModel()
    val appearance by vm.appearance.collectAsState(initial = com.mq1.player.data.LocalStore.Appearance())
    val sessionUser by vm.sessionUser.collectAsState(initial = null)
    val tasteGenres by ServiceLocator.localStore.tasteGenres.collectAsState(initial = emptySet())
    var selectedTaste by remember { mutableStateOf(tasteGenres) }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp)
    ) {
        Spacer(Modifier.height(52.dp))
        Text("Настройки", style = MaterialTheme.typography.headlineMedium)

        // ── Account ──────────────────────────────────────────────────────────
        Spacer(Modifier.height(16.dp))
        SettingsCard("Аккаунт") {
            Row(verticalAlignment = Alignment.CenterVertically) {
                com.mq1.player.ui.components.Artwork(
                    url = sessionUser?.avatar, sizeDp = 48, corner = 24
                )
                Column(Modifier.padding(start = 12.dp)) {
                    Text(
                        sessionUser?.username ?: "…",
                        style = MaterialTheme.typography.titleMedium
                    )
                    Text(
                        sessionUser?.role?.let { "Роль: $it" } ?: "",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }

        // ── Appearance ───────────────────────────────────────────────────────
        Spacer(Modifier.height(12.dp))
        SettingsCard("Внешний вид") {
            Text("Режим", style = MaterialTheme.typography.labelLarge)
            Spacer(Modifier.height(8.dp))
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                listOf("system" to "Системный", "light" to "Светлый", "dark" to "Тёмный")
                    .forEachIndexed { i, (mode, label) ->
                        SegmentedButton(
                            selected = appearance.darkMode == mode,
                            onClick = { vm.setDarkMode(mode) },
                            shape = SegmentedButtonDefaults.itemShape(i, 3)
                        ) { Text(label) }
                    }
            }
            Spacer(Modifier.height(16.dp))
            Text("Тема", style = MaterialTheme.typography.labelLarge)
            Spacer(Modifier.height(8.dp))
            LazyVerticalGrid(
                columns = GridCells.Fixed(3),
                modifier = Modifier.height(((mqThemes.size / 3 + 1) * 108).dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                items(mqThemes) { palette ->
                    ThemePreviewTile(
                        name = palette.name,
                        background = palette.background,
                        card = palette.surface,
                        accent = palette.accent,
                        selected = appearance.themeId == palette.id,
                        onClick = { vm.setTheme(palette.id) }
                    )
                }
            }
        }

        // ── Listener preferences ─────────────────────────────────────────────
        Spacer(Modifier.height(12.dp))
        SettingsCard("Музыкальные предпочтения") {
            Text(
                "Жанры — основа для Волны и рекомендаций",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(8.dp))
            val allGenres = listOf(
                "Hip Hop", "Trap", "House", "Techno", "Drum & Bass", "Ambient",
                "Rock", "Indie Rock", "Metal", "Pop", "Lo-Fi", "Jazzhop",
                "Jazz", "Soul", "Funk", "R&B", "Classical", "Trip Hop"
            )
            allGenres.forEach { genre ->
                FilterChip(
                    selected = genre in selectedTaste,
                    onClick = {
                        selectedTaste =
                            if (genre in selectedTaste) selectedTaste - genre
                            else selectedTaste + genre
                    },
                    label = { Text(genre) },
                    modifier = Modifier.padding(vertical = 2.dp)
                )
            }
            Spacer(Modifier.height(8.dp))
            Button(
                onClick = { vm.saveTaste(selectedTaste) },
                enabled = selectedTaste != tasteGenres
            ) {
                Text("Сохранить предпочтения")
            }
        }

        // ── About / logout ───────────────────────────────────────────────────
        Spacer(Modifier.height(12.dp))
        SettingsCard("О приложении") {
            Text("MQ Player для Android", style = MaterialTheme.typography.bodyMedium)
            Text(
                "Версия 1.0.0 · нативный клиент MQ (mq1.vercel.app)",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        Spacer(Modifier.height(16.dp))
        OutlinedButton(
            onClick = onLogout,
            modifier = Modifier.fillMaxWidth(),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.error)
        ) {
            Text("Выйти из аккаунта", color = MaterialTheme.colorScheme.error)
        }
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun SettingsCard(title: String, content: @Composable () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text(title.uppercase(), style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(12.dp))
            content()
        }
    }
}

/** Mini-UI preview of a theme (same concept as the web theme picker). */
@Composable
private fun ThemePreviewTile(
    name: String,
    background: Color,
    card: Color,
    accent: Color,
    selected: Boolean,
    onClick: () -> Unit
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Surface(
            color = background,
            shape = MaterialTheme.shapes.medium,
            border = if (selected) BorderStroke(2.dp, accent) else null,
            modifier = Modifier
                .fillMaxWidth()
                .height(84.dp)
                .clickable(onClick = onClick)
        ) {
            Column(Modifier.padding(8.dp)) {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(38.dp)
                        .background(card)
                )
                Spacer(Modifier.height(6.dp))
                Box(
                    Modifier
                        .fillMaxWidth(0.55f)
                        .height(14.dp)
                        .background(accent)
                )
                Spacer(Modifier.height(6.dp))
                Box(
                    Modifier
                        .fillMaxWidth(0.8f)
                        .height(6.dp)
                        .background(card)
                )
            }
        }
        Spacer(Modifier.height(4.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (selected) {
                Icon(
                    Icons.Filled.Check, contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(14.dp)
                )
                Spacer(Modifier.width(3.dp))
            }
            Text(name, style = MaterialTheme.typography.labelMedium)
        }
    }
}
