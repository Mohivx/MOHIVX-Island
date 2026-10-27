package com.mohivx.island.companion

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.app.KeyguardManager
import android.graphics.Path
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONObject
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Explicitly enabled by the phone owner; commands work only during screen sharing. */
class PhoneControlService: AccessibilityService() {
 companion object {
  @Volatile private var instance:PhoneControlService?=null
  val connected:Boolean get()=instance!=null
  fun enabled():Boolean=instance?.allowed()==true
  fun execute(input:JSONObject):JSONObject {
   val service=instance ?: throw IllegalStateException("Enable MOHIVX Island in Android accessibility settings.")
   require(service.allowed()){"Phone control is off, the phone is locked, or screen sharing stopped."}
   val done=CountDownLatch(1);var error:Exception?=null
   Handler(Looper.getMainLooper()).post {
    try{require(service.allowed());service.perform(input){failure->error=failure;done.countDown()}}catch(e:Exception){error=e;done.countDown()}
   }
   require(done.await(1800,TimeUnit.MILLISECONDS)){"Phone input timed out."};error?.let{throw it}
   return JSONObject().put("accepted",true)
  }
 }
 private fun allowed():Boolean=getSharedPreferences("ui",MODE_PRIVATE).getBoolean("phoneControl",false)&&PhoneCaptureService.active.contains("screen")&&!(getSystemService(KEYGUARD_SERVICE) as KeyguardManager).isKeyguardLocked
 override fun onServiceConnected(){instance=this}
 override fun onDestroy(){if(instance===this)instance=null;super.onDestroy()}
 override fun onAccessibilityEvent(event:AccessibilityEvent?){}
 override fun onInterrupt(){}
 private fun perform(input:JSONObject,done:(Exception?)->Unit){
  when(input.getString("type")){
   "tap","swipe"->{
    fun coordinate(key:String,maximum:Int):Float {val value=input.getDouble(key);require(value.isFinite()&&value>=0&&value<=1);return (value*(maximum-1)).toFloat()}
    val metrics=resources.displayMetrics;val path=Path().apply{moveTo(coordinate("x",metrics.widthPixels),coordinate("y",metrics.heightPixels));if(input.getString("type")=="swipe")lineTo(coordinate("endX",metrics.widthPixels),coordinate("endY",metrics.heightPixels))}
    val duration=if(input.getString("type")=="tap")60L else input.optLong("duration",250).coerceIn(60,1000)
    val gesture=GestureDescription.Builder().addStroke(GestureDescription.StrokeDescription(path,0,duration)).build()
    require(dispatchGesture(gesture,object:GestureResultCallback(){override fun onCompleted(gestureDescription:GestureDescription?){done(null)};override fun onCancelled(gestureDescription:GestureDescription?){done(IllegalStateException("Phone gesture cancelled."))}},null)){"Phone gesture unavailable."}
   }
   "key"->{when(val key=input.getString("key")){
    "back","home","recents"->{require(performGlobalAction(when(key){"back"->GLOBAL_ACTION_BACK;"home"->GLOBAL_ACTION_HOME;else->GLOBAL_ACTION_RECENTS}));done(null)}
    "escape"->{require(performGlobalAction(GLOBAL_ACTION_BACK));done(null)}
    "backspace"->{edit(null);done(null)}
    "delete"->{edit(null,forward=true);done(null)}
    "enter"->{val node=rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT) ?: throw IllegalStateException("Tap a text field first.");try{require(!node.isPassword);require(android.os.Build.VERSION.SDK_INT>=30&&node.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.id)){"Enter is unavailable for this field."}}finally{node.recycle()};done(null)}
    "selectAll","copy","cut","paste"->{val node=rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT) ?: throw IllegalStateException("Tap a text field first.");try{require(node.isEditable&&!node.isPassword){"This field cannot be edited remotely."};val currentText=if(android.os.Build.VERSION.SDK_INT>=26&&node.isShowingHintText)"" else node.text?.toString().orEmpty();val ok=when(key){"selectAll"->node.performAction(AccessibilityNodeInfo.ACTION_SET_SELECTION,Bundle().apply{putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_START_INT,0);putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_END_INT,currentText.length)});"copy"->node.performAction(AccessibilityNodeInfo.ACTION_COPY);"cut"->node.performAction(AccessibilityNodeInfo.ACTION_CUT);else->node.performAction(AccessibilityNodeInfo.ACTION_PASTE)};require(ok){"This text action is unavailable for this field."}}finally{node.recycle()};done(null)}
    else->throw IllegalArgumentException("Unsupported phone key.")
   }}
   "text"->{val text=input.getString("text");require(text.isNotEmpty()&&text.length<=2000);edit(text);done(null)}
   else->throw IllegalArgumentException("Unsupported phone input.")
  }
 }
 private fun edit(insert:String?,forward:Boolean=false){
  val node=rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT) ?: throw IllegalStateException("Tap a text field on the phone first.")
  try{
   require(node.isEditable&&!node.isPassword){"This field cannot be edited remotely."}
   val old=if(android.os.Build.VERSION.SDK_INT>=26&&node.isShowingHintText)"" else node.text?.toString().orEmpty();require(old.length<=12000)
   val rawA=node.textSelectionStart.takeIf{it>=0}?:old.length;val rawB=node.textSelectionEnd.takeIf{it>=0}?:old.length
   val a=minOf(rawA,rawB).coerceIn(0,old.length);val b=maxOf(rawA,rawB).coerceIn(a,old.length)
   val start=if(insert==null&&a==b&&!forward&&a>0)old.offsetByCodePoints(a,-1) else a
   val end=if(insert==null&&a==b&&forward&&b<old.length)old.offsetByCodePoints(b,1) else b
   val next=old.substring(0,start)+(insert?:"")+old.substring(end)
   val bundle=Bundle().apply{putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,next)}
   require(node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT,bundle)){"Text input is unavailable."}
   val cursor=(start+(insert?.length?:0)).coerceIn(0,next.length)
   node.performAction(AccessibilityNodeInfo.ACTION_SET_SELECTION,Bundle().apply{putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_START_INT,cursor);putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_END_INT,cursor)})
  }finally{node.recycle()}
 }
}
