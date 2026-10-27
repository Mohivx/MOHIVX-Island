package com.mohivx.island.companion

import android.app.Activity
import android.app.AlertDialog
import android.app.KeyguardManager
import android.content.Intent
import android.content.ClipData
import android.content.ClipboardManager
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.widget.*
import org.json.JSONObject
import java.util.concurrent.Executors

class MainActivity:Activity() {
    private lateinit var client:CompanionClient
    private lateinit var body:LinearLayout
    private lateinit var status:TextView
    private var contentScroll:ScrollView?=null
    private val worker=Executors.newSingleThreadExecutor()
    private val buttons=mutableListOf<View>()
    private var busy=false
    private var ar=false
    private var page=0
    private var lastPageBeforeSettings=0
    private var remoteSetup=false
    private var pendingCapture=""
    private val remoteCapture=object:android.content.BroadcastReceiver(){override fun onReceive(c:android.content.Context?,i:Intent?){reviewCapture(i?.getStringExtra("kind").orEmpty())}}
    private fun reviewCapture(kind:String){if(kind !in listOf("mic","camera","screen"))return;AlertDialog.Builder(this).setTitle(t("PC sharing request","طلب مشاركة من الكمبيوتر")).setMessage(t("Start phone $kind sharing?","بدء مشاركة $kind من الهاتف؟")).setNegativeButton(t("Cancel","إلغاء"),null).setPositiveButton(t("Start","بدء")){_,_->beginCapture(kind)}.show()}
    private fun syncIntent(value:Intent){if(value.getBooleanExtra("openPhone",false))page=4;if(value.getBooleanExtra("openAgents",false))page=3;value.getStringExtra("captureKind")?.let{kind->value.removeExtra("captureKind");reviewCapture(kind)};render();if(client.paired)refresh()}
    private fun startPhoneSync(){if(android.os.Build.VERSION.SDK_INT>=33&&checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=android.content.pm.PackageManager.PERMISSION_GRANTED){requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS),952);return};prefs.edit().putBoolean("phoneSync",true).apply();val value=Intent(this,PhoneSyncService::class.java);if(android.os.Build.VERSION.SDK_INT>=26)startForegroundService(value)else startService(value);render()}
    private val captureReceiver=object:android.content.BroadcastReceiver(){override fun onReceive(c:android.content.Context?,i:Intent?){if(page==4&&client.paired)render()}}
    private var accent=Color.rgb(138,180,255)
    private val settingsBlack:Boolean get()=prefs.getString("settingsTheme","pc")=="black"
    private val palette:CompanionPalette get()=if(settingsBlack)CompanionPalette.BLACK else CompanionPalette.PC
    private val muted:Int get()=palette.textDim.toInt()
    private val ink:Int get()=palette.text.toInt()
    private var state:JSONObject?=null
    private var telemetry:JSONObject?=null
    private var agents:JSONObject?=null
    private var authenticating=false
    private var authSignal:android.os.CancellationSignal?=null
    private var afterUnlock:(()->Unit)?=null
    private val polling=android.os.Handler(android.os.Looper.getMainLooper())
    private val poll=object:Runnable {override fun run(){if(client.paired&&!busy&&!authenticating&&(page==0||page==3||page==4))refresh();polling.postDelayed(this,4000)}}
    private var answer=""
    private var question=""
    private var pairingCode=""
    private var statusText=""
    private var volume=50
    private val prefs by lazy {getSharedPreferences("ui",MODE_PRIVATE)}
    private fun t(en:String,a:String)=if(ar)a else en
    private fun dp(value:Int)=(value*resources.displayMetrics.density).toInt()
    override fun onCreate(savedInstanceState:Bundle?) {
        super.onCreate(savedInstanceState)
        val debug=(applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)!=0
        val testHost=if(debug)intent.getStringExtra("test_discovery_host") else null
        client=CompanionClient(this,testHost?.let{PcEndpoint(it,intent.getIntExtra("test_discovery_port",19120))})
        ar=prefs.getBoolean("ar",resources.configuration.locales[0].language=="ar")
        pairingCode=intent.getStringExtra("pairing_code") ?: ""
        window.statusBarColor=CompanionPalette.DARK.background.toInt();window.navigationBarColor=CompanionPalette.DARK.background.toInt()
        render();handleLink(intent);syncIntent(intent)
    }
    private fun surface(radius:Int=20,selected:Boolean=false):GradientDrawable = GradientDrawable().apply {
        setColor(if(selected){if(settingsBlack)Color.rgb(20,20,22)else Color.rgb(53,54,75)}else palette.card.toInt())
        cornerRadius=dp(radius).toFloat();setStroke(dp(1),if(selected)Color.argb(70,Color.red(accent),Color.green(accent),Color.blue(accent)) else palette.line.toInt())
    }
    private fun text(parent:LinearLayout,value:String,size:Float=14f,color:Int=ink,bold:Boolean=false):TextView = TextView(this).apply {
        text=value;textSize=size;setTextColor(color);if(bold)typeface=Typeface.create("sans-serif-medium",Typeface.NORMAL)
        setLineSpacing(dp(3).toFloat(),1f);parent.addView(this,LinearLayout.LayoutParams(-1,-2))
    }
    private fun gap(parent:LinearLayout,height:Int=12) {parent.addView(View(this),LinearLayout.LayoutParams(1,dp(height)))}
    private fun row(parent:LinearLayout):LinearLayout = LinearLayout(this).apply {orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;parent.addView(this,LinearLayout.LayoutParams(-1,-2))}
    private fun card(parent:LinearLayout=body,selected:Boolean=false):LinearLayout=LinearLayout(this).apply {
        orientation=LinearLayout.VERTICAL;background=surface(selected=selected);setPadding(dp(18),dp(17),dp(18),dp(17))
        parent.addView(this,LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=dp(14)})
    }
    private fun button(parent:LinearLayout,label:String,primary:Boolean=false,compact:Boolean=false,enabled:Boolean=true,action:()->Unit):TextView=TextView(this).apply {
        text=label;gravity=Gravity.CENTER;textSize=if(compact)12f else 14f;typeface=Typeface.create("sans-serif-medium",Typeface.NORMAL)
        setTextColor(if(primary)Color.rgb(10,20,34) else if(enabled)ink else muted)
        val shape=if(primary)GradientDrawable().apply{setColor(accent);cornerRadius=dp(24).toFloat()} else surface(24)
        background=RippleDrawable(ColorStateList.valueOf(Color.argb(35,255,255,255)),shape,null)
        setPadding(dp(15),0,dp(15),0);isClickable=true;isFocusable=true;isEnabled=enabled&&!busy;alpha=if(enabled)1f else .45f
        parent.addView(this,LinearLayout.LayoutParams(if(compact)-2 else -1,dp(if(compact)36 else 46)).apply{if(compact)marginEnd=dp(8)})
        tag=enabled;buttons.add(this);setOnClickListener{if(!busy&&enabled)action()}
    }
    private fun input(parent:LinearLayout,hintValue:String,value:String,lines:Int=2,changed:(String)->Unit):EditText=EditText(this).apply {
        hint=hintValue;setHintTextColor(muted);setTextColor(ink);textSize=14f;minLines=lines;maxLines=6;gravity=Gravity.TOP or Gravity.START
        background=GradientDrawable().apply {setColor(if(settingsBlack)Color.rgb(6,6,7)else Color.argb(100,5,9,15));cornerRadius=dp(12).toFloat();setStroke(dp(1),palette.line.toInt())}
        setPadding(dp(13),dp(12),dp(13),dp(12));setText(value);parent.addView(this,LinearLayout.LayoutParams(-1,-2))
        addTextChangedListener(object:TextWatcher {override fun beforeTextChanged(s:CharSequence?,start:Int,count:Int,after:Int){};override fun onTextChanged(s:CharSequence?,start:Int,before:Int,count:Int){changed(s.toString())};override fun afterTextChanged(s:Editable?){} })
    }
    private fun has(cap:String):Boolean {val a=state?.optJSONArray("capabilities") ?: return false;return (0 until a.length()).any{a.optString(it)==cap}}
    private fun render() {
        accent=Color.rgb(138,180,255)
        window.statusBarColor=palette.background.toInt();window.navigationBarColor=palette.background.toInt()
        buttons.clear()
        val root=LinearLayout(this).apply {orientation=LinearLayout.VERTICAL;layoutDirection=if(ar)View.LAYOUT_DIRECTION_RTL else View.LAYOUT_DIRECTION_LTR;setBackgroundColor(palette.background.toInt())}
        setContentView(root)
        val header=row(root).apply{setPadding(dp(20),dp(12),dp(20),dp(12))}
        header.addView(SpiritView(this),LinearLayout.LayoutParams(dp(34),dp(40)))
        val brand=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(9),0,0,0)}
        header.addView(brand,LinearLayout.LayoutParams(0,-2,1f));text(brand,"MOHIVX Island",17f,ink,true);text(brand,t("ISLAND COMPANION","رفيق الجزيرة"),9f,muted)
        button(header,if(ar)"EN" else "ع",compact=true){ar=!ar;prefs.edit().putBoolean("ar",ar).apply();statusText="";render()}
        if(client.paired)button(header,if(page==6)"‹" else "⚙",compact=true){if(page==6)page=lastPageBeforeSettings else{lastPageBeforeSettings=page;page=6};statusText="";render()}.contentDescription=t("Settings","الإعدادات")
        val scroll=ScrollView(this).apply {isFillViewport=true;isVerticalScrollBarEnabled=false};contentScroll=scroll
        root.addView(scroll,LinearLayout.LayoutParams(-1,0,1f));body=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(22),dp(10),dp(22),dp(15))};scroll.addView(body)
        if(!client.paired)pairPage() else when(page){0->homePage();1->controlsPage();2->assistantPage();3->agentsPage();4->phonePage();5->connectionPage();6->settingsPage();else->homePage()}
        if(client.paired)navigation(root)
    }
    private fun statusLine(parent:LinearLayout) {
        status=text(parent,statusText.ifEmpty{if(state!=null)t("● Connected securely","● متصل بأمان") else t("Connect to your island","اتصل بجزيرتك")},12f,if(state!=null)accent else muted)
    }
    private fun pairPage() {
        val hero=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER};body.addView(hero)
        hero.addView(SpiritView(this),LinearLayout.LayoutParams(dp(100),dp(104)))
        text(hero,t("Your island. Closer.","جزيرتك، أقرب إليك."),25f,ink,true).gravity=Gravity.CENTER
        gap(hero,8);text(hero,t("The same companion, now in your hand.","نفس الرفيق، الآن بين يديك."),13f,muted).gravity=Gravity.CENTER;gap(body,26)
        val box=card(selected=true);text(box,t("Connect your PC","اربط الكمبيوتر"),17f,ink,true);gap(box,8)
        val modes=row(box);button(modes,t("Same Wi-Fi","نفس الشبكة"),compact=true){client.useLocal();remoteSetup=false;render()};button(modes,t("Direct address","عنوان مباشر"),compact=true){remoteSetup=true;render()}
        if(remoteSetup||client.remote){gap(box);text(box,t("Enter a numeric PC address or scan its direct QR. No external services are used. On another network, the address must be reachable directly. The six-digit pairing code is still required.","أدخل عنوان الكمبيوتر الرقمي أو امسح رمز عنوانه المباشر. لا تُستخدم خدمات خارجية. من شبكة أخرى يجب أن يكون العنوان قابلًا للوصول مباشرة. يبقى رمز الاقتران من ٦ أرقام مطلوبًا."),12f,muted);var endpoint=client.remoteEndpoint;input(box,"https://192.168.1.10:9120",endpoint,1){endpoint=it};button(box,t("Use this address","استخدام العنوان"),compact=true){try{client.setDirectEndpoint(endpoint.trim());remoteSetup=false;statusText=t("Enter the six-digit code now.","أدخل رمز الاقتران الآن.");render()}catch(_:Exception){status.text=t("Use the HTTPS address shown on your PC.","استخدم عنوان HTTPS الظاهر على الكمبيوتر.")}};gap(box)}
        if(client.remote)text(box,t("Direct address ready. Keep MOHIVX running on the PC and enter its six-digit code.","العنوان المباشر جاهز. اترك MOHIVX يعمل على الكمبيوتر وأدخل رمزه المكوّن من ٦ أرقام."),12f,muted) else text(box,t("Connect both devices to the same Wi-Fi. Open Connections → Android on your PC and enter its six-digit code here.","وصّل الجهازين بنفس شبكة واي فاي. افتح الاتصالات ← أندرويد على الكمبيوتر وأدخل رمزه المكوّن من ٦ أرقام هنا."),12f,muted);gap(box)
        val field=input(box,t("6-digit code","رمز من ٦ أرقام"),pairingCode,1){pairingCode=it}
        field.inputType=android.text.InputType.TYPE_CLASS_NUMBER;field.keyListener=android.text.method.DigitsKeyListener.getInstance("0123456789٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹")
        field.filters=arrayOf(android.text.InputFilter.LengthFilter(6));field.maxLines=1;field.textSize=28f;field.letterSpacing=.22f;field.gravity=Gravity.CENTER;field.textDirection=View.TEXT_DIRECTION_LTR
        gap(box);val actions=row(box)
        button(actions,t("Paste code","لصق الرمز"),compact=true){val clip=getSystemService(CLIPBOARD_SERVICE) as ClipboardManager;val value=clip.primaryClip?.getItemAt(0)?.coerceToText(this)?.toString();if(value!=null)field.setText(value)}
        gap(box);button(box,t("Pair securely","اقتران آمن"),primary=true){task({client.pair(pairingCode,android.os.Build.MODEL)}){state=it;statusText="";render();refresh()}}
        gap(box);statusLine(box);text(body,t("Encrypted connection · You control every permission.","اتصال مشفّر · أنت تتحكم بكل صلاحية."),11f,muted).gravity=Gravity.CENTER
        gap(body,18)
    }
    private fun homePage() {
        val hero=row(body);val heading=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL};hero.addView(heading,LinearLayout.LayoutParams(0,-2,1f))
        text(heading,t("Welcome back.","أهلًا بعودتك."),25f,ink,true);gap(heading,5);text(heading,t("Your desktop, within reach.","سطح مكتبك، أقرب إليك."),13f,muted)
        hero.addView(SpiritView(this),LinearLayout.LayoutParams(dp(76),dp(90)));gap(body,20)
        agentFocus()
        val pc=card(selected=true);text(pc,t("YOUR COMPUTER","الكمبيوتر الخاص بك"),10f,muted,true);gap(pc,8);text(pc,"MOHIVX Island",19f,ink,true);gap(pc,6);statusLine(pc);gap(pc,6);text(pc,if(client.remote)t("Direct · encrypted","مباشر · مشفّر") else client.host,11f,muted).textDirection=View.TEXT_DIRECTION_LTR
        val metrics=row(pc);gap(pc,10)
        for((name,value) in listOf("CPU" to telemetry?.optJSONObject("cpu")?.opt("percent"),"RAM" to telemetry?.optJSONObject("ram")?.opt("percent"))){val cell=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(0,dp(12),dp(12),0)};metrics.addView(cell,LinearLayout.LayoutParams(0,-2,1f));text(cell,name,10f,muted);text(cell,if(value!=null)"$value%" else "—",25f,ink,true).textDirection=View.TEXT_DIRECTION_LTR}
        text(pc,telemetry?.optString("uptime")?.let{t("Uptime · $it","مدة التشغيل · $it")} ?: t("Refresh to read live information.","حدّث لقراءة البيانات الحالية."),11f,muted)
        val quick=row(body);button(quick,t("Refresh","تحديث"),compact=true){refresh()};button(quick,t("Open controls","فتح التحكم"),compact=true){page=1;render()}
        gap(body,22);text(body,t("One companion. Both screens.","رفيق واحد، على الشاشتين."),15f,ink,true);gap(body,6);text(body,t("Music, wallpapers, applications and a conversation with your PC. Permissions stay in your hands.","الصوت والخلفيات والتطبيقات ومحادثة رفيق الكمبيوتر. الصلاحيات تبقى بيدك."),13f,muted)
    }
    private fun controlsPage() {
        text(body,t("Your controls","التحكم"),25f,ink,true);gap(body,5);text(body,t("Small actions. Right where you need them.","إجراءات صغيرة، في المكان الذي تحتاجه."),13f,muted);gap(body,21)
        val sound=card();val head=row(sound);val title=TextView(this).apply{text=t("Sound","الصوت");textSize=16f;setTextColor(ink)};head.addView(title,LinearLayout.LayoutParams(0,-2,1f));val level=text(head,"$volume%",14f,accent).apply{layoutParams=LinearLayout.LayoutParams(-2,-2)}
        gap(sound);val slider=SeekBar(this).apply{max=100;progress=volume;progressTintList=ColorStateList.valueOf(accent);thumbTintList=ColorStateList.valueOf(accent);isEnabled=has("volume")};sound.addView(slider,LinearLayout.LayoutParams(-1,dp(42)))
        slider.setOnSeekBarChangeListener(object:SeekBar.OnSeekBarChangeListener{override fun onProgressChanged(s:SeekBar?,value:Int,fromUser:Boolean){volume=value;level.text="$value%"};override fun onStartTrackingTouch(s:SeekBar?){};override fun onStopTrackingTouch(s:SeekBar?){} })
        gap(sound,8);button(sound,t("Apply volume","ضبط الصوت"),primary=true,enabled=has("volume")){task({client.request("/api/volume",JSONObject().put("value",volume))}){statusText=t("Volume updated.","تم ضبط الصوت.");status.text=statusText}}
        if(!has("volume")){gap(sound,8);text(sound,t("Enable sound permission on your PC, then refresh.","فعّل صلاحية الصوت من الكمبيوتر ثم حدّث الاتصال."),11f,muted)}
        val tools=card();text(tools,t("Desktop","سطح المكتب"),16f,ink,true);gap(tools)
        button(tools,t("Wallpapers","الخلفيات"),enabled=has("wallpaper")){choose("/api/wallpapers","wallpapers","/api/wallpaper")};gap(tools,8)
        button(tools,t("Applications","التطبيقات"),enabled=has("apps")){choose("/api/apps","apps","/api/launch")};gap(tools,8)
        button(tools,t("Lock screen","قفل الشاشة"),enabled=has("power")){AlertDialog.Builder(this).setMessage(t("Lock your PC screen now?","قفل شاشة الكمبيوتر الآن؟")).setNegativeButton(t("Cancel","إلغاء"),null).setPositiveButton(t("Lock","قفل")){_,_->task({client.request("/api/power",JSONObject().put("action","lock").put("confirmed",true))}){statusText=t("Screen lock requested.","أُرسل طلب قفل الشاشة.");status.text=statusText}}.show()}
        statusLine(body);gap(body);button(body,t("Refresh permissions","تحديث الصلاحيات"),compact=true){refresh()}
    }
    private fun assistantPage() {
        text(body,t("Your companion","رفيقك"),25f,ink,true);gap(body,6);text(body,t("Pick up the conversation.","أكمل الحديث من هنا."),13f,muted);gap(body,22)
        val box=card();box.addView(SpiritView(this),LinearLayout.LayoutParams(dp(68),dp(72)).apply{gravity=Gravity.CENTER_HORIZONTAL});gap(box)
        input(box,t("Ask your companion…","اسأل رفيقك…"),question,4){question=it};gap(box)
        button(box,t("Send message","إرسال الرسالة"),primary=true,enabled=has("ai")){if(question.trim().isNotEmpty())task({client.request("/api/ask",JSONObject().put("prompt",question.trim()))}){answer=it.optString("reply");question="";render()}}
        if(!has("ai")){gap(box);text(box,t("Enable conversation permission from your PC.","فعّل صلاحية المحادثة من الكمبيوتر."),11f,muted)}
        if(answer.isNotEmpty()){val reply=card();text(reply,answer,14f);gap(reply);button(reply,t("Copy answer","نسخ الإجابة"),compact=true){(getSystemService(CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("MOHIVX Island",answer))}}
        statusLine(body)
    }
    private fun stateWord(value:String)=when(value){"working"->t("Working now","يعمل الآن");"waiting"->t("Needs your answer","بانتظارك");"completed"->t("Task complete","اكتملت المهمة");"error"->t("Needs attention","تعثر");else->t("All quiet","هادئ")}
    private fun agentFocus() {
        val sessions=agents?.optJSONArray("sessions") ?: return
        if(sessions.length()==0)return
        var focus=sessions.getJSONObject(0)
        for(i in 0 until sessions.length()){val s=sessions.getJSONObject(i);if(s.optString("status")=="waiting"){focus=s;break}else if(s.optString("status")=="working")focus=s}
        val box=card(selected=true);box.background=GradientDrawable().apply{setColor(Color.BLACK);cornerRadius=dp(24).toFloat();setStroke(dp(1),Color.rgb(38,40,46))}
        text(box,focus.optString("name"),12f,accent,true);gap(box,6);text(box,stateWord(focus.optString("status")),22f,ink,true);gap(box,6);text(box,focus.optString("project"),12f,muted)
        gap(box);button(box,t("View agents","عرض الوكلاء"),compact=true){page=3;render()}
    }
    private fun agentsPage() {
        text(body,t("Your agents","وكلاؤك"),25f,ink,true);gap(body,6);text(body,t("Their work. Your decisions.","عملهم، وقراراتك."),13f,muted);gap(body,20)
        if(!has("agents")){text(body,t("Enable agent activity on your PC, then refresh.","فعّل نشاط الوكلاء من الكمبيوتر، ثم حدّث الاتصال."),13f,muted);statusLine(body);button(body,t("Refresh","تحديث"),compact=true){refresh()};return}
        val requests=agents?.optJSONArray("pendingApprovals")
        if(requests!=null)for(i in 0 until requests.length()){
            val p=requests.getJSONObject(i);val box=card(selected=true);text(box,t("NEEDS YOUR ANSWER","بانتظار قرارك"),10f,Color.rgb(245,165,36),true);gap(box,7);text(box,p.optString("title"),16f,ink,true)
            gap(box,6);text(box,t("Review this request before deciding.","راجع الطلب قبل اتخاذ القرار."),12f,muted);gap(box)
            button(box,t("Review request","مراجعة الطلب"),primary=true,enabled=has("agentApprovals")){reviewRequest(p)}
        }
        val sessions=agents?.optJSONArray("sessions")
        if(sessions==null||sessions.length()==0){val box=card();text(box,t("All quiet.","كل شيء هادئ."),20f,ink,true);gap(box,6);text(box,t("Connect an agent from the PC app and start a new session.","اربط وكيلًا من تطبيق الكمبيوتر، ثم ابدأ جلسة جديدة."),13f,muted)}
        if(sessions!=null)for(i in 0 until sessions.length()){
            val s=sessions.getJSONObject(i);val box=card();text(box,s.optString("name"),16f,ink,true);gap(box,5);text(box,stateWord(s.optString("status")),12f,accent);text(box,s.optString("project"),11f,muted)
            val steps=s.optJSONArray("steps");if(steps!=null)for(j in 0 until minOf(5,steps.length())){gap(box,6);text(box,steps.getJSONObject(j).optString("detail"),12f,muted)}
            val diffs=s.optJSONArray("diffs");if(diffs!=null&&diffs.length()>0){gap(box);button(box,t("File changes · ${diffs.length()}","تغييرات الملفات · ${diffs.length()}"),compact=true){val lines=mutableListOf<String>();for(j in 0 until diffs.length()){val d=diffs.getJSONObject(j);lines.add(d.optString("path")+"\n+${d.optInt("added")}  −${d.optInt("removed")}")};AlertDialog.Builder(this).setTitle(t("File changes","تغييرات الملفات")).setMessage(lines.joinToString("\n\n")).setPositiveButton(t("Done","تم"),null).show()}}
        }
        statusLine(body);gap(body);button(body,t("Refresh","تحديث"),compact=true){refresh()}
    }
    private fun reviewRequest(p:JSONObject) {
        if(p.optLong("expires")<=System.currentTimeMillis()){status.text=t("This request expired. Refresh the list.","انتهت مهلة الطلب. حدّث القائمة.");return}
        val questions=p.optJSONArray("questions")
        if(questions!=null&&questions.length()>0){answerQuestion(p);return}
        val dialog=AlertDialog.Builder(this).setTitle(p.optString("title")).setMessage(p.optString("detail"))
            .setNegativeButton(t("Deny","رفض")){_,_->sendDecision(p,"deny")}
            .setNeutralButton(t("Cancel","إلغاء"),null)
            .setPositiveButton(t("Allow once","السماح مرة واحدة")){_,_->authenticate{sendDecision(p,"allow_once")}}.create()
        dialog.setOnShowListener{val allow=dialog.getButton(AlertDialog.BUTTON_POSITIVE);allow.isEnabled=false;polling.postDelayed({if(dialog.isShowing)allow.isEnabled=true},600)};dialog.show()
    }
    private fun answerQuestion(p:JSONObject) {
        if(p.optLong("expires")<=System.currentTimeMillis()){statusText=t("This request expired. Refresh the list.","انتهت مهلة الطلب. حدّث القائمة.");render();return}
        val questions=p.optJSONArray("questions") ?: return
        if(questions.length()==0)return
        AgentQuestionSheet(this,p,ar,accent,{reply->authenticate{sendDecision(p,"answer",reply)}},{sendDecision(p,"deny")}).show()
    }
    private fun sendDecision(p:JSONObject,option:String,answers:JSONObject?=null) {
        val input=JSONObject().put("id",p.getString("id")).put("fingerprint",p.getString("fingerprint")).put("optionId",option)
        if(answers!=null)input.put("answers",answers)
        task({client.request("/api/agent-decision",input)}){statusText=t("Answer sent.","أُرسل القرار.");refresh()}
    }
    private fun authenticate(action:()->Unit) {
        val guard=getSystemService(KEYGUARD_SERVICE) as KeyguardManager
        if(!guard.isDeviceSecure){status.text=t("Set a screen lock on your phone before allowing requests.","أضف قفل شاشة للهاتف قبل السماح بالطلبات.");return}
        authenticating=true
        if(android.os.Build.VERSION.SDK_INT>=30){authenticateModern(action);return}
        afterUnlock=action
        val intent=guard.createConfirmDeviceCredentialIntent(t("Confirm decision","تأكيد القرار"),t("Allow this agent request once.","السماح بطلب الوكيل مرة واحدة."))
        if(intent!=null)startActivityForResult(intent,920) else {authenticating=false;afterUnlock=null}
    }
    @android.annotation.TargetApi(30)
    private fun authenticateModern(action:()->Unit) {
        try{authSignal=android.os.CancellationSignal();android.hardware.biometrics.BiometricPrompt.Builder(this).setTitle(t("Confirm decision","تأكيد القرار")).setAllowedAuthenticators(android.hardware.biometrics.BiometricManager.Authenticators.BIOMETRIC_STRONG or android.hardware.biometrics.BiometricManager.Authenticators.DEVICE_CREDENTIAL).build().authenticate(authSignal!!,mainExecutor,object:android.hardware.biometrics.BiometricPrompt.AuthenticationCallback(){override fun onAuthenticationSucceeded(result:android.hardware.biometrics.BiometricPrompt.AuthenticationResult){authenticating=false;if(!isDestroyed&&!isFinishing)action()};override fun onAuthenticationError(code:Int,message:CharSequence){authenticating=false;status.text=t("Decision cancelled.","أُلغي القرار.")}})}catch(e:Exception){authenticating=false;status.text=t("Could not confirm your identity.","تعذر تأكيد هويتك.")}
    }
    override fun onActivityResult(requestCode:Int,resultCode:Int,data:Intent?){super.onActivityResult(requestCode,resultCode,data);if(requestCode==954){if(resultCode==RESULT_OK&&data?.data!=null)savePhoneWallpaper(data.data!!);return};if(requestCode==951){if(resultCode==RESULT_OK&&data?.data!=null){val uri=data.data!!;contentResolver.takePersistableUriPermission(uri,Intent.FLAG_GRANT_READ_URI_PERMISSION);prefs.edit().putString("phoneFolder",uri.toString()).apply();render()};return};if(requestCode==930){if(resultCode==RESULT_OK&&data!=null)launchCapture("screen",data);else status.text=t("Screen sharing cancelled.","أُلغيت مشاركة الشاشة.");return};if(requestCode==920){authenticating=false;val action=afterUnlock;afterUnlock=null;if(resultCode==RESULT_OK&&!isDestroyed&&!isFinishing)action?.invoke()}}
    override fun onNewIntent(value:Intent){super.onNewIntent(value);setIntent(value);handleLink(value);syncIntent(value)}
    private fun handleLink(value:Intent){val uri=value.data ?: return;if(uri.scheme!="mohivx"||uri.host!="connect")return;val endpoint=uri.getQueryParameter("endpoint") ?: return
        AlertDialog.Builder(this).setTitle(t("Direct device connection","اتصال مباشر بالجهاز")).setMessage(t("Use the connection address from your PC?","استخدام عنوان الاتصال من الكمبيوتر؟")+"\n"+endpoint.take(180)).setNegativeButton(t("Cancel","إلغاء"),null).setPositiveButton(t("Use address","استخدام العنوان")){_,_->task({client.setDirectEndpoint(endpoint);JSONObject().put("success",true)}){remoteSetup=false;statusText=t("Enter the six-digit code, or refresh your existing connection.","أدخل الرمز المكوّن من ٦ أرقام، أو حدّث اتصالك الحالي.");if(client.paired)page=5;render()}}.show()
    }
    private fun phoneControlCard(){
        val box=card(selected=PhoneControlService.enabled());text(box,t("Control this phone from your PC","تحكم بهذا الهاتف من الكمبيوتر"),17f,ink,true);gap(box,6)
        text(box,t("Tap, swipe and type inside the phone-screen window on your PC. Enable accessibility, allow Phone control on the PC, then share your screen. Control stops when sharing stops or the phone locks.","انقر واسحب واكتب من نافذة شاشة الهاتف على الكمبيوتر. فعّل خدمة إمكانية الوصول، واسمح بالتحكم من الكمبيوتر، ثم شارك الشاشة. يتوقف التحكم عند إيقاف المشاركة أو قفل الهاتف."),12f,muted);gap(box)
        button(box,if(prefs.getBoolean("phoneControl",false))t("Turn phone control off","إيقاف التحكم بالهاتف")else t("Enable phone control","تفعيل التحكم بالهاتف"),compact=true){
            val enable=!prefs.getBoolean("phoneControl",false);prefs.edit().putBoolean("phoneControl",enable).apply()
            if(enable&&!PhoneControlService.connected)startActivity(Intent(android.provider.Settings.ACTION_ACCESSIBILITY_SETTINGS))else render()
        }
        if(prefs.getBoolean("phoneControl",false)&&!PhoneControlService.connected){gap(box);button(box,t("Open accessibility settings","فتح إعدادات إمكانية الوصول"),compact=true){startActivity(Intent(android.provider.Settings.ACTION_ACCESSIBILITY_SETTINGS))}}
        gap(box);text(box,if(PhoneControlService.enabled())t("Control available while screen sharing is active","التحكم متاح أثناء مشاركة الشاشة")else t("View only until you enable all requirements","عرض فقط حتى تفعيل المتطلبات"),11f,muted)
    }
    private fun savePhoneWallpaper(uri:android.net.Uri){
        task({
            val bounds=android.graphics.BitmapFactory.Options().apply{inJustDecodeBounds=true};contentResolver.openInputStream(uri).use{android.graphics.BitmapFactory.decodeStream(it,null,bounds)}
            require(bounds.outWidth>0&&bounds.outHeight>0&&bounds.outWidth<30000&&bounds.outHeight<30000)
            val options=android.graphics.BitmapFactory.Options();while(maxOf(bounds.outWidth,bounds.outHeight)/options.inSampleSize.coerceAtLeast(1)>1024)options.inSampleSize=options.inSampleSize.coerceAtLeast(1)*2
            val bitmap=contentResolver.openInputStream(uri).use{android.graphics.BitmapFactory.decodeStream(it,null,options)} ?: throw IllegalStateException("Image unavailable")
            val scale=minOf(1f,512f/maxOf(bitmap.width,bitmap.height));val scaled=android.graphics.Bitmap.createScaledBitmap(bitmap,(bitmap.width*scale).toInt().coerceAtLeast(1),(bitmap.height*scale).toInt().coerceAtLeast(1),true)
            val output=java.io.ByteArrayOutputStream();scaled.compress(android.graphics.Bitmap.CompressFormat.JPEG,65,output);if(scaled!==bitmap)scaled.recycle();bitmap.recycle()
            val encoded="data:image/jpeg;base64,"+android.util.Base64.encodeToString(output.toByteArray(),android.util.Base64.NO_WRAP);require(encoded.length<=180000){"Choose a smaller image"}
            prefs.edit().putString("phoneWallpaper",encoded).putBoolean("phoneWallpaperAuto",false).apply();JSONObject().put("success",true)
        }){statusText=t("Phone card background updated.","تم تحديث خلفية بطاقة الهاتف.");render()}
    }
    private fun phonePage(){
        text(body,t("Your phone, part of your PC","هاتفك، جزء من الكمبيوتر"),24f,ink,true);gap(body,6);text(body,t("Start sharing here. Stop at any time from this page or the Android notification.","ابدأ المشاركة من هنا، وأوقفها من هذه الصفحة أو إشعار أندرويد في أي وقت."),13f,muted);gap(body,18)
        val sync=card(selected=PhoneSyncService.active);text(sync,t("Notifications, messages and files","الإشعارات والرسائل والملفات"),17f,ink,true);gap(sync,6);text(sync,t("Sync shares incoming notifications (including SMS notifications), selected photos and a folder you choose. Agent requests can reach you while the app is in the background.","المزامنة تشارك الإشعارات الواردة، ومنها إشعارات الرسائل النصية، والصور والمجلد الذي تختاره. تصلك طلبات الوكلاء حتى والتطبيق بالخلفية."),12f,muted);gap(sync)
        button(sync,if(PhoneSyncService.active)t("Stop background sync","إيقاف المزامنة بالخلفية")else t("Enable background sync","تفعيل المزامنة بالخلفية")){if(PhoneSyncService.active){prefs.edit().putBoolean("phoneSync",false).apply();PhoneNotifications.clear();stopService(Intent(this,PhoneSyncService::class.java));render()}else startPhoneSync()}
        val smsRead=PhoneMessages.canRead(this);val smsSend=PhoneMessages.canSend(this)
        text(sync,t("SMS messages","رسائل SMS"),14f,ink,true);gap(sync,4)
        text(sync,t("Optional access to read SMS conversations and send texts from your PC. This does not change your default messaging app. Android may block these restricted permissions for a manually installed APK.","وصول اختياري لقراءة محادثات SMS وإرسال الرسائل من الكمبيوتر. لن يغيّر تطبيق الرسائل الافتراضي. قد يمنع أندرويد هذه الصلاحيات المقيّدة في APK مثبّت يدويًا."),11f,muted);gap(sync,6)
        button(sync,if(smsRead&&smsSend)t("SMS access is enabled","صلاحية SMS مفعلة")else t("Allow SMS access","السماح بصلاحية SMS"),compact=true,enabled=!(smsRead&&smsSend)){
            if(android.os.Build.VERSION.SDK_INT>=23)requestPermissions(arrayOf(android.Manifest.permission.READ_SMS,android.Manifest.permission.SEND_SMS),955)
        };gap(sync)
        gap(sync);button(sync,t("Allow notification access","السماح بالوصول للإشعارات"),compact=true){startActivity(Intent(android.provider.Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))};gap(sync)
        button(sync,t("Allow photos","السماح بالصور"),compact=true){val permission=if(android.os.Build.VERSION.SDK_INT>=33)android.Manifest.permission.READ_MEDIA_IMAGES else android.Manifest.permission.READ_EXTERNAL_STORAGE;requestPermissions(if(android.os.Build.VERSION.SDK_INT>=34)arrayOf(permission,android.Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED)else arrayOf(permission),953)};gap(sync)
        button(sync,t("Choose shared folder","اختيار مجلد مشترك"),compact=true){startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION),951)}
        if(android.os.Build.VERSION.SDK_INT>=30){gap(sync);button(sync,if(prefs.getBoolean("phoneAllFiles",false))t("Disconnect shared storage","فصل ملفات الهاتف")else t("Share all phone folders","مشاركة مجلدات الهاتف كلها"),compact=true){if(prefs.getBoolean("phoneAllFiles",false)){prefs.edit().putBoolean("phoneAllFiles",false).apply();render()}else{prefs.edit().putBoolean("phoneAllFiles",true).apply();startActivity(Intent(android.provider.Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,android.net.Uri.parse("package:"+packageName)))}};gap(sync,5);text(sync,t("Android private app folders remain unavailable.","مجلدات التطبيقات الخاصة في أندرويد غير متاحة."),11f,muted)}
        if(prefs.getString("phoneFolder","").orEmpty().isNotEmpty()){gap(sync,6);button(sync,t("Disconnect folder","فصل المجلد"),compact=true){val uri=android.net.Uri.parse(prefs.getString("phoneFolder",""));try{contentResolver.releasePersistableUriPermission(uri,Intent.FLAG_GRANT_READ_URI_PERMISSION)}catch(_:Exception){};prefs.edit().remove("phoneFolder").apply();render()}}
        for((kind,cap,name,detail) in listOf(arrayOf("screen","phoneScreen",t("Phone screen","شاشة الهاتف"),t("Show this screen in the PC Phone section.","اعرض هذه الشاشة في قسم الهاتف بالكمبيوتر.")),arrayOf("camera","phoneCamera",t("Phone camera","كاميرا الهاتف"),t("Preview on the PC and route to MOHIVX Phone Camera.","معاينة على الكمبيوتر وتوجيه إلى MOHIVX Phone Camera.")),arrayOf("mic","phoneMic",t("Phone microphone","مايك الهاتف"),t("Send microphone audio. Windows apps need the virtual audio cable configured on the PC.","أرسل صوت المايك. برامج ويندوز تحتاج الكابل الصوتي الافتراضي المهيأ من الكمبيوتر.")))){
            val box=card(selected=PhoneCaptureService.active.contains(kind));text(box,name,17f,ink,true);gap(box,5);text(box,detail,12f,muted);gap(box)
            val sharing=PhoneCaptureService.active.contains(kind)
            if(kind=="camera"&&!sharing){val front=Switch(this).apply{text=t("Front camera","الكاميرا الأمامية");setTextColor(ink);isChecked=prefs.getBoolean("frontCamera",false);setOnCheckedChangeListener{_,checked->prefs.edit().putBoolean("frontCamera",checked).apply()}};box.addView(front)}
            button(box,if(sharing)t("Stop sharing","إيقاف المشاركة") else t("Start sharing","بدء المشاركة"),primary=!sharing,enabled=sharing||has(cap)){if(sharing)startService(Intent(this,PhoneCaptureService::class.java).setAction(PhoneCaptureService.STOP).putExtra("kind",kind))else beginCapture(kind)}
            if(!has(cap)){gap(box,6);text(box,t("Enable this permission on your PC, then refresh.","فعّل هذه الصلاحية من الكمبيوتر ثم حدّث الاتصال."),11f,muted)}
        }
        phoneControlCard()
        val appearance=card();text(appearance,t("Your phone in the island","هاتفك داخل الجزيرة"),17f,ink,true);gap(appearance,6);val profile=PhoneStatus.snapshot(this,false);text(appearance,profile.optString("model")+" · "+profile.optInt("battery").toString()+"%",13f,muted);gap(appearance)
        val wallpaperAuto=prefs.getBoolean("phoneWallpaperAuto",true)
        button(appearance,if(wallpaperAuto)t("Phone wallpaper sync: on","مزامنة خلفية الهاتف: مفعلة")else t("Phone wallpaper sync: off","مزامنة خلفية الهاتف: متوقفة"),compact=true){prefs.edit().putBoolean("phoneWallpaperAuto",!wallpaperAuto).apply();render()};gap(appearance)
        if(wallpaperAuto&&!PhoneWallpaper.permitted(this)){text(appearance,t("Android requires file access to read the current wallpaper. This permission also covers other files; you can choose just one picture below instead.","يحتاج أندرويد صلاحية الملفات لقراءة الخلفية الحالية. الصلاحية تشمل ملفات أخرى أيضًا؛ يمكنك اختيار صورة واحدة أدناه بدلًا منها."),11f,muted);gap(appearance,6);button(appearance,t("Allow wallpaper access","السماح بقراءة الخلفية"),compact=true){if(android.os.Build.VERSION.SDK_INT>=30)startActivity(Intent(android.provider.Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,android.net.Uri.parse("package:"+packageName)))else requestPermissions(arrayOf(android.Manifest.permission.READ_EXTERNAL_STORAGE),953)};gap(appearance)}
        button(appearance,t("Choose phone card background","اختيار خلفية بطاقة الهاتف"),compact=true){startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).setType("image/*").addCategory(Intent.CATEGORY_OPENABLE),954)}
        if(prefs.contains("phoneWallpaper")){gap(appearance);button(appearance,t("Remove card background","إزالة خلفية البطاقة"),compact=true){prefs.edit().remove("phoneWallpaper").apply();render()}}
        gap(appearance,6);text(appearance,t("Your current still wallpaper and battery appear on your PC. Live wallpapers need a picture you choose below. No wallpaper is changed.","تظهر الخلفية الثابتة الحالية والشحن على الكمبيوتر. للخلفيات المتحركة، اختر صورة للبطاقة أدناه. لا يغيّر التطبيق خلفية هاتفك."),11f,muted)
        val control=card();text(control,t("Control your PC","تحكم بالكمبيوتر"),17f,ink,true);gap(control);button(control,t("Screen · touchpad · keyboard","الشاشة · الماوس · الكيبورد"),enabled=has("remoteInput")||has("desktopView")){startActivity(Intent(this,RemoteControlActivity::class.java).putExtra("input",has("remoteInput")).putExtra("view",has("desktopView")))}
        if(PhoneCaptureService.lastError.isNotEmpty())text(body,t("Sharing stopped. Check the PC permission and connection; then start again.","توقفت المشاركة. تحقق من الصلاحية والاتصال بالكمبيوتر، ثم ابدأ مجددًا."),12f,accent)
        statusLine(body);gap(body);button(body,t("Refresh permissions","تحديث الصلاحيات"),compact=true){refresh()}
    }
    private fun beginCapture(kind:String){
        pendingCapture=kind;val needed=mutableListOf<String>();if(kind=="camera")needed.add(android.Manifest.permission.CAMERA);if(kind=="mic")needed.add(android.Manifest.permission.RECORD_AUDIO);if(android.os.Build.VERSION.SDK_INT>=33)needed.add(android.Manifest.permission.POST_NOTIFICATIONS)
        val missing=needed.filter{checkSelfPermission(it)!=android.content.pm.PackageManager.PERMISSION_GRANTED};if(missing.isNotEmpty()){requestPermissions(missing.toTypedArray(),940);return};captureConsent(kind)
    }
    private fun captureConsent(kind:String){if(kind=="screen")startActivityForResult((getSystemService(MEDIA_PROJECTION_SERVICE) as android.media.projection.MediaProjectionManager).createScreenCaptureIntent(),930)else launchCapture(kind)}
    override fun onRequestPermissionsResult(code:Int,permissions:Array<out String>,results:IntArray){super.onRequestPermissionsResult(code,permissions,results);if(code==952){if(android.os.Build.VERSION.SDK_INT<33||checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)==android.content.pm.PackageManager.PERMISSION_GRANTED)startPhoneSync();return};if(code==953){render();return};if(code==955){statusText=if(PhoneMessages.canRead(this)&&PhoneMessages.canSend(this))t("SMS access enabled.","تم تفعيل صلاحية SMS.")else if(PhoneMessages.canRead(this)||PhoneMessages.canSend(this))t("Android granted only part of SMS access. Check the phone permissions.","منح أندرويد جزءًا فقط من صلاحية SMS. راجع صلاحيات الهاتف.")else t("Android did not grant SMS access. Some installers block these restricted permissions; quick notification replies still work.","لم يمنح أندرويد صلاحية SMS. بعض أدوات التثبيت تمنع هذه الصلاحيات المقيّدة؛ يظل الرد السريع على الإشعارات متاحًا.");render();return};if(code!=940)return;val kind=pendingCapture;val required=when(kind){"camera"->android.Manifest.permission.CAMERA;"mic"->android.Manifest.permission.RECORD_AUDIO;else->null};if(required!=null&&checkSelfPermission(required)!=android.content.pm.PackageManager.PERMISSION_GRANTED){status.text=t("Permission was not granted. Sharing has not started.","لم تُمنح الصلاحية. لم تبدأ المشاركة.");return};captureConsent(kind)}
    private fun launchCapture(kind:String,consent:Intent?=null){try{val value=Intent(this,PhoneCaptureService::class.java).setAction(PhoneCaptureService.START).putExtra("kind",kind).putExtra("front",prefs.getBoolean("frontCamera",false));if(consent!=null)value.putExtra("consent",consent);if(android.os.Build.VERSION.SDK_INT>=26)startForegroundService(value)else startService(value)}catch(_:Exception){status.text=t("Could not start sharing.","تعذر بدء المشاركة.")}}
    private fun connectionPage() {
        text(body,t("Connections","الاتصالات"),25f,ink,true);gap(body,6);text(body,t("Make it feel like yours.","خصصه ليشبهك."),13f,muted);gap(body,22)
        val box=card(selected=true);text(box,"MOHIVX Island",18f,ink,true);gap(box,5);text(box,client.host,12f,muted);gap(box);statusLine(box);gap(box)
        button(box,t("Refresh connection","تحديث الاتصال"),compact=true){refresh()}
        val direct=card();text(direct,t("Direct connection","اتصال مباشر"),16f,ink,true);gap(direct,6);text(direct,t("No relay or cloud service. Choose local discovery, or enter an IP address reachable from your network.","دون وسيط أو خدمة سحابية. اختر اكتشاف الشبكة، أو أدخل عنوان IP يمكن الوصول إليه من شبكتك."),12f,muted);gap(direct)
        button(direct,t("Find this PC on local Wi-Fi","العثور على الكمبيوتر في الشبكة المحلية"),compact=true){client.useLocal();refresh()};gap(direct)
        var directAddress=client.remoteEndpoint;input(direct,"https://192.168.1.10:9120",directAddress,1){directAddress=it};gap(direct)
        button(direct,t("Use direct address","استخدام العنوان المباشر"),compact=true){try{client.setDirectEndpoint(directAddress.trim());refresh()}catch(_:Exception){status.text=t("Use a numeric IPv4 or IPv6 HTTPS address. Host names and external services are disabled.","استخدم عنوان HTTPS رقميًا من IPv4 أو IPv6. أسماء المواقع والخدمات الخارجية معطّلة.")}}
        val methods=card();text(methods,t("Connection methods","طرق الاتصال"),16f,ink,true);gap(methods)
        text(methods,t("Wi-Fi: connect both devices to the same network. USB network: connect a cable, enable USB tethering in Android, then choose the matching direct PC address. Bluetooth network: pair with Windows and connect a Bluetooth PAN network before using its direct address.","واي فاي: صل الجهازين بالشبكة نفسها. شبكة USB: صل الكابل وفعّل ربط USB من أندرويد ثم اختر عنوان الكمبيوتر المباشر المناسب. شبكة البلوتوث: اقترن بويندوز واتصل بشبكة Bluetooth PAN ثم استخدم عنوانها المباشر."),12f,muted)
        gap(methods,6);text(methods,t("USB and Bluetooth use system network sharing here; direct accessory/Bluetooth data pairing is not included in this version. Internet access needs a reachable direct IP address; no relay server is used.","USB والبلوتوث هنا عبر مشاركة شبكة النظام؛ الربط المباشر كبروتوكول مستقل غير متاح في هذا الإصدار. الوصول عبر الإنترنت يحتاج عنوان IP مباشرًا يمكن الوصول إليه؛ دون خادم وسيط."),11f,muted)
        val permissions=card();text(permissions,t("Permissions","الصلاحيات"),16f,ink,true);gap(permissions)
        for((id,name) in listOf("telemetry" to t("Live information","بيانات الجهاز"),"volume" to t("Sound","الصوت"),"wallpaper" to t("Wallpapers","الخلفيات"),"apps" to t("Applications","التطبيقات"),"ai" to t("Conversation","المحادثة"),"agents" to t("Coding agents","وكلاء البرمجة"),"agentApprovals" to t("Agent approvals","موافقات الوكلاء"),"power" to t("Lock screen","قفل الشاشة"),"remoteInput" to t("Mouse and keyboard","الماوس والكيبورد"),"desktopView" to t("PC screen","شاشة الكمبيوتر"),"phoneScreen" to t("Phone screen","شاشة الهاتف"),"phoneCamera" to t("Phone camera","كاميرا الهاتف"),"phoneMic" to t("Phone microphone","مايك الهاتف"),"phoneData" to t("Phone notifications and files","الإشعارات وملفات الهاتف"),"phoneMessages" to t("Phone SMS messages","رسائل SMS للهاتف"),"phoneControl" to t("Control phone screen","التحكم بشاشة الهاتف"))){text(permissions,(if(has(id))"● " else "○ ")+name,12f,if(has(id))accent else muted);gap(permissions,5)}
        text(permissions,t("Manage these permissions on your PC.","أدر هذه الصلاحيات من الكمبيوتر."),11f,muted)
        if(has("agents"))button(body,t("Coding agent activity","نشاط وكلاء البرمجة")){page=3;render();refresh()}
        gap(body,12);button(body,t("Forget this PC","نسيان الكمبيوتر"),compact=true){AlertDialog.Builder(this).setMessage(t("Remove this connection from your phone? Revoke the device on your PC to remove all access.","حذف الاتصال من الهاتف؟ ألغِ ربط الجهاز من الكمبيوتر لسحب الوصول بالكامل.")).setNegativeButton(t("Cancel","إلغاء"),null).setPositiveButton(t("Forget","نسيان")){_,_->prefs.edit().putBoolean("phoneSync",false).apply();PhoneNotifications.clear();stopService(Intent(this,PhoneSyncService::class.java));stopService(Intent(this,PhoneCaptureService::class.java));task({try{client.request("/api/phone-stop",JSONObject())}catch(_:Exception){};client.forget();JSONObject().put("success",true)}){state=null;telemetry=null;agents=null;pairingCode="";statusText="";render()}}.show()}
    }
    private fun settingsPage() {
        button(body,t("Back","رجوع"),compact=true){page=lastPageBeforeSettings;render()}
        gap(body,10);text(body,t("Settings","الإعدادات"),25f,ink,true);gap(body,5)
        text(body,t("The same calm desktop look, made for your phone.","نفس شكل الكمبيوتر الهادئ، بتنسيق يناسب الجوال."),13f,muted);gap(body,22)
        val appearance=card(selected=true);text(appearance,t("Appearance","المظهر"),18f,ink,true);gap(appearance,5)
        text(appearance,t("Choose the current PC style or a pure black surface.","اختر شكل الكمبيوتر الحالي أو الواجهة السوداء."),12f,muted);gap(appearance,12)
        themes(appearance)
        val note=card();text(note,t("This phone","هذا الجوال"),16f,ink,true);gap(note,6)
        text(note,t("The choice is saved on this phone. Set the same option in PC settings to match both screens.","يُحفظ الاختيار على هذا الجوال. اختر الشكل نفسه في إعدادات الكمبيوتر لمطابقة الشاشتين."),12f,muted);gap(note,10)
        button(note,t("Open connections","فتح الاتصالات"),compact=true){lastPageBeforeSettings=6;page=5;render()}
    }
    private fun themes(parent:LinearLayout) {
        val options=row(parent)
        for((id,name,detail,color) in listOf(
            arrayOf("pc",t("Desktop style","شكل الكمبيوتر"),t("Navy glass cards","بطاقات زجاجية كحلية"),"#10111D"),
            arrayOf("black",t("Black","أسود"),t("Pure black surfaces","مساحات سوداء بالكامل"),"#000000")
        )){
            val selected=prefs.getString("settingsTheme","pc")==id
            val choice=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER;setPadding(dp(10),dp(12),dp(10),dp(12));background=if(selected)surface(17,true)else surface(17);contentDescription=name;isClickable=true;isFocusable=true}
            options.addView(choice,LinearLayout.LayoutParams(0,-2,1f).apply{marginEnd=dp(8)})
            choice.addView(View(this).apply{background=GradientDrawable().apply{setColor(Color.parseColor(color));cornerRadius=dp(7).toFloat();setStroke(dp(1),if(id=="black")Color.rgb(50,50,54)else Color.argb(30,255,255,255))}},LinearLayout.LayoutParams(dp(48),dp(30)))
            gap(choice,8);text(choice,name,12f,ink,true).gravity=Gravity.CENTER;gap(choice,3);text(choice,detail,10f,muted).gravity=Gravity.CENTER
            choice.setOnClickListener{if(!busy){prefs.edit().putString("settingsTheme",id).apply();render()}}
        }
    }
    private fun navigation(root:LinearLayout) {
        val dock=row(root).apply {background=surface(30);setPadding(dp(6),dp(5),dp(6),dp(5))}
        (dock.layoutParams as LinearLayout.LayoutParams).apply{width=-1;height=dp(66);setMargins(dp(22),dp(8),dp(22),dp(16))}
        for((index,label) in listOf(t("Home","الرئيسية"),t("Controls","التحكم"),t("Companion","الرفيق"),t("Agents","الوكلاء"),t("Phone","الهاتف"),t("Connections","الاتصالات")).withIndex()){
            val cell=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER;background=if(index==page)surface(23,true)else null;isClickable=true;isFocusable=true;contentDescription=label}
            dock.addView(cell,LinearLayout.LayoutParams(0,-1,1f));cell.addView(NavIcon(this,index,if(index==page)accent else muted),LinearLayout.LayoutParams(dp(22),dp(22)));gap(cell,3);text(cell,label,9f,if(index==page)ink else muted).gravity=Gravity.CENTER
            buttons.add(cell);cell.setOnClickListener{if(!busy){page=index;statusText="";render()}}
        }
    }
    private fun refresh() {task({val result=client.request("/api/status");val caps=result.getJSONArray("capabilities").toString();if(caps.contains("telemetry"))try{result.put("telemetry",client.request("/api/telemetry").optJSONObject("telemetry"))}catch(_:Exception){};if(caps.contains("agents"))try{result.put("agents",client.request("/api/agents").optJSONObject("agents"))}catch(_:Exception){};result}){val scrollY=contentScroll?.scrollY ?: 0;state=it;telemetry=it.optJSONObject("telemetry");agents=it.optJSONObject("agents");statusText="";render();contentScroll?.post{contentScroll?.scrollTo(0,scrollY)}}}
    private fun choose(route:String,key:String,apply:String) {task({client.request(route)}){result->val values=result.getJSONArray(key);val names=Array(values.length()){values.getJSONObject(it).getString("name")};if(names.isEmpty()){statusText=t("No items available.","لا توجد عناصر متاحة.");status.text=statusText}else AlertDialog.Builder(this).setItems(names){_,index->task({client.request(apply,JSONObject().put("id",values.getJSONObject(index).getString("id")))}){statusText=t("Action completed.","اكتمل الإجراء.");status.text=statusText}}.show()}}
    private fun task(work:()->JSONObject,done:(JSONObject)->Unit) {
        if(busy)return;busy=true;buttons.forEach{it.isEnabled=false};status.text=t("Working…","جارٍ التنفيذ…")
        worker.execute{try{val value=work();runOnUiThread{if(!isDestroyed){busy=false;buttons.forEach{it.isEnabled=it.tag!=false};done(value)}}}catch(e:Exception){runOnUiThread{if(!isDestroyed){busy=false;buttons.forEach{it.isEnabled=it.tag!=false};val message=e.message ?: "";statusText=when{
            message.contains("permission",true)->t("Enable this permission on your PC.","فعّل هذه الصلاحية من الكمبيوتر.")
            message.contains("No PC",true)->t("No PC found. Use the same Wi-Fi and generate a code on your PC.","لم يُعثر على الكمبيوتر. تأكد من شبكة واي فاي وأنشئ الرمز من الكمبيوتر.")
            message.contains("six digits",true)->t("Enter the six-digit code.","أدخل الرمز المكوّن من ٦ أرقام.")
            message.contains("PIN",true)->t("Generate a new pairing code.","أنشئ رمز اقتران جديدًا.")
            message.contains("Pair this",true)||message.contains("revoked",true)->t("Connection revoked. Pair again.","أُلغي الاتصال. أعد الاقتران.")
            message.contains("identity",true)||message.contains("certificate",true)->t("PC identity changed. Pair again from your PC.","تغيّرت هوية الكمبيوتر. أعد الاقتران من الكمبيوتر.")
            message.contains("sequence",true)->t("Connection refreshed. Repeat the action.","تجدد الاتصال. كرر الإجراء.")
            message.contains("remote connection",true)->t("Use the numeric direct address shown on the PC.","استخدم عنوان الكمبيوتر المباشر الرقمي.")
            message.contains("Update the PC",true)->t("Update the PC app first.","حدّث تطبيق الكمبيوتر أولًا.")
            e is java.net.SocketTimeoutException->t("The PC did not respond. Check that it is awake and its address is reachable from your network.","لم يرد الكمبيوتر. تأكد أنه مستيقظ وأن عنوانه قابل للوصول من شبكتك.")
            else->t("Connection unavailable. Keep MOHIVX running and use the same Wi-Fi or a reachable direct numeric address.","الاتصال غير متاح. اترك MOHIVX يعمل واستخدم نفس واي فاي أو عنوانًا رقميًا مباشرًا يمكن الوصول إليه.")
        };if(!client.paired){state=null;telemetry=null;pairingCode="";render()}else status.text=statusText}}}}
    }
    override fun onStart(){super.onStart();if(android.os.Build.VERSION.SDK_INT>=33)registerReceiver(remoteCapture,android.content.IntentFilter(PhoneSyncService.CAPTURE),RECEIVER_NOT_EXPORTED)else registerReceiver(remoteCapture,android.content.IntentFilter(PhoneSyncService.CAPTURE));if(android.os.Build.VERSION.SDK_INT>=33)registerReceiver(captureReceiver,android.content.IntentFilter(PhoneCaptureService.CHANGED),RECEIVER_NOT_EXPORTED) else registerReceiver(captureReceiver,android.content.IntentFilter(PhoneCaptureService.CHANGED))}
    override fun onStop(){unregisterReceiver(remoteCapture);unregisterReceiver(captureReceiver);super.onStop()}
    override fun onResume(){super.onResume();PhoneSyncService.activityVisible=true;polling.removeCallbacks(poll);polling.postDelayed(poll,4000)}
    override fun onPause(){PhoneSyncService.activityVisible=false;polling.removeCallbacks(poll);super.onPause()}
    override fun onDestroy(){afterUnlock=null;authSignal?.cancel();polling.removeCallbacksAndMessages(null);worker.shutdownNow();super.onDestroy()}
}

