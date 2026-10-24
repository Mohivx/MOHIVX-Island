import com.mohivx.island.companion.DirectAddress;
public final class DirectAddressHarness {
 public static void main(String[] args){for(String value:args){try{DirectAddress.Peer peer=DirectAddress.parse(value);System.out.println(peer.getPort()+" "+peer.getHost());}catch(Exception error){System.out.println("REJECT");}}}
}
