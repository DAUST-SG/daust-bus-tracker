package sn.daust.bustracker

import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.BatteryManager
import android.os.Build
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException

/**
 * Foreground location service, alive for the whole shift (ARCHITECTURE §3.1, Flow 2):
 * fix every 10 s → accuracy filter → SQLite queue → batch upload with backoff. Also the
 * service-hours guard: at `serviceEndsAt` it stops location, drains the queue and ends the shift.
 * START_STICKY + BootReceiver bring it back after a kill or a reboot; all state lives in TokenStore.
 */
class TrackingService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var loop: Job? = null
    private var locationOn = false
    private val fused by lazy { LocationServices.getFusedLocationProviderClient(this) }
    private var maxAccuracy = 50f

    private val callback = object : LocationCallback() {
        override fun onLocationResult(r: LocationResult) {
            for (l in r.locations) if (l.hasAccuracy() && l.accuracy <= maxAccuracy) Graph.queue.add(l)
            Graph.queued.value = Graph.queue.count()
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val store = Graph.store
        if (store.shiftId.value == null) {
            stopSelf()
            return START_NOT_STICKY
        }
        ServiceCompat.startForeground(
            this, NOTIF_ID, notification(),
            if (Build.VERSION.SDK_INT >= 29) ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION else 0,
        )
        if (intent?.action == ACTION_END && !store.ending.value) store.setEnding("driver")
        if (store.ending.value) stopLocation() else startLocation()
        if (loop?.isActive != true) loop = scope.launch { runLoop() }
        return START_STICKY
    }

    override fun onDestroy() {
        stopLocation()
        scope.cancel()
        super.onDestroy()
    }

    private fun startLocation() {
        if (locationOn) return
        maxAccuracy = Graph.store.configJson?.let { JSONObject(it).optJSONObject("upload")?.optDouble("maxAccuracyMeters") }?.toFloat() ?: 50f
        val req = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, ShiftRules.TICK_MS)
            .setMinUpdateIntervalMillis(5_000)
            .build()
        try {
            fused.requestLocationUpdates(req, callback, Looper.getMainLooper())
            locationOn = true
        } catch (_: SecurityException) {
            alert(ALERT_PERMISSION, "Localisation refusée", "Ouvrez l'application et autorisez la localisation « Toujours ».")
        }
    }

    private fun stopLocation() {
        if (locationOn) fused.removeLocationUpdates(callback)
        locationOn = false
    }

    private suspend fun CoroutineScope.runLoop() {
        val store = Graph.store
        val queue = Graph.queue
        var failures = 0
        var stuckAlerted = false
        while (isActive) {
            val now = System.currentTimeMillis()
            if (!store.ending.value && now >= store.serviceEndsAt) {
                store.setEnding("service_hours_over")
                stopLocation()
                alert(ALERT_AUTO_STOP, "Fin du service", "Les heures de service sont terminées : le suivi s'est arrêté tout seul.")
            }
            queue.dropOlderThan(now - ShiftRules.QUEUE_CAP_MS)

            try {
                flush()
                failures = 0
                if (store.ending.value) {
                    try {
                        Graph.api.endShift(System.currentTimeMillis(), store.endReason)
                    } catch (e: ApiError) {
                        if (e.code != "SHIFT_NOT_ACTIVE") throw e // already closed server-side (cron) = done
                    }
                    finish()
                    return
                }
            } catch (e: ApiError) {
                when {
                    e.http == 401 || e.http == 403 -> { // token revoked or invalid: nothing will ever be accepted
                        queue.clear()
                        finish()
                        alert(ALERT_REVOKED, "Appareil non autorisé", "Le suivi est arrêté. Contactez le comité IT.")
                        return
                    }
                    e.code == "SHIFT_NOT_ACTIVE" -> { // shift closed server-side; queued points can't be stored
                        queue.clear()
                        finish()
                        return
                    }
                    else -> failures++
                }
            } catch (_: IOException) {
                failures++ // offline: keep the queue, retry with backoff
            }

            val queued = queue.count()
            Graph.queued.value = queued
            if (ShiftRules.queueStuck(queued, store.lastUploadAt, now)) {
                if (!stuckAlerted) alert(ALERT_STUCK, "Positions en attente", "$queued positions non envoyées. Vérifiez les données mobiles.")
                stuckAlerted = true
            } else {
                stuckAlerted = false
            }
            delay(if (failures == 0) ShiftRules.TICK_MS else ShiftRules.backoffMs(failures))
        }
    }

    /** Upload the queue oldest-first in batches; rows are deleted only after the server acknowledges. */
    private fun flush() {
        while (true) {
            val batch = Graph.queue.oldest(BATCH_MAX)
            if (batch.isEmpty()) return
            val res = try {
                Graph.api.pings(JSONArray(batch.map { it.second }), heartbeat())
            } catch (e: ApiError) {
                // 400 = the server will never accept this batch; retrying it would block every newer point.
                // ponytail: drops the whole batch (up to BATCH_MAX points); bisect it if 400s turn out to be common.
                if (e.http != 400) throw e
                Graph.queue.delete(batch.map { it.first })
                continue
            }
            Graph.queue.delete(batch.map { it.first })
            val now = System.currentTimeMillis()
            Graph.store.lastUploadAt = now
            Graph.lastUploadAt.value = now
            Graph.serverStatus.value = res.optJSONObject("status")?.let(::describe)
            Graph.queued.value = Graph.queue.count()
        }
    }

    private fun finish() {
        stopLocation()
        Graph.store.clearShift()
        Graph.serverStatus.value = null
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun heartbeat(): JSONObject {
        val bm = getSystemService(BatteryManager::class.java)
        return JSONObject()
            .put("batteryPercent", bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY))
            .put("isCharging", bm.isCharging)
            .put("queuedCount", Graph.queue.count())
            .put("appVersion", BuildConfig.VERSION_NAME)
    }

    private fun notification() = NotificationCompat.Builder(this, BusTrackerApp.CH_TRACKING)
        .setSmallIcon(android.R.drawable.ic_menu_mylocation)
        .setContentTitle("DAUST Bus — en service")
        .setContentText(Graph.store.itineraryName ?: "Suivi en cours")
        .setOngoing(true)
        .setContentIntent(
            PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE),
        )
        .build()

    companion object {
        private const val NOTIF_ID = 1
        private const val ALERT_AUTO_STOP = 2
        private const val ALERT_STUCK = 3
        private const val ALERT_REVOKED = 4
        private const val ALERT_PERMISSION = 5
        private const val BATCH_MAX = 50
        private const val ACTION_END = "end"

        fun start(ctx: Context) = ContextCompat.startForegroundService(ctx, Intent(ctx, TrackingService::class.java))
        fun end(ctx: Context) =
            ContextCompat.startForegroundService(ctx, Intent(ctx, TrackingService::class.java).setAction(ACTION_END))

        /** Driver-facing French summary of the server's status block. */
        fun describe(s: JSONObject): String {
            val at = s.optString("currentStopName").takeIf { it.isNotEmpty() && it != "null" }
            val next = s.optString("nextStopName").takeIf { it.isNotEmpty() && it != "null" }
            return listOfNotNull(at?.let { "À l'arrêt : $it" }, next?.let { "Prochain arrêt : $it" })
                .joinToString(" · ").ifEmpty { "En route" }
        }
    }
}
