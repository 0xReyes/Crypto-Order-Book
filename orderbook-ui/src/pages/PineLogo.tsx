const PineLogo = ({ className = "w-10 h-10" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="pine-bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#3a414c" />
        <stop offset="50%" stopColor="#181a20" />
        <stop offset="100%" stopColor="#0b0e11" />
      </linearGradient>
      <linearGradient id="pine-gl" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="rgba(255,255,255,0.5)" />
        <stop offset="100%" stopColor="rgba(255,255,255,0)" />
      </linearGradient>
    </defs>
    <path
      fill="url(#pine-bg)"
      stroke="#fcd535"
      strokeWidth="4"
      strokeLinejoin="round"
      d="M50 10 L70 30 L60 40 L75 55 L60 65 L70 80 L50 95 L30 80 L40 65 L25 55 L40 40 L30 30 Z"
    />
    <path
      fill="url(#pine-gl)"
      d="M50 10 L30 30 L40 40 L25 55 L40 65 L30 80 L50 95 Z"
    />
  </svg>
);

export default PineLogo;
