package com.mohivx.island.companion
import android.content.Context
import android.graphics.*
import android.view.View
class NavIcon(context:Context,private val kind:Int,private val tint:Int):View(context) {
    override fun onDraw(c:Canvas){super.onDraw(c);c.save();c.scale(width/24f,height/24f);val p=Paint(Paint.ANTI_ALIAS_FLAG).apply{color=tint;style=Paint.Style.STROKE;strokeWidth=1.6f;strokeCap=Paint.Cap.ROUND;strokeJoin=Paint.Join.ROUND}
        when(kind){
            0->{val path=Path().apply{moveTo(3f,11f);lineTo(12f,3f);lineTo(21f,11f);moveTo(5f,10f);lineTo(5f,21f);lineTo(10f,21f);lineTo(10f,15f);lineTo(14f,15f);lineTo(14f,21f);lineTo(19f,21f);lineTo(19f,10f)};c.drawPath(path,p)}
            1->{for((x,y) in listOf(5f to 8f,12f to 16f,19f to 10f)){c.drawLine(x,3f,x,y-3,p);c.drawLine(x,y+3,x,21f,p);c.drawCircle(x,y,3f,p)}}
            2->{c.drawRoundRect(3f,4f,21f,18f,5f,5f,p);val path=Path().apply{moveTo(7f,18f);lineTo(6f,22f);lineTo(12f,18f)};c.drawPath(path,p);c.drawLine(7f,9f,17f,9f,p);c.drawLine(7f,13f,13f,13f,p)}
            3->{c.drawRoundRect(4f,6f,20f,20f,4f,4f,p);c.drawLine(12f,2f,12f,6f,p);c.drawCircle(8f,12f,1f,p);c.drawCircle(16f,12f,1f,p);c.drawLine(9f,16f,15f,16f,p)}
            4->{c.drawRoundRect(6f,2f,18f,22f,3f,3f,p);c.drawLine(10f,18f,14f,18f,p)}
            5->{c.save();c.rotate(-35f,12f,12f);c.drawRoundRect(2f,8f,14f,16f,4f,4f,p);c.drawRoundRect(10f,8f,22f,16f,4f,4f,p);c.restore()}
        };c.restore()
    }
}
