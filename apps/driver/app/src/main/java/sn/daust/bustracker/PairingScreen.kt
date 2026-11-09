package sn.daust.bustracker

import android.os.Build
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Done once per phone by the IT Committee with a token from `devices:provision`. */
@Composable
fun PairingScreen(modifier: Modifier, onPaired: () -> Unit) {
    var token by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    Column(modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("Associer ce téléphone", style = MaterialTheme.typography.headlineSmall)
        Text("Saisissez le code fourni par le comité IT.")
        OutlinedTextField(token, { token = it.trim() }, Modifier.fillMaxWidth(), label = { Text("Code de l'appareil") }, singleLine = true)
        Button(
            enabled = token.isNotEmpty() && !busy,
            modifier = Modifier.fillMaxWidth(),
            onClick = {
                busy = true
                error = null
                scope.launch {
                    error = withContext(Dispatchers.IO) {
                        Graph.store.token = token
                        try {
                            val r = Graph.api.pair(Build.MANUFACTURER + " " + Build.MODEL, Build.VERSION.RELEASE)
                            Graph.store.busName = r.optJSONObject("bus")?.optString("name")
                            Graph.store.configJson = Graph.api.config().toString()
                            null
                        } catch (e: Exception) {
                            Graph.store.token = null
                            if (e is ApiError) "Code refusé : ${e.message}" else "Pas de connexion au serveur."
                        }
                    }
                    busy = false
                    if (error == null) onPaired()
                }
            },
        ) { Text(if (busy) "Vérification…" else "Associer") }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        Text("Serveur : ${BuildConfig.SITE_URL}", style = MaterialTheme.typography.bodySmall)
    }
}
