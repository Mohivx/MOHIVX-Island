package com.mohivx.island.companion;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;

/** SRP-6a, RFC 5054 group 3072 / SHA-256, with certificate-bound mutual proofs. */
public final class PinPairing {
    private static final BigInteger N = new BigInteger("ffffffffffffffffc90fdaa22168c234c4c6628b80dc1cd129024e088a67cc74020bbea63b139b22514a08798e3404ddef9519b3cd3a431b302b0a6df25f14374fe1356d6d51c245e485b576625e7ec6f44c42e9a637ed6b0bff5cb6f406b7edee386bfb5a899fa5ae9f24117c4b1fe649286651ece45b3dc2007cb8a163bf0598da48361c55d39a69163fa8fd24cf5f83655d23dca3ad961c62f356208552bb9ed529077096966d670c354e4abc9804f1746c08ca18217c32905e462e36ce3be39e772c180e86039b2783a2ec07a28fb5c55df06f4c52c9de2bcbf6955817183995497cea956ae515d2261898fa051015728e5a8aaac42dad33170d04507a33a85521abdf1cba64ecfb850458dbef0a8aea71575d060c7db3970f85a6e1e4c7abf5ae8cdb0933d71e8c94e04a25619dcee3d2261ad2ee6bf12ffa06d98a0864d87602733ec86a64521f2b18177b200cbbe117577a615d6c770988c0bad946e208e24fa074e5ab3143db5bfce0fd108e4b82d120a93ad2caffffffffffffffff",16);
    private static final BigInteger G = BigInteger.valueOf(5);
    private static final BigInteger K = number(hash(pad(N),pad(G)));
    private final BigInteger a = new BigInteger(256,new SecureRandom());
    private final BigInteger publicA = G.modPow(a,N);
    private final String pin;
    private byte[] expected;
    private byte[] transport;
    public final String A = publicA.toString(16);
    public PinPairing(String pin) { if(!pin.matches("[0-9]{6}"))throw new IllegalArgumentException("Enter six digits."); this.pin=pin; }
    private static byte[] utf(String text){return text.getBytes(StandardCharsets.UTF_8);}
    private static byte[] hash(byte[]... values){try{MessageDigest h=MessageDigest.getInstance("SHA-256");for(byte[] v:values)h.update(v);return h.digest();}catch(Exception e){throw new IllegalStateException(e);}}
    private static BigInteger number(byte[] data){return new BigInteger(1,data);}
    private static byte[] pad(BigInteger n){byte[] source=n.toByteArray(),out=new byte[384];int length=Math.min(source.length,384);System.arraycopy(source,source.length-length,out,384-length,length);return out;}
    private static byte[] unhex(String s){if(s==null||!s.matches("[a-fA-F0-9]+")||s.length()%2!=0)throw new IllegalArgumentException("Invalid pairing value.");byte[] out=new byte[s.length()/2];for(int i=0;i<out.length;i++)out[i]=(byte)Integer.parseInt(s.substring(i*2,i*2+2),16);return out;}
    private static String hex(byte[] data){StringBuilder out=new StringBuilder();for(byte b:data)out.append(String.format(java.util.Locale.ROOT,"%02x",b&255));return out.toString();}
    public String proof(String saltHex,String bHex,String fingerprint){
        if(saltHex.length()!=64||fingerprint.length()!=64||!bHex.matches("[a-fA-F0-9]{1,768}"))throw new IllegalArgumentException("Invalid pairing value.");
        BigInteger B=new BigInteger(bHex,16);if(B.signum()<=0||B.compareTo(N)>=0)throw new IllegalArgumentException("Invalid pairing value.");
        byte[] salt=unhex(saltHex),context=unhex(fingerprint);
        BigInteger x=number(hash(salt,hash(utf("MOHIVX:"+pin)))),u=number(hash(pad(publicA),pad(B)));
        if(u.signum()==0)throw new IllegalArgumentException("Invalid pairing value.");
        BigInteger base=B.subtract(K.multiply(G.modPow(x,N))).mod(N);
        if(base.signum()==0)throw new IllegalArgumentException("Invalid pairing value.");
        byte[] session=hash(pad(base.modPow(a.add(u.multiply(x)),N)));
        byte[] hn=hash(pad(N)),hg=hash(pad(G));for(int i=0;i<hn.length;i++)hn[i]^=hg[i];
        byte[] client=hash(hn,hash(utf("MOHIVX")),salt,pad(publicA),pad(B),session,context);
        expected=hash(pad(publicA),client,session,context);transport=hash(utf("MOHIVX secure transport v1"),session,context);Arrays.fill(session,(byte)0);return hex(client);
    }
    public boolean verify(String proof){try{return expected!=null&&proof!=null&&proof.length()==64&&MessageDigest.isEqual(expected,unhex(proof));}catch(Exception e){return false;}}
    public byte[] transportKey(){if(transport==null)throw new IllegalStateException("Pairing not started.");return transport.clone();}
}
