package com.mohivx.island.companion

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject
import java.text.Collator

/** MOHIVX-native launcher inventory and explicit app-open requests for a paired PC. */
class PhoneApps(private val context: Context) {
 private val packageManager get()=context.packageManager

 @Suppress("DEPRECATION")
 private fun launchableApps() = run {
  val query=Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
  val matches=if(Build.VERSION.SDK_INT>=33)
   packageManager.queryIntentActivities(query,PackageManager.ResolveInfoFlags.of(0L))
  else packageManager.queryIntentActivities(query,0)
  matches.asSequence().mapNotNull { info ->
   val app=info.activityInfo?.applicationInfo?:return@mapNotNull null
   val packageName=app.packageName
   if(packageName==context.packageName||packageName.isBlank())return@mapNotNull null
   val label=try{app.loadLabel(packageManager).toString().trim()}catch(_:Exception){""}
   if(label.isBlank())return@mapNotNull null
   packageName to label.take(100)
  }.distinctBy { it.first }.sortedWith { a,b -> Collator.getInstance().compare(a.second,b.second) }.take(300).toList()
 }

 fun list():JSONObject {
  val items=JSONArray()
  launchableApps().forEach { (packageName,name)->items.put(JSONObject().put("packageName",packageName).put("name",name)) }
  return JSONObject().put("items",items)
 }

 fun launch(packageName:String):JSONObject {
  require(packageName.length<=255&&Regex("^([A-Za-z][A-Za-z0-9_]*\\.)+[A-Za-z][A-Za-z0-9_]*$").matches(packageName)) { "Choose an installed phone app." }
  require(packageName!=context.packageName) { "Choose another phone app." }
  val app=launchableApps().firstOrNull { it.first==packageName } ?: throw IllegalArgumentException("This phone app is unavailable.")
  val intent=packageManager.getLaunchIntentForPackage(packageName)?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
   ?:throw IllegalArgumentException("This phone app cannot be opened.")

  if(PhoneSyncService.activityVisible){
   context.startActivity(intent)
   return JSONObject().put("opened",true)
  }

  val manager=context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
  val notificationIntent=Intent(intent).setData(Uri.parse("mohivx://phone-app/${Uri.encode(packageName)}"))
  val requestCode=packageName.hashCode()
  val pending=PendingIntent.getActivity(context,requestCode,notificationIntent,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  val builder=if(Build.VERSION.SDK_INT>=26)Notification.Builder(context,"phone-requests")else Notification.Builder(context)
  val notification=builder.setSmallIcon(android.R.drawable.ic_menu_view)
   .setContentTitle(context.getString(R.string.phone_app_open_title))
   .setContentText(context.getString(R.string.phone_app_open_text,app.second))
   .setVisibility(Notification.VISIBILITY_PRIVATE).setAutoCancel(true).setContentIntent(pending).build()
  manager.notify(36000+(requestCode and 0x0fffffff),notification)
  return JSONObject().put("needsTap",true)
 }
}
