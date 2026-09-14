import React from 'react';

interface DiamondLogoProps {
  className?: string;
  size?: number;
}

export const DiamondLogo: React.FC<DiamondLogoProps> = ({ className = 'w-full h-full', size = 48 }) => {
  return (
    <svg
      id="svg-diamond-std-logo"
      viewBox="0 0 200 180"
      width={size}
      height={size}
      className={`${className} drop-shadow-[0_2px_12px_rgba(236,72,153,0.35)]`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Cyan gradients for left & top facets */}
        <linearGradient id="cyanGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00F2FE" />
          <stop offset="100%" stopColor="#0072FF" />
        </linearGradient>
        
        <linearGradient id="cyanGrad2" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>

        {/* Purple / Magenta gradients */}
        <linearGradient id="magentaGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#c084fc" />
          <stop offset="100%" stopColor="#d946ef" />
        </linearGradient>

        <linearGradient id="magentaGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#e879f9" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>

        {/* Electric Blue to Purple */}
        <linearGradient id="bluePurple" x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="50%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#ec4899" />
        </linearGradient>

        {/* Facet shading gradients */}
        <linearGradient id="shadeDark" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#4338ca" />
        </linearGradient>

        <linearGradient id="shadeLight" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="100%" stopColor="#818cf8" />
        </linearGradient>

        <linearGradient id="facetD" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ec4899" />
          <stop offset="50%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>

        <filter id="logoGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#ec4899" floodOpacity="0.4" />
        </filter>
      </defs>

      {/* White Sticker Contour / Outer Die-Cut Silhouette */}
      <polygon
        points="52,42 148,42 186,80 100,166 14,80"
        fill="#FFFFFF"
        stroke="#E2E8F0"
        strokeWidth="6"
        strokeLinejoin="round"
      />

      {/* Outer Diamond Contour Base */}
      <polygon
        points="55,45 145,45 180,80 100,160 20,80"
        fill="#0f172a"
        stroke="#FFFFFF"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />

      {/* === TOP FACETS (Diamond Crown) === */}
      {/* Top Left Triangle */}
      <polygon
        points="55,47 78,60 100,47"
        fill="url(#cyanGrad1)"
        stroke="#ffffff"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {/* Top Right Triangle */}
      <polygon
        points="100,47 122,60 145,47"
        fill="url(#magentaGrad2)"
        stroke="#ffffff"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {/* Top Center Diamond Facet */}
      <polygon
        points="100,47 78,60 100,60 122,60"
        fill="url(#bluePurple)"
        stroke="#ffffff"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />

      {/* === LETTER 'S' (Left 3D Facets) === */}
      {/* Upper S Diagonal Arc */}
      <polygon
        points="52,50 24,78 40,88 56,66 70,66 72,58 52,50"
        fill="url(#cyanGrad1)"
        stroke="#ffffff"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Upper S Inner Facet (3D effect) */}
      <polygon
        points="40,88 56,66 68,76 48,96"
        fill="url(#shadeDark)"
        stroke="#ffffff"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {/* Lower S Body & Corner */}
      <polygon
        points="24,80 48,96 78,118 78,128 42,94"
        fill="url(#magentaGrad1)"
        stroke="#ffffff"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* S Middle Cross Beam */}
      <polygon
        points="48,94 76,104 88,96 58,84"
        fill="url(#cyanGrad2)"
        stroke="#ffffff"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {/* S Lower Hook Tail */}
      <polygon
        points="42,96 78,128 88,118 64,96"
        fill="url(#magentaGrad2)"
        stroke="#ffffff"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />

      {/* === LETTER 'T' (Central Pillar Facet) === */}
      {/* T Horizontal Bar */}
      <polygon
        points="70,64 130,64 135,76 100,76 65,76"
        fill="url(#cyanGrad1)"
        stroke="#ffffff"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* T Top Bevel Facets */}
      <polygon
        points="70,64 100,64 100,70 80,72"
        fill="#38bdf8"
        stroke="#ffffff"
        strokeWidth="1"
      />
      <polygon
        points="100,64 130,64 120,72 100,70"
        fill="#d946ef"
        stroke="#ffffff"
        strokeWidth="1"
      />

      {/* T Vertical Center Spike (Pillar to bottom point) */}
      <polygon
        points="92,76 108,76 106,140 100,158 94,140"
        fill="url(#cyanGrad1)"
        stroke="#ffffff"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* T Pillar Left 3D Shade */}
      <polygon
        points="92,76 100,76 100,158 94,140"
        fill="url(#cyanGrad2)"
        stroke="#ffffff"
        strokeWidth="1"
      />
      {/* T Pillar Right 3D Highlight */}
      <polygon
        points="100,76 108,76 106,140 100,158"
        fill="#0284c7"
        stroke="#ffffff"
        strokeWidth="1"
      />

      {/* === LETTER 'D' (Right 3D Facets) === */}
      {/* D Outer Curved Spine */}
      <polygon
        points="145,50 178,78 140,126 122,112 152,82 130,62"
        fill="url(#facetD)"
        stroke="#ffffff"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* D Inner Facet & 3D Shading */}
      <polygon
        points="130,62 152,82 136,98 122,86"
        fill="url(#magentaGrad2)"
        stroke="#ffffff"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {/* D Inner Upright Column */}
      <polygon
        points="112,80 126,80 126,122 112,130"
        fill="url(#cyanGrad1)"
        stroke="#ffffff"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* D Inner Facet Shade */}
      <polygon
        points="126,80 126,122 118,126 118,84"
        fill="url(#shadeDark)"
        stroke="#ffffff"
        strokeWidth="1"
      />

      {/* === BOTTOM POINT SHARDS (Lower Diamond Wing Tips) === */}
      {/* Left Bottom Shard */}
      <polygon
        points="65,135 88,150 94,144 76,126"
        fill="url(#magentaGrad1)"
        stroke="#ffffff"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {/* Right Bottom Shard */}
      <polygon
        points="135,135 112,150 106,144 124,126"
        fill="url(#magentaGrad2)"
        stroke="#ffffff"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {/* Diamond Tip Accent */}
      <polygon
        points="94,146 100,158 106,146"
        fill="#00F2FE"
        stroke="#ffffff"
        strokeWidth="1"
      />
    </svg>
  );
};
