package sn.daust.bustracker

import android.text.format.DateUtils
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

private data class Itinerary(val id: String, val name: String, val isTemporary: Boolean, val stops: String)
private data class Reason(val code: String, val fr: String)

private fun parseConfig(json: String?): Pair<List<Itinerary>, List<Reason>> {
    val c = json?.let(::JSONObject) ?: return emptyList<Itinerary>() to emptyList()
    val its = c.optJSONArray("itineraries")
    val rs = c.optJSONArray("outOfServiceReasons")
    return List(its?.length() ?: 0) { i ->
        val it = its!!.getJSONObject(i)
        val stops = it.optJSONArray("stops")
        Itinerary(it.getString("id"), it.getString("name"), it.optBoolean("isTemporary"),
            List(stops?.length() ?: 0) { s -> stops!!.getJSONObject(s).optString("name") }.joinToString(" → "))
    } to List(rs?.length() ?: 0) { i -> rs!!.getJSONObject(i).let { Reason(it.getString("code"), it.getString("fr")) } }
}

/** Server error codes → French for the driver; anything unexpected falls back to the server text. */
private fun frError(e: Exception) = when ((e as? ApiError)?.code) {
    null -> "Pas de connexion. Réessayez."
    "OUTSIDE_SERVICE_HOURS" -> "Hors des heures de service."
    "ITINERARY_NOT_FOUND" -> "Cet itinéraire n'est pas valable aujourd'hui."
    "DEVICE_REVOKED", "UNAUTHORIZED" -> "Appareil non autorisé. Contactez le comité IT."
    "RATE_LIMITED" -> "Trop de tentatives. Patientez une minute."
    else -> e.message ?: "Erreur"
}

@Composable
fun ShiftScreen(modifier: Modifier, onOpenSetup: () -> Unit) {
    val ctx = LocalContext.current
    val store = Graph.store
    val scope = rememberCoroutineScope()
    val shiftId by store.shiftId.collectAsState()
    val ending by store.ending.collectAsState()
    val outOfService by store.outOfService.collectAsState()
    val queued by Graph.queued.collectAsState()
    val lastUpload by Graph.lastUploadAt.collectAsState()
    val serverStatus by Graph.serverStatus.collectAsState()

    var configJson by remember { mutableStateOf(store.configJson) }
    val (itineraries, reasons) = remember(configJson) { parseConfig(configJson) }
    var selected by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var confirmEnd by remember { mutableStateOf(false) }
    var askReason by remember { mutableStateOf(false) }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }

    LaunchedEffect(Unit) { // refresh itineraries; the cached copy keeps the screen usable offline
        runCatching { withContext(Dispatchers.IO) { Graph.api.config().toString() } }
            .onSuccess { store.configJson = it; configJson = it }
    }
    LaunchedEffect(Unit) { while (true) { now = System.currentTimeMillis(); delay(15_000) } }
    LaunchedEffect(shiftId) { if (shiftId != null) TrackingService.start(ctx) } // re-attach after an app kill

    fun run(block: suspend () -> Unit) {
        busy = true
        message = null
        scope.launch {
            try { block() } catch (e: Exception) { message = frError(e) }
            busy = false
        }
    }

    Column(
        modifier.padding(24.dp).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(store.busName ?: "DAUST Bus", style = MaterialTheme.typography.headlineSmall)

        if (shiftId == null) {
            Text("Choisissez l'itinéraire", style = MaterialTheme.typography.titleMedium)
            if (itineraries.isEmpty()) Text("Aucun itinéraire aujourd'hui. Vérifiez la connexion.")
            itineraries.forEach { it ->
                Card(Modifier.fillMaxWidth().selectable(selected == it.id, onClick = { selected = it.id })) {
                    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(selected == it.id, onClick = { selected = it.id })
                        Column {
                            Text(it.name + if (it.isTemporary) " (temporaire)" else "", style = MaterialTheme.typography.titleSmall)
                            Text(it.stops, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
            Button(
                enabled = selected != null && !busy,
                modifier = Modifier.fillMaxWidth(),
                onClick = {
                    val it = itineraries.first { i -> i.id == selected }
                    run { startShift(it, configJson) }
                },
            ) { Text(if (busy) "Démarrage…" else "Démarrer le service") }
        } else {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(if (ending) "Fin du service en cours…" else "En service", style = MaterialTheme.typography.titleLarge)
                    Text(store.itineraryName.orEmpty())
                    serverStatus?.let { Text(it) }
                    if (outOfService) Text("Bus signalé HORS SERVICE", color = MaterialTheme.colorScheme.error)
                    Text(
                        "Dernier envoi : " + if (lastUpload == 0L) "—" else DateUtils.getRelativeTimeSpanString(lastUpload, now, DateUtils.MINUTE_IN_MILLIS),
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Text("Positions en attente : $queued", style = MaterialTheme.typography.bodySmall)
                    if (queued > 50) Text("Pas d'envoi : vérifiez les données mobiles.", color = MaterialTheme.colorScheme.error)
                }
            }
            if (!ending) {
                if (outOfService) {
                    OutlinedButton(enabled = !busy, modifier = Modifier.fillMaxWidth(), onClick = {
                        run { withContext(Dispatchers.IO) { Graph.api.setState(false, null, null) }; store.setOutOfService(false) }
                    }) { Text("Remettre en service") }
                } else {
                    OutlinedButton(enabled = !busy, modifier = Modifier.fillMaxWidth(), onClick = { askReason = true }) {
                        Text("Signaler hors service")
                    }
                }
                Button(
                    onClick = { confirmEnd = true },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                ) { Text("Terminer le service") }
            }
        }

        message?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        TextButton(onClick = onOpenSetup) { Text("Vérifier les réglages du téléphone") }
    }

    if (confirmEnd) {
        AlertDialog(
            onDismissRequest = { confirmEnd = false },
            title = { Text("Terminer le service ?") },
            text = { Text("Le bus n'apparaîtra plus aux étudiants.") },
            confirmButton = { TextButton(onClick = { confirmEnd = false; TrackingService.end(ctx) }) { Text("Terminer") } },
            dismissButton = { TextButton(onClick = { confirmEnd = false }) { Text("Annuler") } },
        )
    }
    if (askReason) {
        OutOfServiceDialog(reasons, onDismiss = { askReason = false }) { code, note ->
            askReason = false
            run { withContext(Dispatchers.IO) { Graph.api.setState(true, code, note) }; store.setOutOfService(true) }
        }
    }
}

private suspend fun startShift(it: Itinerary, configJson: String?) {
    val endsFromConfig = configJson?.let(::JSONObject)?.optJSONObject("serviceHours")
        ?.let { h -> ShiftRules.serviceEndsAt(h.getString("date"), h.getString("end")) }
    val (id, endsAt) = withContext(Dispatchers.IO) {
        try {
            val shift = Graph.api.startShift(it.id, System.currentTimeMillis()).getJSONObject("shift")
            val ends = if (shift.isNull("serviceEndsAt")) endsFromConfig else shift.getLong("serviceEndsAt")
            shift.getString("id") to (ends ?: Long.MAX_VALUE) // no service window today: driver ends it
        } catch (e: ApiError) {
            // The bus already has an open shift (app reinstalled, data cleared): adopt it.
            val open = e.details?.optString("shiftId")
            if (e.code != "SHIFT_ALREADY_ACTIVE" || open.isNullOrEmpty() || endsFromConfig == null) throw e
            open to endsFromConfig
        }
    }
    Graph.store.startShift(id, it.name, endsAt)
    Graph.lastUploadAt.value = Graph.store.lastUploadAt
}

@Composable
private fun OutOfServiceDialog(reasons: List<Reason>, onDismiss: () -> Unit, onConfirm: (String, String) -> Unit) {
    var code by remember { mutableStateOf<String?>(null) }
    var note by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Hors service") },
        text = {
            Column {
                reasons.forEach { r ->
                    Row(Modifier.fillMaxWidth().selectable(code == r.code, onClick = { code = r.code }), verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(code == r.code, onClick = { code = r.code })
                        Text(r.fr)
                    }
                }
                OutlinedTextField(note, { note = it.take(140) }, label = { Text("Note (facultatif)") })
            }
        },
        confirmButton = { TextButton(enabled = code != null, onClick = { onConfirm(code!!, note) }) { Text("Confirmer") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Annuler") } },
    )
}
