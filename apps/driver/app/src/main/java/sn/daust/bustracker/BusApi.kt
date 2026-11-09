package sn.daust.bustracker

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Server answered with the `{ error: { code, message, details } }` envelope (Docs/API_CONTRACT.md). */
class ApiError(val http: Int, val code: String, message: String, val details: JSONObject?) : Exception(message)

/**
 * Driver endpoints. Blocking: call from Dispatchers.IO. Network failures surface as IOException.
 * ponytail: HttpURLConnection + org.json (both built in) instead of OkHttp + a serializer, six endpoints.
 */
class BusApi(private val store: TokenStore) {

    fun pair(deviceModel: String, androidVersion: String) = call(
        "POST", "/driver/pair",
        JSONObject().put("deviceModel", deviceModel.take(80)).put("androidVersion", androidVersion).put("appVersion", BuildConfig.VERSION_NAME),
    )

    fun config() = call("GET", "/driver/config")

    fun startShift(itineraryId: String, startedAt: Long) =
        call("POST", "/driver/shifts", JSONObject().put("itineraryId", itineraryId).put("startedAt", startedAt))

    fun endShift(endedAt: Long, reason: String) =
        call("POST", "/driver/shifts/end", JSONObject().put("endedAt", endedAt).put("reason", reason))

    fun pings(pings: JSONArray, heartbeat: JSONObject) =
        call("POST", "/driver/pings", JSONObject().put("pings", pings).put("heartbeat", heartbeat))

    fun setState(outOfService: Boolean, reasonCode: String?, note: String?) = call(
        "PATCH", "/driver/state",
        JSONObject()
            .put("serviceStatus", if (outOfService) "out_of_service" else "in_service")
            .apply { if (outOfService) put("reasonCode", reasonCode) }
            .apply { if (!note.isNullOrBlank()) put("note", note.take(140)) },
    )

    private fun call(method: String, path: String, body: JSONObject? = null): JSONObject {
        val c = URL("${BuildConfig.SITE_URL}/api/v1$path").openConnection() as HttpURLConnection
        try {
            c.requestMethod = method
            c.connectTimeout = 15_000
            c.readTimeout = 20_000
            c.setRequestProperty("Authorization", "Bearer ${store.token.orEmpty()}")
            c.setRequestProperty("Content-Type", "application/json")
            if (body != null) {
                c.doOutput = true
                c.outputStream.use { it.write(body.toString().toByteArray()) }
            }
            val status = c.responseCode
            val text = (if (status < 400) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
            val json = if (text.isBlank()) JSONObject() else JSONObject(text)
            if (status >= 400) {
                val e = json.optJSONObject("error")
                throw ApiError(status, e?.optString("code") ?: "HTTP_$status", e?.optString("message") ?: "HTTP $status", e?.optJSONObject("details"))
            }
            return json
        } finally {
            c.disconnect()
        }
    }
}
