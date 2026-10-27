package com.mohivx.island.companion

import android.app.*
import android.content.Intent
import android.os.IBinder
import org.json.JSONArray
import org.json.JSONObject

class PhoneSyncService:Service(){
 companion object {const val STOP="com.mohivx.SYNC_STOP";@Volatile var active=false;@Volatile var activityVisible=false;@Volatile var lastSyncAt=0L;@Volatile var lastError="";const val CAPTURE="com.mohivx.REMOTE_CAPTURE"}
 private val worker=java.util.concurrent.Executors.newSingleThreadScheduledExecutor()
 private lateinit var client:CompanionClient
 private lateinit var files:PhoneFiles
 private lateinit var apps:PhoneApps
 private val results=linkedMapOf<String,JSONObject>()
 private val agentIds=mutableSetOf<Int>()
 private var lastProfileAt=0L
 private var lastNotificationRevision=-1L
 private var lastNotificationAt=0L
 private fun pending(intent:Intent,id:Int)=PendingIntent.getActivity(this,id,intent,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
 private fun manager()=getSystemService(NOTIFICATION_SERVICE) as NotificationManager
 override fun onCreate(){super.onCreate();client=CompanionClient(this);files=PhoneFiles(this);apps=PhoneApps(this);val m=manager();if(android.os.Build.VERSION.SDK_INT>=26){m.createNotificationChannel(NotificationChannel("phone-sync","Phone connection",NotificationManager.IMPORTANCE_LOW));m.createNotificationChannel(NotificationChannel("phone-requests","Agent and sharing requests",NotificationManager.IMPORTANCE_DEFAULT))}}
 private fun builder(channel:String)=if(android.os.Build.VERSION.SDK_INT>=26)Notification.Builder(this,channel)else Notification.Builder(this)
 override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int {
  if(intent?.action==STOP){getSharedPreferences("ui",MODE_PRIVATE).edit().putBoolean("phoneSync",false).apply();PhoneNotifications.clear();stopSelf();return START_NOT_STICKY}
  if(!client.paired||!getSharedPreferences("ui",MODE_PRIVATE).getBoolean("phoneSync",false)){stopSelf();return START_NOT_STICKY}
  val stop=PendingIntent.getService(this,100,Intent(this,PhoneSyncService::class.java).setAction(STOP),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  val n=builder("phone-sync").setSmallIcon(android.R.drawable.stat_sys_upload_done).setContentTitle("MOHIVX Island · Phone connected").setContentText("Notifications and shared files sync is enabled").setOngoing(true).setVisibility(Notification.VISIBILITY_PRIVATE).setContentIntent(pending(Intent(this,MainActivity::class.java).putExtra("openPhone",true),101)).addAction(Notification.Action.Builder(null,"Stop",stop).build()).build()
  startForeground(3100,n);PhoneNotifications.refresh();if(!active){active=true;worker.execute{tick()}};return START_STICKY
 }
 private fun tick(){if(!active)return;val fast=sync();if(active&&!worker.isShutdown)worker.schedule({tick()},if(fast)40L else if(PhoneControlService.enabled())200L else 2000L,java.util.concurrent.TimeUnit.MILLISECONDS)}
 private fun sync():Boolean {if(!active)return false;try{
  if(!client.paired){stopSelf();return false}
  val includeProfile=System.currentTimeMillis()-lastProfileAt>5000
  val notifications=PhoneNotifications.packet();val includeNotifications=notifications.first!=lastNotificationRevision||System.currentTimeMillis()-lastNotificationAt>5000
  val body=JSONObject().put("sentAt",System.currentTimeMillis()).put("results",JSONArray(results.values.toList())).put("status",PhoneStatus.snapshot(this,includeProfile).put("notifications",PhoneNotifications.connected).put("photos",files.photosAllowed()).put("folder",files.folderAllowed()).put("capture",JSONArray(PhoneCaptureService.active.toList())))
  if(includeNotifications)body.put("notifications",notifications.second)
  val response=client.request("/api/phone-sync",body);if(!active)return false;lastSyncAt=System.currentTimeMillis();lastError="";if(includeProfile)lastProfileAt=lastSyncAt;if(includeNotifications){lastNotificationRevision=notifications.first;lastNotificationAt=lastSyncAt};response.optJSONArray("ack")?.let{a->for(i in 0 until a.length())results.remove(a.optString(i))}
  response.optJSONArray("commands")?.let{a->for(i in 0 until a.length()){val c=a.getJSONObject(i);val id=c.getString("id");if(results.containsKey(id)||c.optLong("expires")<response.optLong("serverAt",System.currentTimeMillis()))continue;val r=JSONObject().put("id",id);try{r.put("value",execute(c))}catch(e:Exception){r.put("error",e.message?:"Phone request failed.")};results[id]=r;while(results.size>12)results.remove(results.keys.first())}}
  notifyAgents(response.optJSONArray("requests")?:JSONArray());return (response.optJSONArray("commands")?.length()?:0)>0
 }catch(e:Exception){lastError=e.message?:"Connection unavailable";return false}}
 private fun execute(c:JSONObject):JSONObject {
  val type=c.getString("type");if(type=="apps.list")return apps.list();if(type=="apps.launch")return apps.launch(c.getString("packageName"));if(type=="notifications.reply")return PhoneNotifications.reply(c.optString("notificationId"),c.optString("text"));if(type.startsWith("messages."))return PhoneMessages.execute(this,c);if(type=="contacts.resolve"||type.startsWith("calls."))return PhoneCalls.execute(this,c);if(type.startsWith("files.")||type=="photos.list")return files.execute(c)
  if(type=="input")return PhoneControlService.execute(c.getJSONObject("input"))
  val kind=c.optString("kind");require(kind in listOf("camera","mic","screen"))
  if(type=="capture.stop"){if(PhoneCaptureService.active.contains(kind))startService(Intent(this,PhoneCaptureService::class.java).setAction(PhoneCaptureService.STOP).putExtra("kind",kind));manager().cancel(3200+kind.hashCode());return JSONObject().put("stopped",true)}
  require(type=="capture.start")
  if(activityVisible){sendBroadcast(Intent(CAPTURE).setPackage(packageName).putExtra("kind",kind));return JSONObject().put("needsTap",false)}
  val action=Intent(this,MainActivity::class.java).putExtra("captureKind",kind).putExtra("openPhone",true)
  manager().notify(3200+kind.hashCode(),builder("phone-requests").setSmallIcon(android.R.drawable.ic_menu_camera).setContentTitle("MOHIVX Island · Start $kind").setContentText("Tap to review and start phone sharing").setVisibility(Notification.VISIBILITY_PRIVATE).setAutoCancel(true).setContentIntent(pending(action,3200+kind.hashCode())).build())
  return JSONObject().put("needsTap",true)
 }
 private fun notifyAgents(requests:JSONArray){val current=mutableSetOf<Int>();for(i in 0 until requests.length()){val r=requests.getJSONObject(i);val id=40000+(r.optString("id")+r.optString("fingerprint")).hashCode().ushr(1)%100000;current.add(id);if(agentIds.contains(id))continue
  val text=(r.optString("description").ifBlank{r.optString("title")}).take(700)
  manager().notify(id,builder("phone-requests").setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("MOHIVX Island · "+r.optString("agent","Agent request")).setContentText(text).setStyle(Notification.BigTextStyle().bigText(text)).setVisibility(Notification.VISIBILITY_PRIVATE).setAutoCancel(true).setContentIntent(pending(Intent(this,MainActivity::class.java).putExtra("openAgents",true),id)).build())
 };for(id in agentIds-current)manager().cancel(id);agentIds.clear();agentIds.addAll(current)}
 override fun onDestroy(){active=false;worker.shutdownNow();for(id in agentIds)manager().cancel(id);super.onDestroy()}
 override fun onBind(intent:Intent?):IBinder?=null
}
