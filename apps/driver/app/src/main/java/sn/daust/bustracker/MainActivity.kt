package sn.daust.bustracker

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext

/** Pairing → Setup checklist → Shift. Driver-facing copy is French (PRODUCT_DECISIONS E1). */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MaterialTheme {
                Scaffold { inner ->
                    val mod = Modifier.fillMaxSize().padding(inner)
                    val ctx = LocalContext.current
                    var paired by remember { mutableStateOf(Graph.store.token != null) }
                    var showSetup by rememberSaveable { mutableStateOf(!Setup.ready(ctx)) }
                    when {
                        !paired -> PairingScreen(mod, onPaired = { paired = true })
                        showSetup -> SetupScreen(mod, onDone = { showSetup = false })
                        else -> ShiftScreen(mod, onOpenSetup = { showSetup = true })
                    }
                }
            }
        }
    }
}
