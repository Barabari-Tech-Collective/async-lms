import React from 'react';

interface MascotProps {
  className?: string;
  size?: number; // width in pixels, default 56
  animate?: boolean;
}

/**
 * GoldenHexMascot - Completed Stage Companion
 * Pixel-perfect recreation from Figma:
 * - 3D Golden-Yellow Hexagon Prism
 * - Cute Navy Dot Eyes & Cheerful Smile
 * - Floating Ethereal White Glowing Halo Ring at base
 */
export const GoldenHexMascot: React.FC<MascotProps> = ({
  className = '',
  size = 56,
  animate = true,
}) => {
  return (
    <div
      className={`relative flex flex-col items-center justify-center shrink-0 ${className}`}
      style={{
        width: size,
        height: size * 1.15,
        animation: animate ? 'cosmic-float 3.2s ease-in-out infinite' : undefined,
      }}
    >
      <svg
        viewBox="0 0 100 115"
        className="w-full h-full overflow-visible drop-shadow-md"
      >
        <defs>
          {/* Golden Yellow 3D Gradient */}
          <linearGradient id="goldMascotGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFD84D" />
            <stop offset="45%" stopColor="#FFBA1A" />
            <stop offset="100%" stopColor="#F59E0B" />
          </linearGradient>

          {/* Subtle Top-Vertex Light Sheen */}
          <linearGradient id="goldSheenGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
            <stop offset="60%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>

          {/* White Glow Filter for the Base Halo Ring */}
          <filter id="haloGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ─── Glowing Base Halo / Portal Ring ─── */}
        <g transform="translate(0, 15)">
          {/* Diffuse Outer Glow */}
          <ellipse
            cx="50"
            cy="84"
            rx="36"
            ry="11"
            fill="rgba(255, 255, 255, 0.28)"
            filter="url(#haloGlow)"
          />
          {/* Inner Light Cloud */}
          <ellipse
            cx="50"
            cy="84"
            rx="30"
            ry="8"
            fill="rgba(255, 255, 255, 0.45)"
            filter="url(#haloGlow)"
          />
          {/* Sharp Bright Halo Ring */}
          <ellipse
            cx="50"
            cy="84"
            rx="32"
            ry="9"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="3.2"
            filter="url(#haloGlow)"
          />
        </g>

        {/* ─── Golden Hexagon Body ─── */}
        <g>
          {/* Main Hexagon with smoothly rounded vertices */}
          <polygon
            points="50,6 88,27 88,71 50,92 12,71 12,27"
            fill="url(#goldMascotGrad)"
            stroke="url(#goldMascotGrad)"
            strokeWidth="6"
            strokeLinejoin="round"
          />

          {/* Top-Edge Highlight Rim */}
          <path
            d="M 17 28 L 50 9 L 83 28"
            fill="none"
            stroke="rgba(255, 255, 255, 0.45)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />

          {/* ─── Cute Face Features (Figma exact) ─── */}
          {/* Left Eye */}
          <circle cx="36" cy="46" r="3.4" fill="#0F172A" />

          {/* Right Eye */}
          <circle cx="64" cy="46" r="3.4" fill="#0F172A" />

          {/* Cheerful Smile */}
          <path
            d="M 37 57 Q 50 68 63 57"
            stroke="#0F172A"
            strokeWidth="3.4"
            strokeLinecap="round"
            fill="none"
          />
        </g>
      </svg>
    </div>
  );
};

/**
 * IndigoHexMascot - Next Up Stage Companion
 * Pixel-perfect recreation from Figma:
 * - Electric Indigo/Periwinkle Hexagon
 * - Horizontal Capsule Eyes ("- -") & Sweet White Smile
 * - Dual Glowing Stepping-Stone Pedestals (Blue-Pink disc + Magenta Neon-Rim disc)
 */
export const IndigoHexMascot: React.FC<MascotProps> = ({
  className = '',
  size = 56,
  animate = true,
}) => {
  return (
    <div
      className={`relative flex flex-col items-center justify-center shrink-0 ${className}`}
      style={{
        width: size,
        height: size * 1.15,
        animation: animate ? 'cosmic-float 3.2s ease-in-out infinite' : undefined,
        animationDelay: '600ms',
      }}
    >
      <svg
        viewBox="0 0 120 120"
        className="w-full h-full overflow-visible drop-shadow-md"
      >
        <defs>
          {/* Indigo/Periwinkle Hexagon Gradient */}
          <linearGradient id="indigoMascotGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#707EEA" />
            <stop offset="50%" stopColor="#5E6DE2" />
            <stop offset="100%" stopColor="#4E5CD4" />
          </linearGradient>

          {/* Left Pedestal: Blue-Pink Gradient */}
          <linearGradient id="pedestalBluePink" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#60A5FA" />
            <stop offset="50%" stopColor="#A855F7" />
            <stop offset="100%" stopColor="#EC4899" />
          </linearGradient>

          {/* Right Pedestal: Dark Magenta to Purple */}
          <linearGradient id="pedestalMagenta" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#831843" />
            <stop offset="60%" stopColor="#581C87" />
            <stop offset="100%" stopColor="#3B0764" />
          </linearGradient>

          {/* Neon Rim Glow Filter */}
          <filter id="neonPinkGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ─── Dual Floating Stepping-Stone Pedestals (Figma exact) ─── */}
        <g transform="translate(10, 16)">
          {/* Platform 1: Glowing Blue-to-Pink Stepping Stone (Bottom-Left) */}
          <ellipse
            cx="32"
            cy="78"
            rx="20"
            ry="7.5"
            fill="url(#pedestalBluePink)"
            className="opacity-90"
            style={{ filter: 'drop-shadow(0 0 8px rgba(168, 85, 247, 0.45))' }}
          />

          {/* Platform 2: Tilted Deep-Magenta Stepping Stone with Glowing Neon Rim (Bottom-Right) */}
          <g transform="translate(56, 70) rotate(-4)">
            <ellipse
              cx="0"
              cy="0"
              rx="23"
              ry="8.5"
              fill="url(#pedestalMagenta)"
            />
            {/* Outer Glowing Neon-Pink/White Rim */}
            <ellipse
              cx="0"
              cy="0"
              rx="23"
              ry="8.5"
              fill="none"
              stroke="#F472B6"
              strokeWidth="2.2"
              filter="url(#neonPinkGlow)"
            />
            <ellipse
              cx="0"
              cy="0"
              rx="22.5"
              ry="8"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="1.2"
              className="opacity-90"
            />
          </g>
        </g>

        {/* ─── Indigo Hexagon Body ─── */}
        <g transform="translate(10, 0)">
          {/* Main Hexagon with smoothly rounded vertices and crisp outline */}
          <polygon
            points="50,6 88,27 88,71 50,92 12,71 12,27"
            fill="url(#indigoMascotGrad)"
            stroke="rgba(255, 255, 255, 0.45)"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />

          {/* ─── Face Features (Figma exact) ─── */}
          {/* Left Eye: Horizontal White Pill/Capsule */}
          <rect
            x="30"
            y="43"
            width="12"
            height="5.5"
            rx="2.75"
            fill="#FFFFFF"
          />

          {/* Right Eye: Horizontal White Pill/Capsule */}
          <rect
            x="58"
            y="43"
            width="12"
            height="5.5"
            rx="2.75"
            fill="#FFFFFF"
          />

          {/* Sweet White Smile */}
          <path
            d="M 39 57 Q 50 66 61 57"
            stroke="#FFFFFF"
            strokeWidth="3.2"
            strokeLinecap="round"
            fill="none"
          />
        </g>
      </svg>
    </div>
  );
};
