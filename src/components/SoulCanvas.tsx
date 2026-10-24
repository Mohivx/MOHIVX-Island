import React, { useEffect, useRef } from 'react';
import type { SoulMode, SoulSkin } from '../types';

interface SoulCanvasProps {
  mode: SoulMode;
  skin: SoulSkin;
  scale?: number;
  interactive?: boolean;
  className?: string;
}

export const SoulCanvas: React.FC<SoulCanvasProps> = ({
  mode,
  skin,
  scale = 1,
  interactive = true,
  className = ''
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mousePosRef = useRef<{ x: number; y: number; movedAt: number }>({ x: 0, y: 0, movedAt: 0 });
  const modeRef = useRef<SoulMode>(mode);
  const skinRef = useRef<SoulSkin>(skin);

  modeRef.current = mode;
  skinRef.current = skin;

  useEffect(() => {
    if (!interactive) return;

    const handlePointerMove = (e: PointerEvent) => {
      mousePosRef.current = {
        x: e.clientX,
        y: e.clientY,
        movedAt: performance.now() / 1000
      };
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
    };
  }, [interactive]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const startTime = performance.now();

    // Helper: hex to rgb array
    const hexToRgb = (hex: string): [number, number, number] => {
      const clean = hex.replace('#', '');
      return [
        parseInt(clean.slice(0, 2), 16),
        parseInt(clean.slice(2, 4), 16),
        parseInt(clean.slice(4, 6), 16)
      ];
    };

    const render = () => {
      animId = requestAnimationFrame(render);
      const now = performance.now();
      const t = (now - startTime) / 1000;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.clientWidth || 120;
      const height = canvas.clientHeight || 90;

      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2 + 6;
      const s = 24 * scale;

      const currentMode = modeRef.current;
      const currentSkin = skinRef.current;

      const coreRgb = hexToRgb(currentSkin.core);
      const midRgb = hexToRgb(currentSkin.mid);
      const glowRgb = hexToRgb(currentSkin.glow);

      // Eye tracking calculation
      const rect = canvas.getBoundingClientRect();
      const canvasScreenX = rect.left + rect.width / 2;
      const canvasScreenY = rect.top + rect.height / 2;
      const diffX = mousePosRef.current.x - canvasScreenX;
      const diffY = mousePosRef.current.y - canvasScreenY;

      const maxDist = 450;
      const targetLookX = Math.max(-1, Math.min(1, diffX / maxDist)) * 0.7;
      const targetLookY = Math.max(-1, Math.min(1, diffY / maxDist)) * 0.5;

      // Mode Dynamics
      const isMuted = currentMode === 'MUTED';
      const isListening = currentMode === 'LISTENING';
      const isThinking = currentMode === 'THINKING';
      const isTalking = currentMode === 'TALKING';

      // Squashing and stretching
      const squash = isTalking
        ? Math.sin(t * 12) * 0.12
        : isThinking
        ? Math.sin(t * 6) * 0.06
        : Math.sin(t * 2.2) * 0.03;

      const tilt = isListening
        ? 0.08 * Math.sin(t * 2.5) + targetLookX * 0.15
        : isThinking
        ? 0.12 * Math.sin(t * 4)
        : targetLookX * 0.1;

      // Draw bottom glow reflection
      ctx.save();
      ctx.translate(cx, cy + s * 1.05);
      ctx.scale(1.3 * (1 + squash), 0.35);
      const shadowGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 1.5);
      shadowGrad.addColorStop(0, `rgba(${glowRgb.join(',')}, 0.35)`);
      shadowGrad.addColorStop(1, `rgba(${glowRgb.join(',')}, 0)`);
      ctx.fillStyle = shadowGrad;
      ctx.beginPath();
      ctx.arc(0, 0, s * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Transform for flame body
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(tilt);
      ctx.scale(1 + squash, 1 - squash);

      // Construct Flame Body Path with Superellipse Math & Harmonics
      const flamePath = new Path2D();
      const n = 2.7; // superellipse exponent
      const steps = 60;
      const rx = s * 1.05;
      const ry = s * 0.9;

      // Bottom curved base
      for (let i = 0; i <= steps; i++) {
        const theta = -Math.PI * 0.1 + (Math.PI * 1.2 * i) / steps;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        const px = rx * Math.sign(cosT) * Math.pow(Math.abs(cosT), 2 / n);
        const py = ry * Math.sign(sinT) * Math.pow(Math.abs(sinT), 2 / n);
        if (i === 0) flamePath.moveTo(px, py);
        else flamePath.lineTo(px, py);
      }

      // Top tapering tail with harmonic waves
      const waveOffset = Math.sin(t * 4.2) * 4;
      const tailX = (Math.sin(t * 2.8) * 0.25 + (isThinking ? Math.sin(t * 8) * 0.4 : 0)) * s;
      const tailY = -s * 1.7 + waveOffset * 0.4;
      // Continue from the left shoulder to the tip, then the right shoulder.
      // Crossing those controls cut a dark diagonal gap through the face.
      flamePath.quadraticCurveTo(-s * 0.8, -s * 0.8, tailX, tailY);
      flamePath.quadraticCurveTo(s * 0.25, -s * 0.55,
        rx * Math.pow(Math.cos(Math.PI * 0.1), 2 / n),
        -ry * Math.pow(Math.sin(Math.PI * 0.1), 2 / n));
      flamePath.closePath();

      // Multi-layer Radial Fill for the Soul
      const bodyGrad = ctx.createRadialGradient(0, -s * 0.2, 0, 0, -s * 0.2, s * 1.8);
      bodyGrad.addColorStop(0, `rgba(${coreRgb.join(',')}, 0.95)`);
      bodyGrad.addColorStop(0.4, `rgba(${midRgb.join(',')}, 0.88)`);
      bodyGrad.addColorStop(0.85, `rgba(${glowRgb.join(',')}, 0.65)`);
      bodyGrad.addColorStop(1, `rgba(${glowRgb.join(',')}, 0.1)`);

      ctx.fillStyle = bodyGrad;
      ctx.fill(flamePath);

      // Outer aura stroke
      ctx.strokeStyle = `rgba(${glowRgb.join(',')}, 0.4)`;
      ctx.lineWidth = 1.5;
      ctx.stroke(flamePath);

      // Floating wisp hands
      const handDist = s * 1.35;
      const handYOffset = Math.sin(t * 3.2) * 3;
      const leftHandPos = { x: -handDist, y: handYOffset };
      const rightHandPos = { x: handDist, y: -handYOffset };

      [leftHandPos, rightHandPos].forEach((pos) => {
        const handGrad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, s * 0.25);
        handGrad.addColorStop(0, `rgba(${coreRgb.join(',')}, 0.9)`);
        handGrad.addColorStop(0.5, `rgba(${midRgb.join(',')}, 0.7)`);
        handGrad.addColorStop(1, `rgba(${glowRgb.join(',')}, 0)`);

        ctx.fillStyle = handGrad;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, s * 0.22, 0, Math.PI * 2);
        ctx.fill();
      });

      // Eyes and Face Rendering
      const eyeSpacing = s * 0.42;
      const eyeY = -s * 0.05;
      const eyeW = s * 0.13;
      const eyeH = isMuted ? 1.5 : s * 0.17;

      ctx.fillStyle = currentSkin.id === 'void' ? '#ffffff' : '#0e111a';

      if (isMuted) {
        // Sleeping closed eyes: happy curved arcs
        ctx.strokeStyle = currentSkin.id === 'void' ? '#ffffff' : '#141824';
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';

        ctx.beginPath();
        ctx.arc(-eyeSpacing, eyeY + 2, eyeW * 1.2, 0.2, Math.PI - 0.2, true);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(eyeSpacing, eyeY + 2, eyeW * 1.2, 0.2, Math.PI - 0.2, true);
        ctx.stroke();

        // Draw floating Z's for sleep
        const zTime = (t * 0.8) % 1;
        const zx = s * 0.8 + zTime * 18;
        const zy = -s * 0.9 - zTime * 24;
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.fillStyle = `rgba(${midRgb.join(',')}, ${1 - zTime})`;
        ctx.fillText('Z', zx, zy);
      } else {
        // Active eyes with pupil tracking
        const pupilX = targetLookX * (eyeW * 0.55);
        const pupilY = targetLookY * (eyeH * 0.55);

        // Left eye
        ctx.beginPath();
        ctx.ellipse(-eyeSpacing, eyeY, eyeW, eyeH, 0, 0, Math.PI * 2);
        ctx.fill();

        // Right eye
        ctx.beginPath();
        ctx.ellipse(eyeSpacing, eyeY, eyeW, eyeH, 0, 0, Math.PI * 2);
        ctx.fill();

        // Pupil highlights (cute glint reflection)
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(-eyeSpacing + pupilX + 1.2, eyeY + pupilY - 1.5, 1.6, 0, Math.PI * 2);
        ctx.arc(eyeSpacing + pupilX + 1.2, eyeY + pupilY - 1.5, 1.6, 0, Math.PI * 2);
        ctx.fill();

        // Mouth (if talking or happy)
        if (isTalking) {
          ctx.strokeStyle = currentSkin.id === 'void' ? '#ffffff' : '#0e111a';
          ctx.lineWidth = 2;
          ctx.beginPath();
          const mouthOpen = Math.abs(Math.sin(t * 14)) * 3.5 + 1;
          ctx.ellipse(0, eyeY + s * 0.35, 3.5, mouthOpen, 0, 0, Math.PI * 2);
          ctx.fill();
        } else if (isListening) {
          ctx.strokeStyle = currentSkin.id === 'void' ? '#ffffff' : '#0e111a';
          ctx.lineWidth = 1.8;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.arc(0, eyeY + s * 0.25, 3.5, 0.2, Math.PI - 0.2);
          ctx.stroke();
        }
      }

      ctx.restore();
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [scale, interactive]);

  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      <canvas
        ref={canvasRef}
        style={{ width: `${120 * scale}px`, height: `${90 * scale}px` }}
        className="pointer-events-none drop-shadow-md"
      />
    </div>
  );
};
