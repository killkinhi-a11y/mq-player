package com.mq1.player.ui.screens

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import com.mq1.player.data.MqUrls
import com.mq1.player.ui.components.Artwork
import com.mq1.player.ui.components.ErrorState
import com.mq1.player.ui.components.LoadingState
import com.mq1.player.ui.components.MqIcon
import com.mq1.player.ui.components.MqIcons
import com.mq1.player.ui.components.TrackRow
import com.mq1.player.ui.theme.MqType
import com.mq1.player.ui.vm.ArtistViewModel
import com.mq1.player.ui.vm.PlayerViewModel

/**
 * WEB PARITY artist — port of ArtistDetailView.tsx (mobile, 375px):
 *  ┌ hero: full-bleed artwork (1:0.92) + dark gradient scrim,
 *  │ back/share floating on top, «АРТИСТ» badge, huge name,
 *  │ stats (подписчики · треки · жанр)
 *  ├ actions: «Слушать» (accent, full-width) · Перемешать 48 · ♥ подписка · share
 *  ├ «Популярное» section + track rows with real context menus
 *  └ long names ellipsized, RTL-safe
 */
@Composable
fun ArtistScreen(artistName: String, onBack: () -> Unit) {
    val vm: ArtistViewModel = viewModel()
    val context = LocalContext.current
    val player: PlayerViewModel = viewModel()
    val ui by vm.ui.collectAsState()
    val queue by player.controller.queue.collectAsState()
    val currentIndex by player.controller.currentIndex.collectAsState()
    val favorites by player.favorites.collectAsState(initial = emptyList())
    val subscribedArtists by player.controller.subscribedArtists.collectAsState()

    val menu = remember { com.mq1.player.ui.components.TrackMenuState() }

    LaunchedEffect(artistName) { vm.load(artistName) }

    val heroUrl = remember(ui.info, ui.avatarTrack) {
        MqUrls.absolute(ui.info?.avatar?.takeIf { it.isNotBlank() } ?: ui.avatarTrack?.cover)
    }
    val info = ui.info
    val genreLabel = info?.genre?.takeIf { it.isNotBlank() }
    val followers = info?.followers ?: 0L
    val accent = MaterialTheme.colorScheme.primary
    val text = MaterialTheme.colorScheme.onBackground
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val isSubscribed = subscribedArtists.contains(ui.name)

    Box(Modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(bottom = 16.dp)
        ) {
            // ── web hero: full-bleed artwork + scrim + identity + actions ──
            item {
                Box(Modifier.fillMaxWidth()) {
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .aspectRatio(1f / 0.92f)
                    ) {
                        if (heroUrl != null) {
                            AsyncImage(
                                model = heroUrl,
                                contentDescription = "Обложка артиста ${ui.name}",
                                modifier = Modifier.fillMaxSize(),
                                contentScale = ContentScale.Crop
                            )
                        } else {
                            Box(
                                Modifier
                                    .fillMaxSize()
                                    .background(
                                        Brush.verticalGradient(
                                            listOf(
                                                accent.copy(alpha = 0.35f),
                                                Color.Black
                                            )
                                        )
                                    )
                            )
                        }
                        // web: gradient from artwork color → page bg (dark scrim)
                        Box(
                            Modifier
                                .fillMaxSize()
                                .background(
                                    Brush.verticalGradient(
                                        0f to Color.Black.copy(alpha = 0.30f),
                                        0.55f to Color.Black.copy(alpha = 0.15f),
                                        1f to Color.Black.copy(alpha = 0.72f)
                                    )
                                )
                        )
                    }

                    // floating navigation (web: absolute over the hero)
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .statusBarsPadding()
                            .padding(horizontal = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        IconButton(onClick = onBack) {
                            Icon(
                                Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = "Назад",
                                tint = Color.White
                            )
                        }
                        Spacer(Modifier.weight(1f))
                        IconButton(
                            onClick = {
                                val url = com.mq1.player.deeplink.DeepLinkParser.shareArtistUrl(artistName)
                                val share = Intent(Intent.ACTION_SEND).apply {
                                    type = "text/plain"
                                    putExtra(Intent.EXTRA_TEXT, "Артист: $artistName\n$url")
                                }
                                context.startActivity(Intent.createChooser(share, "Поделиться"))
                            }
                        ) {
                            Icon(
                                Icons.Filled.Share,
                                contentDescription = "Поделиться артистом",
                                tint = Color.White
                            )
                        }
                    }

                    // identity block rides the bottom of the hero (web)
                    Column(
                        Modifier
                            .align(Alignment.BottomStart)
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 14.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Box(
                                Modifier
                                    .clip(RoundedCornerShape(50))
                                    .background(Color.White.copy(alpha = 0.14f))
                                    .padding(horizontal = 10.dp, vertical = 3.dp)
                            ) {
                                Text(
                                    "АРТИСТ",
                                    style = MqType.label.copy(fontSize = 10.sp, letterSpacing = 1.2.sp),
                                    color = Color.White
                                )
                            }
                            if (genreLabel != null) {
                                Text(
                                    genreLabel,
                                    style = MqType.label.copy(fontSize = 10.sp),
                                    color = Color.White.copy(alpha = 0.75f)
                                )
                            }
                        }
                        Spacer(Modifier.height(6.dp))
                        Text(
                            ui.name,
                            style = MqType.page.copy(fontSize = 30.sp, fontWeight = FontWeight.ExtraBold),
                            color = Color.White,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.semantics { contentDescription = "Артист: ${ui.name}" }
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(
                            buildString {
                                append("${ui.tracks.size} треков")
                                if (followers > 0) append(" · $followers подписчиков")
                            },
                            style = MqType.meta,
                            color = Color.White.copy(alpha = 0.8f)
                        )
                    }
                }
            }

            // ── actions row: Слушать · Перемешать · ♥ · Поделиться ────────
            item {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .weight(1f)
                            .height(46.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(accent)
                            .clickable(enabled = ui.tracks.isNotEmpty()) {
                                player.controller.playQueue(ui.tracks, 0)
                            }
                            .padding(horizontal = 16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        MqIcon(icon = MqIcons.Play, size = 16.dp, tint = Color.White, fill = true, strokeWidth = 0f)
                        Text(
                            "Слушать",
                            style = MqType.body.copy(fontWeight = FontWeight.SemiBold),
                            color = Color.White
                        )
                    }
                    Box(
                        modifier = Modifier
                            .size(46.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(MaterialTheme.colorScheme.surfaceContainer)
                            .clickable(enabled = ui.tracks.isNotEmpty()) {
                                player.controller.playQueue(ui.tracks.shuffled(), 0)
                            },
                        contentAlignment = Alignment.Center
                    ) {
                        MqIcon(
                            icon = MqIcons.Shuffle, size = 18.dp, tint = muted,
                            modifier = Modifier.semantics { contentDescription = "Перемешать и слушать" }
                        )
                    }
                    Box(
                        modifier = Modifier
                            .size(46.dp)
                            .clip(CircleShape)
                            .background(if (isSubscribed) accent.copy(alpha = 0.16f) else MaterialTheme.colorScheme.surfaceContainer)
                            .clickable {
                                if (ui.name.isNotBlank()) player.controller.toggleArtistSubscription(ui.name)
                            },
                        contentAlignment = Alignment.Center
                    ) {
                        MqIcon(
                            icon = MqIcons.Heart, size = 20.dp,
                            tint = if (isSubscribed) accent else muted,
                            fill = isSubscribed,
                            modifier = Modifier.semantics {
                                contentDescription = if (isSubscribed) "Удалить из избранного" else "Добавить в избранное"
                            }
                        )
                    }
                }
            }

            // ── «Популярное» ──────────────────────────────────────────────
            item {
                Row(
                    Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        "Популярное",
                        style = MqType.section.copy(fontSize = 18.sp, fontWeight = FontWeight.Bold),
                        color = text,
                        modifier = Modifier.weight(1f)
                    )
                    Text("${ui.tracks.size}", style = MqType.meta2, color = muted)
                }
            }

            when {
                ui.loading -> item { LoadingState() }
                ui.error != null -> item { ErrorState(ui.error!!, onRetry = { vm.load(artistName) }) }
                else -> items(ui.tracks, key = { it.id }) { track ->
                    TrackRow(
                        track = track,
                        isPlaying = currentIndex >= 0 &&
                                queue.getOrNull(currentIndex)?.id == track.id,
                        isFavorite = favorites.any { it.id == track.id },
                        onPlay = {
                            player.controller.playQueue(ui.tracks, ui.tracks.indexOf(track))
                        },
                        onFavorite = { player.controller.toggleFavorite(track) },
                        onMenu = { menu.open(track, isCurrent = queue.getOrNull(currentIndex)?.id == track.id) }
                    )
                }
            }
        }
    }

    // shared web-parity context menu for artist track rows
    com.mq1.player.ui.components.TrackMenuHost(
        state = menu,
        controller = player.controller,
        onOpenArtist = { }
    )
}
