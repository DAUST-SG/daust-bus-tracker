package sn.daust.bustracker

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ShiftRulesTest {
    @Test
    fun backoffDoublesThenCaps() {
        assertEquals(listOf(20_000L, 40_000L, 80_000L, 160_000L, 300_000L, 300_000L), (1..6).map(ShiftRules::backoffMs))
    }

    @Test
    fun serviceEndIsDakarWallClock() {
        assertEquals(1_794_002_400_000L, ShiftRules.serviceEndsAt("2026-11-06", "22:00")) // 2026-11-06T22:00Z
    }

    @Test
    fun queueStuckNeedsBothBacklogAndTime() {
        val now = 1_000_000_000L
        assertTrue(ShiftRules.queueStuck(51, now - 11 * 60_000, now))
        assertFalse(ShiftRules.queueStuck(50, now - 11 * 60_000, now))
        assertFalse(ShiftRules.queueStuck(500, now - 9 * 60_000, now))
    }
}
