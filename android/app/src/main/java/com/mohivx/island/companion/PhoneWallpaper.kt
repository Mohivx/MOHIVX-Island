package com.mohivx.island.companion

import android.Manifest
import android.app.WallpaperManager
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.os.Environment
import android.os.SystemClock
import android.system.Os
import android.system.OsConstants
import android.util.Base64
import java.io.ByteArrayOutputStream

object PhoneWallpaper {
 data class Profile(val image:String,val source:String)
 private var key=""
 private var checkedAt=0L
 private var cached=Profile("","unavailable")
 fun permitted(context:Context):Boolean = if(Build.VERSION.SDK_INT>=33)Environment.isExternalStorageManager() else (Build.VERSION.SDK_INT>=30&&Environment.isExternalStorageManager())||context.checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE)==PackageManager.PERMISSION_GRANTED
 @Synchronized fun profile(context:Context):Profile {
  val prefs=context.getSharedPreferences("ui",Context.MODE_PRIVATE)
  val custom=prefs.getString("phoneWallpaper","").orEmpty()
  val automatic=prefs.getBoolean("phoneWallpaperAuto",true)
  val allowed=permitted(context)
  val manager=WallpaperManager.getInstance(context)
  val wallpaperId=try{manager.getWallpaperId(WallpaperManager.FLAG_SYSTEM)}catch(_:Exception){-1}
  val nextKey="$automatic:$allowed:$wallpaperId:${custom.hashCode()}"
  val now=SystemClock.elapsedRealtime()
  if(key==nextKey&&now-checkedAt<10000)return cached
  val fallback=if(custom.isNotEmpty())Profile(custom,"custom") else Profile("",if(automatic&&!allowed)"permission-required" else if(automatic)"unavailable" else "off")
  cached=if(!automatic||!allowed)fallback else try{
   // Never substitute Android's built-in default image for a live wallpaper.
   if(manager.wallpaperInfo!=null){if(custom.isNotEmpty())fallback else Profile("","live")}
   else manager.getWallpaperFile(WallpaperManager.FLAG_SYSTEM)?.use { descriptor ->
    val options=BitmapFactory.Options().apply{inJustDecodeBounds=true}
    BitmapFactory.decodeFileDescriptor(descriptor.fileDescriptor,null,options)
    if(options.outWidth<=0||options.outHeight<=0)return@use fallback
    var sample=1
    while(maxOf(options.outWidth,options.outHeight)/sample>1024)sample*=2
    Os.lseek(descriptor.fileDescriptor,0,OsConstants.SEEK_SET)
    options.inJustDecodeBounds=false;options.inSampleSize=sample
    val bitmap=BitmapFactory.decodeFileDescriptor(descriptor.fileDescriptor,null,options)?:return@use fallback
    try{
     val ratio=minOf(1.0,512.0/maxOf(bitmap.width,bitmap.height))
     val small=Bitmap.createScaledBitmap(bitmap,maxOf(1,(bitmap.width*ratio).toInt()),maxOf(1,(bitmap.height*ratio).toInt()),true)
     try{val bytes=ByteArrayOutputStream();small.compress(Bitmap.CompressFormat.JPEG,68,bytes)
      val encoded="data:image/jpeg;base64,"+Base64.encodeToString(bytes.toByteArray(),Base64.NO_WRAP)
      if(encoded.length<=180000)Profile(encoded,"system")else fallback
     }finally{if(small!==bitmap)small.recycle()}
    }finally{bitmap.recycle()}
   }?:fallback
  }catch(_:Exception){fallback}
  key=nextKey;checkedAt=now
  return cached
 }
}
