import com.mohivx.island.companion.PinPairing;
import java.io.*;
public class PinPairingHarness {
    public static void main(String[] args) throws Exception {
        BufferedReader input=new BufferedReader(new InputStreamReader(System.in,"UTF-8"));
        PinPairing client=new PinPairing(input.readLine());
        System.out.println(client.A);System.out.flush();
        String salt=input.readLine(),b=input.readLine(),certificate=input.readLine();
        System.out.println(client.proof(salt,b,certificate));System.out.flush();
        System.out.println(client.verify(input.readLine()));System.out.flush();
        StringBuilder key=new StringBuilder();for(byte value:client.transportKey())key.append(String.format(java.util.Locale.ROOT,"%02x",value&255));System.out.println(key.toString());System.out.flush();
    }
}
