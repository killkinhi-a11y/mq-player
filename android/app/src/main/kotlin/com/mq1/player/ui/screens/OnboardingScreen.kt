package com.mq1.player.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import com.mq1.player.di.ServiceLocator
import kotlinx.coroutines.launch
import androidx.compose.runtime.rememberCoroutineScope

/** Listener-preferences onboarding: genre chips → taste profile → Wave seeds. */
@Composable
fun OnboardingScreen(onDone: () -> Unit) {
    val scope = rememberCoroutineScope()
    var selected by remember { mutableStateOf(setOf<String>()) }

    val categories = listOf(
        "Хип-хоп" to listOf("Hip Hop", "Rap", "Trap", "Drill"),
        "Электроника" to listOf("House", "Techno", "Dubstep", "Drum & Bass", "Ambient"),
        "Рок" to listOf("Rock", "Indie Rock", "Punk", "Metal", "Alt Rock"),
        "Поп" to listOf("Pop", "Dance Pop", "Synth-pop"),
        "Альтернатива" to listOf("Alternative", "Post-Punk", "Shoegaze"),
        "Лоу-фай и чилл" to listOf("Lo-Fi", "Chillhop", "Jazzhop", "Trip Hop"),
        "Джаз и соул" to listOf("Jazz", "Soul", "Funk", "R&B"),
        "Классика" to listOf("Classical", "Piano", "Orchestral")
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp)
    ) {
        Spacer(Modifier.height(48.dp))
        Text("Что слушаем?", style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(8.dp))
        Text(
            "Выберите жанры — Волна будет подбирать треки под ваш вкус. Это можно изменить в настройках.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(Modifier.height(24.dp))

        categories.forEach { (category, genres) ->
            Text(
                category.uppercase(),
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                genres.forEach { genre ->
                    FilterChip(
                        selected = genre in selected,
                        onClick = {
                            selected = if (genre in selected) selected - genre else selected + genre
                        },
                        label = { Text(genre) }
                    )
                }
            }
            Spacer(Modifier.height(16.dp))
        }

        Spacer(Modifier.height(8.dp))
        Button(
            onClick = {
                scope.launch {
                    ServiceLocator.localStore.setTasteGenres(selected)
                    runCatching {
                        ServiceLocator.api.saveFavoriteArtists(
                            com.mq1.player.data.api.SaveFavoriteArtistsBody(
                                artists = selected.toList(),
                                completeOnboarding = true
                            )
                        )
                    }
                    onDone()
                }
            },
            enabled = selected.isNotEmpty(),
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Начать слушать (${selected.size})")
        }
        Spacer(Modifier.height(24.dp))
    }
}
