// Adapted from Coucou Android. Copyright (c) 2026 Rhytam Biswas, MIT.
package com.mohivx.island.companion

import kotlin.math.pow

/**
 * Shared desktop-style and AMOLED palettes as plain 0xAARRGGBB numbers.
 */
data class CompanionPalette(
    val background: Long, val card: Long, val line: Long,
    val text: Long, val textDim: Long, val accent: Long, val onAccent: Long, val error: Long,
) {
    companion object {
        val PC = CompanionPalette(
            background = 0xFF10111D, card = 0xFF1E1E2B, line = 0x26FFFFFF,
            text = 0xFFF3F4F6, textDim = 0xFF8E9BB0, accent = 0xFF8AB4FF, onAccent = 0xFF10111D, error = 0xFFFF8A80,
        )
        val BLACK = CompanionPalette(
            background = 0xFF000000, card = 0xFF09090B, line = 0xFF202124,
            text = 0xFFF3F4F6, textDim = 0xFF969BA5, accent = 0xFF8AB4FF, onAccent = 0xFF000000, error = 0xFFFF8A80,
        )
        val DARK = PC

        private fun lin(c: Int): Double {
            val v = c / 255.0
            return if (v <= 0.03928) v / 12.92 else ((v + 0.055) / 1.055).pow(2.4)
        }

        private fun luminance(argb: Long): Double {
            val r = ((argb shr 16) and 0xFF).toInt()
            val g = ((argb shr 8) and 0xFF).toInt()
            val b = (argb and 0xFF).toInt()
            return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
        }

        /** WCAG contrast ratio, 1 (none) to 21 (black on white). */
        fun contrast(a: Long, b: Long): Double {
            val la = luminance(a)
            val lb = luminance(b)
            return (maxOf(la, lb) + 0.05) / (minOf(la, lb) + 0.05)
        }
    }
}

