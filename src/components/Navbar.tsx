import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  Sparkles,
  HardDrive,
  Calendar,
  Building2,
  ChevronDown,
  RotateCcw,
  KeyRound,
  LogOut,
  Sun,
  Moon,
  FileSpreadsheet,
  Save,
  CheckCircle2,
  RefreshCw,
  BookOpen,
} from 'lucide-react';
import { LoginModal } from './LoginModal';
import { UserManagementModal } from './UserManagementModal';
import { ExcelBatchGridModal } from './ExcelBatchGridModal';
import { UserGuideModal } from './UserGuideModal';
import { BrandLogo } from './BrandLogo';
import { UserAvatar } from './UserAvatar';

export const Navbar: React.FC = () => {
  const {
    db,
    selectedCompanyId,
    setSelectedCompanyId,
    asOfDate,
    setAsOfDate,
    isFileConnected,
    activeFileName,
    isServerConnected,
    serverStoragePath,
    connectDiskFile,
    resetToDemoSeed,
    manualSaveDatabase,
    lastSavedAt,
  } = useApp();

  const { currentUser, logout, permissions } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showExcelGrid, setShowExcelGrid] = useState(false);
  const [showUserGuide, setShowUserGuide] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveToast, setSaveToast] = useState<{ message: string; isError?: boolean } | null>(null);

  const handleForceSave = async () => {
    setIsSaving(true);
    const res = await manualSaveDatabase();
    setIsSaving(false);
    if (res.success) {
      setSaveToast({ message: `Data Saved Successfully! (${res.timestamp})` });
      setTimeout(() => setSaveToast(null), 3500);
    } else {
      setSaveToast({ message: `Save Alert: ${res.error || 'Server error'}`, isError: true });
      setTimeout(() => setSaveToast(null), 4500);
    }
  };

  return (
    <header className="no-print bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl text-slate-800 dark:text-slate-100 border-b border-slate-200/80 dark:border-white/10 sticky top-0 z-30 shadow-xs transition-colors duration-300">
      <div className="flex items-center justify-between px-5 py-2.5">
        {/* Brand & Studio Title */}
        <BrandLogo />

        {/* Global Selectors */}
        <div className="flex items-center space-x-3">
          {/* Company Switcher */}
          <div className="relative flex items-center bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100/80 dark:hover:bg-slate-700/80 transition-colors pl-3 pr-2 py-1.5 rounded-xl border border-slate-200/90 dark:border-white/10 shadow-2xs">
            <Building2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 mr-2 shrink-0" />
            <div className="flex flex-col text-left mr-2">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 leading-none">
                Entity
              </span>
              <select
                id="company-select"
                value={selectedCompanyId}
                onChange={e => setSelectedCompanyId(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none cursor-pointer pr-4 appearance-none"
              >
                <option value="ALL" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">ALL Companies (Consolidated)</option>
                {db.companies
                  .filter(c => c.active)
                  .map(c => (
                    <option key={c.id} value={c.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                      {c.code} — {c.fullName}
                    </option>
                  ))}
              </select>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 pointer-events-none -ml-3" />
          </div>

          {/* As-Of Date Pill */}
          <div className="flex items-center bg-slate-50 dark:bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-200/90 dark:border-white/10 text-xs shadow-2xs">
            <Calendar className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 mr-2" />
            <div className="flex flex-col">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 leading-none">
                As Of
              </span>
              <input
                id="asof-date"
                type="date"
                value={asOfDate}
                onChange={e => setAsOfDate(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Right Controls: Theme Toggle, User Auth, Disk Status & Admin Reset */}
        <div className="flex items-center space-x-2">
          {/* Explicit One-Click Save Button (Persists All Modules To Disk) */}
          <button
            onClick={handleForceSave}
            disabled={isSaving}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border transition-all text-xs font-bold cursor-pointer shadow-xs active:scale-95 ${
              isSaving
                ? 'bg-amber-500 text-white border-amber-600 animate-pulse'
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white border-blue-500/40 shadow-blue-500/20'
            }`}
            title={`Explicitly save and commit all data to persistent storage. Last synchronized at: ${lastSavedAt || 'Now'}`}
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                <span className="text-[11px]">Saving...</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5 text-white" />
                <span className="text-[11px]">Save Data</span>
                {lastSavedAt && (
                  <span className="hidden lg:inline text-[9px] font-mono opacity-80 pl-1 border-l border-white/20">
                    {lastSavedAt.slice(0, 5)}
                  </span>
                )}
              </>
            )}
          </button>

          {/* Quick Excel Copy-Paste Hub Button */}
          <button
            onClick={() => setShowExcelGrid(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border transition-all text-xs font-bold cursor-pointer shadow-2xs bg-emerald-50 dark:bg-emerald-950/70 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300"
            title="Open Excel Copy-Paste & Inline Spreadsheet Editor"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-[11px]">Excel Paste & Edit</span>
          </button>

          {/* Interactive User Guide Button */}
          <button
            onClick={() => setShowUserGuide(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border transition-all text-xs font-bold cursor-pointer shadow-2xs bg-indigo-50 dark:bg-indigo-950/70 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border-indigo-300 dark:border-indigo-800 text-indigo-800 dark:text-indigo-300"
            title="Open Complete Step-by-Step User Guide with Instructions"
          >
            <BookOpen className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span className="text-[11px]">User Guide</span>
          </button>

          {/* Theme Mode Toggle Button (Image 1 & 2 inspired) */}
          <button
            onClick={toggleTheme}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border transition-all text-xs font-semibold cursor-pointer shadow-2xs bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/80 dark:hover:bg-slate-700/80 border-slate-200/90 dark:border-white/10 text-slate-700 dark:text-slate-200"
            title={isDark ? 'Switch to Luxe Soft-Glass Light Theme' : 'Switch to Cyber Glass Dark Theme'}
          >
            {isDark ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400 fill-amber-400/30" />
                <span className="text-[11px] font-bold">Light</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-indigo-600 fill-indigo-600/20" />
                <span className="text-[11px] font-bold">Dark</span>
              </>
            )}
          </button>

          {/* Current User Session Pill */}
          <div className="flex items-center bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700/80 transition-colors pl-2.5 pr-1.5 py-1 rounded-xl border border-slate-200/90 dark:border-white/10 shadow-2xs">
            <button
              onClick={() => setShowLoginModal(true)}
              className="flex items-center space-x-2 text-left cursor-pointer"
              title="Click to switch user account"
            >
              <UserAvatar size="sm" username={currentUser?.username} role={currentUser?.role} showStatus={false} />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100 leading-tight">
                  {currentUser?.username || 'Guest'}
                </span>
                <span className="text-[9px] font-semibold uppercase tracking-tight text-slate-500 dark:text-slate-400">
                  {currentUser?.role || 'Guest'}
                </span>
              </div>
            </button>

            {/* If admin, button to open User Management */}
            {permissions.canManageUsers && (
              <button
                onClick={() => setShowUserModal(true)}
                className="ml-2 p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-colors"
                title="Manage All 5 User Accounts"
              >
                <KeyRound className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Logout button */}
            <button
              onClick={logout}
              className="ml-1 p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Persistence Status Pill */}
          {isServerConnected ? (
            <div
              className="flex items-center space-x-1.5 text-xs px-2.5 py-1.5 rounded-xl border bg-emerald-50/90 dark:bg-emerald-950/60 border-emerald-300/80 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 shadow-2xs"
              title="Cloud Database Synced & Live"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-emerald-400"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="font-bold text-[11px]">Cloud Live</span>
            </div>
          ) : (
            <button
              onClick={() => connectDiskFile()}
              className={`flex items-center space-x-1.5 text-xs px-2.5 py-1.5 rounded-xl border transition-all ${
                isFileConnected
                  ? 'bg-emerald-50/80 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100/80 shadow-2xs'
                  : 'bg-amber-50/80 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 hover:bg-amber-100/80 shadow-2xs'
              }`}
              title={
                isFileConnected
                  ? `Active File: ${activeFileName}. Changes save directly to disk.`
                  : 'Click to connect local JSON file for real-time hard drive persistence.'
              }
            >
              <span className="relative flex h-2 w-2">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    isFileConnected ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                ></span>
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    isFileConnected ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                ></span>
              </span>
              <span className="font-bold text-[11px]">
                {isFileConnected ? (activeFileName ? activeFileName.slice(0, 12) + '...' : 'Disk Synced') : 'Local Cache'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Floating Save Notification Toast */}
      {saveToast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center space-x-2 px-4 py-2.5 rounded-2xl shadow-xl text-xs font-bold text-white transition-all transform animate-bounce ${
          saveToast.isError ? 'bg-rose-600 border border-rose-400' : 'bg-emerald-600 border border-emerald-400'
        }`}>
          {saveToast.isError ? (
            <span>⚠️</span>
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-200" />
          )}
          <span>{saveToast.message}</span>
        </div>
      )}

      {/* Modals */}
      <LoginModal isOpen={showLoginModal} isBlockingGate={false} onClose={() => setShowLoginModal(false)} />
      <UserManagementModal isOpen={showUserModal} onClose={() => setShowUserModal(false)} />
      <ExcelBatchGridModal isOpen={showExcelGrid} onClose={() => setShowExcelGrid(false)} />
      <UserGuideModal
        isOpen={showUserGuide}
        onClose={() => setShowUserGuide(false)}
        onOpenExcelGrid={() => {
          setShowUserGuide(false);
          setShowExcelGrid(true);
        }}
      />
    </header>
  );
};
