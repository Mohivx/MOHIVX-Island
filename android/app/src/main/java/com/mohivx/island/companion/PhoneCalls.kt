package com.mohivx.island.companion

import android.Manifest
import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.CallLog
import android.provider.ContactsContract
import android.telephony.PhoneNumberUtils
import org.json.JSONArray
import org.json.JSONObject

object PhoneCalls {
    private const val PAGE_SIZE = 60
    private const val MAX_CONTACT_NUMBERS = 60

    fun canReadContacts(context: Context) =
        context.checkSelfPermission(Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED

    fun canReadCalls(context: Context) =
        context.checkSelfPermission(Manifest.permission.READ_CALL_LOG) == PackageManager.PERMISSION_GRANTED

    private fun cleanText(value: String?, max: Int): String =
        value.orEmpty().replace("\u0000", "").take(max)

    private fun normalizeDigits(value: String): String = buildString(value.length) {
        for (ch in value) {
            when (ch) {
                in '٠'..'٩' -> append((ch.code - 0x0660).digitToChar())
                in '۰'..'۹' -> append((ch.code - 0x06F0).digitToChar())
                in '\u200E'..'\u200F', in '\u202A'..'\u202E', in '\u2066'..'\u2069' -> {}
                else -> append(ch)
            }
        }
    }

    private fun normalizeNumber(value: String): String =
        PhoneNumberUtils.normalizeNumber(normalizeDigits(value)).orEmpty()

    fun execute(context: Context, command: JSONObject): JSONObject {
        check(context.getSharedPreferences("ui", Context.MODE_PRIVATE).getBoolean("phoneSync", false)) {
            "Enable background sync on the phone first."
        }
        return when (command.optString("type")) {
            "contacts.resolve" -> resolveContacts(context, command.optJSONArray("numbers"))
            "calls.list" -> listCalls(context, command.optInt("offset", 0))
            "calls.dial" -> dial(context, command.optString("number"))
            else -> throw IllegalArgumentException("Unknown phone call or contact request.")
        }
    }

    private fun resolveContacts(context: Context, rawNumbers: JSONArray?): JSONObject {
        require(canReadContacts(context)) { "Grant contacts access on Android first." }
        require(rawNumbers != null && rawNumbers.length() in 1..MAX_CONTACT_NUMBERS) {
            "Provide 1–60 valid phone numbers to resolve."
        }
        val contacts = JSONObject()
        val projection = arrayOf(ContactsContract.PhoneLookup.DISPLAY_NAME)
        try {
            for (i in 0 until rawNumbers.length()) {
                val normalized = normalizeNumber(rawNumbers.optString(i))
                require(normalized.matches(Regex("^\\+?[0-9]{3,20}$"))) {
                    "Provide 1–60 valid phone numbers to resolve."
                }
                if (contacts.has(normalized)) continue
                val uri = Uri.withAppendedPath(
                    ContactsContract.PhoneLookup.CONTENT_FILTER_URI,
                    Uri.encode(normalized)
                )
                context.contentResolver.query(uri, projection, null, null, null)?.use { cursor ->
                    if (cursor.moveToFirst()) {
                        val nameColumn = cursor.getColumnIndex(ContactsContract.PhoneLookup.DISPLAY_NAME)
                        val name = if (nameColumn >= 0) cleanText(cursor.getString(nameColumn), 120).trim() else ""
                        if (name.isNotEmpty() && name.none { it in '\u0000'..'\u001F' }) {
                            contacts.put(normalized, name)
                        }
                    }
                }
            }
        } catch (_: SecurityException) {
            throw IllegalStateException("Grant contacts access on Android first.")
        }
        return JSONObject().put("contacts", contacts)
    }

    private fun listCalls(context: Context, offset: Int): JSONObject {
        require(canReadCalls(context)) { "Grant call history access on Android first." }
        require(offset in 0..10000) { "Invalid call history page." }
        val projection = arrayOf(
            CallLog.Calls._ID,
            CallLog.Calls.NUMBER,
            CallLog.Calls.TYPE,
            CallLog.Calls.DATE,
            CallLog.Calls.DURATION
        )
        val rows = mutableListOf<JSONObject>()
        var more = false
        try {
            context.contentResolver.query(
                CallLog.Calls.CONTENT_URI,
                projection,
                null,
                null,
                "${CallLog.Calls.DATE} DESC"
            )?.use { cursor ->
                if (offset > 0 && !cursor.moveToPosition(offset - 1)) {
                    return JSONObject().put("items", JSONArray()).put("next", 0)
                }
                val idColumn = cursor.getColumnIndexOrThrow(CallLog.Calls._ID)
                val numberColumn = cursor.getColumnIndexOrThrow(CallLog.Calls.NUMBER)
                val typeColumn = cursor.getColumnIndexOrThrow(CallLog.Calls.TYPE)
                val dateColumn = cursor.getColumnIndexOrThrow(CallLog.Calls.DATE)
                val durationColumn = cursor.getColumnIndexOrThrow(CallLog.Calls.DURATION)
                while (rows.size < PAGE_SIZE && cursor.moveToNext()) {
                    val rawId = cursor.getLong(idColumn)
                    if (rawId <= 0L) continue
                    val rawNumber = cleanText(cursor.getString(numberColumn), 80).trim()
                    val number = if (rawNumber.startsWith("-")) "" else rawNumber
                    val callType = when (cursor.getInt(typeColumn)) {
                        CallLog.Calls.OUTGOING_TYPE -> "outgoing"
                        CallLog.Calls.MISSED_TYPE -> "missed"
                        CallLog.Calls.REJECTED_TYPE, CallLog.Calls.BLOCKED_TYPE -> "rejected"
                        else -> "incoming"
                    }
                    rows += JSONObject()
                        .put("id", rawId.toString())
                        .put("number", number)
                        .put("type", callType)
                        .put("date", cursor.getLong(dateColumn).coerceAtLeast(0L))
                        .put("duration", cursor.getLong(durationColumn).coerceIn(0L, 864000L))
                }
                more = cursor.moveToNext()
            }
        } catch (_: SecurityException) {
            throw IllegalStateException("Grant call history access on Android first.")
        }
        val next = if (more && offset + rows.size <= 10000) offset + rows.size else 0
        return JSONObject().put("items", JSONArray(rows)).put("next", next)
    }

    private fun dial(context: Context, rawNumber: String): JSONObject {
        val normalized = normalizeNumber(rawNumber)
        require(normalized.matches(Regex("^\\+?[0-9]{3,20}$"))) { "Enter a valid phone number to dial." }
        val dialIntent = Intent(Intent.ACTION_DIAL, Uri.fromParts("tel", normalized, null))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

        if (PhoneSyncService.activityVisible) {
            try {
                context.startActivity(dialIntent)
                return JSONObject().put("opened", true).put("needsTap", false)
            } catch (_: ActivityNotFoundException) {
                throw IllegalStateException("No dialer app is available on this Android device.")
            } catch (_: Exception) {
                // Fall back to notification tap when background activity launch is restricted
            }
        }

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val requestCode = normalized.hashCode()
        val pending = PendingIntent.getActivity(
            context,
            requestCode,
            dialIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val builder = if (Build.VERSION.SDK_INT >= 26) {
            Notification.Builder(context, "phone-requests")
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(context)
        }
        val notification = builder.setSmallIcon(android.R.drawable.ic_menu_call)
            .setContentTitle(context.getString(R.string.phone_dial_title))
            .setContentText(context.getString(R.string.phone_dial_text, normalized))
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .build()
        manager.notify(38000 + (requestCode and 0x0fffffff), notification)
        return JSONObject().put("opened", false).put("needsTap", true)
    }
}
