package sn.daust.bustracker

import android.content.Context
import android.database.DatabaseUtils
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.location.Location
import org.json.JSONObject
import java.util.UUID

/**
 * Durable offline queue: every accepted fix is written here first, the uploader drains it oldest
 * first. ponytail: one table on the platform SQLite instead of Room (no KSP, no codegen).
 */
class PingQueue(context: Context) : SQLiteOpenHelper(context, "pings.db", null, 1) {

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            "CREATE TABLE ping (id INTEGER PRIMARY KEY AUTOINCREMENT, clientId TEXT NOT NULL, recordedAt INTEGER NOT NULL," +
                " lat REAL NOT NULL, lng REAL NOT NULL, accuracy REAL NOT NULL, speed REAL, heading REAL)",
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

    @Synchronized
    fun add(l: Location) {
        writableDatabase.execSQL(
            "INSERT INTO ping (clientId, recordedAt, lat, lng, accuracy, speed, heading) VALUES (?, ?, ?, ?, ?, ?, ?)",
            arrayOf(
                UUID.randomUUID().toString(), l.time, l.latitude, l.longitude, l.accuracy.toDouble(),
                if (l.hasSpeed()) l.speed.toDouble() else null,
                if (l.hasBearing()) l.bearing.toDouble() else null,
            ),
        )
    }

    /** Oldest [n] rows as (rowId, API ping JSON). */
    @Synchronized
    fun oldest(n: Int): List<Pair<Long, JSONObject>> =
        readableDatabase.rawQuery("SELECT * FROM ping ORDER BY recordedAt, id LIMIT $n", null).use { c ->
            buildList {
                while (c.moveToNext()) {
                    val p = JSONObject()
                        .put("clientId", c.getString(1))
                        .put("recordedAt", c.getLong(2))
                        .put("lat", c.getDouble(3))
                        .put("lng", c.getDouble(4))
                        .put("accuracy", c.getDouble(5))
                    if (!c.isNull(6)) p.put("speed", c.getDouble(6))
                    if (!c.isNull(7)) p.put("heading", c.getDouble(7))
                    add(c.getLong(0) to p)
                }
            }
        }

    @Synchronized
    fun delete(ids: List<Long>) {
        if (ids.isNotEmpty()) writableDatabase.execSQL("DELETE FROM ping WHERE id IN (${ids.joinToString(",")})")
    }

    /** 24 h cap (ARCHITECTURE §3.1): older points are useless for live status. */
    @Synchronized
    fun dropOlderThan(ts: Long) = writableDatabase.execSQL("DELETE FROM ping WHERE recordedAt < ?", arrayOf(ts))

    @Synchronized
    fun clear() = writableDatabase.execSQL("DELETE FROM ping")

    @Synchronized
    fun count(): Long = DatabaseUtils.queryNumEntries(readableDatabase, "ping")
}
