import React from 'react';

interface BrandLogoProps {
  className?: string;
  showSubtitle?: boolean;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ className = '', showSubtitle = true }) => {
  return (
    <div className={`flex items-center space-x-3.5 select-none ${className}`}>
      {/* 3D Holographic / Glass Prism Emblem */}
      <div className="relative group cursor-pointer">
        {/* Ambient Neon Backglow */}
        <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-cyan-500 via-indigo-500 to-purple-600 opacity-60 dark:opacity-75 blur-md group-hover:opacity-100 transition-opacity duration-300"></div>

        {/* Outer Prism Container */}
        <div className="relative w-10 h-10 rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 border border-white/20 dark:border-cyan-400/40 p-1.5 shadow-xl flex items-center justify-center overflow-hidden">
          {/* Subtle light sweep reflection */}
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent pointer-events-none"></div>

          {/* Precision Vector Emblem: Layered Diamond Shield with Orbital Nodes */}
          <svg
            viewBox="0 0 40 40"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-full transform group-hover:scale-105 transition-transform duration-300"
          >
            <defs>
              <linearGradient id="prismGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="50%" stopColor="#6366f1" />
                <stop offset="100%" stopColor="#a855f7" />
              </linearGradient>
              <linearGradient id="prismGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#22d3ee" />
                <stop offset="100%" stopColor="#3b82f6" />
              </linearGradient>
              <filter id="glowFilter" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="1.5" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Faceted Prism Outer Shape */}
            <path
              d="M20 3L35 11.5V28.5L20 37L5 28.5V11.5L20 3Z"
              stroke="url(#prismGrad1)"
              strokeWidth="1.8"
              strokeLinejoin="round"
              fill="rgba(30, 27, 75, 0.45)"
            />

            {/* Inner Geometric Star/Vault Node */}
            <path
              d="M20 9L30 16.5V23.5L20 31L10 23.5V16.5L20 9Z"
              fill="url(#prismGrad2)"
              fillOpacity="0.3"
              stroke="url(#prismGrad2)"
              strokeWidth="1.2"
            />

            {/* Central Luminous Core Node */}
            <circle cx="20" cy="20" r="3.5" fill="#ffffff" filter="url(#glowFilter)" />
            <circle cx="20" cy="20" r="1.8" fill="#38bdf8" />

            {/* Cross Laser Accents */}
            <line x1="20" y1="5" x2="20" y2="12" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="20" y1="28" x2="20" y2="35" stroke="#a855f7" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="7" y1="20" x2="13" y2="20" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="27" y1="20" x2="33" y2="20" stroke="#a855f7" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      {/* Brand Title & Status Badges */}
      <div className="flex flex-col">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-black tracking-tight leading-none text-slate-900 dark:text-white flex items-center gap-1.5">
            <span className="tracking-tighter">IMPORT</span>
            <span className="bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-600 dark:from-cyan-400 dark:via-sky-300 dark:to-indigo-400 bg-clip-text text-transparent font-extrabold">
              PAYMENT
            </span>
            <span className="text-indigo-600 dark:text-cyan-400 font-extrabold tracking-tight">CONTROL</span>
          </h1>

          <span className="text-[10px] font-extrabold px-2 py-0.5 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 dark:from-indigo-950/80 dark:to-purple-950/80 text-indigo-700 dark:text-cyan-300 border border-indigo-200/80 dark:border-cyan-500/30 rounded-full tracking-wider uppercase shadow-2xs">
            PRO 3.0
          </span>

          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 bg-emerald-500/10 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-400/40 dark:border-emerald-500/30 rounded-full shadow-2xs">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
            </span>
            IDPMS Live
          </span>
        </div>

        {showSubtitle && (
          <p className="text-[10.5px] text-slate-500 dark:text-slate-400 font-medium tracking-tight mt-0.5 flex items-center gap-1.5">
            <span>Foreign Remittances</span>
            <span className="text-slate-300 dark:text-slate-600">•</span>
            <span>BOE Customs Clearance</span>
            <span className="text-slate-300 dark:text-slate-600">•</span>
            <span>Realized FX Engine</span>
          </p>
        )}
      </div>
    </div>
  );
};
