import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { DebitNote, DebitNoteReason, DebitNoteRecoveryMethod } from '../types';
import { formatFC, formatINR, formatDate, formatRate } from '../utils/formatters';
import { exportToExcel } from '../utils/excel';
import { Plus, Download, AlertCircle, ArrowRight, CheckCircle2, Copy, FileMinus, Sparkles } from 'lucide-react';

export const DebitNotesScreen: React.FC = () => {
  const { db, engineResult, selectedCompanyId, saveDebitNote } = useApp();
  const { permissions } = useAuth();

  const [showModal, setShowModal] = useState(false);
  const [editingDN, setEditingDN] = useState<DebitNote | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<DebitNote>>({
    companyId: selectedCompanyId !== 'ALL' ? selectedCompanyId : db.companies[0]?.id || '',
    supplierId: db.suppliers[0]?.id || '',
    currency: 'USD',
    dnNo: '',
    dnDate: new Date().toISOString().split('T')[0],
    linkedPiId: '',
    linkedCiId: '',
    amountFC: 0,
    rate: 86.5,
    inrAmount: 0,
    reason: 'Short shipment',
    recoveryMethod: 'Refund',
    status: 'Open',
    remarks: '',
  });

  const activeSuppliers = db.suppliers.filter(
    s => s.active && (!formData.companyId || s.companyId === formData.companyId)
  );

  const availablePIs = db.proformaInvoices.filter(
    p => p.companyId === formData.companyId && p.supplierId === formData.supplierId && p.currency === formData.currency
  );

  const availableCIs = db.commercialInvoices.filter(
    c => c.companyId === formData.companyId && c.supplierId === formData.supplierId && c.currency === formData.currency
  );

  const handleOpenAdd = () => {
    setEditingDN(null);
    setErrorMsg(null);
    const compId = selectedCompanyId !== 'ALL' ? selectedCompanyId : db.companies[0]?.id || '';
    const supp = db.suppliers.find(s => s.companyId === compId && s.active);

    setFormData({
      companyId: compId,
      supplierId: supp?.id || '',
      currency: supp?.defaultCurrency || 'USD',
      dnNo: `DN-${Date.now().toString().slice(-4)}`,
      dnDate: new Date().toISOString().split('T')[0],
      linkedPiId: '',
      linkedCiId: '',
      amountFC: 0,
      rate: 86.5,
      inrAmount: 0,
      reason: 'Short shipment',
      recoveryMethod: 'Refund',
      status: 'Open',
      remarks: '',
    });
    setShowModal(true);
  };

  // One-click create from suggestion
  const handleAcceptSuggestion = (s: typeof engineResult.suggestedDebitNotes[0]) => {
    setEditingDN(null);
    setErrorMsg(null);
    setFormData({
      companyId: s.companyId,
      supplierId: s.supplierId,
      currency: s.currency,
      dnNo: `DN-${Date.now().toString().slice(-4)}`,
      dnDate: new Date().toISOString().split('T')[0],
      linkedPiId: s.piId,
      linkedCiId: s.ciId || '',
      amountFC: s.excessFC,
      rate: s.recommendedRate,
      inrAmount: s.recommendedINR,
      reason: 'Short shipment',
      recoveryMethod: 'Refund',
      status: 'Open',
      remarks: `Auto-suggested for excess payment on PI (Payment rate: ${s.recommendedRate})`,
    });
    setShowModal(true);
  };

  const handleEdit = (dn: DebitNote) => {
    setEditingDN(dn);
    setErrorMsg(null);
    setFormData({ ...dn });
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.companyId || !formData.supplierId || !formData.dnNo || !formData.amountFC || formData.amountFC <= 0) {
      setErrorMsg('Please fill mandatory fields (Company, Supplier, DN No, Amount FC > 0).');
      return;
    }
    if (!formData.rate || formData.rate <= 0) {
      setErrorMsg('Exchange rate must be greater than 0.');
      return;
    }

    const inr = Math.round(Number(formData.amountFC) * Number(formData.rate));

    const payload: DebitNote = {
      id: editingDN ? editingDN.id : `DN-${Date.now()}`,
      companyId: formData.companyId!,
      supplierId: formData.supplierId!,
      currency: formData.currency || 'USD',
      dnNo: formData.dnNo.trim(),
      dnDate: formData.dnDate || new Date().toISOString().split('T')[0],
      linkedPiId: formData.linkedPiId || undefined,
      linkedCiId: formData.linkedCiId || undefined,
      amountFC: Number(formData.amountFC),
      rate: Number(formData.rate),
      inrAmount: inr,
      reason: (formData.reason as DebitNoteReason) || 'Short shipment',
      recoveryMethod: (formData.recoveryMethod as DebitNoteRecoveryMethod) || 'Refund',
      status: editingDN?.status || 'Open',
      recoveredFC: editingDN?.recoveredFC || 0,
      remarks: formData.remarks || undefined,
      createdAt: editingDN?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const res = saveDebitNote(payload);
    if (!res.success) {
      setErrorMsg(res.error || 'Failed to save Debit Note.');
      return;
    }

    setShowModal(false);
  };

  // Filtered Debit Notes
  const filteredDNs = db.debitNotes.filter(
    d => selectedCompanyId === 'ALL' || d.companyId === selectedCompanyId
  );

  const handleExport = () => {
    const data = filteredDNs.map(dn => {
      const comp = db.companies.find(c => c.id === dn.companyId);
      const supp = db.suppliers.find(s => s.id === dn.supplierId);
      const pi = db.proformaInvoices.find(p => p.id === dn.linkedPiId);
      const ci = db.commercialInvoices.find(c => c.id === dn.linkedCiId);
      return {
        Company: comp?.code,
        Supplier: supp?.supplierName,
        'DN No': dn.dnNo,
        'DN Date': formatDate(dn.dnDate),
        Currency: dn.currency,
        'Amount FC': dn.amountFC,
        'Exchange Rate': dn.rate,
        'Amount INR': dn.inrAmount,
        'Recovered FC': dn.recoveredFC || 0,
        Status: dn.status,
        Reason: dn.reason,
        'Recovery Method': dn.recoveryMethod,
        'Linked PI': pi?.piNo || '-',
        'Linked CI': ci?.ciNo || '-',
        Remarks: dn.remarks || '',
      };
    });
    exportToExcel(data, 'Debit_Note_Register');
  };

  return (
    <div className="p-6 space-y-6">
      {/* Suggestions Box if any */}
      {engineResult.suggestedDebitNotes.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 shadow-sm space-y-3">
          <div className="flex items-center space-x-2 text-amber-900 font-bold text-sm">
            <Sparkles className="w-5 h-5 text-amber-600 animate-spin" />
            <span>Smart System Suggestions: Excess Payment / Short Shipment Detected</span>
          </div>
          <p className="text-xs text-amber-800">
            The following Proforma Invoices are closed or completed where remittances exceed the shipped value. Create debit notes at original payment rate to protect group company balances:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {engineResult.suggestedDebitNotes.map((s, idx) => {
              const comp = db.companies.find(c => c.id === s.companyId);
              const supp = db.suppliers.find(x => x.id === s.supplierId);
              const pi = db.proformaInvoices.find(p => p.id === s.piId);
              return (
                <div key={idx} className="bg-white p-3 rounded-lg border border-amber-200 flex items-center justify-between shadow-2xs">
                  <div>
                    <div className="font-bold text-xs text-slate-900">
                      {comp?.code} • {supp?.supplierName}
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5">
                      PI: <strong>{pi?.piNo}</strong> | Excess: <strong className="text-amber-800">{formatFC(s.excessFC)} {s.currency}</strong>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      FIFO Rate: {formatRate(s.recommendedRate)} | INR: {formatINR(s.recommendedINR, 0, true)}
                    </div>
                  </div>
                  {permissions.canIssueDebitNote && (
                    <button
                      onClick={() => handleAcceptSuggestion(s)}
                      className="flex items-center space-x-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs rounded-lg shadow-sm"
                    >
                      <span>Create DN</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Action Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-base font-bold text-slate-900">Debit Notes Register</h2>
          <p className="text-xs text-slate-500">
            Recover excess remittances, short shipments, and rate differences at FIFO payment exchange rates
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleExport}
            className="flex items-center space-x-1 text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg border border-slate-300"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel</span>
          </button>

          {permissions.canIssueDebitNote ? (
            <button
              onClick={handleOpenAdd}
              className="flex items-center space-x-1 text-xs px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Issue Debit Note</span>
            </button>
          ) : (
            <span className="text-[11px] font-semibold px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg">
              Read-Only Access
            </span>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-100 text-slate-700 font-semibold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-3 py-2.5">Company</th>
                <th className="px-3 py-2.5">Supplier</th>
                <th className="px-3 py-2.5">DN No & Date</th>
                <th className="px-3 py-2.5">Against PI / CI</th>
                <th className="px-3 py-2.5 text-right">Amount FC</th>
                <th className="px-3 py-2.5 text-right">Rate</th>
                <th className="px-3 py-2.5 text-right">Amount INR</th>
                <th className="px-3 py-2.5 text-right text-emerald-800">Recovered FC</th>
                <th className="px-3 py-2.5">Reason</th>
                <th className="px-3 py-2.5">Recovery Method</th>
                <th className="px-3 py-2.5 text-center">Status</th>
                <th className="px-3 py-2.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredDNs.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-slate-400">
                    No Debit Notes recorded yet.
                  </td>
                </tr>
              ) : (
                filteredDNs.map(dn => {
                  const comp = db.companies.find(c => c.id === dn.companyId);
                  const supp = db.suppliers.find(s => s.id === dn.supplierId);
                  const pi = db.proformaInvoices.find(p => p.id === dn.linkedPiId);
                  const ci = db.commercialInvoices.find(c => c.id === dn.linkedCiId);

                  let statusBadge = 'bg-slate-100 text-slate-700';
                  if (dn.status === 'Fully Recovered') statusBadge = 'bg-emerald-100 text-emerald-800 font-bold';
                  else if (dn.status === 'Partially Recovered') statusBadge = 'bg-sky-100 text-sky-800 font-semibold';
                  else if (dn.status === 'Written Off') statusBadge = 'bg-slate-200 text-slate-600';
                  else statusBadge = 'bg-amber-100 text-amber-900 font-bold';

                  return (
                    <tr key={dn.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-3 py-2.5 font-bold text-slate-900">{comp?.code}</td>
                      <td className="px-3 py-2.5 font-semibold text-slate-900">{supp?.supplierName}</td>
                      <td className="px-3 py-2.5">
                        <div className="font-bold text-indigo-600">{dn.dnNo}</div>
                        <div className="text-slate-400">{formatDate(dn.dnDate)}</div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">
                        {pi?.piNo || '-'} {ci?.ciNo ? `/ ${ci.ciNo}` : ''}
                      </td>
                      <td className="px-3 py-2.5 text-right font-extrabold text-slate-900">
                        {formatFC(dn.amountFC)} <span className="text-[10px] text-slate-500 font-normal">{dn.currency}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium">{formatRate(dn.rate)}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-900">{formatINR(dn.inrAmount)}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-emerald-700">
                        {formatFC(dn.recoveredFC)}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">{dn.reason}</td>
                      <td className="px-3 py-2.5 text-slate-600 font-medium">{dn.recoveryMethod}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] ${statusBadge}`}>
                          {dn.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {permissions.canIssueDebitNote ? (
                          <button
                            onClick={() => handleEdit(dn)}
                            className="px-2 py-1 text-indigo-600 hover:text-indigo-800 font-semibold"
                          >
                            Edit
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400">View only</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">
                {editingDN ? `Edit Debit Note: ${editingDN.dnNo}` : 'Issue Debit Note'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {/* Company */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Company *</label>
                  <select
                    value={formData.companyId}
                    onChange={e => setFormData({ ...formData, companyId: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-slate-300 bg-white"
                    required
                  >
                    {db.companies.filter(c => c.active).map(c => (
                      <option key={c.id} value={c.id}>{c.code} — {c.fullName}</option>
                    ))}
                  </select>
                </div>

                {/* Supplier */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Supplier *</label>
                  <select
                    value={formData.supplierId}
                    onChange={e => setFormData({ ...formData, supplierId: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-slate-300 bg-white"
                    required
                  >
                    {activeSuppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.vendorCode} — {s.supplierName}</option>
                    ))}
                  </select>
                </div>

                {/* DN No */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Debit Note No *</label>
                  <input
                    type="text"
                    value={formData.dnNo}
                    onChange={e => setFormData({ ...formData, dnNo: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-slate-300 font-semibold uppercase"
                    required
                  />
                </div>

                {/* DN Date */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">DN Date *</label>
                  <input
                    type="date"
                    value={formData.dnDate}
                    onChange={e => setFormData({ ...formData, dnDate: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-slate-300"
                    required
                  />
                </div>

                {/* Linked PI */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Against PI</label>
                  <select
                    value={formData.linkedPiId || ''}
                    onChange={e => setFormData({ ...formData, linkedPiId: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-slate-300 bg-white"
                  >
                    <option value="">-- Optional Linked PI --</option>
                    {availablePIs.map(p => (
                      <option key={p.id} value={p.id}>{p.piNo} ({formatFC(p.piValueFC)} {p.currency})</option>
                    ))}
                  </select>
                </div>

                {/* Linked CI */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Against CI</label>
                  <select
                    value={formData.linkedCiId || ''}
                    onChange={e => setFormData({ ...formData, linkedCiId: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-slate-300 bg-white"
                  >
                    <option value="">-- Optional Linked CI --</option>
                    {availableCIs.map(c => (
                      <option key={c.id} value={c.id}>{c.ciNo} ({formatFC(c.ciValueFC)} {c.currency})</option>
                    ))}
                  </select>
                </div>

                {/* Amount FC */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Amount FC *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.amountFC || ''}
                    onChange={e => setFormData({ ...formData, amountFC: parseFloat(e.target.value) || 0 })}
                    placeholder="e.g. 200"
                    className="w-full text-xs p-2 rounded border border-slate-300 font-bold"
                    required
                  />
                </div>

                {/* Exchange Rate (FIFO rate from unapplied payment) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Exchange Rate (FIFO Payment Rate) *
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={formData.rate || ''}
                    onChange={e => setFormData({ ...formData, rate: parseFloat(e.target.value) || 0 })}
                    placeholder="e.g. 86.50"
                    className="w-full text-xs p-2 rounded border border-slate-300 font-bold text-indigo-700"
                    required
                  />
                </div>

                {/* Reason */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Reason</label>
                  <select
                    value={formData.reason}
                    onChange={e => setFormData({ ...formData, reason: e.target.value as DebitNoteReason })}
                    className="w-full text-xs p-2 rounded border border-slate-300 bg-white"
                  >
                    <option value="Short shipment">Short shipment</option>
                    <option value="Rate difference">Rate difference</option>
                    <option value="Quality claim">Quality claim</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                {/* Recovery Method */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Recovery Method</label>
                  <select
                    value={formData.recoveryMethod}
                    onChange={e => setFormData({ ...formData, recoveryMethod: e.target.value as DebitNoteRecoveryMethod })}
                    className="w-full text-xs p-2 rounded border border-slate-300 bg-white"
                  >
                    <option value="Refund">Refund via Bank TT</option>
                    <option value="Adjust against another PI or CI">Adjust against another PI or CI</option>
                    <option value="Write-off">Write-off</option>
                  </select>
                </div>
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Remarks</label>
                <input
                  type="text"
                  value={formData.remarks || ''}
                  onChange={e => setFormData({ ...formData, remarks: e.target.value })}
                  placeholder="Notes, supplier email reference..."
                  className="w-full text-xs p-2 rounded border border-slate-300"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm"
                >
                  {editingDN ? 'Update Debit Note' : 'Issue Debit Note'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
