package com.mq1.player

import com.mq1.player.data.api.Track
import com.mq1.player.player.QueueRules
import com.mq1.player.player.QueueSnapshot
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Queue persistence (web parity: queue restored paused, window contains current). */
class QueueSnapshotTest {
    private fun t(i: Int) = Track(id = "sc_$i", title = "T$i", artist = "A", source = "soundcloud", scTrackId = i.toLong(),
        _src = if (i == 3) "yandex_music" else null, _srcTrackId = if (i == 3) "y3" else null)

    @Test
    fun roundTripKeepsCurrentTrackPositionAndModes() {
        val q = (0 until 5).map(::t)
        val snap = QueueSnapshot.capture(q, 3, positionMs = 42_000, repeatMode = 2, shuffle = true)!!
        val back = QueueSnapshot.decode(QueueSnapshot.encode(snap))!!
        assertEquals(q, back.tracks)
        assertEquals(3, back.index)
        assertEquals("sc_3", back.tracks[back.index].id)
        assertEquals("yandex_music", back.tracks[back.index]._src) // attribution survives restart
        assertEquals(42_000L, back.positionMs)
        assertEquals("all", back.repeat)
        assertEquals(2, QueueRules.repeatToMedia3(QueueRules.repeatFromWeb(back.repeat)))
        assertEquals(true, back.shuffle)
    }

    @Test
    fun largeQueueIsWindowedAroundCurrent() {
        val q = (0 until 80).map(::t)
        val snap = QueueSnapshot.capture(q, 70, 0, 0, false)!!
        assertEquals(50, snap.tracks.size)
        assertEquals("sc_70", snap.tracks[snap.index].id)
    }

    @Test
    fun staleIndexIsRepairedByCurrentId() {
        val q = (0 until 3).map(::t)
        val enc = QueueSnapshot.encode(QueueSnapshot(tracks = q, index = 9, currentId = "sc_1"))
        assertEquals(1, QueueSnapshot.decode(enc)!!.index)
    }

    @Test
    fun corruptEmptyOrFutureSnapshotsAreIgnored() {
        assertNull(QueueSnapshot.decode(null))
        assertNull(QueueSnapshot.decode("{not json"))
        assertNull(QueueSnapshot.decode(QueueSnapshot.encode(QueueSnapshot(tracks = emptyList()))))
        assertNull(QueueSnapshot.decode(QueueSnapshot.encode(QueueSnapshot(version = 99, tracks = listOf(t(1))))))
        assertNull(QueueSnapshot.capture(emptyList(), 0, 0, 0, false))
    }
}
