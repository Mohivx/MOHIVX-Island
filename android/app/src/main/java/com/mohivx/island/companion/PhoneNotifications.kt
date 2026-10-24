package com.mohivx.island.companion

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONArray
import org.json.JSONObject

class PhoneNotifications:NotificationListenerService(){
 companion object {
  private val entries=linkedMapOf<String,JSONObject>()
  @Volatile var connected=false
  @Volatile private var listener:PhoneNotifications?=null
  private var revision=0L
  fun refresh(){listener?.rescan()}
  @Synchronized fun snapshot():JSONArray=JSONArray(entries.values.toList().asReversed().take(80))
  @Synchronized fun packet():Pair<Long,JSONArray> = Pair(revision,snapshot())
  @Synchronized private fun put(key:String,value:JSONObject){entries.remove(key);entries[key]=value;while(entries.size>80)entries.remove(entries.keys.first());revision++}
  @Synchronized private fun remove(key:String){if(entries.remove(key)!=null)revision++}
  @Synchronized fun clear(){entries.clear();revision++}
 }
 private fun rescan(){clear();try{activeNotifications?.forEach{onNotificationPosted(it)}}catch(_:Exception){}}
 override fun onListenerConnected(){connected=true;listener=this;rescan()}
 override fun onListenerDisconnected(){connected=false;if(listener===this)listener=null;clear()}
 override fun onNotificationPosted(sbn:StatusBarNotification){
  if(sbn.packageName==packageName||!getSharedPreferences("ui",MODE_PRIVATE).getBoolean("phoneSync",false))return
  val n=sbn.notification;if(n.flags and android.app.Notification.FLAG_GROUP_SUMMARY!=0)return
  val e=n.extras;val title=e.getCharSequence(android.app.Notification.EXTRA_TITLE)?.toString().orEmpty().take(300)
  val text=(e.getCharSequence(android.app.Notification.EXTRA_BIG_TEXT)?:e.getCharSequence(android.app.Notification.EXTRA_TEXT))?.toString().orEmpty().take(2000)
  if(title.isBlank()&&text.isBlank())return
  val label=try{packageManager.getApplicationLabel(packageManager.getApplicationInfo(sbn.packageName,0)).toString()}catch(_:Exception){sbn.packageName}
  val sms=sbn.packageName==android.provider.Telephony.Sms.getDefaultSmsPackage(this)
  put(sbn.key,JSONObject().put("id",sbn.key).put("app",label).put("title",title).put("text",text).put("at",sbn.postTime).put("sms",sms))
 }
 override fun onNotificationRemoved(sbn:StatusBarNotification){remove(sbn.key)}
}
