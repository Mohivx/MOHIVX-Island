import React, { useState, useEffect, useRef } from 'react';

export type SpiritState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'success'
  | 'error'
  | 'sleeping';

export type SpiritStyle = 'mohivx' | 'silver' | 'minimal' | 'spectral';

interface MohivxSpiritProps {
  state?: SpiritState;
  styleVariant?: SpiritStyle;
  size?: number;
  className?: string;
  onClick?: () => void;
  showGlow?: boolean;
  interactive?: boolean;
}

export const MohivxSpirit: React.FC<MohivxSpiritProps> = ({
  state = 'idle',
  styleVariant: _styleVariant = 'mohivx',
  size = 72,
  className = '',
  onClick,
  showGlow = true,
  interactive = true,
}) => {
  const [internalState, setInternalState] = useState<SpiritState>(state);
  const [isBlinking, setIsBlinking] = useState(false);
  const [lookOffset, setLookOffset] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInternalState(state);
  }, [state]);

  // Periodic natural blink
  useEffect(() => {
    if (internalState === 'sleeping') return;
    const interval = setInterval(() => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 160);
    }, 3800 + Math.random() * 2600);
    return () => clearInterval(interval);
  }, [internalState]);

  // Mouse tracking gaze in idle/listening mode
  useEffect(() => {
    if (!interactive || internalState === 'sleeping') return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = (e.clientX - centerX) / (window.innerWidth / 2);
      const dy = (e.clientY - centerY) / (window.innerHeight / 2);
      const clampedX = Math.max(-1, Math.min(1, dx)) * 4;
      const clampedY = Math.max(-1, Math.min(1, dy)) * 3;
      setLookOffset({ x: clampedX, y: clampedY });
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [interactive, internalState]);

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (interactive) {
      // Cycle through moods on click
      setInternalState((prev) => {
        if (prev === 'idle') return 'listening';
        if (prev === 'listening') return 'thinking';
        if (prev === 'thinking') return 'speaking';
        if (prev === 'speaking') return 'success';
        return 'idle';
      });
    }
  };

  const id = `mohivx-spirit-${size}-${Math.random().toString(36).substring(2, 7)}`;

  // Eye color and glow based on state
  const eyeGlowColor =
    internalState === 'error'
      ? 'rgba(239, 68, 68, 0.9)'
      : internalState === 'success'
      ? 'rgba(234, 179, 8, 0.95)'
      : internalState === 'thinking'
      ? 'rgba(168, 85, 247, 0.9)'
      : internalState === 'listening'
      ? 'rgba(56, 189, 248, 0.95)'
      : 'rgba(255, 255, 255, 0.95)';

  const auraColor =
    internalState === 'error'
      ? 'bg-rose-500/20'
      : internalState === 'success'
      ? 'bg-amber-400/20'
      : internalState === 'thinking'
      ? 'bg-purple-500/20'
      : internalState === 'listening'
      ? 'bg-sky-400/25'
      : 'bg-white/10';

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      className={`relative inline-flex items-center justify-center select-none cursor-pointer transition-transform duration-300 hover:scale-105 active:scale-95 ${className}`}
      style={{ width: size, height: size * 1.05 }}
      title="MOHIVX Spirit"
    >
      {/* 1. Ambient Glow Aura */}
      {showGlow && (
        <div
          className={`absolute inset-0 rounded-full blur-xl pointer-events-none transition-all duration-700 ${auraColor} ${
            internalState === 'listening' || internalState === 'thinking'
              ? 'scale-125 opacity-100'
              : 'scale-100 opacity-60'
          }`}
        />
      )}

      {/* 2. Soft Contact Shadow underneath */}
      <div className="absolute -bottom-1 w-[45%] h-2 rounded-full bg-black/60 blur-[3px] pointer-events-none" />

      {/* 3. The MOHIVX Spirit Silhouette (Matching references/mascot/mohivx-spirit.jpg) */}
      <svg
        viewBox="0 0 120 126"
        className="w-full h-full overflow-visible transition-transform duration-300"
        style={{
          filter: `drop-shadow(0 6px 16px rgba(0,0,0,0.85))`,
          transform: internalState === 'speaking' ? 'scale(1.02)' : 'none'
        }}
      >
        <defs>
          {/* Obsidian Body Gradient */}
          <radialGradient id={`${id}-body-grad`} cx="45%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#25262B" />
            <stop offset="45%" stopColor="#141518" />
            <stop offset="85%" stopColor="#0B0B0D" />
            <stop offset="100%" stopColor="#050506" />
          </radialGradient>

          {/* Silver Crescent Highlight Gradient */}
          <linearGradient id={`${id}-crescent`} x1="0%" y1="0%" x2="100%" y2="80%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="35%" stopColor="#D4D4D8" />
            <stop offset="70%" stopColor="#71717A" />
            <stop offset="100%" stopColor="#27272A" />
          </linearGradient>

          {/* Inner Face Cavity Shadow */}
          <radialGradient id={`${id}-face-cavity`} cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="#050506" />
            <stop offset="75%" stopColor="#0A0B0E" />
            <stop offset="100%" stopColor="#121318" />
          </radialGradient>

          {/* Eye Glow Filter */}
          <filter id={`${id}-eye-glow`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* --- MAIN SPIRIT BODY: Curved Droplet & Hood Silhouette --- */}
        <g className="transition-transform duration-500 ease-out">
          {/* Back hood rim & shadow */}
          <path
            d="M 68 8 
               C 80 20, 84 38, 76 56 
               C 74 61, 80 72, 77 82 
               C 72 98, 62 110, 58 116 
               C 56 112, 50 102, 44 94 
               C 36 82, 34 66, 38 48 
               C 42 32, 52 18, 68 8 Z"
            fill="url(#mohivx-back-rim)"
            opacity="0.5"
          />

          {/* Outer Hood Body */}
          <path
            d="M 72 10 
               C 82 24, 82 46, 74 60 
               C 79 66, 81 74, 78 84 
               C 74 98, 63 112, 58 118 
               C 54 112, 45 100, 40 88 
               C 33 74, 34 56, 40 40 
               C 47 24, 58 14, 72 10 Z"
            fill={`url(#${id}-body-grad)`}
            stroke="#2A2B30"
            strokeWidth="0.8"
          />

          {/* Elegant Brushed Silver Crescent Accent Curve */}
          <path
            d="M 72 10 
               C 60 22, 46 36, 42 50 
               C 40 56, 42 62, 48 66 
               C 56 68, 68 64, 74 60 
               C 66 61, 56 62, 50 56 
               C 46 48, 52 32, 72 10 Z"
            fill={`url(#${id}-crescent)`}
            opacity={internalState === 'listening' || internalState === 'thinking' ? 1 : 0.92}
            className="transition-opacity duration-300"
          />

          {/* Hood Inner Bezel Shadow */}
          <path
            d="M 45 54 
               C 43 62, 46 72, 52 78 
               C 58 84, 68 82, 74 76 
               C 78 70, 77 62, 74 60 
               C 66 63, 54 62, 45 54 Z"
            fill="#08080A"
          />

          {/* Recessed Dark Face Mask */}
          <ellipse
            cx="60"
            cy="70"
            rx="16"
            ry="14"
            fill={`url(#${id}-face-cavity)`}
          />

          {/* --- EXPRESSIVE EYES SYSTEM --- */}
          <g
            transform={`translate(${lookOffset.x}, ${lookOffset.y})`}
            className="transition-transform duration-150 ease-out"
          >
            {isBlinking || internalState === 'sleeping' ? (
              /* Blinking or Sleeping: Sleek Horizontal Slits */
              <g stroke={eyeGlowColor} strokeWidth="1.8" strokeLinecap="round" filter={`url(#${id}-eye-glow)`}>
                <line x1="51" y1="69" x2="57" y2="70" />
                <line x1="63" y1="70" x2="69" y2="69" />
              </g>
            ) : internalState === 'success' ? (
              /* Joyful / Success: Upward Cheerful Crescent Eyes (^ ^) */
              <g fill="none" stroke={eyeGlowColor} strokeWidth="2.2" strokeLinecap="round" filter={`url(#${id}-eye-glow)`}>
                <path d="M 50 71 Q 54 66 58 71" />
                <path d="M 62 71 Q 66 66 70 71" />
              </g>
            ) : internalState === 'thinking' ? (
              /* Thinking: Pulsing Concentrated Almond Eyes */
              <g fill={eyeGlowColor} filter={`url(#${id}-eye-glow)`}>
                <path
                  d="M 50 69 C 52 66, 56 67, 57 70 C 56 72, 52 72, 50 69 Z"
                  className="animate-pulse"
                />
                <path
                  d="M 63 70 C 64 67, 68 66, 70 69 C 68 72, 64 72, 63 70 Z"
                  className="animate-pulse"
                />
              </g>
            ) : internalState === 'listening' ? (
              /* Listening: Wide Attentive Leaf/Almond Glowing Eyes */
              <g fill={eyeGlowColor} filter={`url(#${id}-eye-glow)`}>
                {/* Left Eye */}
                <path d="M 49 69 C 51 64, 57 65, 59 70 C 57 73, 51 73, 49 69 Z" />
                {/* Right Eye */}
                <path d="M 61 70 C 63 65, 69 64, 71 69 C 69 73, 63 73, 61 70 Z" />
                {/* Pupil shine */}
                <circle cx="53" cy="68" r="0.8" fill="#FFFFFF" />
                <circle cx="65" cy="68" r="0.8" fill="#FFFFFF" />
              </g>
            ) : (
              /* Default / Idle: Sharp, Minimal, Angled Glowing Eyes */
              <g fill={eyeGlowColor} filter={`url(#${id}-eye-glow)`}>
                {/* Left Eye: Angled upward outward */}
                <path d="M 50 69 C 52 65, 56 66, 58 70 C 56 72, 52 71, 50 69 Z" />
                {/* Right Eye: Angled upward outward */}
                <path d="M 62 70 C 64 66, 68 65, 70 69 C 68 71, 64 72, 62 70 Z" />
              </g>
            )}
          </g>

          {/* Subtle Crescent Specular Gleam */}
          <path
            d="M 68 14 C 58 24, 48 36, 45 46"
            stroke="#FFFFFF"
            strokeWidth="0.8"
            strokeLinecap="round"
            opacity="0.7"
          />
        </g>
      </svg>
    </div>
  );
};

export default MohivxSpirit;
