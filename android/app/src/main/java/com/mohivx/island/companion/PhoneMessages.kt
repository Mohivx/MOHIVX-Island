package com.mohivx.island.companion

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Telephony
import android.telephony.PhoneNumberUtils
import android.telephony.SmsManager
import org.json.JSONArray
import org.json.JSONObject

object PhoneMessages {
    private const val THREADS_SCAN_LIMIT = 500
    private const val PAGE_SIZE = 60

    fun canRead(context: Context) =
        context.checkSelfPermission(Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED
    fun canSend(context: Context) =
        context.checkSelfPermission(Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED

    private fun cleanText(value: String?, max: Int): String =
        value.orEmpty().replace("\u0000", "").take(max)

    private fun normalizeDigits(value: String): String = buildString(value.length) {
        for (ch in value) {
            when (ch) {
                in '٠'..'٩' -> append((ch.code - 0x0660). digitToChar())
                in '۰'..'۹' -> append((ch.code - 0x06F0).digitToChar())
                in '\u200E'..'\u200F', in '\u202A'..'\u202E', in '\u2066'..'\u2069' -> {}
                else -> append(ch)
            }
        }
    }

    fun execute(context: Context, command: JSONObject): JSONObject {
        check(context.getSharedPreferences("ui", Context.MODE_PRIVATE).getBoolean("phoneSync", false)) {
            "Enable background sync on the phone first."
        }
        return when (command.optString("type")) {
            "messages.threads" -> threads(context, command.optInt("offset", 0))
            "messages.list" -> messages(context, command.optString("threadId"), command.optInt("offset", 0))
            "messages.send" -> send(context, command.optString("address"), command.optString("text"))
            else -> throw IllegalArgumentException("Unknown phone message request.")
        }
    }

    private fun threads(context: Context, offset: Int): JSONObject {
        require(canRead(context)) { "Grant SMS read access on Android first." }
        require(offset in 0..10000) { "Invalid message page." }
        val projection = arrayOf(
            Telephony.Sms.THREAD_ID,
            Telephony.Sms.ADDRESS,
            Telephony.Sms.BODY,
            Telephony.Sms.DATE,
            Telephony.Sms.READ
        )
        val grouped = linkedMapOf<String, JSONObject>()
        try {
            context.contentResolver.query(
                Telephony.Sms.CONTENT_URI,
                projection,
                null,
                null,
                "${Telephony.Sms.DATE} DESC"
            )?.use { cursor ->
                val threadColumn = cursor.getColumnIndexOrThrow(Telephony.Sms.THREAD_ID)
                val addressColumn = cursor.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
                val bodyColumn = cursor.getColumnIndexOrThrow(Telephony.Sms.BODY)
                val dateColumn = cursor.getColumnIndexOrThrow(Telephony.Sms.DATE)
                val readColumn = cursor.getColumnIndexOrThrow(Telephony.Sms.READ)
                var scanned = 0
                while (scanned < THREADS_SCAN_LIMIT && cursor.moveToNext()) {
                    scanned++
                    val rawId = cursor.getLong(threadColumn)
                    if (rawId <= 0L) continue
                    val id = rawId.toString()
                    val address = cleanText(cursor.getString(addressColumn), 80)
                    val unread = cursor.getInt(readColumn) == 0
                    val existing = grouped[id]
                    if (existing == null) {
                        grouped[id] = JSONObject()
                            .put("threadId", id)
                            .put("address", address)
                            .put("preview", cleanText(cursor.getString(bodyColumn), 500))
                            .put("date", cursor.getLong(dateColumn).coerceAtLeast(0L))
                            .put("unread", unread)
                    } else {
                        if (existing.optString("address").isEmpty() && address.isNotEmpty()) {
                            existing.put("address", address)
                        }
                        if (unread) {
                            existing.put("unread", true)
                        }
                    }
                }
            }
        } catch (_: SecurityException) {
            throw IllegalStateException("Grant SMS read access on Android first.")
        }
        val all = grouped.values.toList()
        val page = all.drop(offset).take(PAGE_SIZE)
        val next = if (offset + page.size < all.size && offset + page.size <= 10000) offset + page.size else 0
        return JSONObject().put("items", JSONArray(page)).put("next", next)
    }

    private fun messages(context: Context, rawThreadId: String, offset: Int): JSONObject {
        require(canRead(context)) { "Grant SMS read access on Android first." }
        val trimmedId = rawThreadId.trim()
        val threadId = trimmedId.toLongOrNull()
        require(threadId != null && threadId > 0L && trimmedId.length <= 18) { "Choose a valid SMS conversation." }
        require(offset in 0..10000) { "Invalid message page." }
        val projection = arrayOf(
            Telephony.Sms._ID,
            Telephony.Sms.ADDRESS,
            Telephony.Sms.BODY,
            Telephony.Sms.DATE,
            Telephony.Sms.TYPE
        )
        val rows = mutableListOf<JSONObject>()
        var more = false
        try {
            context.contentResolver.query(
                Telephony.Sms.CONTENT_URI,
                projection,
                "${Telephony.Sms.THREAD_ID}=?",
                arrayOf(threadId.toString()),
                "${Telephony.Sms.DATE} DESC"
            )?.use { cursor ->
                if (offset > 0 && !cursor.moveToPosition(offset - 1)) {
                    return JSONObject().put("items", JSONArray()).put("next", 0)
                }
                val idColumn = cursor.getColumnIndexOrThrow(Telephony.Sms._ID)
                val addressColumn = cursor.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
                val bodyColumn = cursor.getColumnIndexOrThrow(Telephony.Sms.BODY)
                val dateColumn = cursor.getColumnIndexOrThrow(Telephony.Sms.DATE)
                val typeColumn = cursor.getColumnIndexOrThrow(Telephony.Sms.TYPE)
                while (rows.size < PAGE_SIZE && cursor.moveToNext()) {
                    val rawId = cursor.getLong(idColumn)
                    if (rawId <= 0L) continue
                    val type = cursor.getInt(typeColumn)
                    val outgoing = type == Telephony.Sms.MESSAGE_TYPE_SENT ||
                        type == Telephony.Sms.MESSAGE_TYPE_OUTBOX ||
                        type == Telephony.Sms.MESSAGE_TYPE_FAILED ||
                        type == Telephony.Sms.MESSAGE_TYPE_QUEUED
                    rows += JSONObject()
                        .put("id", rawId.toString())
                        .put("address", cleanText(cursor.getString(addressColumn), 80))
                        .put("text", cleanText(cursor.getString(bodyColumn), 2000))
                        .put("date", cursor.getLong(dateColumn).coerceAtLeast(0L))
                        .put("direction", if (outgoing) "outgoing" else "incoming")
                }
                more = cursor.moveToNext()
            }
        } catch (_: SecurityException) {
            throw IllegalStateException("Grant SMS read access on Android first.")
        }
        rows.reverse()
        val next = if (more && offset + rows.size <= 10000) offset + rows.size else 0
        return JSONObject().put("items", JSONArray(rows)).put("next", next)
    }

    private fun send(context: Context, address: String, text: String): JSONObject {
        require(canSend(context)) { "Grant SMS send access on Android first." }
        val normalized = PhoneNumberUtils.normalizeNumber(normalizeDigits(address)).orEmpty()
        require(normalized.matches(Regex("^\\+?[0-9]{3,20}$"))) { "Enter a valid phone number." }
        val message = text.trim()
        require(
            message.isNotEmpty() &&
                message.length <= 1600 &&
                message.none { it in '\u0000'..'\u0008' || it == '\u000B' || it == '\u000C' || it in '\u000E'..'\u001F' }
        ) {
            "Enter a message of 1–1600 characters."
        }
        try {
            val smsManager = if (Build.VERSION.SDK_INT >= 31) {
                context.getSystemService(SmsManager::class.java) ?: @Suppress("DEPRECATION") SmsManager.getDefault()
            } else {
                @Suppress("DEPRECATION")
                SmsManager.getDefault()
            }
            val parts = smsManager.divideMessage(message)
            if (parts != null && parts.size > 1) {
                smsManager.sendMultipartTextMessage(normalized, null, parts, null, null)
            } else {
                smsManager.sendTextMessage(normalized, null, message, null, null)
            }
        } catch (_: SecurityException) {
            throw IllegalStateException("Grant SMS send access on Android first.")
        } catch (_: Exception) {
            throw IllegalStateException("Android could not submit this SMS. Check the SIM and default subscription.")
        }
        return JSONObject().put("submitted", true)
    }
}
