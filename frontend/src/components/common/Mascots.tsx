import React from 'react';

interface MascotProps {
  className?: string;
  size?: number; // width in pixels, default 56
  animate?: boolean;
  showBase?: boolean; // whether to show the glowing halo / pedestal underneath
}

/**
 * GoldenHexMascot - Completed Stage Companion (Figma Exact)
 * - Golden-yellow hexagon prism with soft warm aura
 * - Navy oval dot eyes & cheerful curved smile
 * - Luminous white glowing halo ring at base
 */
export const GoldenHexMascot: React.FC<MascotProps> = ({
  className = '',
  size = 56,
  animate = true,
  showBase = true,
}) => {
  return (
    <div
      className={`relative flex flex-col items-center justify-center shrink-0 ${className}`}
      style={{
        width: size,
        height: showBase ? size * 1.25 : size,
        animation: animate ? 'cosmic-float 3.5s ease-in-out infinite' : undefined,
      }}
    >
      <svg
        viewBox={showBase ? '0 0 100 120' : '0 0 100 100'}
        className="w-full h-full overflow-visible"
      >
        <defs>
          {/* Golden Yellow Hexagon Gradient */}
          <linearGradient id="figmaGoldGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFC837" />
            <stop offset="50%" stopColor="#FFBA1A" />
            <stop offset="100%" stopColor="#F59E0B" />
          </linearGradient>

          {/* Yellow Mascot Outer Glow */}
          <filter id="goldAuraGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* White Glow for Base Halo Ring */}
          <filter id="haloRingGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ─── Glowing Base Halo Ring (under mascot) ─── */}
        {showBase && (
          <g>
            {/* Soft Ambient Light Disk */}
            <ellipse
              cx="50"
              cy="96"
              rx="36"
              ry="10"
              fill="rgba(255, 255, 255, 0.18)"
              filter="url(#haloRingGlow)"
            />
            {/* Luminous Core Cloud */}
            <ellipse
              cx="50"
              cy="96"
              rx="28"
              ry="7.5"
              fill="rgba(255, 255, 255, 0.4)"
              filter="url(#haloRingGlow)"
            />
            {/* Crisp Glowing White Ring */}
            <ellipse
              cx="50"
              cy="96"
              rx="32"
              ry="8.5"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="2.8"
              filter="url(#haloRingGlow)"
            />
          </g>
        )}

        {/* ─── Golden Hexagon Body ─── */}
        <g filter="url(#goldAuraGlow)">
          {/* Main Regular Hexagon */}
          <polygon
            points="50,8 86,28 86,72 50,92 14,72 14,28"
            fill="url(#figmaGoldGrad)"
            stroke="#FFB814"
            strokeWidth="5"
            strokeLinejoin="round"
          />

          {/* Top Subtle Vertex Highlight */}
          <path
            d="M 19 29 L 50 11 L 81 29"
            fill="none"
            stroke="rgba(255, 255, 255, 0.5)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />

          {/* ─── Face: Dark Navy Oval Eyes & Curved Smile ─── */}
          {/* Left Eye */}
          <ellipse cx="38" cy="47" rx="3.2" ry="4.2" fill="#1B357F" />

          {/* Right Eye */}
          <ellipse cx="62" cy="47" rx="3.2" ry="4.2" fill="#1B357F" />

          {/* Cheerful Smile */}
          <path
            d="M 39 57 Q 50 67 61 57"
            stroke="#1B357F"
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
 * IndigoHexMascot - Next Up Stage Companion (Figma Exact)
 * - Slate-indigo/periwinkle hexagon
 * - Horizontal rounded capsule eyes & white smile
 * - Dual floating stepping-stone pedestals (blurred gradient + glowing rim)
 */
export const IndigoHexMascot: React.FC<MascotProps> = ({
  className = '',
  size = 56,
  animate = true,
  showBase = true,
}) => {
  return (
    <div
      className={`relative flex flex-col items-center justify-center shrink-0 ${className}`}
      style={{
        width: size,
        height: showBase ? size * 1.25 : size,
        animation: animate ? 'cosmic-float 3.5s ease-in-out infinite' : undefined,
        animationDelay: '700ms',
      }}
    >
      <svg
        viewBox={showBase ? '0 0 100 120' : '0 0 100 100'}
        className="w-full h-full overflow-visible"
      >
        <defs>
          {/* Indigo/Periwinkle Solid/Gradient */}
          <linearGradient id="figmaIndigoGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#5B6DC9" />
            <stop offset="50%" stopColor="#5061B4" />
            <stop offset="100%" stopColor="#4554A4" />
          </linearGradient>

          {/* Left Pedestal: Blue-to-Magenta Blurred Gradient */}
          <linearGradient id="leftPedestalGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#5D7CE2" />
            <stop offset="50%" stopColor="#7E47B0" />
            <stop offset="100%" stopColor="#98388B" />
          </linearGradient>

          {/* Right Pedestal: Dark Indigo to Deep Magenta */}
          <linearGradient id="rightPedestalGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#45186A" />
            <stop offset="60%" stopColor="#6C1E62" />
            <stop offset="100%" stopColor="#8C2068" />
          </linearGradient>

          {/* Pedestal Blur Filter */}
          <filter id="pedestalBlur" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.5" />
          </filter>

          {/* Neon Ring Glow Filter */}
          <filter id="neonRingGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ─── Dual Floating Stepping-Stone Pedestals (Symmetrically balanced around x=50) ─── */}
        {showBase && (
          <g>
            {/* Pedestal 1 (Left): Blurred Blue-Pink Gradient Oval (Ellipse 4) */}
            <ellipse
              cx="35"
              cy="94"
              rx="20"
              ry="8.5"
              fill="url(#leftPedestalGrad)"
              filter="url(#pedestalBlur)"
              opacity="0.95"
            />

            {/* Pedestal 2 (Right): Dark Magenta Oval with Glowing Ring (Ellipse 7) */}
            <g transform="translate(65, 94)">
              <ellipse
                cx="0"
                cy="0"
                rx="21"
                ry="8.5"
                fill="url(#rightPedestalGrad)"
              />
              {/* Glowing Outer Pink Halo */}
              <ellipse
                cx="0"
                cy="0"
                rx="21"
                ry="8.5"
                fill="none"
                stroke="#F472B6"
                strokeWidth="2"
                filter="url(#neonRingGlow)"
                opacity="0.8"
              />
              {/* Crisp Inner White Ring */}
              <ellipse
                cx="0"
                cy="0"
                rx="20.5"
                ry="8"
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="1.2"
                opacity="0.95"
              />
            </g>
          </g>
        )}

        {/* ─── Indigo Hexagon Body (Symmetrically centered at x=50) ─── */}
        <g>
          {/* Main Regular Hexagon */}
          <polygon
            points="50,8 86,28 86,72 50,92 14,72 14,28"
            fill="url(#figmaIndigoGrad)"
            stroke="rgba(255, 255, 255, 0.3)"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />

          {/* ─── Face: Horizontal Capsule Eyes & Friendly White Smile ─── */}
          {/* Left Eye: Horizontal White Capsule */}
          <rect
            x="32"
            y="43"
            width="12"
            height="5.5"
            rx="2.75"
            fill="#FFFFFF"
          />

          {/* Right Eye: Horizontal White Capsule */}
          <rect
            x="56"
            y="43"
            width="12"
            height="5.5"
            rx="2.75"
            fill="#FFFFFF"
          />

          {/* Sweet White Smile */}
          <path
            d="M 39 57 Q 50 67 61 57"
            stroke="#FFFFFF"
            strokeWidth="3.5"
            strokeLinecap="round"
            fill="none"
          />
        </g>
      </svg>
    </div>
  );
};


