package com.mohivx.island.companion

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.net.URL
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.security.KeyStore
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.cert.X509Certificate
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

class CompanionClient(context:Context,private val testEndpoint:PcEndpoint?=null) {
 companion object {
  private val transportLock=Any()
  private val mediaLocks=mapOf("camera" to Any(),"screen" to Any(),"mic" to Any(),"audio" to Any())
 }
 @Volatile private var mediaLanes=false
 private var cachedPin=""
 private var cachedFactory:javax.net.ssl.SSLSocketFactory?=null
 fun enableMediaLanes(enabled:Boolean){mediaLanes=enabled}
 private fun reloadConnection(){host=prefs.getString("host","") ?: "";port=prefs.getInt("port",9120);fingerprint=prefs.getString("fingerprint","") ?: "";remoteEndpoint=prefs.getString("directEndpoint","") ?: "";remote=prefs.getBoolean("directManual",false)}
 private val prefs=context.getSharedPreferences("companion",Context.MODE_PRIVATE)
 var host:String=prefs.getString("host","") ?: ""
 var port:Int=prefs.getInt("port",9120)
 var fingerprint:String=prefs.getString("fingerprint","") ?: ""
 var remoteEndpoint:String=prefs.getString("directEndpoint","") ?: ""
  private set
 var remote:Boolean=prefs.getBoolean("directManual",false)
  private set
 val paired:Boolean get()=(host.isNotEmpty()||remoteEndpoint.isNotEmpty())&&credential().optString("token").isNotEmpty()&&(!remote||credential().optString("key").isNotEmpty())
 init {if(prefs.contains("remote")||prefs.contains("remoteMode")){prefs.edit().remove("remote").remove("remoteMode").apply()};try{if(remote)DirectAddress.parse(remoteEndpoint)}catch(_:Exception){remote=false;remoteEndpoint="";prefs.edit().remove("directEndpoint").putBoolean("directManual",false).apply()}}
 fun setDirectEndpoint(value:String)=synchronized(transportLock){val peer=DirectAddress.parse(value);remoteEndpoint=peer.url;remote=true;prefs.edit().putString("directEndpoint",remoteEndpoint).putBoolean("directManual",true).apply()}
 fun useLocal()=synchronized(transportLock){remote=false;host=prefs.getString("lanHost",if(PcDiscovery.local(host))host else "")?:"";port=prefs.getInt("lanPort",9120);prefs.edit().putBoolean("directManual",false).putString("host",host).putInt("port",port).apply()}
 private fun key():SecretKey {val store=KeyStore.getInstance("AndroidKeyStore").apply{load(null)};(store.getKey("mohivx-companion",null) as? SecretKey)?.let{return it};return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").apply{init(KeyGenParameterSpec.Builder("mohivx-companion",KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())}.generateKey()}
 private fun credential():JSONObject=try {val packed=prefs.getString("credential","") ?: "";if(packed.isEmpty())JSONObject() else {val data=Base64.decode(packed,Base64.NO_WRAP);val cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,data.copyOfRange(0,12)));val value=String(cipher.doFinal(data.copyOfRange(12,data.size)),Charsets.UTF_8);if(value.startsWith("{"))JSONObject(value) else JSONObject().put("token",value)}}catch(_:Exception){JSONObject()}
 private fun save(value:JSONObject) {val cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());val packed=cipher.iv+cipher.doFinal(value.toString().toByteArray(Charsets.UTF_8));prefs.edit().putString("credential",Base64.encodeToString(packed,Base64.NO_WRAP)).putString("host",host).putInt("port",port).putString("fingerprint",fingerprint).putBoolean("directManual",remote).apply()}
 fun forget()=synchronized(transportLock){prefs.edit().remove("credential").remove("host").remove("fingerprint").remove("counter").remove("remote").remove("remoteMode").remove("directEndpoint").remove("directManual").remove("lanHost").remove("lanPort").apply();host="";fingerprint="";remoteEndpoint="";remote=false}
 fun pair(code:String,name:String):JSONObject = synchronized(transportLock) {
  val pin=code.trim().map{val n=Character.digit(it,10);if(n in 0..9)('0'.code+n).toChar() else it}.joinToString("");require(pin.matches(Regex("[0-9]{6}"))){"Enter six digits."}
  val endpoints=if(remote){val peer=DirectAddress.parse(remoteEndpoint);listOf(PcEndpoint(peer.host,peer.port))}else testEndpoint?.let{listOf(it)} ?: PcDiscovery.find()
  if(endpoints.isEmpty())throw IllegalStateException("No PC found. Use the same Wi-Fi and generate a PIN on the PC.")
  val oldHost=host;val oldPort=port;val oldFingerprint=fingerprint;var last:Exception=IllegalStateException("Incorrect or expired PIN.")
  for(endpoint in endpoints.take(8))try {
   if(!remote)require(PcDiscovery.local(endpoint.host)&&endpoint.port in 1024..65535);host=endpoint.host;port=endpoint.port;fingerprint=""
   val exchange=PinPairing(pin);val start=network("/api/pair/start",JSONObject().put("A",exchange.A).put("secure",true),false,true)
   if(remote&&start.optInt("protocol")<3)throw IllegalStateException("Update the PC app first.")
   val proof=exchange.proof(start.getString("salt"),start.getString("B"),fingerprint)
   val result=network("/api/pair/finish",JSONObject().put("session",start.getString("session")).put("proof",proof).put("name",name),false)
   require(exchange.verify(result.optString("proof"))){"PC identity changed. Pair again."}
   val transport=exchange.transportKey().joinToString(""){"%02x".format(it.toInt() and 255)}
   val details=if(result.has("sealed"))SecureEnvelope.open(transport,"pair:"+start.getString("session"),result.getJSONObject("sealed")) else result
   val saved=JSONObject().put("token",details.getString("token"));if(result.has("sealed"))saved.put("key",transport).put("id",details.getString("id"));save(saved);val state=prefs.edit().putLong("counter",0);if(!remote)state.putString("lanHost",host).putInt("lanPort",port);state.apply();return details
  }catch(e:Exception){last=e;host=oldHost;port=oldPort;fingerprint=oldFingerprint}
  throw last
 }
 private fun matches(cert:X509Certificate):Boolean=MessageDigest.isEqual(MessageDigest.getInstance("SHA-256").digest(cert.encoded),fingerprint.chunked(2).map{it.toInt(16).toByte()}.toByteArray())
 fun request(route:String,body:JSONObject?=null,authenticated:Boolean=true,bootstrap:Boolean=false):JSONObject {
  val kind=if(route=="/api/phone-stop")body?.optString("kind") else route.removePrefix("/api/phone-")
  val lane=if(mediaLanes && body!=null && mediaLocks.containsKey(kind))kind!! else ""
  return synchronized(mediaLocks[lane] ?: transportLock){requestLocked(route,body,authenticated,bootstrap,lane)}
 }
 private fun requestLocked(route:String,body:JSONObject?,authenticated:Boolean,bootstrap:Boolean,lane:String):JSONObject {
  reloadConnection()
  require(route.matches(Regex("/api/[a-z-]+")))
  val credentials=credential();val secret=credentials.optString("key");val safe=body==null
  if(!remote&&host.isEmpty()&&fingerprint.isNotEmpty()){val found=PcDiscovery.find(fingerprint).firstOrNull()?:throw IllegalStateException("No PC found on the local network.");host=found.host;port=found.port;prefs.edit().putString("host",host).putInt("port",port).putString("lanHost",host).putInt("lanPort",port).apply()}
  if(authenticated&&secret.isNotEmpty()){
   repeat(2){attempt->
    val counterKey=if(lane.isEmpty())"counter" else "counter-$lane"
    val counter=prefs.getLong(counterKey,0)+1;require(counter in 1..9007199254736000L);prefs.edit().putLong(counterKey,counter).apply()
    val id=credentials.getString("id");val plain=JSONObject().put("route",route).put("method",if(body==null)"GET" else "POST").put("token",credentials.getString("token"));if(body!=null)plain.put("body",body)
    val scope=if(lane.isEmpty())"$id:$counter" else "$id:$lane:$counter"
    val packet=SecureEnvelope.seal(secret,"request:$scope",plain).put("device",id).put("counter",counter);if(lane.isNotEmpty())packet.put("lane",lane)
    val response=try{network("/api/secure",packet,false,retrySafe=safe,responseTimeout=if(lane.isNotEmpty())2500 else if(route=="/api/ask")65000 else 15000)}catch(e:Exception){throw e}
    val value=SecureEnvelope.open(secret,"response:$scope",response)
    if(value.optString("code")=="COUNTER"){prefs.edit().putLong(counterKey,maxOf(counter,value.optLong("minimumCounter"))).apply();if((safe||lane.isNotEmpty())&&attempt==0)return@repeat;throw IllegalStateException("Request sequence refreshed. Repeat the action.")}
    if(value.optInt("httpStatus")==401){forget();throw IllegalStateException("Connection revoked. Pair again.")}
    if(!value.optBoolean("success"))throw IllegalStateException(value.optString("error","PC request failed."))
    return value
   }
   throw IllegalStateException("Encrypted request failed.")
  }
  val value=network(route,body,authenticated,bootstrap,retrySafe=safe,responseTimeout=if(lane.isNotEmpty())2500 else 15000);return value
 }
 private fun network(route:String,body:JSONObject?,authenticated:Boolean,bootstrap:Boolean=false,retrySafe:Boolean=false,retried:Boolean=false,responseTimeout:Int=15000):JSONObject {
  require(!bootstrap||route=="/api/pair/start"&&!authenticated)
  val peer=if(remote)DirectAddress.parse(remoteEndpoint)else DirectAddress.parse(DirectAddress.url(host,port,""));val url=URL(peer.url+route)
  val connection=url.openConnection() as HttpsURLConnection
  run {
   val pin=fingerprint
   fun check(cert:X509Certificate)=MessageDigest.isEqual(MessageDigest.getInstance("SHA-256").digest(cert.encoded),pin.chunked(2).map{it.toInt(16).toByte()}.toByteArray())
   if(bootstrap || cachedFactory==null || cachedPin!=pin){
    val trust=object:X509TrustManager{override fun getAcceptedIssuers():Array<X509Certificate> = emptyArray();override fun checkClientTrusted(chain:Array<X509Certificate>,authType:String){throw java.security.cert.CertificateException("Unsupported client certificate")};override fun checkServerTrusted(chain:Array<X509Certificate>,authType:String){require(chain.isNotEmpty());chain[0].checkValidity();if(!bootstrap&&!check(chain[0]))throw java.security.cert.CertificateException("PC identity changed. Pair again.")}}
    val ssl=SSLContext.getInstance("TLS").apply{init(null,arrayOf<TrustManager>(trust),SecureRandom())};connection.sslSocketFactory=ssl.socketFactory
    if(!bootstrap){cachedFactory=ssl.socketFactory;cachedPin=pin}
   }else connection.sslSocketFactory=cachedFactory
   connection.hostnameVerifier=javax.net.ssl.HostnameVerifier{_,session->try{bootstrap||check(session.peerCertificates[0] as X509Certificate)}catch(_:Exception){false}}
  }
  connection.connectTimeout=if(responseTimeout==2500)2500 else if(remote)12000 else if(route.startsWith("/api/pair/"))3000 else 5000;connection.readTimeout=if(route=="/api/ask")65000 else responseTimeout;connection.instanceFollowRedirects=false;connection.setRequestProperty("Content-Type","application/json")
  if(authenticated)connection.setRequestProperty("Authorization","Bearer "+credential().optString("token"))
  try{
   if(body!=null){connection.requestMethod="POST";connection.doOutput=true;connection.outputStream.use{it.write(body.toString().toByteArray(Charsets.UTF_8))}}
   val status=connection.responseCode;val stream=if(status in 200..299)connection.inputStream else connection.errorStream
   val response=stream?.use{input->val out=java.io.ByteArrayOutputStream();val block=ByteArray(8192);while(true){val count=input.read(block);if(count<0)break;require(out.size()+count<=4000000){"Response too large"};out.write(block,0,count)};out.toString("UTF-8")} ?: "{}";val result=JSONObject(response)
   if(bootstrap&&status in 200..299){val observed=MessageDigest.getInstance("SHA-256").digest(connection.serverCertificates[0].encoded).joinToString(""){"%02x".format(it.toInt() and 255)};require(observed.matches(Regex("[a-f0-9]{64}"))&&result.optString("fingerprint")==observed){"PC identity changed. Pair again."};fingerprint=observed}
   if(status==401&&(authenticated||route=="/api/secure")){forget();throw IllegalStateException("Connection revoked. Pair again.")}
   if(status !in 200..299||!result.optBoolean("success"))throw IllegalStateException(result.optString("error","Connection failed ($status)"))
   return result
  }catch(error:Exception){
   if(!retried&&retrySafe&&!bootstrap&&(error is ConnectException||error is SocketTimeoutException||error is UnknownHostException)){
    if(fingerprint.isNotEmpty())for(endpoint in PcDiscovery.find(fingerprint)){val oldHost=host;val oldPort=port;val oldMode=remote;try{remote=false;host=endpoint.host;port=endpoint.port;val result=network(route,body,authenticated,false,false,true,responseTimeout);prefs.edit().putString("host",host).putInt("port",port).putBoolean("directManual",false).putString("lanHost",host).putInt("lanPort",port).apply();return result}catch(_:Exception){host=oldHost;port=oldPort;remote=oldMode}}
   }
   throw error
  }finally{connection.disconnect()}
 }
}

