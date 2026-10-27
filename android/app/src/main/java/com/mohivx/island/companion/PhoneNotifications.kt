package com.mohivx.island.companion

import android.content.Intent
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.content.ComponentName
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.MediaMetadata
import android.media.session.PlaybackState
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
  fun mediaStatus():JSONObject=listener?.activeMedia()?:JSONObject().put("available",false)
  fun controlMedia(command:JSONObject):JSONObject=listener?.controlMediaSession(command)?:throw IllegalStateException("Phone notification access is unavailable.")
  @Synchronized fun snapshot():JSONArray=JSONArray(entries.values.toList().asReversed().take(80))
  @Synchronized fun packet():Pair<Long,JSONArray> = Pair(revision,snapshot())
  @Synchronized private fun put(key:String,value:JSONObject){entries.remove(key);entries[key]=value;while(entries.size>80)entries.remove(entries.keys.first());revision++}
  @Synchronized private fun remove(key:String){if(entries.remove(key)!=null)revision++}
  @Synchronized fun clear(){entries.clear();revision++}
 }
 private fun rescan(){clear();try{activeNotifications?.forEach{onNotificationPosted(it)}}catch(_:Exception){}}
 private fun mediaControllers():List<MediaController> = (getSystemService(MEDIA_SESSION_SERVICE) as MediaSessionManager).getActiveSessions(ComponentName(this,PhoneNotifications::class.java))
 private fun activeMedia():JSONObject {
  return try {
   val sessions=mediaControllers();val controller=sessions.firstOrNull{it.playbackState?.state==PlaybackState.STATE_PLAYING}?:sessions.firstOrNull{it.metadata!=null}?:return JSONObject().put("available",false)
   val metadata=controller.metadata;val state=controller.playbackState;val duration=(metadata?.getLong(MediaMetadata.METADATA_KEY_DURATION)?:0L).coerceIn(0,86400000L)
   var position=(state?.position?:0L).coerceIn(0,duration)
   if(state?.state==PlaybackState.STATE_PLAYING&&state.lastPositionUpdateTime>0){position=(position+(android.os.SystemClock.elapsedRealtime()-state.lastPositionUpdateTime).coerceAtLeast(0L)).coerceAtMost(duration)}
   val stateName=when(state?.state){PlaybackState.STATE_PLAYING->"playing";PlaybackState.STATE_PAUSED->"paused";PlaybackState.STATE_BUFFERING,PlaybackState.STATE_CONNECTING->"buffering";PlaybackState.STATE_STOPPED->"stopped";else->"none"}
   val app=try{packageManager.getApplicationLabel(packageManager.getApplicationInfo(controller.packageName,0)).toString()}catch(_:Exception){controller.packageName}
   val actions=state?.actions?:0L
   JSONObject().put("available",metadata!=null).put("packageName",controller.packageName).put("app",app).put("title",metadata?.getString(MediaMetadata.METADATA_KEY_TITLE).orEmpty()).put("artist",metadata?.getString(MediaMetadata.METADATA_KEY_ARTIST).orEmpty()).put("album",metadata?.getString(MediaMetadata.METADATA_KEY_ALBUM).orEmpty()).put("duration",duration).put("position",position).put("state",stateName).put("canPlay",(actions and PlaybackState.ACTION_PLAY)!=0L||(actions and PlaybackState.ACTION_PLAY_PAUSE)!=0L).put("canPause",(actions and PlaybackState.ACTION_PAUSE)!=0L||(actions and PlaybackState.ACTION_PLAY_PAUSE)!=0L).put("canPrevious",(actions and PlaybackState.ACTION_SKIP_TO_PREVIOUS)!=0L).put("canNext",(actions and PlaybackState.ACTION_SKIP_TO_NEXT)!=0L).put("canSeek",(actions and PlaybackState.ACTION_SEEK_TO)!=0L)
  }catch(_:Exception){JSONObject().put("available",false)}
 }
 private fun controlMediaSession(command:JSONObject):JSONObject {
  check(connected){"Allow notification access in the phone app first."}
  val action=command.getString("action");val packageName=command.optString("packageName")
  val controller=mediaControllers().firstOrNull{it.packageName==packageName&&it.metadata!=null}?:throw IllegalStateException("No active media player was found on the phone.")
  val controls=controller.transportControls
  when(action){"play"->controls.play();"pause"->controls.pause();"previous"->controls.skipToPrevious();"next"->controls.skipToNext();"seek"->controls.seekTo(command.getLong("position"));else->throw IllegalArgumentException("Unsupported media action.")}
  return JSONObject().put("accepted",true).put("packageName",controller.packageName)
 }
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
