import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Company, BankAccount, Supplier, CurrencyMaster, MonthEndRate } from '../types';
import { downloadTemplate, parseExcelFile, exportToExcel } from '../utils/excel';
import { formatRate, formatDate } from '../utils/formatters';
import { Plus, Download, Upload, Database, Building, CreditCard, Users, DollarSign, Calendar, AlertCircle } from 'lucide-react';

type MasterTab = 'companies' | 'banks' | 'suppliers' | 'currencies' | 'rates';

export const MastersScreen: React.FC = () => {
  const {
    db,
    saveCompany,
    saveBankAccount,
    saveSupplier,
    saveCurrency,
    saveMonthEndRate,
    batchImportCompanies,
    batchImportBankAccounts,
    batchImportSuppliers,
  } = useApp();

  const [activeTab, setActiveTab] = useState<MasterTab>('companies');
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<MasterTab>('companies');
  const [editItem, setEditItem] = useState<any>(null);

  // Form states
  const [compForm, setCompForm] = useState<Partial<Company>>({
    code: '',
    fullName: '',
    gstin: '',
    iec: '',
    igcrIIN: '',
    igcrBondNo: '',
    igcrBondValueINR: 0,
    igcrNotifications: '',
    active: true,
  });
  const [bankForm, setBankForm] = useState<Partial<BankAccount>>({ companyId: db.companies[0]?.id || '', bankName: '', branch: '', accountNumber: '', adCode: '', currency: 'INR', active: true });
  const [suppForm, setSuppForm] = useState<Partial<Supplier>>({ companyId: db.companies[0]?.id || '', vendorCode: '', supplierName: '', country: 'China', defaultCurrency: 'USD', active: true });
  const [rateForm, setRateForm] = useState<Partial<MonthEndRate>>({ monthEndDate: '2026-07-31', currency: 'USD', valuationRate: 86.5 });

  // Open add modals
  const handleOpenAdd = (type: MasterTab) => {
    setModalType(type);
    setEditItem(null);
    if (type === 'companies') {
      setCompForm({
        code: '',
        fullName: '',
        gstin: '',
        iec: '',
        igcrIIN: '',
        igcrBondNo: '',
        igcrBondValueINR: 0,
        igcrNotifications: '',
        active: true,
      });
    }
    if (type === 'banks') setBankForm({ companyId: db.companies[0]?.id || '', bankName: '', branch: '', accountNumber: '', adCode: '', currency: 'INR', active: true });
    if (type === 'suppliers') setSuppForm({ companyId: db.companies[0]?.id || '', vendorCode: '', supplierName: '', country: 'China', defaultCurrency: 'USD', active: true });
    if (type === 'rates') setRateForm({ monthEndDate: '2026-07-31', currency: 'USD', valuationRate: 86.5 });
    setShowModal(true);
  };

  // Excel import handler
  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>, type: 'companies' | 'bankAccounts' | 'suppliers') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const res = await parseExcelFile(file);
    if (res.error) {
      alert(`Error reading Excel: ${res.error}`);
      return;
    }

    if (type === 'companies') {
      const parsed: Company[] = res.rows.map((r, i) => ({
        id: `COMP-IMP-${Date.now()}-${i}`,
        code: String(r['Company Code*'] || r['code'] || '').trim(),
        fullName: String(r['Full Name*'] || r['fullName'] || '').trim(),
        gstin: r['GSTIN'] || undefined,
        iec: r['IEC'] || undefined,
        active: String(r['Active (Yes/No)'] || 'Yes').toLowerCase() !== 'no',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })).filter(c => c.code && c.fullName);

      batchImportCompanies(parsed);
      alert(`Imported ${parsed.length} companies successfully.`);
    } else if (type === 'suppliers') {
      const parsed: Supplier[] = res.rows.map((r, i) => {
        const comp = db.companies.find(c => c.code.toLowerCase() === String(r['Company Code*'] || '').trim().toLowerCase()) || db.companies[0];
        return {
          id: `SUPP-IMP-${Date.now()}-${i}`,
          companyId: comp ? comp.id : db.companies[0]?.id || '',
          vendorCode: String(r['Vendor Code*'] || r['vendorCode'] || '').trim(),
          supplierName: String(r['Supplier Name*'] || r['supplierName'] || '').trim(),
          country: String(r['Country*'] || 'China').trim(),
          defaultCurrency: String(r['Default Currency*'] || 'USD').trim(),
          active: String(r['Active (Yes/No)'] || 'Yes').toLowerCase() !== 'no',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }).filter(s => s.vendorCode && s.supplierName);

      batchImportSuppliers(parsed);
      alert(`Imported ${parsed.length} suppliers successfully.`);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-base font-bold text-slate-900">Masters Management</h2>
          <p className="text-xs text-slate-500">
            Maintain Group Companies, Bank Accounts (AD Code), Suppliers (Vendor Code), Currencies & Valuation Rates
          </p>
        </div>

        {/* Tab buttons */}
        <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-lg text-xs font-semibold">
          <button
            onClick={() => setActiveTab('companies')}
            className={`px-3 py-1.5 rounded-md transition-colors ${activeTab === 'companies' ? 'bg-white text-indigo-700 shadow-2xs font-bold' : 'text-slate-600'}`}
          >
            Companies ({db.companies.length})
          </button>
          <button
            onClick={() => setActiveTab('banks')}
            className={`px-3 py-1.5 rounded-md transition-colors ${activeTab === 'banks' ? 'bg-white text-indigo-700 shadow-2xs font-bold' : 'text-slate-600'}`}
          >
            Bank Accounts ({db.bankAccounts.length})
          </button>
          <button
            onClick={() => setActiveTab('suppliers')}
            className={`px-3 py-1.5 rounded-md transition-colors ${activeTab === 'suppliers' ? 'bg-white text-indigo-700 shadow-2xs font-bold' : 'text-slate-600'}`}
          >
            Suppliers ({db.suppliers.length})
          </button>
          <button
            onClick={() => setActiveTab('rates')}
            className={`px-3 py-1.5 rounded-md transition-colors ${activeTab === 'rates' ? 'bg-white text-indigo-700 shadow-2xs font-bold' : 'text-slate-600'}`}
          >
            Month-End Rates ({db.monthEndRates.length})
          </button>
        </div>
      </div>

      {/* Main Content per tab */}
      {activeTab === 'companies' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Group Companies Master</h3>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => downloadTemplate('companies')}
                className="text-xs px-2.5 py-1 text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50"
              >
                Template
              </button>
              <label className="text-xs px-2.5 py-1 text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 cursor-pointer">
                Import Excel
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => handleExcelImport(e, 'companies')} />
              </label>
              <button
                onClick={() => handleOpenAdd('companies')}
                className="text-xs px-3 py-1 bg-indigo-600 text-white font-semibold rounded hover:bg-indigo-700"
              >
                + Add Company
              </button>
            </div>
          </div>
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100 text-slate-700 font-semibold border-b">
              <tr>
                <th className="px-4 py-2.5">Code</th>
                <th className="px-4 py-2.5">Full Legal Name</th>
                <th className="px-4 py-2.5">GSTIN</th>
                <th className="px-4 py-2.5">IEC</th>
                <th className="px-4 py-2.5">IGCR Bond / IIN</th>
                <th className="px-4 py-2.5 text-center">Status</th>
                <th className="px-4 py-2.5 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {db.companies.map(c => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-bold text-slate-900">{c.code}</td>
                  <td className="px-4 py-2.5">{c.fullName}</td>
                  <td className="px-4 py-2.5">{c.gstin || '-'}</td>
                  <td className="px-4 py-2.5">{c.iec || '-'}</td>
                  <td className="px-4 py-2.5">
                    {c.igcrIIN || c.igcrBondNo ? (
                      <div className="text-[11px]">
                        <span className="font-bold text-emerald-700">{c.igcrIIN || 'IIN'}</span>
                        {c.igcrBondValueINR ? ` • ₹${c.igcrBondValueINR.toLocaleString('en-IN')}` : ''}
                        <div className="text-[10px] text-slate-400">Bond: {c.igcrBondNo || '-'}</div>
                      </div>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`px-2 py-0.5 rounded text-[10px] ${c.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                      {c.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center space-x-2">
                    <button
                      onClick={() => {
                        setModalType('companies');
                        setEditItem(c);
                        setCompForm({ ...c });
                        setShowModal(true);
                      }}
                      className="text-slate-700 hover:text-indigo-700 font-semibold"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => saveCompany({ ...c, active: !c.active })}
                      className="text-indigo-600 hover:text-indigo-800 font-semibold"
                    >
                      {c.active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'banks' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Bank Accounts Master</h3>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => downloadTemplate('bankAccounts')}
                className="text-xs px-2.5 py-1 text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50"
              >
                Template
              </button>
              <button
                onClick={() => handleOpenAdd('banks')}
                className="text-xs px-3 py-1 bg-indigo-600 text-white font-semibold rounded hover:bg-indigo-700"
              >
                + Add Bank Account
              </button>
            </div>
          </div>
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100 text-slate-700 font-semibold border-b">
              <tr>
                <th className="px-4 py-2.5">Company</th>
                <th className="px-4 py-2.5">Bank Name & Branch</th>
                <th className="px-4 py-2.5">Account Number (Full)</th>
                <th className="px-4 py-2.5">Dropdown Display Name</th>
                <th className="px-4 py-2.5">AD Code</th>
                <th className="px-4 py-2.5 text-center">Status</th>
                <th className="px-4 py-2.5 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {db.bankAccounts.map(b => {
                const comp = db.companies.find(c => c.id === b.companyId);
                return (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-bold text-slate-900">{comp?.code}</td>
                    <td className="px-4 py-2.5 font-semibold text-slate-900">{b.bankName} ({b.branch})</td>
                    <td className="px-4 py-2.5 font-mono">•••• {b.accountNumber.slice(-4)}</td>
                    <td className="px-4 py-2.5 font-bold text-indigo-700">{b.bankName} - {b.accountNumber.slice(-4)}</td>
                    <td className="px-4 py-2.5">{b.adCode || '-'}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] ${b.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                        {b.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <button
                        onClick={() => saveBankAccount({ ...b, active: !b.active })}
                        className="text-indigo-600 hover:text-indigo-800 font-semibold"
                      >
                        {b.active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'suppliers' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Suppliers Master</h3>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => downloadTemplate('suppliers')}
                className="text-xs px-2.5 py-1 text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50"
              >
                Template
              </button>
              <label className="text-xs px-2.5 py-1 text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 cursor-pointer">
                Import Excel
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => handleExcelImport(e, 'suppliers')} />
              </label>
              <button
                onClick={() => handleOpenAdd('suppliers')}
                className="text-xs px-3 py-1 bg-indigo-600 text-white font-semibold rounded hover:bg-indigo-700"
              >
                + Add Supplier
              </button>
            </div>
          </div>
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100 text-slate-700 font-semibold border-b">
              <tr>
                <th className="px-4 py-2.5">Company</th>
                <th className="px-4 py-2.5">Vendor Code</th>
                <th className="px-4 py-2.5">Supplier Name</th>
                <th className="px-4 py-2.5">Country</th>
                <th className="px-4 py-2.5">Default Currency</th>
                <th className="px-4 py-2.5 text-center">Status</th>
                <th className="px-4 py-2.5 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {db.suppliers.map(s => {
                const comp = db.companies.find(c => c.id === s.companyId);
                return (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-bold text-slate-900">{comp?.code}</td>
                    <td className="px-4 py-2.5 font-bold text-indigo-700">{s.vendorCode}</td>
                    <td className="px-4 py-2.5 font-semibold text-slate-900">{s.supplierName}</td>
                    <td className="px-4 py-2.5">{s.country}</td>
                    <td className="px-4 py-2.5 font-bold">{s.defaultCurrency}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] ${s.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                        {s.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <button
                        onClick={() => saveSupplier({ ...s, active: !s.active })}
                        className="text-indigo-600 hover:text-indigo-800 font-semibold"
                      >
                        {s.active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'rates' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Month-End Valuation Rates Master</h3>
            <button
              onClick={() => handleOpenAdd('rates')}
              className="text-xs px-3 py-1 bg-indigo-600 text-white font-semibold rounded hover:bg-indigo-700"
            >
              + Add Month-End Rate
            </button>
          </div>
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100 text-slate-700 font-semibold border-b">
              <tr>
                <th className="px-4 py-2.5">Month End Date</th>
                <th className="px-4 py-2.5">Currency</th>
                <th className="px-4 py-2.5 text-right font-bold">Valuation Rate (INR)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {db.monthEndRates.map(r => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-bold text-slate-900">{formatDate(r.monthEndDate)}</td>
                  <td className="px-4 py-2.5 font-semibold text-indigo-700">{r.currency}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-slate-900">{formatRate(r.valuationRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">
              {editItem ? `Edit ${modalType.slice(0, -1).toUpperCase()}` : `Add New ${modalType.slice(0, -1).toUpperCase()}`}
            </h3>

            {modalType === 'companies' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Company Code *</label>
                  <input
                    type="text"
                    value={compForm.code}
                    onChange={e => setCompForm({ ...compForm, code: e.target.value })}
                    placeholder="e.g. Sakar"
                    className="w-full text-xs p-2 rounded border border-slate-300 uppercase font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Full Legal Name *</label>
                  <input
                    type="text"
                    value={compForm.fullName}
                    onChange={e => setCompForm({ ...compForm, fullName: e.target.value })}
                    placeholder="e.g. Sakar Electricals & Electronics Pvt Ltd"
                    className="w-full text-xs p-2 rounded border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">GSTIN</label>
                  <input
                    type="text"
                    value={compForm.gstin || ''}
                    onChange={e => setCompForm({ ...compForm, gstin: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">IEC</label>
                  <input
                    type="text"
                    value={compForm.iec || ''}
                    onChange={e => setCompForm({ ...compForm, iec: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-slate-300"
                  />
                </div>
                <div className="pt-2 border-t grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">IGCR IIN</label>
                    <input
                      type="text"
                      value={compForm.igcrIIN || ''}
                      onChange={e => setCompForm({ ...compForm, igcrIIN: e.target.value })}
                      placeholder="e.g. IIN2026..."
                      className="w-full text-xs p-2 rounded border border-slate-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">IGCR Bond No</label>
                    <input
                      type="text"
                      value={compForm.igcrBondNo || ''}
                      onChange={e => setCompForm({ ...compForm, igcrBondNo: e.target.value })}
                      placeholder="Continuity Bond"
                      className="w-full text-xs p-2 rounded border border-slate-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">IGCR Bond Value (INR)</label>
                    <input
                      type="number"
                      value={compForm.igcrBondValueINR || ''}
                      onChange={e => setCompForm({ ...compForm, igcrBondValueINR: parseFloat(e.target.value) || 0 })}
                      className="w-full text-xs p-2 rounded border border-slate-300 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">IGCR Notifications</label>
                    <input
                      type="text"
                      value={compForm.igcrNotifications || ''}
                      onChange={e => setCompForm({ ...compForm, igcrNotifications: e.target.value })}
                      placeholder="e.g. 50/2017-Cus"
                      className="w-full text-xs p-2 rounded border border-slate-300"
                    />
                  </div>
                </div>
              </div>
            )}

            {modalType === 'banks' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Company *</label>
                  <select
                    value={bankForm.companyId}
                    onChange={e => setBankForm({ ...bankForm, companyId: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-slate-300 bg-white"
                  >
                    {db.companies.map(c => (
                      <option key={c.id} value={c.id}>{c.code}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Bank Name *</label>
                  <input
                    type="text"
                    value={bankForm.bankName}
                    onChange={e => setBankForm({ ...bankForm, bankName: e.target.value })}
                    placeholder="e.g. HDFC Bank"
                    className="w-full text-xs p-2 rounded border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Branch *</label>
                  <input
                    type="text"
                    value={bankForm.branch}
                    onChange={e => setBankForm({ ...bankForm, branch: e.target.value })}
                    placeholder="e.g. Andheri East"
                    className="w-full text-xs p-2 rounded border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Account Number *</label>
                  <input
                    type="text"
                    value={bankForm.accountNumber}
                    onChange={e => setBankForm({ ...bankForm, accountNumber: e.target.value })}
                    placeholder="Full account number"
                    className="w-full text-xs p-2 rounded border border-slate-300 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">AD Code</label>
                  <input
                    type="text"
                    value={bankForm.adCode || ''}
                    onChange={e => setBankForm({ ...bankForm, adCode: e.target.value })}
                    placeholder="e.g. 0510012"
                    className="w-full text-xs p-2 rounded border border-slate-300"
                  />
                </div>
              </div>
            )}

            {modalType === 'suppliers' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Company *</label>
                  <select
                    value={suppForm.companyId}
                    onChange={e => setSuppForm({ ...suppForm, companyId: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-slate-300 bg-white"
                  >
                    {db.companies.map(c => (
                      <option key={c.id} value={c.id}>{c.code}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Vendor Code *</label>
                  <input
                    type="text"
                    value={suppForm.vendorCode}
                    onChange={e => setSuppForm({ ...suppForm, vendorCode: e.target.value })}
                    placeholder="e.g. V00088"
                    className="w-full text-xs p-2 rounded border border-slate-300 uppercase font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Supplier Name *</label>
                  <input
                    type="text"
                    value={suppForm.supplierName}
                    onChange={e => setSuppForm({ ...suppForm, supplierName: e.target.value })}
                    placeholder="Full company name"
                    className="w-full text-xs p-2 rounded border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Country *</label>
                  <input
                    type="text"
                    value={suppForm.country}
                    onChange={e => setSuppForm({ ...suppForm, country: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Default Currency *</label>
                  <select
                    value={suppForm.defaultCurrency}
                    onChange={e => setSuppForm({ ...suppForm, defaultCurrency: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-slate-300 bg-white"
                  >
                    {db.currencies.map(c => (
                      <option key={c.code} value={c.code}>{c.code}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {modalType === 'rates' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Month End Date *</label>
                  <input
                    type="date"
                    value={rateForm.monthEndDate}
                    onChange={e => setRateForm({ ...rateForm, monthEndDate: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Currency *</label>
                  <select
                    value={rateForm.currency}
                    onChange={e => setRateForm({ ...rateForm, currency: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-slate-300 bg-white"
                  >
                    {db.currencies.map(c => (
                      <option key={c.code} value={c.code}>{c.code}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Valuation Rate INR *</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={rateForm.valuationRate}
                    onChange={e => setRateForm({ ...rateForm, valuationRate: parseFloat(e.target.value) || 0 })}
                    className="w-full text-xs p-2 rounded border border-slate-300 font-bold"
                  />
                </div>
              </div>
            )}

            <div className="pt-4 border-t flex justify-end space-x-2">
              <button
                onClick={() => setShowModal(false)}
                className="px-3 py-1.5 text-xs text-slate-600 bg-slate-100 rounded hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (modalType === 'companies') {
                    if (!compForm.code || !compForm.fullName) return;
                    saveCompany({
                      id: editItem ? editItem.id : `COMP-${Date.now()}`,
                      code: compForm.code.trim(),
                      fullName: compForm.fullName.trim(),
                      gstin: compForm.gstin,
                      iec: compForm.iec,
                      igcrIIN: compForm.igcrIIN,
                      igcrBondNo: compForm.igcrBondNo,
                      igcrBondValueINR: Number(compForm.igcrBondValueINR || 0),
                      igcrNotifications: compForm.igcrNotifications,
                      active: editItem ? Boolean(editItem.active) : true,
                      createdAt: editItem?.createdAt || new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    });
                  } else if (modalType === 'banks') {
                    if (!bankForm.bankName || !bankForm.accountNumber) return;
                    saveBankAccount({
                      id: `BANK-${Date.now()}`,
                      companyId: bankForm.companyId!,
                      bankName: bankForm.bankName.trim(),
                      branch: bankForm.branch || 'Main',
                      accountNumber: bankForm.accountNumber.trim(),
                      adCode: bankForm.adCode,
                      currency: 'INR',
                      active: true,
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    });
                  } else if (modalType === 'suppliers') {
                    if (!suppForm.vendorCode || !suppForm.supplierName) return;
                    saveSupplier({
                      id: `SUPP-${Date.now()}`,
                      companyId: suppForm.companyId!,
                      vendorCode: suppForm.vendorCode.trim(),
                      supplierName: suppForm.supplierName.trim(),
                      country: suppForm.country || 'China',
                      defaultCurrency: suppForm.defaultCurrency || 'USD',
                      active: true,
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    });
                  } else if (modalType === 'rates') {
                    if (!rateForm.valuationRate) return;
                    saveMonthEndRate({
                      id: `RATE-${rateForm.monthEndDate}-${rateForm.currency}`,
                      monthEndDate: rateForm.monthEndDate!,
                      currency: rateForm.currency || 'USD',
                      valuationRate: Number(rateForm.valuationRate),
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    });
                  }
                  setShowModal(false);
                }}
                className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 rounded hover:bg-indigo-700"
              >
                Save Master
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
