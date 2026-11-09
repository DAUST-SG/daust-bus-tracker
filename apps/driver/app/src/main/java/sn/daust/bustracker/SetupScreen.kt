package sn.daust.bustracker

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect

/** The checks that decide whether Android lets the phone track all day (risk R1). */
object Setup {
    private fun granted(ctx: Context, p: String) = ContextCompat.checkSelfPermission(ctx, p) == PackageManager.PERMISSION_GRANTED

    fun location(ctx: Context) = granted(ctx, Manifest.permission.ACCESS_FINE_LOCATION)
    fun background(ctx: Context) = Build.VERSION.SDK_INT < 29 || granted(ctx, Manifest.permission.ACCESS_BACKGROUND_LOCATION)
    fun notifications(ctx: Context) = Build.VERSION.SDK_INT < 33 || granted(ctx, Manifest.permission.POST_NOTIFICATIONS)
    fun battery(ctx: Context) = ctx.getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(ctx.packageName)

    fun ready(ctx: Context) = location(ctx) && background(ctx) && notifications(ctx) && battery(ctx)

    /** Vendor battery managers that kill background apps regardless of the Android exemption. */
    fun brandTip(): String? = when (Build.MANUFACTURER.lowercase()) {
        "tecno", "infinix", "itel" -> "Phone Master → Gestion du démarrage auto : activez DAUST Bus. Paramètres → Batterie → DAUST Bus : « Aucune restriction ». Verrouillez l'app dans les applis récentes (cadenas)."
        "xiaomi", "redmi", "poco" -> "Paramètres → Applications → DAUST Bus : Démarrage automatique ON, Économiseur de batterie « Aucune restriction ». Verrouillez l'app dans les applis récentes."
        "samsung" -> "Paramètres → Batterie → Limites d'utilisation en arrière-plan : ajoutez DAUST Bus aux « Applications jamais en veille »."
        "huawei", "honor" -> "Paramètres → Batterie → Lancement d'applications → DAUST Bus : gestion manuelle, tout activer."
        "oppo", "realme", "oneplus", "vivo" -> "Paramètres → Batterie → DAUST Bus : autoriser l'activité en arrière-plan et le démarrage auto."
        else -> null
    }
}

@SuppressLint("BatteryLife") // sideloaded tracker: the direct exemption request is the point
@Composable
fun SetupScreen(modifier: Modifier, onDone: () -> Unit) {
    val ctx = LocalContext.current
    var tick by remember { mutableIntStateOf(0) } // bump to re-read permission state
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { tick++ }
    val refresh: (Any?) -> Unit = { tick++ }
    val fgLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions(), refresh)
    val permLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission(), refresh)

    key(tick) { Column(
        modifier.padding(24.dp).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("Réglages du téléphone", style = MaterialTheme.typography.headlineSmall)
        Text("À faire une fois. Sans ces réglages, Android coupe le suivi quand l'écran est éteint.")

        Check("1. Localisation précise", Setup.location(ctx)) {
            fgLauncher.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
        }
        if (Build.VERSION.SDK_INT >= 29) {
            Check("2. Localisation « Toujours autoriser »", Setup.background(ctx), enabled = Setup.location(ctx)) {
                permLauncher.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
            }
        }
        if (Build.VERSION.SDK_INT >= 33) {
            Check("3. Notifications", Setup.notifications(ctx)) { permLauncher.launch(Manifest.permission.POST_NOTIFICATIONS) }
        }
        Check("4. Batterie sans restriction", Setup.battery(ctx)) {
            ctx.startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${ctx.packageName}")))
        }
        Setup.brandTip()?.let {
            Text("5. Réglage ${Build.MANUFACTURER}", style = MaterialTheme.typography.titleMedium)
            Text(it)
            OutlinedButton(onClick = {
                ctx.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${ctx.packageName}")))
            }) { Text("Ouvrir les réglages de l'app") }
        }

        Button(onClick = onDone, enabled = Setup.ready(ctx), modifier = Modifier.fillMaxWidth()) { Text("Continuer") }
    } }
}

@Composable
private fun Check(label: String, ok: Boolean, enabled: Boolean = true, onFix: () -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
        Text("${if (ok) "✅" else "⬜"} $label", Modifier.weight(1f))
        if (!ok) OutlinedButton(onClick = onFix, enabled = enabled) { Text("Autoriser") }
    }
}
