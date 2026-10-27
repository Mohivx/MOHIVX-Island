package com.mohivx.island.companion

import android.content.Intent
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
  fun reply(notificationId:String,text:String):JSONObject = listener?.replyCurrent(notificationId,text) ?: throw IllegalStateException("Phone notification access is unavailable.")
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
  val replyAvailable=n.actions.orEmpty().any { action -> action.actionIntent!=null && action.remoteInputs.orEmpty().any { it.allowFreeFormInput && it.resultKey.isNotBlank() } }
  put(sbn.key,JSONObject().put("id",sbn.key).put("app",label).put("title",title).put("text",text).put("at",sbn.postTime).put("sms",sms).put("replyAvailable",replyAvailable))
 }
 private fun replyCurrent(notificationId:String,text:String):JSONObject {
  require(notificationId.isNotBlank()&&notificationId.length<=200) {"Choose a current phone notification."}
  val reply=text.trim();require(reply.isNotEmpty()&&reply.length<=1000) {"Enter a short reply."}
  check(getSharedPreferences("ui",MODE_PRIVATE).getBoolean("phoneSync",false)) {"Enable background sync on the phone first."}
  val sbn=activeNotifications?.firstOrNull { it.key==notificationId&&it.packageName!=packageName } ?: throw IllegalStateException("This phone notification is no longer available.")
  val actions=sbn.notification.actions.orEmpty().filter { it.actionIntent!=null }.flatMap { action -> action.remoteInputs.orEmpty().filter { it.allowFreeFormInput&&it.resultKey.isNotBlank() }.map { action to it } }
  val (action,input)=actions.firstOrNull() ?: throw IllegalStateException("This app does not provide a text reply action.")
  val fillIn=Intent();val results=android.os.Bundle().apply { putCharSequence(input.resultKey,reply) }
  android.app.RemoteInput.addResultsToIntent(arrayOf(input),fillIn,results)
  action.actionIntent.send(this,0,fillIn)
  return JSONObject().put("submitted",true)
 }
 override fun onNotificationRemoved(sbn:StatusBarNotification){remove(sbn.key)}
}
