package com.mohivx.island.companion
import android.util.Base64
import org.json.JSONObject
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
object SecureEnvelope {
 fun decodeKey(hex:String):ByteArray {require(hex.matches(Regex("[a-f0-9]{64}")));return hex.chunked(2).map{it.toInt(16).toByte()}.toByteArray()}
 fun seal(key:String,aad:String,value:JSONObject):JSONObject {val iv=ByteArray(12).also{SecureRandom().nextBytes(it)};val cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,SecretKeySpec(decodeKey(key),"AES"),GCMParameterSpec(128,iv));cipher.updateAAD(aad.toByteArray(Charsets.UTF_8));return JSONObject().put("nonce",Base64.encodeToString(iv,Base64.NO_WRAP)).put("data",Base64.encodeToString(cipher.doFinal(value.toString().toByteArray(Charsets.UTF_8)),Base64.NO_WRAP))}
 fun open(key:String,aad:String,value:JSONObject):JSONObject {val iv=Base64.decode(value.getString("nonce"),Base64.NO_WRAP);require(iv.size==12);val cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,SecretKeySpec(decodeKey(key),"AES"),GCMParameterSpec(128,iv));cipher.updateAAD(aad.toByteArray(Charsets.UTF_8));return JSONObject(String(cipher.doFinal(Base64.decode(value.getString("data"),Base64.NO_WRAP)),Charsets.UTF_8))}
}

