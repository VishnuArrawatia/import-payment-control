import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { AppSettings } from '../types';
import { Settings as SettingsIcon, Save, CheckCircle2 } from 'lucide-react';

export const SettingsScreen: React.FC = () => {
  const { db, saveSettings } = useApp();
  const [settings, setSettings] = useState<AppSettings>({ ...db.settings });
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveSettings(settings);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-base font-bold text-slate-900">Application Configuration & Accounting Rules</h2>
        <p className="text-xs text-slate-500">
          Configure financial year boundaries, ageing calculation methods, and month-end foreign exchange valuation policies
        </p>
      </div>

      <form onSubmit={handleSave} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-6">
        {savedSuccess && (
          <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-lg text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Settings saved successfully.</span>
          </div>
        )}

        {/* Section: Ageing Policy */}
        <div className="space-y-4">
          <h3 className="text-xs font-bold text-indigo-900 uppercase tracking-wider border-b pb-2">
            Ageing Calculation Rules
          </h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ageing Base Date for Payables (Cr)
              </label>
              <select
                value={settings.ageingBaseDateForPayables}
                onChange={e => setSettings({ ...settings, ageingBaseDateForPayables: e.target.value as any })}
                className="w-full text-xs p-2 rounded border border-slate-300 bg-white"
              >
                <option value="boeDate">BOE Date (Customs Clearance Date - Recommended)</option>
                <option value="ciDate">Commercial Invoice (CI) Date</option>
              </select>
              <span className="text-[11px] text-slate-400 block mt-1">
                Controls the starting point for calculating age of unpaid supplier bills.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Revalue Advances at Month-End?
              </label>
              <select
                value={settings.revalueAdvancesAtMonthEnd ? 'Yes' : 'No'}
                onChange={e => setSettings({ ...settings, revalueAdvancesAtMonthEnd: e.target.value === 'Yes' })}
                className="w-full text-xs p-2 rounded border border-slate-300 bg-white"
              >
                <option value="No">No (Default - AS 11 / Ind AS 21 non-monetary advance rule)</option>
                <option value="Yes">Yes (Revalue open advance remittances at month-end valuation rate)</option>
              </select>
              <span className="text-[11px] text-slate-400 block mt-1">
                Under standard Indian accounting, advances paid for goods are treated as non-monetary assets and kept at transaction rate.
              </span>
            </div>
          </div>
        </div>

        {/* Section: Debit Note & Recovery Defaults */}
        <div className="space-y-4">
          <h3 className="text-xs font-bold text-indigo-900 uppercase tracking-wider border-b pb-2">
            Debit Note & Recovery Defaults
          </h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Default Debit Note Recovery Method
              </label>
              <select
                value={settings.dnDefaultRecoveryMethod}
                onChange={e => setSettings({ ...settings, dnDefaultRecoveryMethod: e.target.value as any })}
                className="w-full text-xs p-2 rounded border border-slate-300 bg-white"
              >
                <option value="Refund">Refund (Telegraphic Transfer back to bank)</option>
                <option value="Adjust against another PI or CI">Adjust against another PI or CI</option>
                <option value="Write-off">Write-off</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Financial Year Start Month
              </label>
              <select
                value={settings.financialYearStartMonth}
                onChange={e => setSettings({ ...settings, financialYearStartMonth: parseInt(e.target.value) })}
                className="w-full text-xs p-2 rounded border border-slate-300 bg-white"
              >
                <option value={4}>1st April (Indian Financial Year standard)</option>
                <option value={1}>1st January (Calendar Year)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Save button */}
        <div className="pt-4 border-t flex justify-end">
          <button
            type="submit"
            className="flex items-center space-x-1 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg shadow-sm"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Settings</span>
          </button>
        </div>
      </form>
    </div>
  );
};
