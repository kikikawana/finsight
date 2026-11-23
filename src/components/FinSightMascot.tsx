import { useId } from 'react';

interface FinSightMascotProps {
  mood?: 'idle' | 'thinking' | 'happy';
  className?: string;
}

export function FinSightMascot({
  mood = 'idle',
  className = 'w-9 h-9',
}: FinSightMascotProps) {
  const uid = useId().replace(/:/g, '');
  const bodyGradId = `pisoBodyGrad-${uid}`;
  const goldGradId = `pisoGoldGrad-${uid}`;

  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={bodyGradId} x1="12" y1="10" x2="52" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#10B981" />
          <stop offset="55%" stopColor="#047857" />
          <stop offset="100%" stopColor="#064E3B" />
        </linearGradient>
        <linearGradient id={goldGradId} x1="20" y1="36" x2="44" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FDE68A" />
          <stop offset="55%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#D97706" />
        </linearGradient>
      </defs>

      {/* Sprout / leaf crest representing compounding growth */}
      <path
        d="M32 13V6"
        stroke="#FCD34D"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M32 9C27 9 24 6 24 3C28 3 32 5 32 9Z"
        fill="#34D399"
        stroke="#ECFDF5"
        strokeWidth="1.2"
      />
      <path
        d="M32 8C32 4 36 2 40 2C40 6 37 8 32 8Z"
        fill="#FBBF24"
        stroke="#FEF3C7"
        strokeWidth="1.2"
      />

      {/* Rounded owl-coin guardian body */}
      <path
        d="M15 22L19 14L26 17C28 16.4 30 16 32 16C34 16 36 16.4 38 17L45 14L49 22C51.5 25.5 53 30 53 35C53 47.5 43.8 57 32 57C20.2 57 11 47.5 11 35C11 30 12.5 25.5 15 22Z"
        fill={`url(#${bodyGradId})`}
        stroke="#A7F3D0"
        strokeWidth="1.8"
      />

      {/* Warm golden belly coin shield */}
      <ellipse cx="32" cy="44" rx="12" ry="10" fill={`url(#${goldGradId})`} />
      <text
        x="32"
        y="48"
        textAnchor="middle"
        fill="#78350F"
        fontSize="12"
        fontWeight="700"
        fontFamily="JetBrains Mono, monospace"
      >
        ₱
      </text>

      {/* Expressive eye patches */}
      <circle cx="24" cy="27" r="6.5" fill="#ECFDF5" />
      <circle cx="40" cy="27" r="6.5" fill="#ECFDF5" />

      {mood === 'thinking' ? (
        <g>
          <circle cx="25.5" cy="26" r="2.8" fill="#0F172A" />
          <circle cx="41.5" cy="26" r="2.8" fill="#0F172A" />
          <circle cx="26.3" cy="25.1" r="1" fill="#FFFFFF" />
          <circle cx="42.3" cy="25.1" r="1" fill="#FFFFFF" />
          <path d="M19 20L27 21.5" stroke="#FCD34D" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M45 20L37 21.5" stroke="#FCD34D" strokeWidth="1.8" strokeLinecap="round" />
        </g>
      ) : mood === 'happy' ? (
        <g>
          <path
            d="M21 27.5C22.2 25.5 25.8 25.5 27 27.5"
            stroke="#0F172A"
            strokeWidth="2.3"
            strokeLinecap="round"
          />
          <path
            d="M37 27.5C38.2 25.5 41.8 25.5 43 27.5"
            stroke="#0F172A"
            strokeWidth="2.3"
            strokeLinecap="round"
          />
        </g>
      ) : (
        <g>
          <circle cx="24.5" cy="27" r="3" fill="#0F172A" />
          <circle cx="40.5" cy="27" r="3" fill="#0F172A" />
          <circle cx="25.5" cy="25.8" r="1.1" fill="#FFFFFF" />
          <circle cx="41.5" cy="25.8" r="1.1" fill="#FFFFFF" />
        </g>
      )}

      {/* Golden beak */}
      <path d="M29.5 31L32 34.5L34.5 31H29.5Z" fill="#F59E0B" stroke="#78350F" strokeWidth="1" strokeLinejoin="round" />

      {/* Subtle wing accents */}
      <path
        d="M12.5 35C14.5 35 16.5 38 16.5 43C14 42 12 39 12.5 35Z"
        fill="#34D399"
        fillOpacity="0.65"
      />
      <path
        d="M51.5 35C49.5 35 47.5 38 47.5 43C50 42 52 39 51.5 35Z"
        fill="#34D399"
        fillOpacity="0.65"
      />
    </svg>
  );
}
