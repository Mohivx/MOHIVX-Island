package com.mohivx.island.companion

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.OpenableColumns
import android.util.Base64
import org.json.JSONObject
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

object PhoneClipboard {
 const val MAX_TEXT_CHARS = 32000
 const val MAX_TEXT_BYTES = 65536
 private val SENSITIVE_PATTERN = Regex(
  "-----BEGIN (?:\\w+ )?PRIVATE KEY-----|\\b(?:AIza[A-Za-z0-9_-]{25,}|sk-[A-Za-z0-9_-]{20,}|tvly-[A-Za-z0-9_-]{15,}|gh[pousr]_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16})\\b|(?:password|passwd|api[_ -]?key|access[_ -]?token|client[_ -]?secret)\\s*[:=]\\s*\\S+",
  RegexOption.IGNORE_CASE
 )
 @Volatile private var lastSyncedHash = ""
 @Volatile private var lastSyncedAt = 0L

 fun enabled(context: Context): Boolean =
  context.getSharedPreferences("ui", Context.MODE_PRIVATE).getBoolean("phoneClipboard", false)

 fun setEnabled(context: Context, value: Boolean) {
  context.getSharedPreferences("ui", Context.MODE_PRIVATE).edit().putBoolean("phoneClipboard", value).apply()
  if (!value) {
   lastSyncedHash = ""
   lastSyncedAt = 0L
  }
 }

 fun sha256(text: String): String =
  MessageDigest.getInstance("SHA-256").digest(text.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }

 fun isSensitive(clip: ClipData?, text: String): Boolean {
  val flagged = try {
   clip?.description?.extras?.getBoolean("android.content.extra.IS_SENSITIVE", false) == true
  } catch (_: Exception) {
   false
  }
  return flagged || SENSITIVE_PATTERN.containsMatchIn(text)
 }

 fun validateText(text: String, clip: ClipData? = null): String {
  require(text.isNotBlank() && !text.contains('\u0000') && text.length <= MAX_TEXT_CHARS && text.toByteArray(Charsets.UTF_8).size <= MAX_TEXT_BYTES) {
   "Choose plain text up to 32,000 characters."
  }
  require(!isSensitive(clip, text)) { "Sensitive clipboard content was blocked from syncing." }
  return text
 }

 private fun <T> runOnMain(block: () -> T): T {
  if (Looper.myLooper() == Looper.getMainLooper()) return block()
  var result: T? = null
  var failure: Throwable? = null
  val latch = CountDownLatch(1)
  Handler(Looper.getMainLooper()).post {
   try {
    result = block()
   } catch (t: Throwable) {
    failure = t
   } finally {
    latch.countDown()
   }
  }
  check(latch.await(2500, TimeUnit.MILLISECONDS)) { "Clipboard access timed out." }
  failure?.let { throw it }
  @Suppress("UNCHECKED_CAST")
  return result as T
 }

 private fun readPrimary(context: Context): Pair<ClipData?, String> = runOnMain {
  val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
  val clip = cm.primaryClip
  val text = if (clip != null && clip.itemCount > 0) clip.getItemAt(0)?.text?.toString().orEmpty() else ""
  Pair(clip, text)
 }

 fun execute(context: Context, command: JSONObject): JSONObject {
  check(enabled(context)) { "Enable clipboard sync in the phone app first." }
  return when (command.getString("type")) {
   "clipboard.set" -> {
    val text = validateText(command.optString("text", ""))
    val hash = sha256(text)
    if (hash != lastSyncedHash) {
     runOnMain {
      val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
      cm.setPrimaryClip(ClipData.newPlainText("MOHIVX Island", text))
     }
    }
    lastSyncedHash = hash
    lastSyncedAt = System.currentTimeMillis()
    JSONObject().put("updated", true).put("hash", hash)
   }
   "clipboard.get" -> {
    val (clip, raw) = readPrimary(context)
    check(raw.isNotBlank()) { "Open MOHIVX on the phone and copy plain text first." }
    val text = validateText(raw, clip)
    val hash = sha256(text)
    lastSyncedHash = hash
    lastSyncedAt = System.currentTimeMillis()
    JSONObject().put("text", text).put("hash", hash)
   }
   else -> throw IllegalArgumentException("Unknown clipboard command.")
  }
 }

 fun outgoingPacket(context: Context): JSONObject? {
  if (!enabled(context) || !PhoneSyncService.activityVisible) return null
  return try {
   val (clip, raw) = readPrimary(context)
   if (raw.isBlank() || raw.contains('\u0000') || raw.length > MAX_TEXT_CHARS || raw.toByteArray(Charsets.UTF_8).size > MAX_TEXT_BYTES || isSensitive(clip, raw)) return null
   val hash = sha256(raw)
   if (hash == lastSyncedHash) null
   else JSONObject().put("text", raw).put("hash", hash).put("copiedAt", System.currentTimeMillis())
  } catch (_: Exception) {
   null
  }
 }

 fun markSynced(hash: String) {
  if (hash.isNotEmpty()) {
   lastSyncedHash = hash
   lastSyncedAt = System.currentTimeMillis()
  }
 }

 fun sendNow(context: Context, client: CompanionClient): JSONObject {
  check(client.paired) { "Pair your phone with your PC first." }
  check(enabled(context)) { "Enable clipboard sync in the phone app first." }
  val (clip, raw) = readPrimary(context)
  check(raw.isNotBlank()) { "Copy plain text on your phone first." }
  val text = validateText(raw, clip)
  val hash = sha256(text)
  val response = client.request("/api/phone-clipboard", JSONObject().put("text", text).put("copiedAt", System.currentTimeMillis()))
  lastSyncedHash = hash
  lastSyncedAt = System.currentTimeMillis()
  return response
 }
}

object PhoneShare {
 const val CHUNK_SIZE = 49152
 const val MAX_FILE_SIZE = 104857600L
 const val MAX_FILES = 10
 private val BLOCKED_EXT = Regex(
  "\\.(?:exe|bat|cmd|com|scr|msi|msp|ps1|psm1|vbs|vbe|js|jse|wsf|wsh|hta|cpl|msc|jar|apk|aab|dex|reg|lnk|dll|sys|inf|scf|url|pif)$",
  RegexOption.IGNORE_CASE
 )
 private val BLOCKED_MIME = Regex(
  "^application/(?:x-msdownload|x-msdos-program|x-executable|x-dosexec|x-bat|x-msi|vnd\\.android\\.package-archive|x-android-package-archive|hta|winhlp)$",
  RegexOption.IGNORE_CASE
 )

 data class SharedFileItem(val uri: Uri, val name: String, val size: Long, val mimeType: String)
 data class ShareDraft(
  val id: String,
  val signature: String,
  val title: String,
  val text: String,
  val files: List<SharedFileItem>,
  val errorCode: String = ""
 )

 @Volatile var currentDraft: ShareDraft? = null
 @Volatile var sending: Boolean = false
 @Volatile var progressLabel: String = ""
 @Volatile private var cancelRequested: Boolean = false
 @Volatile private var lastSignature: String = ""
 @Volatile private var lastHandledAt: Long = 0L

 fun clear() {
  cancelRequested = true
  currentDraft = null
  sending = false
  progressLabel = ""
 }

 fun requestCancel() {
  cancelRequested = true
 }

 private fun sanitizeFileName(raw: String, fallbackIndex: Int): String {
  val cleaned = raw.replace(Regex("[\\\\/:<>\"|?*\\x00-\\x1f]"), "_").trim().trimEnd('.', ' ').take(160)
  return if (cleaned.isEmpty() || cleaned == "." || cleaned == "..") "shared-file-$fallbackIndex" else cleaned
 }

 @Suppress("DEPRECATION")
 private fun extractUris(intent: Intent): List<Uri> {
  val found = linkedSetOf<Uri>()
  if (intent.action == Intent.ACTION_SEND) {
   (intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM))?.let { found.add(it) }
  } else if (intent.action == Intent.ACTION_SEND_MULTIPLE) {
   intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)?.filterNotNull()?.forEach { found.add(it) }
  }
  val clip = intent.clipData
  if (clip != null) {
   for (i in 0 until clip.itemCount) {
    clip.getItemAt(i)?.uri?.let { found.add(it) }
   }
  }
  return found.toList()
 }

 fun fromIntent(context: Context, intent: Intent?): ShareDraft? {
  if (intent == null) return null
  val action = intent.action ?: return null
  if (action != Intent.ACTION_SEND && action != Intent.ACTION_SEND_MULTIPLE) return null
  if (intent.getBooleanExtra("com.mohivx.SHARE_CONSUMED", false)) return currentDraft
  val uris = extractUris(intent)
  val text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString().orEmpty().trim()
  val title = (intent.getCharSequenceExtra(Intent.EXTRA_SUBJECT) ?: intent.getCharSequenceExtra(Intent.EXTRA_TITLE))
   ?.toString().orEmpty().replace("\u0000", "").trim().take(200)
  val clip = intent.clipData
  intent.putExtra("com.mohivx.SHARE_CONSUMED", true)
  intent.action = Intent.ACTION_MAIN
  intent.removeExtra(Intent.EXTRA_STREAM)
  intent.removeExtra(Intent.EXTRA_TEXT)

  val signature = PhoneClipboard.sha256("$action|$title|$text|${uris.joinToString(",")}")
  val now = System.currentTimeMillis()
  if (signature == lastSignature && now - lastHandledAt < 4000L && currentDraft != null) {
   return currentDraft
  }
  lastSignature = signature
  lastHandledAt = now
  // A new user share gets a fresh ID, even when its content matches a recent share.
  // The consumed-intent marker and short debounce above handle activity recreation.
  val id = UUID.randomUUID().toString()

  val draft = if (uris.isNotEmpty()) {
   if (uris.size > MAX_FILES) {
    ShareDraft(id, signature, title, "", emptyList(), "too_many_files")
   } else {
    val files = mutableListOf<SharedFileItem>()
    var error = ""
    for ((idx, uri) in uris.withIndex()) {
     if (uri.scheme != "content" || uri.authority.isNullOrBlank() || uri.authority == context.packageName) {
      error = "invalid_uri"
      break
     }
     var rawName = ""
     var size = -1L
     try {
      context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
       if (c.moveToFirst()) {
        rawName = c.getString(0).orEmpty()
        if (!c.isNull(1)) size = c.getLong(1)
       }
      }
      if (size <= 0L) {
       context.contentResolver.openAssetFileDescriptor(uri, "r")?.use { afd ->
        if (afd.length > 0L) size = afd.length
       }
      }
     } catch (_: Exception) {
      error = "invalid_uri"
      break
     }
     val safeName = sanitizeFileName(rawName.ifBlank { uri.lastPathSegment.orEmpty() }, idx + 1)
     val mime = context.contentResolver.getType(uri).orEmpty().trim().take(120).ifEmpty { "application/octet-stream" }
     if (BLOCKED_EXT.containsMatchIn(safeName) || BLOCKED_MIME.containsMatchIn(mime)) {
      error = "blocked_type"
      break
     }
     if (size <= 0L || size > MAX_FILE_SIZE) {
      error = "file_too_large"
      break
     }
     files.add(SharedFileItem(uri, safeName, size, mime))
    }
    if (error.isNotEmpty()) ShareDraft(id, signature, title, "", emptyList(), error)
    else ShareDraft(id, signature, title, "", files)
   }
  } else if (text.isNotEmpty()) {
   if (text.contains('\u0000') || text.length > PhoneClipboard.MAX_TEXT_CHARS || text.toByteArray(Charsets.UTF_8).size > PhoneClipboard.MAX_TEXT_BYTES) {
    ShareDraft(id, signature, title, "", emptyList(), "text_too_large")
   } else if (PhoneClipboard.isSensitive(clip, text)) {
    ShareDraft(id, signature, title, "", emptyList(), "sensitive_text")
   } else {
    ShareDraft(id, signature, title, text, emptyList())
   }
  } else {
   ShareDraft(id, signature, title, "", emptyList(), "empty_share")
  }
  currentDraft = draft
  progressLabel = ""
  cancelRequested = false
  return draft
 }

 fun send(
  context: Context,
  client: CompanionClient,
  draft: ShareDraft,
  onProgress: (index: Int, total: Int, name: String, sent: Long, size: Long) -> Unit
 ): JSONObject {
  check(client.paired) { "Pair your phone with your PC first." }
  check(draft.errorCode.isEmpty()) { "This shared item cannot be sent." }
  cancelRequested = false
  if (draft.files.isEmpty()) {
   val body = JSONObject()
    .put("kind", "text")
    .put("shareId", draft.id)
    .put("title", draft.title)
    .put("text", draft.text)
   return client.request("/api/phone-share", body)
  }
  val buffer = ByteArray(CHUNK_SIZE)
  for ((index, file) in draft.files.withIndex()) {
   // Use a new transfer ID on every send attempt so completed/aborted attempts
   // cannot make a deliberate retry look like a duplicate.
   val transferId = UUID.randomUUID().toString()
   var offset = 0L
   try {
    context.contentResolver.openInputStream(file.uri)?.use { input ->
     while (offset < file.size) {
      if (cancelRequested) throw IllegalStateException("Share cancelled.")
      var readCount = 0
      val target = minOf(CHUNK_SIZE.toLong(), file.size - offset).toInt()
      while (readCount < target) {
       val n = input.read(buffer, readCount, target - readCount)
       if (n < 0) break
       readCount += n
      }
      if (readCount <= 0) throw IllegalStateException("Shared file changed while sending.")
      val eof = (offset + readCount) == file.size
      val chunk = Base64.encodeToString(buffer, 0, readCount, Base64.NO_WRAP)
      val packet = JSONObject()
       .put("kind", "file")
       .put("transferId", transferId)
       .put("name", file.name)
       .put("mimeType", file.mimeType)
       .put("size", file.size)
       .put("offset", offset)
       .put("data", chunk)
       .put("eof", eof)
      val ack = client.request("/api/phone-share", packet)
      offset = ack.optLong("nextOffset", offset + readCount)
      onProgress(index + 1, draft.files.size, file.name, offset, file.size)
     }
    } ?: throw IllegalStateException("Shared file is unavailable.")
   } catch (error: Exception) {
    try {
     client.request("/api/phone-share", JSONObject().put("kind", "abort").put("transferId", transferId))
    } catch (_: Exception) {}
    throw error
   }
  }
  return JSONObject().put("success", true).put("files", draft.files.size)
 }
}
