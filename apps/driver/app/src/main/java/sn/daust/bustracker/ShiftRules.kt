package sn.daust.bustracker

import java.time.Instant

/** Pure rules, unit-tested on the JVM (ShiftRulesTest). */
object ShiftRules {
    const val TICK_MS = 10_000L
    const val QUEUE_CAP_MS = 24 * 60 * 60_000L

    /** Retry delay after [failures] consecutive upload failures: 20 s, 40 s, … capped at 5 min. */
    fun backoffMs(failures: Int): Long = minOf(TICK_MS shl failures.coerceIn(1, 5), 5 * 60_000L)

    /** Service end for config `serviceHours` (`date` YYYY-MM-DD, `end` HH:mm). Africa/Dakar = UTC, no DST. */
    fun serviceEndsAt(date: String, end: String): Long = Instant.parse("${date}T$end:00Z").toEpochMilli()

    /** USER_BLUEPRINT: alert the driver when > 50 points are stuck for > 10 min. */
    fun queueStuck(queued: Long, lastUploadAt: Long, now: Long) = queued > 50 && now - lastUploadAt > 10 * 60_000L
}
