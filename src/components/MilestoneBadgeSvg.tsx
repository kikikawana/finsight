import type { MilestoneId } from '../types/finance';

interface MilestoneBadgeSvgProps {
  id: MilestoneId;
  unlocked: boolean;
  className?: string;
}

const PALETTES: Record<
  MilestoneId,
  { rim: string; bg: string; accent: string; inner: string }
> = {
  first_deposit: {
    rim: '#059669',
    bg: '#ECFDF5',
    accent: '#10B981',
    inner: '#065F46',
  },
  first_1000_php: {
    rim: '#D97706',
    bg: '#FFFBEB',
    accent: '#F59E0B',
    inner: '#92400E',
  },
  first_month_consistency: {
    rim: '#0284C7',
    bg: '#F0F9FF',
    accent: '#0EA5E9',
    inner: '#075985',
  },
  first_10000_php: {
    rim: '#15803D',
    bg: '#F0FDF4',
    accent: '#22C55E',
    inner: '#14532D',
  },
  quarter_year_habit: {
    rim: '#7C3AED',
    bg: '#F5F3FF',
    accent: '#8B5CF6',
    inner: '#4C1D95',
  },
  down_payment_25: {
    rim: '#0F766E',
    bg: '#F0FDFA',
    accent: '#14B8A6',
    inner: '#134E4A',
  },
  down_payment_50: {
    rim: '#B45309',
    bg: '#FEF3C7',
    accent: '#F59E0B',
    inner: '#78350F',
  },
  down_payment_100: {
    rim: '#CA8A04',
    bg: '#FEF9C3',
    accent: '#EAB308',
    inner: '#713F12',
  },
};

export function MilestoneBadgeSvg({
  id,
  unlocked,
  className = 'w-14 h-14',
}: MilestoneBadgeSvgProps) {
  const palette = unlocked
    ? PALETTES[id]
    : {
        rim: '#94A3B8',
        bg: '#F1F5F9',
        accent: '#CBD5E1',
        inner: '#64748B',
      };

  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Shield / Medal outer geometry */}
      {id.startsWith('down_payment') ? (
        <path
          d="M32 4L56 14V31C56 45.2 45.8 56.4 32 60C18.2 56.4 8 45.2 8 31V14L32 4Z"
          fill={palette.bg}
          stroke={palette.rim}
          strokeWidth="2.5"
        />
      ) : (
        <>
          <circle
            cx="32"
            cy="32"
            r="27"
            fill={palette.bg}
            stroke={palette.rim}
            strokeWidth="2.5"
          />
          <circle
            cx="32"
            cy="32"
            r="22"
            stroke={palette.accent}
            strokeWidth="1.2"
            strokeDasharray={unlocked ? 'none' : '3 3'}
            strokeOpacity={unlocked ? 0.5 : 0.7}
          />
        </>
      )}

      {/* Distinct symbolic emblem per milestone */}
      {id === 'first_deposit' && (
        <g stroke={palette.inner} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M32 44V26" />
          <path d="M32 32C25 32 22 27 22 22C27 22 32 25 32 32Z" fill={unlocked ? palette.accent : 'none'} />
          <path d="M32 27C32 21 37 18 42 18C42 23 39 27 32 27Z" fill={unlocked ? palette.accent : 'none'} />
        </g>
      )}

      {id === 'first_1000_php' && (
        <g>
          <text
            x="32"
            y="29"
            textAnchor="middle"
            fill={palette.inner}
            fontSize="14"
            fontWeight="700"
            fontFamily="JetBrains Mono, monospace"
          >
            ₱1K
          </text>
          <path
            d="M21 38H43M24 43H40"
            stroke={palette.accent}
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </g>
      )}

      {id === 'first_month_consistency' && (
        <g stroke={palette.inner} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="20" y="21" width="24" height="22" rx="4" fill={unlocked ? '#FFFFFF' : 'none'} />
          <path d="M26 18V23M38 18V23M20 28H44" />
          <path d="M26 35L30 39L39 31" stroke={palette.rim} strokeWidth="2.6" />
        </g>
      )}

      {id === 'first_10000_php' && (
        <g>
          <polygon
            points="32,16 46,24 46,40 32,48 18,40 18,24"
            fill={unlocked ? '#FFFFFF' : 'none'}
            stroke={palette.inner}
            strokeWidth="2.2"
          />
          <text
            x="32"
            y="36"
            textAnchor="middle"
            fill={palette.inner}
            fontSize="12"
            fontWeight="700"
            fontFamily="JetBrains Mono, monospace"
          >
            10K
          </text>
        </g>
      )}

      {id === 'quarter_year_habit' && (
        <g stroke={palette.inner} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path
            d="M32 16L36.5 26.5L48 28L39.5 35.5L41.8 47L32 41.2L22.2 47L24.5 35.5L16 28L27.5 26.5L32 16Z"
            fill={unlocked ? palette.accent : 'none'}
            fillOpacity={unlocked ? 0.35 : 0}
          />
        </g>
      )}

      {id === 'down_payment_25' && (
        <g stroke={palette.inner} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="27" cy="30" r="6" fill={unlocked ? '#FFFFFF' : 'none'} />
          <path d="M33 30H44M40 30V35M44 30V34" />
          <text
            x="32"
            y="47"
            textAnchor="middle"
            stroke="none"
            fill={palette.inner}
            fontSize="10"
            fontWeight="700"
            fontFamily="JetBrains Mono, monospace"
          >
            25%
          </text>
        </g>
      )}

      {id === 'down_payment_50' && (
        <g stroke={palette.inner} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 31L32 20L44 31" />
          <path d="M23 29V42H41V29" fill={unlocked ? '#FFFFFF' : 'none'} />
          <text
            x="32"
            y="38"
            textAnchor="middle"
            stroke="none"
            fill={palette.inner}
            fontSize="10"
            fontWeight="700"
            fontFamily="JetBrains Mono, monospace"
          >
            50%
          </text>
        </g>
      )}

      {id === 'down_payment_100' && (
        <g stroke={palette.inner} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
          <path
            d="M19 30L32 18L45 30V44H19V30Z"
            fill={unlocked ? palette.accent : 'none'}
            fillOpacity={unlocked ? 0.4 : 0}
          />
          <path d="M27 33L31 37L38 29" stroke={palette.inner} strokeWidth="2.6" />
        </g>
      )}
    </svg>
  );
}
