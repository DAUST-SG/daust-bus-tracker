package sn.daust.bustracker

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.core.content.edit
import kotlinx.coroutines.flow.MutableStateFlow
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Device token (AES-GCM with a non-exportable Android Keystore key) plus the shift state the
 * tracking service needs to survive a process kill or reboot. Everything else is plain prefs.
 */
class TokenStore(context: Context) {
    private val prefs = context.getSharedPreferences("bus", Context.MODE_PRIVATE)

    var token: String?
        get() = prefs.getString("token", null)?.let { runCatching { decrypt(it) }.getOrNull() }
        set(v) = prefs.edit { if (v == null) remove("token") else putString("token", encrypt(v)) }

    var busName: String?
        get() = prefs.getString("busName", null)
        set(v) = prefs.edit { putString("busName", v) }

    /** Last `GET /driver/config` body, so the shift screen works offline. */
    var configJson: String?
        get() = prefs.getString("config", null)
        set(v) = prefs.edit { putString("config", v) }

    /** Active shift id, observed by the UI. null = off shift. */
    val shiftId = MutableStateFlow(prefs.getString("shiftId", null))
    var itineraryName: String?
        get() = prefs.getString("itineraryName", null)
        set(v) = prefs.edit { putString("itineraryName", v) }
    var serviceEndsAt: Long
        get() = prefs.getLong("serviceEndsAt", 0)
        set(v) = prefs.edit { putLong("serviceEndsAt", v) }

    /** Shift is being closed: location is off, the service drains the queue then calls /shifts/end. */
    val ending = MutableStateFlow(prefs.getBoolean("ending", false))
    var endReason: String
        get() = prefs.getString("endReason", "driver")!!
        set(v) = prefs.edit { putString("endReason", v) }

    val outOfService = MutableStateFlow(prefs.getBoolean("outOfService", false))

    var lastUploadAt: Long
        get() = prefs.getLong("lastUploadAt", 0)
        set(v) = prefs.edit { putLong("lastUploadAt", v) }

    fun startShift(id: String, itinerary: String, endsAt: Long) {
        prefs.edit {
            putString("shiftId", id); putString("itineraryName", itinerary); putLong("serviceEndsAt", endsAt)
            putBoolean("ending", false); putString("endReason", "driver"); putBoolean("outOfService", false)
            putLong("lastUploadAt", System.currentTimeMillis())
        }
        ending.value = false
        outOfService.value = false
        shiftId.value = id
    }

    fun setEnding(reason: String) {
        prefs.edit { putBoolean("ending", true); putString("endReason", reason) }
        ending.value = true
    }

    fun setOutOfService(v: Boolean) {
        prefs.edit { putBoolean("outOfService", v) }
        outOfService.value = v
    }

    fun clearShift() {
        prefs.edit { remove("shiftId"); remove("itineraryName"); remove("serviceEndsAt"); remove("ending"); remove("outOfService") }
        ending.value = false
        outOfService.value = false
        shiftId.value = null
    }

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build(),
        )
        return gen.generateKey()
    }

    private fun encrypt(plain: String): String {
        val c = Cipher.getInstance(AES_GCM).apply { init(Cipher.ENCRYPT_MODE, key()) }
        return Base64.encodeToString(c.iv + c.doFinal(plain.toByteArray()), Base64.NO_WRAP)
    }

    private fun decrypt(stored: String): String {
        val bytes = Base64.decode(stored, Base64.NO_WRAP)
        val c = Cipher.getInstance(AES_GCM).apply { init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes, 0, 12)) }
        return String(c.doFinal(bytes, 12, bytes.size - 12))
    }

    private companion object {
        const val ALIAS = "device-token"
        const val AES_GCM = "AES/GCM/NoPadding"
    }
}
