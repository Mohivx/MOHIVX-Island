package com.mohivx.island.companion

import android.app.Activity
import android.os.*
import android.graphics.*
import android.graphics.drawable.GradientDrawable
import android.view.*
import android.widget.*
import org.json.JSONObject
import java.util.concurrent.Executors

class RemoteControlActivity:Activity() {
    private lateinit var client:CompanionClient
    private lateinit var status:TextView
    private lateinit var image:ImageView
    private val worker=Executors.newSingleThreadExecutor()
    private val handler=Handler(Looper.getMainLooper())
    @Volatile private var visible=false
    private val pending=java.util.ArrayDeque<JSONObject>()
    private var viewing=false
    private var fetching=false
    private var bitmap:Bitmap?=null
    private var inputBusy=false
    private var dx=0f;private var dy=0f
    private var ar=false
    private val accent=Color.rgb(138,180,255)
    private fun t(en:String,a:String)=if(ar)a else en
    private fun dp(n:Int)=(n*resources.displayMetrics.density).toInt()
    private fun label(parent:LinearLayout,value:String,size:Float=14f):TextView=TextView(this).apply{text=value;textSize=size;setTextColor(Color.WHITE);setPadding(0,dp(8),0,dp(8));parent.addView(this,LinearLayout.LayoutParams(-1,-2))}
    private fun button(parent:LinearLayout,value:String,action:()->Unit):Button=Button(this).apply{text=value;isAllCaps=false;setTextColor(accent);parent.addView(this,LinearLayout.LayoutParams(-1,dp(48)));setOnClickListener{action()}}
    override fun onCreate(state:Bundle?){
        super.onCreate(state);client=CompanionClient(this);ar=getSharedPreferences("ui",MODE_PRIVATE).getBoolean("ar",resources.configuration.locales[0].language=="ar")
        val root=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setBackgroundColor(Color.rgb(12,13,16));setPadding(dp(18),dp(12),dp(18),dp(12));layoutDirection=if(ar)View.LAYOUT_DIRECTION_RTL else View.LAYOUT_DIRECTION_LTR};setContentView(root)
        val scroll=ScrollView(this);root.addView(scroll,LinearLayout.LayoutParams(-1,0,1f));val body=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL};scroll.addView(body)
        label(body,t("Your PC, in your hand","كمبيوترك بين يديك"),23f)
        status=label(body,t("The PC controls your permissions.","الصلاحيات تُدار من الكمبيوتر."),12f)
        image=ImageView(this).apply{scaleType=ImageView.ScaleType.FIT_CENTER;setBackgroundColor(Color.BLACK);contentDescription=t("Live PC screen preview","معاينة مباشرة لشاشة الكمبيوتر")};body.addView(image,LinearLayout.LayoutParams(-1,dp(220)))
        if(intent.getBooleanExtra("view",false))button(body,t("Start / stop screen preview","تشغيل / إيقاف معاينة الشاشة")){viewing=!viewing;if(viewing)fetch()else{image.setImageDrawable(null);bitmap?.recycle();bitmap=null}}
        if(intent.getBooleanExtra("input",false)){
            label(body,t("Touchpad · tap to click · two fingers to scroll","لوحة لمس · نقرة للنقر · إصبعان للتمرير"),12f)
            val pad=View(this).apply{background=GradientDrawable().apply{setColor(Color.rgb(27,29,35));cornerRadius=dp(20).toFloat();setStroke(dp(1),Color.rgb(55,65,82))};contentDescription=t("PC touchpad","لوحة لمس الكمبيوتر")};body.addView(pad,LinearLayout.LayoutParams(-1,dp(190)))
            var x=0f;var y=0f;var travel=0f;var down=0L;var scrolled=0f
            pad.setOnTouchListener{_,event->when(event.actionMasked){
                MotionEvent.ACTION_DOWN->{x=event.x;y=event.y;travel=0f;down=event.eventTime;scrolled=0f}
                MotionEvent.ACTION_MOVE->{val mx=event.x-x;val my=event.y-y;travel+=kotlin.math.abs(mx)+kotlin.math.abs(my);x=event.x;y=event.y
                    if(event.pointerCount>1){scrolled+=my/dp(24);if(kotlin.math.abs(scrolled)>=1){send(JSONObject().put("type","scroll").put("delta",scrolled.toInt().coerceIn(-20,20)));scrolled=0f}}
                    else{dx+=mx;dy+=my;move()}}
                MotionEvent.ACTION_UP->{if(event.eventTime-down<280&&travel<dp(12))send(JSONObject().put("type","click").put("button","left"))}
            };true}
            button(body,t("Left click","نقرة يسار")){send(JSONObject().put("type","click").put("button","left"))}
            button(body,t("Right click","نقرة يمين")){send(JSONObject().put("type","click").put("button","right"))}
            val field=EditText(this).apply{hint=t("Type to send to the PC","اكتب لإرساله إلى الكمبيوتر");setTextColor(Color.WHITE);setHintTextColor(Color.GRAY);maxLines=4};body.addView(field,LinearLayout.LayoutParams(-1,-2))
            button(body,t("Send text","إرسال النص")){val value=field.text.toString();if(value.isNotEmpty()&&value.length<=2000){send(JSONObject().put("type","text").put("text",value));field.setText("")}}
            val keys=LinearLayout(this);body.addView(keys);for((key,name) in listOf("enter" to "↵","backspace" to "⌫","tab" to "Tab","escape" to "Esc")){val b=Button(this).apply{text=name;isAllCaps=false;setOnClickListener{send(JSONObject().put("type","key").put("key",key))}};keys.addView(b,LinearLayout.LayoutParams(0,dp(48),1f))}
        }
        button(root,t("Done","رجوع")){finish()}
    }
    private fun move(){if(inputBusy||!visible)return;val x=dx.toInt().coerceIn(-2000,2000);val y=dy.toInt().coerceIn(-2000,2000);if(x==0&&y==0)return;dx-=x;dy-=y;send(JSONObject().put("type","move").put("dx",x).put("dy",y))}
    private fun send(data:JSONObject){if(!visible)return;if(inputBusy){if(data.optString("type")!="move"&&pending.size<16)pending.add(data);return};inputBusy=true;worker.execute{try{if(visible)client.request("/api/remote-input",data)}catch(e:Exception){runOnUiThread{if(visible)status.text=t("Control stopped. Check the permission and connection.","توقف التحكم. تحقق من الصلاحية والاتصال.")}}finally{runOnUiThread{inputBusy=false;if(visible){val queued=pending.poll();if(queued!=null)send(queued)else handler.postDelayed({move()},35)}}}}}
    private fun fetch(){if(!viewing||!visible||fetching)return;fetching=true;worker.execute{var next:Bitmap?=null;try{val value=client.request("/api/pc-screen");val data=value.getString("dataUrl").substringAfter(',');val bytes=android.util.Base64.decode(data,android.util.Base64.DEFAULT);next=BitmapFactory.decodeByteArray(bytes,0,bytes.size);require(next!=null)}catch(e:Exception){runOnUiThread{viewing=false;status.text=t("Preview stopped. Check screen permission and connection.","توقفت المعاينة. تحقق من صلاحية الشاشة والاتصال.")}};val frame=next;runOnUiThread{fetching=false;if(visible&&viewing&&frame!=null){image.setImageBitmap(frame);bitmap?.recycle();bitmap=frame;handler.postDelayed({fetch()},500)}else frame?.recycle()}}}
    override fun onResume(){super.onResume();visible=true;if(viewing)fetch()}
    override fun onPause(){visible=false;viewing=false;pending.clear();dx=0f;dy=0f;handler.removeCallbacksAndMessages(null);image.setImageDrawable(null);bitmap?.recycle();bitmap=null;super.onPause()}
    override fun onDestroy(){worker.shutdownNow();super.onDestroy()}
}
