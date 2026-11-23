interface FinSightLogoProps {
  className?: string;
}

export function FinSightLogo({ className = 'w-8 h-8' }: FinSightLogoProps) {
  return (
    <svg
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Outer architectural rounded frame */}
      <rect x="1" y="1" width="34" height="34" rx="9" fill="#0F172A" />
      <rect x="1.5" y="1.5" width="33" height="33" rx="8.5" stroke="#1E293B" />

      {/* Ascending compound bars */}
      <rect x="8" y="21" width="4.5" height="7" rx="1.2" fill="#34D399" fillOpacity="0.55" />
      <rect x="15.5" y="16" width="4.5" height="12" rx="1.2" fill="#10B981" fillOpacity="0.85" />
      <rect x="23" y="10.5" width="4.5" height="17.5" rx="1.2" fill="#34D399" />

      {/* Growth roof-line chevron + amber milestone spark */}
      <path
        d="M8 16.5L17.75 9.5L27.5 14"
        stroke="#FBBF24"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="25.25" cy="8.5" r="2.2" fill="#FBBF24" />
    </svg>
  );
}
