import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, KeyRound, CheckCircle2, AlertCircle } from 'lucide-react';

interface UserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UserManagementModal: React.FC<UserManagementModalProps> = ({ isOpen, onClose }) => {
  const { users, currentUser, updateUserPassword } = useAuth();
  const [selectedUserId, setSelectedUserId] = useState<string>(users[0]?.id || '');
  const [newPassword, setNewPassword] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    if (!newPassword || newPassword.length < 6) {
      setStatusMsg({ type: 'error', text: 'Password must be at least 6 characters.' });
      return;
    }

    const res = await updateUserPassword(selectedUserId, newPassword);
    if (res.success) {
      setStatusMsg({ type: 'success', text: 'Password updated and securely re-hashed successfully.' });
      setNewPassword('');
    } else {
      setStatusMsg({ type: 'error', text: res.error || 'Failed to update password.' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="p-6 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/20">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">
                User Security & Access Control
              </h3>
              <p className="text-xs text-slate-500">Manage Active Roles: Admin, Management, Executors &amp; Purchase</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 font-bold text-sm p-1">
            ✕
          </button>
        </div>

        <div className="p-6 space-y-6">
          {statusMsg && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
                statusMsg.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border-rose-200'
              }`}
            >
              {statusMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <span>{statusMsg.text}</span>
            </div>
          )}

          {/* Users Table */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[10px] border-b">
                <tr>
                  <th className="px-4 py-2.5">Username</th>
                  <th className="px-4 py-2.5">Display Name</th>
                  <th className="px-4 py-2.5">Role</th>
                  <th className="px-4 py-2.5">Access Scope</th>
                  <th className="px-4 py-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {users.map(u => {
                  let badge = 'bg-slate-100 text-slate-700';
                  let scope = 'Transaction Operations (PI, CI, Payment, DN, BOE)';
                  if (u.role === 'admin') {
                    badge = 'bg-indigo-50 text-indigo-800 border border-indigo-200 font-bold';
                    scope = 'Full System Access & Configurations';
                  } else if (u.role === 'management') {
                    badge = 'bg-amber-50 text-amber-800 border border-amber-200 font-bold';
                    scope = 'Executive Reporting & FX Valuations (Read-only)';
                  } else if (u.role === 'purchase') {
                    badge = 'bg-sky-50 text-sky-800 border border-sky-200 font-bold';
                    scope = 'Purchase Desk Only (Items, Requisitions, PI, Shipments, Receipts — No Bank/Payment Access)';
                  }

                  return (
                    <tr key={u.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-2.5 font-bold font-mono text-slate-900">{u.username}</td>
                      <td className="px-4 py-2.5">{u.displayName}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] ${badge}`}>{u.role}</span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 text-[11px]">{scope}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                          Active
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Change Password Section */}
          <form onSubmit={handlePasswordChange} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center space-x-2 text-xs font-bold text-slate-800 border-b pb-2">
              <KeyRound className="w-4 h-4 text-indigo-600" />
              <span>Change User Password (SHA-256 Re-hash)</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Select User</label>
                <select
                  value={selectedUserId}
                  onChange={e => setSelectedUserId(e.target.value)}
                  className="w-full text-xs p-2 rounded-xl border border-slate-300 bg-white"
                >
                  {users.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.username} ({u.displayName})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Enter new secure password"
                  className="w-full text-xs p-2 rounded-xl border border-slate-300 bg-white font-mono"
                  required
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs"
              >
                Update Password
              </button>
            </div>
          </form>
        </div>

        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-100"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
