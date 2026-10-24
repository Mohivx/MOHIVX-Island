package com.mohivx.island.companion

import android.app.Activity
import android.app.Dialog
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.*
import org.json.JSONObject

/** One review surface: options and a written reply stay visible together. */
class AgentQuestionSheet(private val activity:Activity,private val request:JSONObject,private val ar:Boolean,private val accent:Int,private val answer:(JSONObject)->Unit,private val deny:()->Unit) {
    private val dialog=Dialog(activity)
    private val handler=Handler(Looper.getMainLooper())
    private val questions=request.getJSONArray("questions")
    private val drafts=Array(questions.length()){ "" }
    private val choices=Array(questions.length()){linkedSetOf<String>()}
    private val ink=Color.rgb(239,241,247)
    private val muted=Color.rgb(151,159,179)
    private lateinit var send:TextView
    private lateinit var clock:TextView
    private var expired=false
    private val timer=object:Runnable {override fun run(){
        val seconds=((request.optLong("expires")-System.currentTimeMillis()+999)/1000).coerceAtLeast(0)
        expired=seconds==0L;clock.text=if(expired)t("Request expired","انتهت مهلة الطلب")else t("${seconds}s remaining","متبقي $seconds ثانية")
        update();if(!expired&&dialog.isShowing)handler.postDelayed(this,1000)
    }}
    private fun t(en:String,a:String)=if(ar)a else en
    private fun dp(n:Int)=(n*activity.resources.displayMetrics.density).toInt()
    private fun shape(color:Int,radius:Int=18)=GradientDrawable().apply{setColor(color);cornerRadius=dp(radius).toFloat()}
    private fun label(parent:LinearLayout,value:String,size:Float=14f,color:Int=ink)=TextView(activity).apply{text=value;textSize=size;setTextColor(color);setPadding(0,dp(5),0,dp(5));parent.addView(this,LinearLayout.LayoutParams(-1,-2))}
    private fun result(index:Int)=drafts[index].trim().ifBlank{choices[index].joinToString(", ")}
    private fun update(){if(::send.isInitialized){send.isEnabled=!expired&&drafts.indices.all{result(it).isNotBlank()};send.alpha=if(send.isEnabled)1f else .4f}}
    fun show(){
        dialog.window?.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
        val root=LinearLayout(activity).apply{orientation=LinearLayout.VERTICAL;layoutDirection=if(ar)View.LAYOUT_DIRECTION_RTL else View.LAYOUT_DIRECTION_LTR;background=shape(Color.rgb(20,23,33),28);setPadding(dp(22),dp(16),dp(22),dp(18))}
        label(root,"MOHIVX Island · "+request.optString("agent","Codex"),12f,accent)
        label(root,t("Your answer","إجابتك"),24f)
        clock=label(root,"",12f,muted)
        val scroll=ScrollView(activity).apply{isFillViewport=false}
        root.addView(scroll,LinearLayout.LayoutParams(-1,0,1f))
        val content=LinearLayout(activity).apply{orientation=LinearLayout.VERTICAL};scroll.addView(content)
        for(i in 0 until questions.length()){
            val q=questions.getJSONObject(i)
            val card=LinearLayout(activity).apply{orientation=LinearLayout.VERTICAL;background=shape(Color.rgb(29,33,46));setPadding(dp(16),dp(12),dp(16),dp(16))}
            content.addView(card,LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=dp(14)})
            if(questions.length()>1)label(card,"${i+1} / ${questions.length()}",11f,muted)
            label(card,q.getString("question"),17f)
            val options=q.optJSONArray("options")
            val radios=RadioGroup(activity).apply{orientation=LinearLayout.VERTICAL};card.addView(radios)
            for(j in 0 until (options?.length()?:0)){
                val option=options!!.getJSONObject(j);val value=option.getString("label")
                val view=if(q.optBoolean("multiSelect"))CheckBox(activity)else RadioButton(activity)
                view.id=View.generateViewId();view.text=value;view.textSize=14f;view.setTextColor(ink);view.buttonTintList=ColorStateList.valueOf(accent);view.minHeight=dp(48)
                if(view is CheckBox){card.addView(view,LinearLayout.LayoutParams(-1,-2));view.setOnCheckedChangeListener{_,checked->if(checked)choices[i].add(value)else choices[i].remove(value);update()}}
                else {radios.addView(view,LinearLayout.LayoutParams(-1,-2));view.setOnCheckedChangeListener{_,checked->if(checked){choices[i].clear();choices[i].add(value);update()}}}
                option.optString("description").takeIf{it.isNotBlank()}?.let{label(card,it,12f,muted)}
            }
            label(card,t("Or write your own answer","أو اكتب ردك المخصص"),12f,muted)
            val edit=EditText(activity).apply{hint=t("Write your reply…","اكتب ردك…");setHintTextColor(muted);setTextColor(ink);textSize=15f;minLines=2;maxLines=5;gravity=Gravity.TOP or Gravity.START;inputType=android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE;filters=arrayOf(android.text.InputFilter.LengthFilter(2000));background=shape(Color.rgb(12,15,24),12);setPadding(dp(12),dp(12),dp(12),dp(12))}
            card.addView(edit,LinearLayout.LayoutParams(-1,-2))
            edit.addTextChangedListener(object:TextWatcher{override fun beforeTextChanged(s:CharSequence?,start:Int,count:Int,after:Int){};override fun onTextChanged(s:CharSequence?,start:Int,before:Int,count:Int){drafts[i]=s.toString();update()};override fun afterTextChanged(s:Editable?){} })
        }
        label(root,t("A written reply replaces the selected options for that question.","الرد المكتوب يُرسل بدل الخيارات المحددة للسؤال نفسه."),11f,muted)
        send=label(root,t("Send answer","إرسال الإجابة"),16f,Color.rgb(12,22,38)).apply{gravity=Gravity.CENTER;background=shape(accent,24);setPadding(dp(12),dp(14),dp(12),dp(14));isClickable=true;isFocusable=true;setOnClickListener{timer.run();if(isEnabled){val answers=JSONObject();for(i in drafts.indices)answers.put(questions.getJSONObject(i).getString("question"),result(i));dialog.dismiss();answer(answers)}}}
        val actions=LinearLayout(activity).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER};root.addView(actions)
        label(actions,t("Cancel","إلغاء"),14f,muted).apply{layoutParams=LinearLayout.LayoutParams(0,dp(48),1f);gravity=Gravity.CENTER;setOnClickListener{dialog.dismiss()}}
        label(actions,t("Deny request","رفض الطلب"),14f,Color.rgb(243,151,158)).apply{layoutParams=LinearLayout.LayoutParams(0,dp(48),1f);gravity=Gravity.CENTER;setOnClickListener{if(!expired){dialog.dismiss();deny()}}}
        dialog.setContentView(root)
        dialog.setOnDismissListener{handler.removeCallbacks(timer)}
        dialog.show()
        dialog.window?.apply{setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT));setGravity(Gravity.BOTTOM);setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);attributes=attributes.apply{dimAmount=.65f};setLayout((activity.resources.displayMetrics.widthPixels*.96f).toInt(),(activity.resources.displayMetrics.heightPixels*.84f).toInt())}
        timer.run();send.requestFocus()
    }
}
