package com.mohivx.island.companion

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Point
import android.hardware.display.DisplayManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.Build
import org.json.JSONObject

object PhoneStatus {
 fun snapshot(context:Context,includeWallpaper:Boolean=true):JSONObject {
  val battery=context.registerReceiver(null,IntentFilter(Intent.ACTION_BATTERY_CHANGED))
  val level=battery?.getIntExtra(BatteryManager.EXTRA_LEVEL,-1)?:-1
  val scale=battery?.getIntExtra(BatteryManager.EXTRA_SCALE,100)?:100
  val state=battery?.getIntExtra(BatteryManager.EXTRA_STATUS,-1)
  val manager=context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
  val caps=manager.getNetworkCapabilities(manager.activeNetwork)
  val connection=when{
   caps==null->"offline"
   caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)->"wifi"
   caps.hasTransport(NetworkCapabilities.TRANSPORT_BLUETOOTH)->"bluetooth"
   Build.VERSION.SDK_INT>=31&&caps.hasTransport(NetworkCapabilities.TRANSPORT_USB)->"usb"
   caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)->"cellular"
   caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)->"ethernet"
   else->"other"
  }
  val prefs=context.getSharedPreferences("ui",Context.MODE_PRIVATE)
  val display=(context.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager).getDisplay(android.view.Display.DEFAULT_DISPLAY)
  val size=Point()
  @Suppress("DEPRECATION")
  display?.getRealSize(size)
  val metrics=context.resources.displayMetrics
  val result=JSONObject().put("battery",if(level>=0&&scale>0)(level*100/scale).coerceIn(0,100)else JSONObject.NULL)
   .put("charging",state==BatteryManager.BATTERY_STATUS_CHARGING||state==BatteryManager.BATTERY_STATUS_FULL)
   .put("name",Build.MODEL).put("model",Build.MANUFACTURER+" "+Build.MODEL).put("connection",connection)
   .put("version",context.packageManager.getPackageInfo(context.packageName,0).versionName.orEmpty())
   .put("messagesRead",PhoneMessages.canRead(context))
   .put("messagesSend",PhoneMessages.canSend(context))
   .put("contactsRead",PhoneCalls.canReadContacts(context))
   .put("callsRead",PhoneCalls.canReadCalls(context))
   .put("controlEnabled",PhoneControlService.enabled())
   .put("display",JSONObject().put("width",size.x.takeIf{it>0}?:metrics.widthPixels).put("height",size.y.takeIf{it>0}?:metrics.heightPixels).put("densityDpi",metrics.densityDpi).put("rotation",display?.rotation?:0))
  if(includeWallpaper){val profile=PhoneWallpaper.profile(context);result.put("wallpaper",profile.image).put("wallpaperSource",profile.source)}
  return result
 }
}
