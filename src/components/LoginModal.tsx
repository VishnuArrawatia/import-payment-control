import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, User, Lock, AlertCircle, CheckCircle2, ArrowRight, Sparkles } from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  isBlockingGate?: boolean;
  onClose: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, isBlockingGate = false, onClose }) => {
  const { login, currentUser, users } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setSubmitting(true);

    const res = await login(username, password);
    setSubmitting(false);

    if (!res.success) {
      setErrorMsg(res.error || 'Authentication failed.');
      return;
    }

    setSuccessMsg(`Authenticated as ${username.trim()}. Opening workspace...`);
    setPassword('');
    if (!isBlockingGate) {
      setTimeout(() => {
        onClose();
      }, 450);
    }
  };

  const handleSelectUsernameOnly = (uname: string) => {
    setUsername(uname);
    setPassword(''); // Always require manual password entry
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${
        isBlockingGate
          ? 'bg-gradient-to-br from-[#0e1217] via-slate-900 to-indigo-950'
          : 'bg-black/60 backdrop-blur-xs'
      }`}
    >
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-md overflow-hidden">
        {isBlockingGate && (
          <div className="bg-[#0e1217] px-6 py-4 flex items-center space-x-3 border-b border-slate-800">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-sky-400 text-white flex items-center justify-center shadow-xs">
              <Sparkles className="w-5 h-5 fill-white/20" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-white tracking-tight">Import Payment Control</h2>
              <p className="text-[11px] text-slate-400">
                Sakar Electricals &amp; Group Imports • Treasury &amp; IDPMS
              </p>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="p-6 bg-gradient-to-b from-slate-50 to-white border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/20">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                {isBlockingGate ? 'Sign In Required' : 'Switch Account'}
                <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full">
                  RBAC
                </span>
              </h3>
              <p className="text-xs text-slate-500">1 Admin • 1 Management • 3 Executors • 2 Purchase</p>
            </div>
          </div>
          {!isBlockingGate && (
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 font-bold text-sm p-1">
              ✕
            </button>
          )}
        </div>

        {/* Account Quick-Select Username Chips (Password never prefilled) */}
        <div className="px-6 pt-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
            Registered Roles (enter password below):
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {users.map(u => {
              const isSelected = username.toLowerCase() === u.username.toLowerCase();
              let roleColor = 'bg-slate-100 text-slate-700 border-slate-200';
              if (u.role === 'admin') roleColor = 'bg-indigo-50 text-indigo-800 border-indigo-200';
              if (u.role === 'management') roleColor = 'bg-amber-50 text-amber-800 border-amber-200';
              if (u.role === 'executor') roleColor = 'bg-emerald-50 text-emerald-800 border-emerald-200';
              if (u.role === 'purchase') roleColor = 'bg-sky-50 text-sky-800 border-sky-200';

              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => handleSelectUsernameOnly(u.username)}
                  className={`px-2 py-1.5 rounded-xl border text-[11px] font-bold transition-all text-left flex flex-col justify-between cursor-pointer ${
                    isSelected ? 'ring-2 ring-indigo-600 ring-offset-1 ' + roleColor : 'bg-slate-50/80 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span className="truncate">{u.username}</span>
                  <span className="text-[9px] font-semibold opacity-70 uppercase tracking-tighter">
                    {u.role}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Username</label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="admin / management / executor1..3 / purchase1..2"
                className="w-full text-xs pl-9 pr-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                required
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-slate-700">Password</label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-[10px] text-indigo-600 font-semibold hover:underline"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full text-xs pl-9 pr-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                required
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center space-x-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
            >
              <span>{submitting ? 'Verifying...' : 'Sign In & Open Workspace'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {currentUser && (
            <div className="pt-2 text-[11px] text-slate-400 text-center border-t border-slate-100">
              Current Active Session: <strong className="text-slate-800">{currentUser.username}</strong> ({currentUser.role})
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
