package com.mohivx.island.companion

import org.json.JSONObject
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.NetworkInterface
import java.security.SecureRandom

data class PcEndpoint(val host:String,val port:Int)
object PcDiscovery {
    fun local(address:String):Boolean {
        val p=address.split('.').mapNotNull{it.toIntOrNull()}
        return p.size==4&&p.all{it in 0..255}&&(p[0]==127||p[0]==10||(p[0]==192&&p[1]==168)||(p[0]==172&&p[1] in 16..31)||(p[0]==169&&p[1]==254))
    }
    fun find(fingerprint:String=""):List<PcEndpoint> {
        val nonce=ByteArray(16).also{SecureRandom().nextBytes(it)}.joinToString(""){"%02x".format(it)}
        val request=("MOHIVX_DISCOVER_V1 $nonce"+if(fingerprint.matches(Regex("[a-f0-9]{64}")))" $fingerprint" else "").toByteArray(Charsets.US_ASCII)
        val targets=mutableSetOf("255.255.255.255")
        try{NetworkInterface.getNetworkInterfaces().toList().filter{it.isUp&&!it.isLoopback}.flatMap{it.interfaceAddresses}.mapNotNull{it.broadcast?.hostAddress}.forEach{targets.add(it)}}catch(_:Exception){}
        val found=linkedSetOf<PcEndpoint>()
        DatagramSocket().use{socket->
            socket.broadcast=true;socket.soTimeout=350
            repeat(2){
                for(target in targets)try{socket.send(DatagramPacket(request,request.size,InetAddress.getByName(target),9121))}catch(_:Exception){}
                val until=System.currentTimeMillis()+1500
                while(System.currentTimeMillis()<until&&found.size<8)try{
                    val bytes=ByteArray(2048);val packet=DatagramPacket(bytes,bytes.size);socket.receive(packet)
                    val host=packet.address.hostAddress ?: continue
                    val reply=JSONObject(String(packet.data,0,packet.length,Charsets.UTF_8));val port=reply.optInt("port")
                    if(local(host)&&reply.optString("service")=="mohivx"&&reply.optInt("protocol")==2&&reply.optString("nonce")==nonce&&port in 1024..65535)found.add(PcEndpoint(host,port))
                }catch(_:Exception){}
            }
        }
        return found.toList()
    }
}
