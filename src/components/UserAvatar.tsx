import React from 'react';

interface UserAvatarProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  username?: string;
  role?: string;
  showStatus?: boolean;
  className?: string;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  size = 'md',
  username = 'admin',
  role = 'admin',
  showStatus = true,
  className = '',
}) => {
  const sizeClasses = {
    sm: 'w-7 h-7',
    md: 'w-9 h-9',
    lg: 'w-12 h-12',
    xl: 'w-14 h-14',
  }[size];

  const dotClasses = {
    sm: 'w-2 h-2 -bottom-0.5 -right-0.5 border',
    md: 'w-2.5 h-2.5 -bottom-0.5 -right-0.5 border-2',
    lg: 'w-3.5 h-3.5 bottom-0 right-0 border-2',
    xl: 'w-4 h-4 bottom-0 right-0 border-2',
  }[size];

  return (
    <div className={`relative inline-block select-none ${className}`}>
      {/* Outer ambient glow */}
      <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-blue-500 via-indigo-500 to-cyan-400 opacity-60 dark:opacity-80 blur-xs group-hover:opacity-100 transition-opacity"></div>

      {/* Modern Executive 3D Avatar Container */}
      <div
        className={`relative ${sizeClasses} rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 p-[1.5px] shadow-lg overflow-hidden flex items-center justify-center border border-white/20 dark:border-cyan-400/30`}
      >
        {/* Subtle glass reflection highlight */}
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/15 to-transparent pointer-events-none z-10"></div>

        {/* Executive Vector Illustration (Futuristic Executive with Glasses & Corporate Turtleneck) */}
        <svg
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full transform scale-105"
        >
          <defs>
            <linearGradient id="bgGrad" x1="0" y1="0" x2="64" y2="64">
              <stop offset="0%" stopColor="#1e1b4b" />
              <stop offset="50%" stopColor="#2e1065" />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>
            <linearGradient id="hairGrad" x1="0" y1="0" x2="0" y2="30">
              <stop offset="0%" stopColor="#1e293b" />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>
            <linearGradient id="skinGrad" x1="20" y1="15" x2="44" y2="38">
              <stop offset="0%" stopColor="#fed7aa" />
              <stop offset="100%" stopColor="#fdba74" />
            </linearGradient>
            <linearGradient id="suitGrad" x1="0" y1="36" x2="64" y2="64">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="50%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#4338ca" />
            </linearGradient>
            <linearGradient id="visorGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>
          </defs>

          {/* Background Orb */}
          <rect width="64" height="64" rx="16" fill="url(#bgGrad)" />

          {/* Halo Circuit Ring */}
          <circle cx="32" cy="32" r="28" stroke="#38bdf8" strokeWidth="1" strokeOpacity="0.25" strokeDasharray="3 3" />

          {/* Suit / Shoulders */}
          <path
            d="M12 58C12 46 20 40 32 40C44 40 52 46 52 58V64H12V58Z"
            fill="url(#suitGrad)"
          />
          {/* Inner Turtleneck / Collar Accent */}
          <path d="M26 38H38V44H26V38Z" fill="#1e1b4b" />
          <path d="M28 42H36" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" />

          {/* Neck */}
          <path d="M27 30H37V39H27V30Z" fill="#fca5a5" />

          {/* Head Shape */}
          <rect x="22" y="16" width="20" height="23" rx="10" fill="url(#skinGrad)" />

          {/* Hair Modern Quiff */}
          <path
            d="M20 23C20 15 24 10 32 10C40 10 44 14 44 20C41 18 36 17 31 17C26 17 22 20 20 23Z"
            fill="url(#hairGrad)"
          />

          {/* Executive Cyber Eyewear / Modern Glasses */}
          <rect x="23" y="24" width="7" height="5" rx="1.5" fill="#0f172a" stroke="url(#visorGrad)" strokeWidth="1.2" />
          <rect x="34" y="24" width="7" height="5" rx="1.5" fill="#0f172a" stroke="url(#visorGrad)" strokeWidth="1.2" />
          <line x1="30" y1="26" x2="34" y2="26" stroke="url(#visorGrad)" strokeWidth="1.2" />
          {/* Glasses Lens Glint */}
          <circle cx="25" cy="26" r="1" fill="#ffffff" />
          <circle cx="36" cy="26" r="1" fill="#ffffff" />

          {/* Confident Smile */}
          <path d="M29 34C30.5 35.2 33.5 35.2 35 34" stroke="#c2410c" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </div>

      {/* Online Status Live Dot with Pulse Ping */}
      {showStatus && (
        <span
          className={`absolute ${dotClasses} rounded-full bg-emerald-500 border-white dark:border-slate-900 shadow-md shadow-emerald-500/50 flex items-center justify-center`}
        >
          <span className="w-1 h-1 rounded-full bg-white opacity-80"></span>
        </span>
      )}
    </div>
  );
};
