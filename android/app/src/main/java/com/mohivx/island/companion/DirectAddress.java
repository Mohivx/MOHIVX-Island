package com.mohivx.island.companion;

import java.net.InetAddress;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Numeric endpoints only: validation never performs a DNS lookup. */
public final class DirectAddress {
    private static final Pattern ADDRESS=Pattern.compile("^https://(\\[[0-9a-fA-F:.]+\\]|[0-9.]+)(?::([0-9]{1,5}))?/?$");
    public static final class Peer {
        private final String host; private final int port;
        Peer(String host,int port){this.host=host;this.port=port;}
        public String getHost(){return host;}
        public int getPort(){return port;}
        public String getUrl(){return "https://"+(host.indexOf(':')>=0?"["+host+"]":host)+":"+port;}
    }
    public static Peer parse(String value){
        if(value==null||value.length()>300)throw new IllegalArgumentException("Use a numeric direct device address.");
        Matcher match=ADDRESS.matcher(value);
        if(!match.matches())throw new IllegalArgumentException("External services and host names are disabled. Use an IP address.");
        String host=match.group(1).replace("[","").replace("]","");int port=match.group(2)==null?9120:Integer.parseInt(match.group(2));
        boolean valid=false;
        if(host.indexOf(':')>=0){try{InetAddress.getByName(host);valid=true;}catch(Exception ignored){}}
        else {String[] parts=host.split("\\.",-1);valid=parts.length==4;for(String part:parts){if(!part.matches("0|[1-9][0-9]{0,2}")||Integer.parseInt(part)>255){valid=false;break;}}}
        if(valid){try{InetAddress numeric=InetAddress.getByName(host);if(numeric.isAnyLocalAddress()||numeric.isMulticastAddress())valid=false;}catch(Exception ignored){valid=false;}}
        if(!valid||port<1||port>65535||host.equals("255.255.255.255")||host.indexOf(':')<0&&Integer.parseInt(host.split("\\.")[0])>=224)throw new IllegalArgumentException("Invalid direct device address.");
        return new Peer(host,port);
    }
    public static String url(String host,int port,String route){return new Peer(host,port).getUrl()+route;}
    private DirectAddress(){}
}
