import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Shield,
  User,
  Lock,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Ship,
  Plane,
  Truck,
  Anchor,
  Globe,
  Package,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Coins,
  Warehouse,
  FileText,
  Boxes,
  X,
} from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  isBlockingGate?: boolean;
  onClose: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, isBlockingGate = false, onClose }) => {
  const { login, currentUser, users } = useAuth();

  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);

  // Auto-rotate showcase slides every 6 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveSlide(prev => (prev + 1) % 3);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  if (!isOpen) return null;

  // Rich metadata for users
  const userMetadataMap: Record<string, { title: string; subtitle: string; badge: string; color: string; icon: React.ReactNode }> = {
    admin: {
      title: 'Head Administrator',
      subtitle: 'Full System Control • Security & User Management',
      badge: 'ADMIN',
      color: 'from-indigo-600 to-blue-700 text-indigo-400 bg-indigo-950/70 border-indigo-500/40',
      icon: <Shield className="w-4 h-4 text-indigo-400" />,
    },
    management: {
      title: 'Executive Management',
      subtitle: 'Financial Review • P&L, FX Valuation & IDPMS',
      badge: 'MANAGEMENT',
      color: 'from-amber-500 to-orange-600 text-amber-400 bg-amber-950/70 border-amber-500/40',
      icon: <Globe className="w-4 h-4 text-amber-400" />,
    },
    executor1: {
      title: 'Import Operations Lead',
      subtitle: 'Commercial Invoices & Sea Container Demurrage',
      badge: 'EXECUTOR',
      color: 'from-emerald-500 to-teal-700 text-emerald-400 bg-emerald-950/70 border-emerald-500/40',
      icon: <Ship className="w-4 h-4 text-emerald-400" />,
    },
    executor2: {
      title: 'Customs & BOE Specialist',
      subtitle: 'Bill of Entry, Customs Duty & ICEGATE Knock-off',
      badge: 'EXECUTOR',
      color: 'from-sky-500 to-cyan-700 text-sky-400 bg-sky-950/70 border-sky-500/40',
      icon: <FileText className="w-4 h-4 text-sky-400" />,
    },
    executor3: {
      title: 'Bank Remittance Executive',
      subtitle: 'SWIFT Transfers, Outward FX & Bank Letters',
      badge: 'EXECUTOR',
      color: 'from-teal-500 to-emerald-700 text-teal-400 bg-teal-950/70 border-teal-500/40',
      icon: <Coins className="w-4 h-4 text-teal-400" />,
    },
    purchase1: {
      title: 'Purchase Manager',
      subtitle: 'Proforma Invoices, Supplier Pos & Price Audits',
      badge: 'PURCHASE',
      color: 'from-purple-500 to-indigo-700 text-purple-400 bg-purple-950/70 border-purple-500/40',
      icon: <Package className="w-4 h-4 text-purple-400" />,
    },
    purchase2: {
      title: 'Logistics & Cargo Executive',
      subtitle: 'Air & Truck Shipments, Port Delivery & ICD Tracking',
      badge: 'PURCHASE',
      color: 'from-violet-500 to-fuchsia-700 text-violet-400 bg-violet-950/70 border-violet-500/40',
      icon: <Truck className="w-4 h-4 text-violet-400" />,
    },
  };

  const selectedMeta = userMetadataMap[username] || {
    title: username,
    subtitle: 'Registered User Account',
    badge: 'USER',
    color: 'from-slate-600 to-slate-800 text-slate-300 bg-slate-900 border-slate-700',
    icon: <User className="w-4 h-4 text-slate-300" />,
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setSubmitting(true);

    const res = await login(username, password);
    setSubmitting(false);

    if (!res.success) {
      setErrorMsg(res.error || 'Authentication failed. Please verify password.');
      return;
    }

    setSuccessMsg(`Welcome, ${selectedMeta.title}! Opening secure workspace...`);
    setPassword('');
    if (!isBlockingGate) {
      setTimeout(() => {
        onClose();
      }, 500);
    }
  };

  const handleSelectUser = (uname: string) => {
    setUsername(uname);
    setPassword('');
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const slides = [
    {
      id: 'sea',
      mode: 'BY SEA & MARITIME',
      title: 'Ocean Freight & Sea Containers',
      desc: 'Real-time FCL/LCL vessel tracking, container demurrage radar & 14-day port detention compliance.',
      accent: 'from-blue-600 via-indigo-600 to-cyan-500',
      bgGlow: 'bg-blue-600/20',
      badges: [
        { label: '40ft HC Containers', sub: 'Nhava Sheva / Mundra Port', icon: <Boxes className="w-4 h-4 text-cyan-300" />, pos: 'top-8 left-8' },
        { label: '14-Day Free Time', sub: '$100/day Demurrage Saver', icon: <Ship className="w-4 h-4 text-blue-300" />, pos: 'bottom-16 left-10' },
        { label: 'Ocean Carriers', sub: 'Maersk • MSC • COSCO • ONE', icon: <Anchor className="w-4 h-4 text-indigo-300" />, pos: 'top-12 right-10' },
        { label: 'Bill of Lading', sub: 'Original / Surrendered B/L', icon: <FileText className="w-4 h-4 text-emerald-300" />, pos: 'bottom-12 right-12' },
      ],
      centerIcon: <Ship className="w-12 h-12 text-cyan-300" />,
      centerTitle: 'Ocean Vessel Gateway',
      centerSubtitle: '100% Transit Visibility',
    },
    {
      id: 'air',
      mode: 'BY AIR & CUSTOMS',
      title: 'Air Cargo Express & Customs Terminal',
      desc: 'Direct airport cargo flights from HKG / SZX / PVG, ICEGATE BOE clearance & customs duty valuation.',
      accent: 'from-sky-500 via-blue-600 to-indigo-700',
      bgGlow: 'bg-sky-600/20',
      badges: [
        { label: 'Air Freight Express', sub: 'Direct Cargo Flight Transit', icon: <Plane className="w-4 h-4 text-sky-300" />, pos: 'top-8 left-8' },
        { label: 'ICEGATE Customs EDI', sub: 'BOE Automated Knock-off', icon: <ShieldCheck className="w-4 h-4 text-cyan-300" />, pos: 'bottom-16 left-10' },
        { label: 'Duty Assessment', sub: 'BCD, AIDC & IGST Planner', icon: <Coins className="w-4 h-4 text-amber-300" />, pos: 'top-12 right-10' },
        { label: 'Inland Cargo Trucks', sub: 'Air Cargo to Sakar Warehouse', icon: <Truck className="w-4 h-4 text-emerald-300" />, pos: 'bottom-12 right-12' },
      ],
      centerIcon: <Plane className="w-12 h-12 text-sky-300" />,
      centerTitle: 'Air Cargo Hub',
      centerSubtitle: 'Express Customs Clearance',
    },
    {
      id: 'treasury',
      mode: 'INLAND & IDPMS TREASURY',
      title: 'RBI IDPMS 180-Day & Forex Hedging',
      desc: 'Outward remittance banking, SWIFT message reconciliation, multi-currency valuation & realized FX gains.',
      accent: 'from-indigo-600 via-purple-600 to-pink-600',
      bgGlow: 'bg-purple-600/20',
      badges: [
        { label: '180-Day RBI Radar', sub: 'Advance Remittance Safe Window', icon: <ShieldCheck className="w-4 h-4 text-emerald-300" />, pos: 'top-8 left-8' },
        { label: 'Multi-Currency Desk', sub: 'USD • CNY • INR Live Engine', icon: <Coins className="w-4 h-4 text-amber-300" />, pos: 'bottom-16 left-10' },
        { label: 'Inland Fleet Dispatch', sub: 'ICD / Port Container Trucks', icon: <Truck className="w-4 h-4 text-purple-300" />, pos: 'top-12 right-10' },
        { label: 'Central Warehouse', sub: 'Bonded Cargo Storage', icon: <Warehouse className="w-4 h-4 text-blue-300" />, pos: 'bottom-12 right-12' },
      ],
      centerIcon: <Globe className="w-12 h-12 text-purple-300" />,
      centerTitle: 'Global Trade & Treasury',
      centerSubtitle: '100% IDPMS Compliant',
    },
  ];

  const currSlide = slides[activeSlide];

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 md:p-8 overflow-y-auto ${isBlockingGate
          ? 'bg-gradient-to-br from-[#070b14] via-[#0b1329] to-[#050811]'
          : 'bg-black/75 backdrop-blur-md'
        }`}
    >
      {/* Background ambient lighting effects */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-sky-500/10 rounded-full blur-[140px]"></div>
      </div>

      {/* Main Split-Screen Container */}
      <div className="relative w-full max-w-5xl bg-white dark:bg-[#0d1527] rounded-3xl sm:rounded-[32px] shadow-2xl border border-slate-200/80 dark:border-white/10 overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[620px] transition-all">

        {/* Close Button (for Switch Account modal mode) */}
        {!isBlockingGate && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-500 dark:text-slate-300 flex items-center justify-center transition-all cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* LEFT PANEL: Clean Modern Authentication Form (5 Cols on LG) */}
        <div className="lg:col-span-5 p-6 sm:p-8 flex flex-col justify-between bg-white dark:bg-[#0c1426] relative z-10 border-b lg:border-b-0 lg:border-r border-slate-100 dark:border-white/5">
          <div>
            {/* Brand Logo & System Info */}
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 via-blue-600 to-sky-400 text-white flex items-center justify-center shadow-lg shadow-indigo-600/25">
                <Sparkles className="w-5 h-5 fill-white/20" />
              </div>
              <div>
                <h1 className="text-base font-black text-slate-900 dark:text-white tracking-tight leading-none flex items-center gap-1.5">
                  <span>IMPORT PAYMENT CONTROL</span>
                </h1>
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-1">
                  Sakar Electricals • Global Trade &amp; Treasury
                </p>
              </div>
            </div>

            {/* Welcome Greeting */}
            <div className="mb-6">
              <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                {isBlockingGate ? 'Welcome Back' : 'Switch Active User'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Select your user profile from the list below and enter your password to access the workspace.
              </p>
            </div>

            {/* FORM */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {errorMsg && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-2xl text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2.5 animate-shake">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span className="font-semibold">{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 rounded-2xl text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span className="font-semibold">{successMsg}</span>
                </div>
              )}

              {/* User Selection List (Interactive Dropdown & Quick User Cards) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Select User Profile</span>
                  </label>
                  <span className="text-[10px] font-bold text-slate-400">
                    {users.length} Registered Accounts
                  </span>
                </div>

                {/* Styled Dropdown Selector */}
                <div className="relative mb-2.5">
                  <select
                    value={username}
                    onChange={e => handleSelectUser(e.target.value)}
                    className="w-full text-xs font-semibold pl-3 pr-8 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs cursor-pointer appearance-none"
                  >
                    {users.map(u => {
                      const m = userMetadataMap[u.username] || { title: u.username, badge: u.role };
                      return (
                        <option key={u.id} value={u.username} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white py-1">
                          {m.title} ({u.username}) • {m.badge}
                        </option>
                      );
                    })}
                  </select>
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px]">
                    ▼
                  </div>
                </div>

                {/* Interactive Visual User Pill Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-1.5 max-h-44 overflow-y-auto p-1 rounded-2xl bg-slate-50/60 dark:bg-slate-800/40 border border-slate-200/60 dark:border-white/5 pr-1">
                  {users.map(u => {
                    const isSelected = username.toLowerCase() === u.username.toLowerCase();
                    const meta = userMetadataMap[u.username] || {
                      title: u.username,
                      badge: u.role,
                      icon: <User className="w-3.5 h-3.5" />,
                    };

                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => handleSelectUser(u.username)}
                        className={`p-2 rounded-xl text-left transition-all border flex items-center gap-2 cursor-pointer ${isSelected
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-600/30'
                            : 'bg-white dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200/80 dark:border-white/5 hover:border-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-slate-700/60'
                          }`}
                      >
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isSelected
                              ? 'bg-white/20 text-white'
                              : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                            }`}
                        >
                          {meta.icon}
                        </div>
                        <div className="truncate">
                          <div className="text-[11px] font-bold truncate leading-tight">
                            {meta.title}
                          </div>
                          <div
                            className={`text-[9px] font-mono tracking-tighter truncate ${isSelected ? 'text-white/80' : 'text-slate-400'
                              }`}
                          >
                            @{u.username} • {meta.badge}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Password Input */}
              <div className="pt-1">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Password</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    <span>{showPassword ? 'Hide' : 'Show'}</span>
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={`Enter password for @${username}`}
                    className="w-full text-xs font-medium pl-3.5 pr-10 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs font-mono"
                    required
                    autoFocus
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <Lock className="w-4 h-4 opacity-50" />
                  </div>
                </div>
              </div>

              {/* Sign In Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-indigo-600 via-blue-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-extrabold text-xs tracking-wide shadow-lg shadow-indigo-600/30 hover:shadow-indigo-600/40 transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-60 active:scale-[0.99]"
                >
                  <span>{submitting ? 'Authenticating...' : `Sign In as ${selectedMeta.title}`}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>

          {/* Footer note */}
          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>Role-Based Access Control (RBAC)</span>
            </span>
            <span className="font-mono text-[10px]">v3.0 Cloud</span>
          </div>
        </div>

        {/* RIGHT PANEL: Modern Import Showcase (7 Cols on LG - Inspiring Visuals: Ship, Air, Trucks, Customs) */}
        <div className="lg:col-span-7 bg-gradient-to-br from-[#0a1226] via-[#0e1c3d] to-[#081024] p-6 sm:p-10 flex flex-col justify-between relative overflow-hidden select-none">

          {/* Background Ambient Glows & Tech Grid */}
          <div className="absolute inset-0 opacity-20 pointer-events-none bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:24px_24px]"></div>
          <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 ${currSlide.bgGlow} rounded-full blur-[100px] transition-all duration-1000`}></div>

          {/* Top Showcase Navigation & Mode Pill */}
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-white text-[11px] font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="tracking-wider">{currSlide.mode}</span>
            </div>

            {/* Slide Arrows */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveSlide(prev => (prev === 0 ? slides.length - 1 : prev - 1))}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer backdrop-blur-xs border border-white/10"
                title="Previous Slide"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setActiveSlide(prev => (prev + 1) % slides.length)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer backdrop-blur-xs border border-white/10"
                title="Next Slide"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Center Visual Art: Concentric Radar with Floating Orbital Badges (Inspired by Image 2) */}
          <div className="relative z-10 my-8 sm:my-12 flex items-center justify-center">

            {/* Concentric Radar Rings */}
            <div className="relative w-72 h-72 sm:w-88 sm:h-88 flex items-center justify-center">
              {/* Outer Ring */}
              <div className="absolute inset-0 rounded-full border border-white/10 animate-[spin_60s_linear_infinite]"></div>

              {/* Middle Ring */}
              <div className="absolute inset-8 rounded-full border border-dashed border-white/15 animate-[spin_40s_linear_infinite_reverse]"></div>

              {/* Inner Glowing Ring */}
              <div className="absolute inset-16 rounded-full border border-indigo-400/30 bg-gradient-to-tr from-indigo-500/10 to-sky-500/10 backdrop-blur-2xs flex items-center justify-center"></div>

              {/* Center Hub */}
              <div className="relative z-10 w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-gradient-to-tr from-indigo-600 via-blue-600 to-sky-400 shadow-2xl shadow-indigo-500/50 flex flex-col items-center justify-center text-white border border-white/20 transform hover:scale-105 transition-transform duration-500">
                {currSlide.centerIcon}
              </div>

              {/* Floating Orbit Badges (Ref Image 2) */}
              {currSlide.badges.map((b, i) => (
                <div
                  key={i}
                  className={`absolute ${b.pos} hidden sm:flex items-center gap-2.5 px-3 py-2 rounded-2xl bg-white/10 hover:bg-white/15 backdrop-blur-xl border border-white/15 text-white shadow-xl transition-all duration-300 transform hover:scale-105 z-20`}
                >
                  <div className="w-7 h-7 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                    {b.icon}
                  </div>
                  <div className="text-left">
                    <div className="text-[11px] font-black leading-tight tracking-tight text-white">
                      {b.label}
                    </div>
                    <div className="text-[9px] font-medium text-slate-300">
                      {b.sub}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom Slide Info & Pagination Dots (Ref Image 2) */}
          <div className="relative z-10 text-center sm:text-left flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="max-w-md">
              <h3 className="text-lg sm:text-xl font-black text-white tracking-tight leading-snug">
                {currSlide.title}
              </h3>
              <p className="text-xs text-slate-300 mt-1 font-medium leading-relaxed">
                {currSlide.desc}
              </p>
            </div>

            {/* Pagination Dots (Exactly matching Image 2 carousel dots) */}
            <div className="flex items-center justify-center sm:justify-end space-x-1.5 shrink-0">
              {slides.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActiveSlide(idx)}
                  className={`transition-all duration-300 rounded-full cursor-pointer ${activeSlide === idx
                      ? 'w-7 h-2 bg-gradient-to-r from-sky-400 to-indigo-400'
                      : 'w-2 h-2 bg-white/30 hover:bg-white/50'
                    }`}
                  title={`Go to slide ${idx + 1}`}
                />
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
