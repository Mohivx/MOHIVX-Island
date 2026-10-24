import com.mohivx.island.companion.FramePixels;
import java.nio.ByteBuffer;
import java.util.Arrays;
public class FramePixelsHarness {
 static void eq(byte[] actual,int... expected){byte[] bytes=new byte[expected.length];for(int i=0;i<bytes.length;i++)bytes[i]=(byte)expected[i];if(!Arrays.equals(actual,bytes))throw new AssertionError(Arrays.toString(actual));}
 public static void main(String[] args){
  byte[] source={1,2,3,4,5,6,7,8,11,9,12,10};
  eq(FramePixels.orient(source,4,2,90,false),5,1,6,2,7,3,8,4,11,9,12,10);
  eq(FramePixels.orient(source,4,2,90,true),1,5,2,6,3,7,4,8,11,9,12,10);
  eq(FramePixels.orient(source,4,2,180,false),8,7,6,5,4,3,2,1,12,10,11,9);
  eq(FramePixels.orient(source,4,2,0,true),4,3,2,1,8,7,6,5,12,10,11,9);
  byte[] rotated=source;int w=4,h=2;for(int i=0;i<4;i++){rotated=FramePixels.orient(rotated,w,h,90,false);int old=w;w=h;h=old;}if(!Arrays.equals(source,rotated))throw new AssertionError("Four rotations must restore Y and VU");
  ByteBuffer y=ByteBuffer.wrap(new byte[]{0,0,1,2,3,4,0,0,5,6,7,8});y.position(2);
  ByteBuffer u=ByteBuffer.wrap(new byte[]{0,9,0,10}),v=ByteBuffer.wrap(new byte[]{0,11,0,12});u.position(1);v.position(1);
  eq(FramePixels.nv21(4,2,y,6,1,u,4,2,v,4,2),1,2,3,4,5,6,7,8,11,9,12,10);
  boolean rejected=false;try{FramePixels.orient(source,4,2,45,false);}catch(IllegalArgumentException e){rejected=true;}if(!rejected)throw new AssertionError("Invalid rotation accepted");
  System.out.println("Padded YUV planes, single-pass NV21 orientation and mirrored front camera accepted");
 }
}
