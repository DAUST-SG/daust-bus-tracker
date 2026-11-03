package sn.daust.bustracker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Resume an open shift after a reboot. Past `serviceEndsAt`, the service itself closes the shift. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED && Graph.store.shiftId.value != null) {
            runCatching { TrackingService.start(context) }
        }
    }
}
