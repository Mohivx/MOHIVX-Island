package com.mohivx.island.companion;

import java.nio.ByteBuffer;

/** Plane copies and orientation without decoding and encoding JPEG twice. */
public final class FramePixels {
    public static byte[] nv21(int width, int height, ByteBuffer y, int yRow, int yPixel,
                              ByteBuffer u, int uRow, int uPixel, ByteBuffer v, int vRow, int vPixel) {
        if (width <= 0 || height <= 0 || (width & 1) != 0 || (height & 1) != 0 || width * (long)height > 4000000)
            throw new IllegalArgumentException("Unsupported frame dimensions");
        byte[] out = new byte[width * height * 3 / 2];
        ByteBuffer plane = y.duplicate(); int origin = plane.position();
        for (int row = 0; row < height; row++) {
            if (yPixel == 1) { plane.position(origin + row * yRow); plane.get(out, row * width, width); }
            else for (int x = 0; x < width; x++) out[row * width + x] = y.get(origin + row * yRow + x * yPixel);
        }
        int up = u.position(), vp = v.position(), offset = width * height;
        for (int row = 0; row < height / 2; row++) for (int x = 0; x < width / 2; x++) {
            out[offset++] = v.get(vp + row * vRow + x * vPixel);
            out[offset++] = u.get(up + row * uRow + x * uPixel);
        }
        return out;
    }
    public static byte[] orient(byte[] input, int width, int height, int angle, boolean mirror) {
        if (angle != 0 && angle != 90 && angle != 180 && angle != 270) throw new IllegalArgumentException("Invalid rotation");
        if (width <= 0 || height <= 0 || (width & 1) != 0 || (height & 1) != 0 || input.length != width * (long)height * 3 / 2)
            throw new IllegalArgumentException("Invalid NV21 frame");
        if (angle == 0 && !mirror) return input;
        byte[] out = new byte[input.length];
        copyOriented(input, out, width, height, angle, mirror, 0, 1);
        copyOriented(input, out, width / 2, height / 2, angle, mirror, width * height, 2);
        return out;
    }
    private static void copyOriented(byte[] input, byte[] out, int width, int height, int angle, boolean mirror, int offset, int unit) {
        int dw = angle == 90 || angle == 270 ? height : width;
        int dh = angle == 90 || angle == 270 ? width : height;
        for (int row = 0; row < dh; row++) for (int x = 0; x < dw; x++) {
            int col = mirror ? dw - 1 - x : x, sx, sy;
            switch (angle) {
                case 90: sx = row; sy = height - 1 - col; break;
                case 180: sx = width - 1 - col; sy = height - 1 - row; break;
                case 270: sx = width - 1 - row; sy = col; break;
                default: sx = col; sy = row;
            }
            int src = offset + (sy * width + sx) * unit, dst = offset + (row * dw + x) * unit;
            out[dst] = input[src]; if (unit == 2) out[dst + 1] = input[src + 1];
        }
    }
    private FramePixels() {}
}
