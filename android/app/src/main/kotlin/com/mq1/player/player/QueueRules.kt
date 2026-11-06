package com.mq1.player.player

/**
 * Pure queue rules shared with the web — Kotlin twin of src/lib/core/queue.ts.
 * Both run shared/test-fixtures/queue.cases.json (QueueRulesContractTest /
 * src/__tests__/contracts/queue-rules.test.ts). Semantics are documented in
 * the TS file; keep the two in lockstep.
 *
 * Shuffle order is platform-specific (Media3 permutation here, random pick on
 * web); these rules describe the linear order and repeat behaviour.
 */
object QueueRules {
    enum class Repeat { OFF, ALL, ONE }

    const val PREVIOUS_RESTART_THRESHOLD_SEC = 3.0
    const val PERSIST_QUEUE_MAX = 50
    const val PERSIST_QUEUE_LOOKBEHIND = 10

    fun nextIndex(length: Int, index: Int, repeat: Repeat, isBroken: (Int) -> Boolean = { false }): Int? {
        if (length <= 0) return null
        var i = index
        for (step in 0 until length) {
            i += 1
            if (i >= length) {
                if (repeat != Repeat.ALL) return null
                i = 0
            }
            if (i == index && step > 0) return null
            if (!isBroken(i)) return i
        }
        return null
    }

    fun autoAdvanceIndex(length: Int, index: Int, repeat: Repeat, isBroken: (Int) -> Boolean = { false }): Int? {
        if (repeat == Repeat.ONE && index in 0 until length && !isBroken(index)) return index
        return nextIndex(length, index, if (repeat == Repeat.ONE) Repeat.OFF else repeat, isBroken)
    }

    sealed interface PreviousAction {
        data object Restart : PreviousAction
        data class Go(val index: Int) : PreviousAction
    }

    fun previousAction(length: Int, index: Int, repeat: Repeat, progressSec: Double): PreviousAction {
        if (progressSec > PREVIOUS_RESTART_THRESHOLD_SEC || length <= 0) return PreviousAction.Restart
        if (index - 1 >= 0) return PreviousAction.Go(index - 1)
        if (repeat == Repeat.ALL && length > 1) return PreviousAction.Go(length - 1)
        return PreviousAction.Restart
    }

    fun playNextInsertIndex(currentIndex: Int, pendingPlayNext: Int): Int =
        (currentIndex + 1 + pendingPlayNext.coerceAtLeast(0)).coerceAtLeast(0)

    fun pendingAfterTransition(pending: Int, oldIndex: Int, newIndex: Int): Int =
        if (newIndex == oldIndex + 1) (pending - 1).coerceAtLeast(0) else 0

    data class UpNextResult<T>(val queue: List<T>, val index: Int, val upNext: List<T>, val track: T)

    fun <T> consumeUpNext(queue: List<T>, index: Int, upNext: List<T>, isBroken: (T) -> Boolean = { false }): UpNextResult<T>? {
        val pick = upNext.indexOfFirst { !isBroken(it) }
        if (pick < 0) return null
        val track = upNext[pick]
        val insertAt = (index + 1).coerceIn(0, queue.size)
        val q = queue.subList(0, insertAt) + track + queue.subList(insertAt, queue.size)
        return UpNextResult(q, insertAt, upNext.drop(pick + 1), track)
    }

    fun indexAfterMove(from: Int, to: Int, current: Int): Int = when {
        from == current -> to
        from < current && to >= current -> current - 1
        from > current && to <= current -> current + 1
        else -> current
    }

    fun indexAfterRemove(removed: Int, current: Int, length: Int): Int {
        val newLength = length - 1
        if (newLength <= 0) return -1
        return when {
            removed < current -> current - 1
            removed == current -> minOf(current, newLength - 1)
            else -> current
        }
    }

    data class Window<T>(val queue: List<T>, val index: Int)

    fun <T> persistWindow(
        queue: List<T>,
        index: Int,
        max: Int = PERSIST_QUEUE_MAX,
        lookBehind: Int = PERSIST_QUEUE_LOOKBEHIND,
    ): Window<T> {
        val safeIndex = if (queue.isEmpty()) 0 else index.coerceIn(0, queue.size - 1)
        if (queue.size <= max) return Window(queue.toList(), safeIndex)
        val start = (safeIndex - lookBehind).coerceAtLeast(0).coerceAtMost(queue.size - max)
        return Window(queue.subList(start, start + max).toList(), safeIndex - start)
    }

    fun restoreIndex(ids: List<String>, index: Int, currentId: String?): Int {
        if (ids.isEmpty()) return 0
        val clamped = index.coerceIn(0, ids.size - 1)
        if (currentId == null) return clamped
        if (ids.getOrNull(index) == currentId) return index
        val found = ids.indexOf(currentId)
        return if (found >= 0) found else clamped
    }

    /** Media3 Player.REPEAT_MODE_OFF/ONE/ALL = 0/1/2. */
    fun repeatToMedia3(mode: Repeat): Int = when (mode) { Repeat.OFF -> 0; Repeat.ONE -> 1; Repeat.ALL -> 2 }
    fun repeatFromMedia3(mode: Int): Repeat = when (mode) { 1 -> Repeat.ONE; 2 -> Repeat.ALL; else -> Repeat.OFF }
    fun repeatFromWeb(mode: String): Repeat = when (mode) { "one" -> Repeat.ONE; "all" -> Repeat.ALL; else -> Repeat.OFF }
    fun repeatToWeb(mode: Repeat): String = mode.name.lowercase()
}
