package com.mohivx.island.companion

import android.content.Context
import android.graphics.*
import android.view.View

class SpiritView(context:Context):View(context) {
    private val paint=Paint(Paint.ANTI_ALIAS_FLAG)
    override fun onDraw(canvas:Canvas) {
        super.onDraw(canvas);val unit=width.coerceAtMost(height)/100f
        canvas.save();canvas.translate(width/2f-50f*unit,height/2f-50f*unit);canvas.scale(unit,unit)
        paint.shader=RadialGradient(50f,66f,43f,intArrayOf(Color.argb(65,106,197,255),Color.TRANSPARENT),null,Shader.TileMode.CLAMP)
        canvas.drawCircle(50f,62f,43f,paint)
        val flame=Path().apply {moveTo(55f,8f);cubicTo(51f,29f,27f,39f,29f,62f);cubicTo(29f,81f,40f,88f,53f,88f);cubicTo(72f,88f,80f,74f,73f,58f);cubicTo(67f,43f,54f,34f,55f,8f);close()}
        paint.shader=LinearGradient(45f,18f,60f,88f,intArrayOf(Color.rgb(235,250,255),Color.rgb(149,212,248),Color.rgb(67,133,179)),null,Shader.TileMode.CLAMP)
        canvas.drawPath(flame,paint);paint.shader=null;paint.color=Color.rgb(25,56,76)
        canvas.drawOval(42f,64f,47f,72f,paint);canvas.drawOval(59f,64f,64f,72f,paint)
        paint.color=Color.argb(120,221,245,255);canvas.drawOval(44f,79f,62f,82f,paint);canvas.restore()
    }
}
