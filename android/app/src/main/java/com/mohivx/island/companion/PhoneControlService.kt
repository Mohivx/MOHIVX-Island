package com.mohivx.island.companion

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.SharedPreferences
import android.graphics.*
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONObject
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Explicitly enabled by the phone owner; commands and pointer work only during active screen sharing. */
class PhoneControlService: AccessibilityService() {
 companion object {
  @Volatile private var instance: PhoneControlService? = null
  val connected: Boolean get() = instance != null
  fun enabled(): Boolean = instance?.allowed() == true
  fun hidePointer() {
   instance?.let { s -> Handler(Looper.getMainLooper()).post { s.removeOverlay() } }
  }
  fun execute(input: JSONObject): JSONObject {
   val service = instance ?: throw IllegalStateException("Enable MOHIVX Island in Android accessibility settings.")
   require(service.allowed()) { "Phone control is off, the phone is locked, or screen sharing stopped." }
   val done = CountDownLatch(1)
   var error: Exception? = null
   Handler(Looper.getMainLooper()).post {
    try {
     require(service.allowed())
     service.perform(input) { failure ->
      error = failure
      done.countDown()
     }
    } catch (e: Exception) {
     error = e
     done.countDown()
    }
   }
   require(done.await(1800, TimeUnit.MILLISECONDS)) { "Phone input timed out." }
   error?.let { throw it }
   return JSONObject().put("accepted", true)
  }
 }

 private var windowManager: WindowManager? = null
 private var pointerView: PointerOverlayView? = null
 private var pointerParams: WindowManager.LayoutParams? = null
 private val mainHandler = Handler(Looper.getMainLooper())
 private var staleWatchdog: Runnable? = null
 private var lifecycleReceiver: BroadcastReceiver? = null
 private var prefListener: SharedPreferences.OnSharedPreferenceChangeListener? = null

 private class PointerOverlayView(context: Context): View(context) {
  private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
   color = Color.parseColor("#8AB4FF")
   style = Paint.Style.FILL
  }
  private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
   color = Color.parseColor("#101722")
   style = Paint.Style.STROKE
   strokeWidth = 2.2f * resources.displayMetrics.density
   strokeJoin = Paint.Join.ROUND
   strokeCap = Paint.Cap.ROUND
  }
  private val cursorPath = Path()

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
   super.onSizeChanged(w, h, oldw, oldh)
   cursorPath.reset()
   val s = resources.displayMetrics.density
   cursorPath.moveTo(1.5f * s, 1.5f * s)
   cursorPath.lineTo(1.5f * s, 17f * s)
   cursorPath.lineTo(5.5f * s, 13.5f * s)
   cursorPath.lineTo(9.5f * s, 20.5f * s)
   cursorPath.lineTo(12.5f * s, 18.5f * s)
   cursorPath.lineTo(8.5f * s, 12f * s)
   cursorPath.lineTo(14f * s, 12f * s)
   cursorPath.close()
  }

  override fun onDraw(canvas: Canvas) {
   super.onDraw(canvas)
   canvas.drawPath(cursorPath, strokePaint)
   canvas.drawPath(cursorPath, fillPaint)
  }
 }

 private fun allowed(): Boolean {
  val prefs = getSharedPreferences("ui", MODE_PRIVATE)
  val controlPref = prefs.getBoolean("phoneControl", false)
  val screenActive = PhoneCaptureService.active.contains("screen")
  val locked = (getSystemService(KEYGUARD_SERVICE) as KeyguardManager).isKeyguardLocked
  return controlPref && screenActive && !locked
 }

 override fun onServiceConnected() {
  instance = this
  windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
  val filter = IntentFilter().apply {
   addAction(PhoneCaptureService.CHANGED)
   addAction(Intent.ACTION_SCREEN_OFF)
   addAction(Intent.ACTION_USER_PRESENT)
  }
  val receiver = object: BroadcastReceiver() {
   override fun onReceive(context: Context?, intent: Intent?) {
    if (!allowed()) removeOverlay()
   }
  }
  lifecycleReceiver = receiver
  registerReceiver(receiver, filter)

  val prefs = getSharedPreferences("ui", MODE_PRIVATE)
  val listener = SharedPreferences.OnSharedPreferenceChangeListener { _, key ->
   if (key == "phoneControl" && !allowed()) removeOverlay()
  }
  prefListener = listener
  prefs.registerOnSharedPreferenceChangeListener(listener)
 }

 override fun onDestroy() {
  removeOverlay()
  lifecycleReceiver?.let {
   try { unregisterReceiver(it) } catch (_: Exception) {}
   lifecycleReceiver = null
  }
  prefListener?.let {
   getSharedPreferences("ui", MODE_PRIVATE).unregisterOnSharedPreferenceChangeListener(it)
   prefListener = null
  }
  if (instance === this) instance = null
  super.onDestroy()
 }

 override fun onAccessibilityEvent(event: AccessibilityEvent?) {}

 override fun onInterrupt() {
  removeOverlay()
 }

 private fun showOrUpdatePointer(x: Int, y: Int) {
  if (!allowed()) {
   removeOverlay()
   return
  }
  val wm = windowManager ?: (getSystemService(WINDOW_SERVICE) as WindowManager).also { windowManager = it }
  val density = resources.displayMetrics.density
  val size = (26 * density).toInt()

  val current = pointerView
  if (current == null) {
   val view = PointerOverlayView(this)
   val params = WindowManager.LayoutParams(
    size, size,
    WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
    WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
    WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
    WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
    PixelFormat.TRANSLUCENT
   ).apply {
    gravity = Gravity.TOP or Gravity.START
    this.x = x
    this.y = y
   }
   try {
    wm.addView(view, params)
    pointerView = view
    pointerParams = params
   } catch (_: Exception) {}
  } else {
   pointerParams?.let { params ->
    params.x = x
    params.y = y
    try {
     wm.updateViewLayout(current, params)
    } catch (_: Exception) {}
   }
  }

  staleWatchdog?.let { mainHandler.removeCallbacks(it) }
  val watchdog = Runnable { removeOverlay() }
  staleWatchdog = watchdog
  mainHandler.postDelayed(watchdog, 4000L)
 }

 private fun removeOverlay() {
  staleWatchdog?.let { mainHandler.removeCallbacks(it) }
  staleWatchdog = null
  pointerView?.let { view ->
   try {
    windowManager?.removeView(view)
   } catch (_: Exception) {}
   pointerView = null
   pointerParams = null
  }
 }

 private fun perform(input: JSONObject, done: (Exception?) -> Unit) {
  when (input.getString("type")) {
   "move" -> {
    if (!allowed()) {
     removeOverlay()
     throw IllegalStateException("Phone control is off, the phone is locked, or screen sharing stopped.")
    }
    fun coordinate(key: String, maximum: Int): Float {
     val value = input.getDouble(key)
     require(value.isFinite() && value >= 0 && value <= 1)
     return (value * (maximum - 1)).toFloat()
    }
    val metrics = resources.displayMetrics
    val targetX = coordinate("x", metrics.widthPixels).toInt()
    val targetY = coordinate("y", metrics.heightPixels).toInt()
    showOrUpdatePointer(targetX, targetY)
    done(null)
   }
   "tap", "swipe" -> {
    fun coordinate(key: String, maximum: Int): Float {
     val value = input.getDouble(key)
     require(value.isFinite() && value >= 0 && value <= 1)
     return (value * (maximum - 1)).toFloat()
    }
    val metrics = resources.displayMetrics
    val startX = coordinate("x", metrics.widthPixels)
    val startY = coordinate("y", metrics.heightPixels)
    showOrUpdatePointer(startX.toInt(), startY.toInt())
    val path = Path().apply {
     moveTo(startX, startY)
     if (input.getString("type") == "swipe") {
      lineTo(coordinate("endX", metrics.widthPixels), coordinate("endY", metrics.heightPixels))
     }
    }
    val duration = if (input.getString("type") == "tap") 60L else input.optLong("duration", 250).coerceIn(60, 1000)
    val gesture = GestureDescription.Builder().addStroke(GestureDescription.StrokeDescription(path, 0, duration)).build()
    require(dispatchGesture(gesture, object: GestureResultCallback() {
     override fun onCompleted(gestureDescription: GestureDescription?) { done(null) }
     override fun onCancelled(gestureDescription: GestureDescription?) { done(IllegalStateException("Phone gesture cancelled.")) }
    }, null)) { "Phone gesture unavailable." }
   }
   "key" -> {
    when (val key = input.getString("key")) {
     "back", "home", "recents" -> {
      require(performGlobalAction(when (key) { "back" -> GLOBAL_ACTION_BACK; "home" -> GLOBAL_ACTION_HOME; else -> GLOBAL_ACTION_RECENTS }))
      done(null)
     }
     "escape" -> {
      require(performGlobalAction(GLOBAL_ACTION_BACK))
      done(null)
     }
     "backspace" -> {
      edit(null)
      done(null)
     }
     "delete" -> {
      edit(null, forward = true)
      done(null)
     }
     "enter" -> {
      val node = rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT) ?: throw IllegalStateException("Tap a text field first.")
      try {
       require(!node.isPassword)
       require(Build.VERSION.SDK_INT >= 30 && node.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.id)) { "Enter is unavailable for this field." }
      } finally {
       node.recycle()
      }
      done(null)
     }
     "selectAll", "copy", "cut", "paste" -> {
      val node = rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT) ?: throw IllegalStateException("Tap a text field first.")
      try {
       require(node.isEditable && !node.isPassword) { "This field cannot be edited remotely." }
       val currentText = if (Build.VERSION.SDK_INT >= 26 && node.isShowingHintText) "" else node.text?.toString().orEmpty()
       val ok = when (key) {
        "selectAll" -> node.performAction(AccessibilityNodeInfo.ACTION_SET_SELECTION, Bundle().apply {
         putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_START_INT, 0)
         putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_END_INT, currentText.length)
        })
        "copy" -> node.performAction(AccessibilityNodeInfo.ACTION_COPY)
        "cut" -> node.performAction(AccessibilityNodeInfo.ACTION_CUT)
        else -> node.performAction(AccessibilityNodeInfo.ACTION_PASTE)
       }
       require(ok) { "This text action is unavailable for this field." }
      } finally {
       node.recycle()
      }
      done(null)
     }
     else -> throw IllegalArgumentException("Unsupported phone key.")
    }
   }
   "text" -> {
    val text = input.getString("text")
    require(text.isNotEmpty() && text.length <= 2000)
    edit(text)
    done(null)
   }
   else -> throw IllegalArgumentException("Unsupported phone input.")
  }
 }

 private fun edit(insert: String?, forward: Boolean = false) {
  val node = rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT) ?: throw IllegalStateException("Tap a text field on the phone first.")
  try {
   require(node.isEditable && !node.isPassword) { "This field cannot be edited remotely." }
   val old = if (Build.VERSION.SDK_INT >= 26 && node.isShowingHintText) "" else node.text?.toString().orEmpty()
   require(old.length <= 12000)
   val rawA = node.textSelectionStart.takeIf { it >= 0 } ?: old.length
   val rawB = node.textSelectionEnd.takeIf { it >= 0 } ?: old.length
   val a = minOf(rawA, rawB).coerceIn(0, old.length)
   val b = maxOf(rawA, rawB).coerceIn(a, old.length)
   val start = if (insert == null && a == b && !forward && a > 0) old.offsetByCodePoints(a, -1) else a
   val end = if (insert == null && a == b && forward && b < old.length) old.offsetByCodePoints(b, 1) else b
   val next = old.substring(0, start) + (insert ?: "") + old.substring(end)
   val bundle = Bundle().apply { putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, next) }
   require(node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, bundle)) { "Text input is unavailable." }
   val cursor = (start + (insert?.length ?: 0)).coerceIn(0, next.length)
   node.performAction(AccessibilityNodeInfo.ACTION_SET_SELECTION, Bundle().apply {
    putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_START_INT, cursor)
    putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_END_INT, cursor)
   })
  } finally {
   node.recycle()
  }
 }
}
