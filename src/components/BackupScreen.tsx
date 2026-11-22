import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatDate } from '../utils/formatters';
import {
  HardDrive,
  Download,
  Upload,
  FileSpreadsheet,
  RotateCcw,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  History,
  FileText,
} from 'lucide-react';

export const BackupScreen: React.FC = () => {
  const {
    db,
    isFileConnected,
    activeFileName,
    isServerConnected,
    serverStoragePath,
    connectDiskFile,
    createNewDiskFile,
    downloadBackup,
    restoreBackup,
    exportAllExcel,
    autoBackups,
    restoreFromAutoBackup,
  } = useApp();

  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm(`Are you sure you want to restore the entire database from "${file.name}"? Current data will be safely backed up first.`)) {
      return;
    }

    const res = await restoreBackup(file);
    if (res.success) {
      setRestoreStatus(`Successfully restored database from ${file.name}.`);
    } else {
      setRestoreStatus(`Restore failed: ${res.error}`);
    }
  };

  const handleAutoRestore = async (key: string, timestamp: string) => {
    if (!window.confirm(`Restore database to the snapshot taken on ${timestamp}?`)) {
      return;
    }
    const ok = await restoreFromAutoBackup(key);
    if (ok) {
      setRestoreStatus(`Successfully restored database from snapshot ${timestamp}.`);
    } else {
      setRestoreStatus(`Failed to restore snapshot.`);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-base font-bold text-slate-900">Data Storage, File Sync & Backups</h2>
        <p className="text-xs text-slate-500">
          Persistent local file storage via File System Access API, automated daily snapshots (last 60 kept), manual JSON backups & full Excel workbooks
        </p>
      </div>

      {restoreStatus && (
        <div className="p-3 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-lg text-xs font-semibold flex items-center justify-between">
          <span>{restoreStatus}</span>
          <button onClick={() => setRestoreStatus(null)} className="text-indigo-600 hover:text-indigo-900">✕</button>
        </div>
      )}

      {/* Grid: 3 Main Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Disk File Synchronization */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-2 text-indigo-600">
              <HardDrive className="w-5 h-5" />
              <h3 className="text-sm font-bold text-slate-900">Disk File Connection</h3>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Connect directly to a JSON database file on your local hard drive. Any change made in the app is immediately written straight to your chosen file.
            </p>

            <div className={`mt-4 p-3 rounded-lg border text-xs ${
              isServerConnected || isFileConnected
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                : 'bg-amber-50 border-amber-300 text-amber-800'
            }`}>
              <div className="flex items-center space-x-2 font-bold">
                {isServerConnected || isFileConnected ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-amber-600" />}
                <span>
                  {isServerConnected
                    ? 'Server Disk Persistence Active'
                    : isFileConnected
                      ? 'Connected to Disk File'
                      : 'No Disk File Connected'}
                </span>
              </div>
              <p className="mt-1 text-[11px] font-mono break-all">
                {isServerConnected
                  ? (serverStoragePath || 'F:\\Import Payment management\\data\\ipc-database.json')
                  : isFileConnected
                    ? `Active File: ${activeFileName}`
                    : 'Currently operating on encrypted browser cache. Connect a file or run server.mjs.'}
              </p>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <button
              onClick={() => connectDiskFile()}
              className="w-full py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-lg shadow-sm transition-colors"
            >
              Connect Existing JSON File
            </button>
            <button
              onClick={() => createNewDiskFile()}
              className="w-full py-2 px-3 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-xs rounded-lg border border-slate-300 shadow-2xs transition-colors"
            >
              Create New JSON File on Disk
            </button>
          </div>
        </div>

        {/* Card 2: Manual Backup & Restore */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-2 text-indigo-600">
              <ShieldCheck className="w-5 h-5" />
              <h3 className="text-sm font-bold text-slate-900">Manual JSON Backup & Restore</h3>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Download complete database snapshots as standalone JSON files, or upload a backup file to restore full system state.
            </p>

            <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 space-y-1">
              <div><strong>Version:</strong> {db.version}</div>
              <div><strong>Last Updated:</strong> {new Date(db.lastUpdated).toLocaleString()}</div>
              <div><strong>Audit Trail:</strong> {db.auditLogs.length} logged events</div>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <button
              onClick={downloadBackup}
              className="w-full flex items-center justify-center space-x-1.5 py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-lg shadow-sm transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download JSON Backup</span>
            </button>

            <label className="w-full flex items-center justify-center space-x-1.5 py-2 px-3 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-xs rounded-lg border border-slate-300 shadow-2xs transition-colors cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>Restore from JSON File</span>
              <input type="file" accept=".json" className="hidden" onChange={handleFileUpload} />
            </label>
          </div>
        </div>

        {/* Card 3: Full Multi-Sheet Excel Export */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-2 text-emerald-600">
              <FileSpreadsheet className="w-5 h-5" />
              <h3 className="text-sm font-bold text-slate-900">Full System Excel Export</h3>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Export every single table (Companies, Banks, Suppliers, PIs, CIs, BOE submissions, Payments, Debit Notes, and Audit Logs) into one consolidated, formatted Excel (.xlsx) workbook.
            </p>

            <div className="mt-4 p-3 bg-emerald-50/60 border border-emerald-200 rounded-lg text-xs text-emerald-900 space-y-1">
              <div>• Instant audit verification</div>
              <div>• Complete offline spreadsheet archiving</div>
              <div>• Formatted column widths & number formats</div>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={exportAllExcel}
              className="w-full flex items-center justify-center space-x-1.5 py-2.5 px-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-lg shadow-sm transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Export Full Excel Archive</span>
            </button>
          </div>
        </div>
      </div>

      {/* Auto Backup History Table (keeps last 60) */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-2">
            <History className="w-4 h-4 text-indigo-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Auto-Backup Snapshots (Last {autoBackups.length} Available)
            </h3>
          </div>
          <span className="text-xs text-slate-500">Auto-created daily and before every import</span>
        </div>

        <div className="overflow-x-auto max-h-64">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100 text-slate-700 font-semibold border-b sticky top-0">
              <tr>
                <th className="px-4 py-2">Snapshot Timestamp</th>
                <th className="px-4 py-2">Trigger Reason</th>
                <th className="px-4 py-2 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {autoBackups.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-slate-400">
                    No snapshots stored yet. Auto-snapshots are created on every change and import.
                  </td>
                </tr>
              ) : (
                autoBackups.map((b, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-mono text-slate-800">{b.timestamp}</td>
                    <td className="px-4 py-2 text-slate-600">{b.reason}</td>
                    <td className="px-4 py-2 text-center">
                      <button
                        onClick={() => handleAutoRestore(b.key, b.timestamp)}
                        className="px-2.5 py-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 rounded border border-indigo-200"
                      >
                        Restore Snapshot
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Audit Trail Viewer */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-2">
            <FileText className="w-4 h-4 text-indigo-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Audit Trail & Change Log ({db.auditLogs.length} Events)
            </h3>
          </div>
          <span className="text-xs text-slate-500">Chronological history of all data operations</span>
        </div>

        <div className="overflow-x-auto max-h-64">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100 text-slate-700 font-semibold border-b sticky top-0">
              <tr>
                <th className="px-4 py-2">Timestamp</th>
                <th className="px-4 py-2">User</th>
                <th className="px-4 py-2">Action</th>
                <th className="px-4 py-2">Entity</th>
                <th className="px-4 py-2">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {db.auditLogs.slice(0, 50).map(log => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 text-slate-500 font-mono">{new Date(log.timestamp).toLocaleString()}</td>
                  <td className="px-4 py-2 font-semibold text-slate-800">{log.user}</td>
                  <td className="px-4 py-2">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-bold text-indigo-700">{log.entity}</td>
                  <td className="px-4 py-2 text-slate-700">{log.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
