
/** Central logo robot icon (cyberpunk/retro helmet) */
export function LogoIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "inline-block", verticalAlign: "middle" }}
    >
      <defs>
        <linearGradient id="logo-body" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1e294b" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
        <linearGradient id="logo-visor" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ffd54a" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
        <filter id="glow-logo" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      {/* Neck */}
      <rect x="42" y="72" width="16" height="12" rx="4" fill="#334155" stroke="#1e293b" strokeWidth="3" />
      {/* Ears / Antenna Mounts */}
      <rect x="14" y="38" width="8" height="24" rx="4" fill="#475569" stroke="#1e293b" strokeWidth="2" />
      <rect x="78" y="38" width="8" height="24" rx="4" fill="#475569" stroke="#1e293b" strokeWidth="2" />
      {/* Left/Right Antennae */}
      <path d="M18 38 L18 20" stroke="#475569" strokeWidth="3" strokeLinecap="round" />
      <circle cx="18" cy="18" r="4" fill="#ffd54a" />
      <path d="M82 38 L82 20" stroke="#475569" strokeWidth="3" strokeLinecap="round" />
      <circle cx="82" cy="18" r="4" fill="#ffd54a" />
      {/* Main Head Helmet */}
      <rect x="20" y="24" width="60" height="52" rx="16" fill="url(#logo-body)" stroke="#ffd54a" strokeWidth="3" />
      {/* Cybernetic Face Plates */}
      <path d="M26 32 H74 V40 H26 Z" fill="#0f172a" opacity="0.4" />
      {/* Glowing Neon Visor */}
      <rect x="28" y="40" width="44" height="16" rx="8" fill="url(#logo-visor)" filter="url(#glow-logo)" />
      {/* Scanning laser line inside visor */}
      <rect x="34" y="47" width="32" height="2" rx="1" fill="#ffffff" opacity="0.8" />
      {/* Cyber mouth vent lines */}
      <line x1="42" y1="64" x2="42" y2="68" stroke="#475569" strokeWidth="2" strokeLinecap="round" />
      <line x1="50" y1="63" x2="50" y2="69" stroke="#475569" strokeWidth="2" strokeLinecap="round" />
      <line x1="58" y1="64" x2="58" y2="68" stroke="#475569" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Professor Blue (Sleek, intelligent, glowing blue visor) */
export function BlueRobot({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="blue-body" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1e3a8a" />
          <stop offset="50%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
        <linearGradient id="blue-visor" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
        <filter id="glow-blue" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      {/* Neck joint */}
      <rect x="44" y="74" width="12" height="10" rx="3" fill="#334155" stroke="#1e293b" strokeWidth="2" />
      {/* Side sensors / ears */}
      <circle cx="21" cy="50" r="7" fill="#334155" stroke="#38bdf8" strokeWidth="2" />
      <circle cx="79" cy="50" r="7" fill="#334155" stroke="#38bdf8" strokeWidth="2" />
      {/* Sleek brain-dome light */}
      <path d="M35 25 Q50 12 65 25" stroke="#38bdf8" strokeWidth="3" fill="none" opacity="0.8" filter="url(#glow-blue)" />
      {/* Head chassis */}
      <path
        d="M24 40 C24 28, 76 28, 76 40 L74 70 C74 74, 26 74, 26 70 Z"
        fill="url(#blue-body)"
        stroke="#38bdf8"
        strokeWidth="3"
      />
      {/* Visor Area */}
      <rect x="30" y="38" width="40" height="15" rx="6" fill="#0f172a" />
      {/* Visor LED Display */}
      <rect x="33" y="41" width="34" height="9" rx="4" fill="url(#blue-visor)" filter="url(#glow-blue)" />
      {/* Animated dots or grid look inside visor */}
      <circle cx="42" cy="45" r="1.5" fill="#ffffff" />
      <circle cx="58" cy="45" r="1.5" fill="#ffffff" />
      {/* Cybermouth / speaker grid */}
      <path d="M42 62 H58 L54 66 H46 Z" fill="#334155" stroke="#1e293b" strokeWidth="1.5" />
      {/* Logic board/circuit graphics on cheeks */}
      <path d="M29 58 L33 62 V68" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <path d="M71 58 L67 62 V68" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

/** Captain Green (Tactical, armored military robot with combat helmet and visor) */
export function GreenRobot({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="green-body" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#14532d" />
          <stop offset="50%" stopColor="#1b2e35" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
        <linearGradient id="green-visor" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#4ade80" />
          <stop offset="100%" stopColor="#16a34a" />
        </linearGradient>
        <filter id="glow-green" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      {/* Heavy neck shield */}
      <path d="M38 74 L62 74 L58 84 L42 84 Z" fill="#1b2e35" stroke="#14532d" strokeWidth="2.5" />
      {/* Ear protectors / heavy communications gear */}
      <rect x="13" y="42" width="10" height="24" rx="3" fill="#1b2e35" stroke="#4ade80" strokeWidth="2" />
      <rect x="77" y="42" width="10" height="24" rx="3" fill="#1b2e35" stroke="#4ade80" strokeWidth="2" />
      {/* Tactical antenna */}
      <path d="M82 42 L88 24" stroke="#4ade80" strokeWidth="3" strokeLinecap="round" />
      <circle cx="89" cy="22" r="3" fill="#4ade80" filter="url(#glow-green)" />
      {/* Helmet crest / center shield */}
      <path d="M46 16 H54 L52 28 H48 Z" fill="#4ade80" />
      {/* Main Angular armored helmet */}
      <path
        d="M23 38 L28 22 C32 18, 68 18, 72 22 L77 38 L75 72 L65 76 L35 76 L25 72 Z"
        fill="url(#green-body)"
        stroke="#4ade80"
        strokeWidth="3.5"
      />
      {/* Angry/Angled tactical visor */}
      <path d="M30 40 L50 45 L70 40 L67 52 L50 55 L33 52 Z" fill="#0f172a" />
      <path d="M32 42 L50 47 L68 42 L65 50 L50 53 L35 50 Z" fill="url(#green-visor)" filter="url(#glow-green)" />
      {/* Heavy rivets / bolts on helmet */}
      <circle cx="34" cy="28" r="2" fill="#4ade80" />
      <circle cx="66" cy="28" r="2" fill="#4ade80" />
      <circle cx="33" cy="68" r="2" fill="#4ade80" />
      <circle cx="67" cy="68" r="2" fill="#4ade80" />
      {/* Tactical breathing vent / mouth guard */}
      <path d="M43 62 L50 58 L57 62 L54 71 H46 Z" fill="#1b2e35" stroke="#4ade80" strokeWidth="2" />
      <line x1="50" y1="61" x2="50" y2="68" stroke="#4ade80" strokeWidth="1.5" />
    </svg>
  );
}
