package sn.daust.bustracker

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.flow.MutableStateFlow

/** Process-wide singletons. Four buses, one phone each: no DI framework needed. */
object Graph {
    lateinit var store: TokenStore
    lateinit var api: BusApi
    lateinit var queue: PingQueue

    /** Live state the tracking service publishes for the shift screen. */
    val queued = MutableStateFlow(0L)
    val lastUploadAt = MutableStateFlow(0L)
    val serverStatus = MutableStateFlow<String?>(null)
}

class BusTrackerApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Graph.store = TokenStore(this)
        Graph.api = BusApi(Graph.store)
        Graph.queue = PingQueue(this)
        Graph.queued.value = Graph.queue.count()
        Graph.lastUploadAt.value = Graph.store.lastUploadAt

        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CH_TRACKING, "Suivi du bus", NotificationManager.IMPORTANCE_LOW))
        nm.createNotificationChannel(NotificationChannel(CH_ALERTS, "Alertes", NotificationManager.IMPORTANCE_HIGH))
    }

    companion object {
        const val CH_TRACKING = "tracking"
        const val CH_ALERTS = "alerts"
    }
}

/** One-off alert (auto-stop, queue stuck, device revoked). Silently skipped without notification permission. */
fun Context.alert(id: Int, title: String, text: String) {
    val n = NotificationCompat.Builder(this, BusTrackerApp.CH_ALERTS)
        .setSmallIcon(android.R.drawable.stat_notify_error)
        .setContentTitle(title)
        .setContentText(text)
        .setStyle(NotificationCompat.BigTextStyle().bigText(text))
        .setAutoCancel(true)
        .build()
    runCatching { getSystemService(NotificationManager::class.java).notify(id, n) }
}
