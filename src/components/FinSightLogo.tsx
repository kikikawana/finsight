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
      {/* Forest-emerald architectural tile */}
      <rect x="1" y="1" width="34" height="34" rx="9" fill="#064E3B" />
      <rect x="1.5" y="1.5" width="33" height="33" rx="8.5" stroke="#065F46" />

      {/* Crisp ascending ledger bars */}
      <rect x="8.5" y="21" width="4.5" height="7" rx="1.2" fill="#A7F3D0" fillOpacity="0.45" />
      <rect x="15.75" y="15.5" width="4.5" height="12.5" rx="1.2" fill="#6EE7B7" fillOpacity="0.75" />
      <rect x="23" y="10" width="4.5" height="18" rx="1.2" fill="#34D399" />

      {/* Crisp trajectory arc */}
      <path
        d="M8.5 16L17.5 10.5L26.5 7.5"
        stroke="#FCD34D"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="26.5" cy="7.5" r="2" fill="#FCD34D" />
    </svg>
  );
}
