import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { RefundReceipt, AdjustmentTransfer } from '../types';
import { formatFC, formatINR, formatDate, formatRate } from '../utils/formatters';
import { exportToExcel } from '../utils/excel';
import { Plus, Download, RefreshCcw, ArrowRightLeft, AlertCircle, CheckCircle2 } from 'lucide-react';

export const RefundsAdjustmentsScreen: React.FC = () => {
  const {
    db,
    engineResult,
    selectedCompanyId,
    saveRefundReceipt,
    saveAdjustment,
  } = useApp();
  const { permissions } = useAuth();

  const [activeSubTab, setActiveSubTab] = useState<'refunds' | 'adjustments'>('refunds');

  // Refund Modal State
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundForm, setRefundForm] = useState<Partial<RefundReceipt>>({
    companyId: selectedCompanyId !== 'ALL' ? selectedCompanyId : db.companies[0]?.id || '',
    bankAccountId: '',
    date: new Date().toISOString().split('T')[0],
    supplierId: '',
    currency: 'USD',
    amountFC: 0,
    actualExchangeRate: 88.0,
    inrAmount: 0,
    againstDnId: '',
    bankReferenceNo: '',
    remarks: '',
  });

  // Adjustment Modal State
  const [showAdjModal, setShowAdjModal] = useState(false);
  const [adjForm, setAdjForm] = useState<Partial<AdjustmentTransfer>>({
    companyId: selectedCompanyId !== 'ALL' ? selectedCompanyId : db.companies[0]?.id || '',
    supplierId: '',
    currency: 'USD',
    date: new Date().toISOString().split('T')[0],
    fromType: 'PI',
    fromId: '',
    toType: 'PI',
    toId: '',
    amountFC: 0,
    remarks: '',
  });

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filtered dropdown helpers
  const activeBankAccounts = db.bankAccounts.filter(
    b => b.active && (!refundForm.companyId || b.companyId === refundForm.companyId)
  );

  const activeSuppliers = db.suppliers.filter(
    s => s.active && (!refundForm.companyId || s.companyId === refundForm.companyId)
  );

  const openDebitNotes = db.debitNotes.filter(
    dn =>
      dn.companyId === refundForm.companyId &&
      dn.status !== 'Fully Recovered' &&
      dn.status !== 'Written Off'
  );

  // Open PIs and CIs for adjustments
  const pIsForAdj = db.proformaInvoices.filter(
    p => p.companyId === adjForm.companyId && p.supplierId === adjForm.supplierId
  );
  const cIsForAdj = db.commercialInvoices.filter(
    c => c.companyId === adjForm.companyId && c.supplierId === adjForm.supplierId
  );

  const handleOpenRefundModal = () => {
    setErrorMsg(null);
    const compId = selectedCompanyId !== 'ALL' ? selectedCompanyId : db.companies[0]?.id || '';
    const banks = db.bankAccounts.filter(b => b.companyId === compId && b.active);
    const dns = db.debitNotes.filter(d => d.companyId === compId && d.status !== 'Fully Recovered');
    const firstDN = dns[0];
    const companySupps = db.suppliers.filter(s => s.companyId === compId && s.active);

    setRefundForm({
      companyId: compId,
      bankAccountId: banks[0]?.id || '',
      date: new Date().toISOString().split('T')[0],
      supplierId: firstDN ? firstDN.supplierId : companySupps[0]?.id || '',
      currency: firstDN ? firstDN.currency : 'USD',
      amountFC: firstDN ? firstDN.amountFC - (firstDN.recoveredFC || 0) : 0,
      actualExchangeRate: 88.0,
      inrAmount: 0,
      againstDnId: firstDN?.id || '',
      bankReferenceNo: `REF-IN-${Date.now().toString().slice(-4)}`,
      remarks: 'Refund received against Debit Note',
    });
    setShowRefundModal(true);
  };

  const handleRefundSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundForm.companyId || !refundForm.bankAccountId || !refundForm.againstDnId || !refundForm.amountFC || refundForm.amountFC <= 0) {
      setErrorMsg('Please select Bank Account, Debit Note, and enter Amount FC > 0.');
      return;
    }
    if (!refundForm.actualExchangeRate || refundForm.actualExchangeRate <= 0) {
      setErrorMsg('Exchange rate must be greater than 0.');
      return;
    }

    const inr = Math.round(Number(refundForm.amountFC) * Number(refundForm.actualExchangeRate));
    const dn = db.debitNotes.find(d => d.id === refundForm.againstDnId);

    const payload: RefundReceipt = {
      id: `REF-${Date.now()}`,
      companyId: refundForm.companyId!,
      bankAccountId: refundForm.bankAccountId!,
      date: refundForm.date || new Date().toISOString().split('T')[0],
      supplierId: dn ? dn.supplierId : refundForm.supplierId!,
      currency: dn ? dn.currency : refundForm.currency || 'USD',
      amountFC: Number(refundForm.amountFC),
      actualExchangeRate: Number(refundForm.actualExchangeRate),
      inrAmount: inr,
      againstDnId: refundForm.againstDnId!,
      bankReferenceNo: refundForm.bankReferenceNo || undefined,
      remarks: refundForm.remarks || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    saveRefundReceipt(payload);
    setShowRefundModal(false);
  };

  const handleOpenAdjModal = () => {
    setErrorMsg(null);
    const compId = selectedCompanyId !== 'ALL' ? selectedCompanyId : db.companies[0]?.id || '';
    const supp = db.suppliers.find(s => s.companyId === compId && s.active);

    setAdjForm({
      companyId: compId,
      supplierId: supp?.id || '',
      currency: supp?.defaultCurrency || 'USD',
      date: new Date().toISOString().split('T')[0],
      fromType: 'PI',
      fromId: '',
      toType: 'PI',
      toId: '',
      amountFC: 0,
      remarks: 'Transfer / adjustment between orders',
    });
    setShowAdjModal(true);
  };

  const handleAdjSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjForm.companyId || !adjForm.supplierId || !adjForm.fromId || !adjForm.toId || !adjForm.amountFC || adjForm.amountFC <= 0) {
      setErrorMsg('Please select Source (From), Target (To), and enter valid Amount FC.');
      return;
    }

    const payload: AdjustmentTransfer = {
      id: `ADJ-${Date.now()}`,
      companyId: adjForm.companyId!,
      supplierId: adjForm.supplierId!,
      currency: adjForm.currency || 'USD',
      date: adjForm.date || new Date().toISOString().split('T')[0],
      fromType: adjForm.fromType || 'PI',
      fromId: adjForm.fromId!,
      toType: adjForm.toType || 'PI',
      toId: adjForm.toId!,
      amountFC: Number(adjForm.amountFC),
      remarks: adjForm.remarks || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    saveAdjustment(payload);
    setShowAdjModal(false);
  };

  // Filtered Refunds
  const filteredRefunds = db.refundReceipts.filter(
    r => selectedCompanyId === 'ALL' || r.companyId === selectedCompanyId
  );

  // Filtered Adjustments
  const filteredAdjustments = db.adjustments.filter(
    a => selectedCompanyId === 'ALL' || a.companyId === selectedCompanyId
  );

  return (
    <div className="p-6 space-y-6">
      {/* Sub-Tabs Switcher */}
      <div className="flex items-center space-x-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setActiveSubTab('refunds')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center space-x-2 ${
            activeSubTab === 'refunds'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-300'
          }`}
        >
          <RefreshCcw className="w-3.5 h-3.5" />
          <span>Refund Receipts ({filteredRefunds.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('adjustments')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center space-x-2 ${
            activeSubTab === 'adjustments'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-300'
          }`}
        >
          <ArrowRightLeft className="w-3.5 h-3.5" />
          <span>Journal Vouchers (JV) & Transfers ({filteredAdjustments.length})</span>
        </button>
      </div>

      {activeSubTab === 'refunds' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
            <div>
              <h2 className="text-base font-bold text-slate-900">Inward Bank Refund Receipts</h2>
              <p className="text-xs text-slate-500">
                Book incoming bank telegraphic transfers settling debit notes, with automatic realized FX Gain/Loss calculation
              </p>
            </div>

            {permissions.canRecordRefund ? (
              <button
                onClick={handleOpenRefundModal}
                className="flex items-center space-x-1 text-xs px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Record Refund Inward</span>
              </button>
            ) : (
              <span className="text-[11px] font-semibold px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg">
                Read-Only Access
              </span>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-semibold uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2.5">Company</th>
                    <th className="px-3 py-2.5">Bank Account</th>
                    <th className="px-3 py-2.5">Receipt Date</th>
                    <th className="px-3 py-2.5">Supplier</th>
                    <th className="px-3 py-2.5">Against Debit Note</th>
                    <th className="px-3 py-2.5 text-right">Amount FC</th>
                    <th className="px-3 py-2.5 text-right">Actual Bank Rate</th>
                    <th className="px-3 py-2.5 text-right">Received INR</th>
                    <th className="px-3 py-2.5 text-right font-bold text-indigo-700">Refund FX G/L</th>
                    <th className="px-3 py-2.5">Bank Ref</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {filteredRefunds.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                        No refunds recorded yet.
                      </td>
                    </tr>
                  ) : (
                    filteredRefunds.map(r => {
                      const comp = db.companies.find(c => c.id === r.companyId);
                      const supp = db.suppliers.find(s => s.id === r.supplierId);
                      const bank = db.bankAccounts.find(b => b.id === r.bankAccountId);
                      const dn = db.debitNotes.find(d => d.id === r.againstDnId);

                      // FX G/L on refund = Refund INR - DN INR for refunded FC
                      const dnINR = dn ? r.amountFC * dn.rate : 0;
                      const refundINR = r.inrAmount || r.amountFC * r.actualExchangeRate;
                      const refundFX = Math.round(refundINR - dnINR);

                      return (
                        <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-3 py-2.5 font-bold text-slate-900">{comp?.code}</td>
                          <td className="px-3 py-2.5">{bank?.bankName} - {bank?.accountNumber.slice(-4)}</td>
                          <td className="px-3 py-2.5">{formatDate(r.date)}</td>
                          <td className="px-3 py-2.5 font-semibold text-slate-900">{supp?.supplierName}</td>
                          <td className="px-3 py-2.5 font-bold text-indigo-600">
                            {dn?.dnNo || '-'} (DN Rate: {dn ? formatRate(dn.rate) : '-'})
                          </td>
                          <td className="px-3 py-2.5 text-right font-extrabold text-slate-900">
                            {formatFC(r.amountFC)} <span className="text-[10px] text-slate-500 font-normal">{r.currency}</span>
                          </td>
                          <td className="px-3 py-2.5 text-right font-bold text-slate-800">
                            {formatRate(r.actualExchangeRate)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold text-slate-900">
                            {formatINR(r.inrAmount)}
                          </td>
                          <td className={`px-3 py-2.5 text-right font-extrabold ${
                            refundFX >= 0 ? 'text-emerald-700' : 'text-rose-700'
                          }`}>
                            {formatINR(refundFX, 0, true)}
                          </td>
                          <td className="px-3 py-2.5 text-slate-600">{r.bankReferenceNo || '-'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
            <div>
              <h2 className="text-base font-bold text-slate-900">Journal Vouchers (JV) & Inter-Doc Adjustments</h2>
              <p className="text-xs text-slate-500">
                Move unapplied advances or debit note balances between Proforma Invoices or Commercial Invoices at original rate
              </p>
            </div>

            {permissions.canRecordRefund ? (
              <button
                onClick={handleOpenAdjModal}
                className="flex items-center space-x-1 text-xs px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Create Journal Voucher (JV)</span>
              </button>
            ) : (
              <span className="text-[11px] font-semibold px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg">
                Read-Only Access
              </span>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-semibold uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2.5">Company</th>
                    <th className="px-3 py-2.5">Date</th>
                    <th className="px-3 py-2.5">Supplier</th>
                    <th className="px-3 py-2.5">From</th>
                    <th className="px-3 py-2.5">To</th>
                    <th className="px-3 py-2.5 text-right">Amount FC</th>
                    <th className="px-3 py-2.5">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {filteredAdjustments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                        No adjustments recorded yet.
                      </td>
                    </tr>
                  ) : (
                    filteredAdjustments.map(a => {
                      const comp = db.companies.find(c => c.id === a.companyId);
                      const supp = db.suppliers.find(s => s.id === a.supplierId);
                      return (
                        <tr key={a.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-3 py-2.5 font-bold text-slate-900">{comp?.code}</td>
                          <td className="px-3 py-2.5">{formatDate(a.date)}</td>
                          <td className="px-3 py-2.5 font-semibold text-slate-900">{supp?.supplierName}</td>
                          <td className="px-3 py-2.5 text-indigo-700 font-bold">{a.fromType} : {a.fromId}</td>
                          <td className="px-3 py-2.5 text-emerald-700 font-bold">{a.toType} : {a.toId}</td>
                          <td className="px-3 py-2.5 text-right font-extrabold text-slate-900">
                            {formatFC(a.amountFC)} {a.currency}
                          </td>
                          <td className="px-3 py-2.5 text-slate-500">{a.remarks || '-'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Record Refund Modal */}
      {showRefundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-xl flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">Record Bank Refund Inward</h3>
              <button onClick={() => setShowRefundModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleRefundSubmit} className="p-6 space-y-4">
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
                    value={refundForm.companyId}
                    onChange={e => setRefundForm({ ...refundForm, companyId: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-slate-300 bg-white"
                    required
                  >
                    {db.companies.filter(c => c.active).map(c => (
                      <option key={c.id} value={c.id}>{c.code} — {c.fullName}</option>
                    ))}
                  </select>
                </div>

                {/* Bank Account */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Receiving Bank Account *</label>
                  <select
                    value={refundForm.bankAccountId}
                    onChange={e => setRefundForm({ ...refundForm, bankAccountId: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-slate-300 bg-white"
                    required
                  >
                    <option value="">-- Select Bank Account --</option>
                    {activeBankAccounts.map(b => (
                      <option key={b.id} value={b.id}>{b.bankName} - {b.accountNumber.slice(-4)}</option>
                    ))}
                  </select>
                </div>

                {/* Against Debit Note */}
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Against Debit Note *</label>
                  <select
                    value={refundForm.againstDnId}
                    onChange={e => {
                      const dn = db.debitNotes.find(d => d.id === e.target.value);
                      setRefundForm({
                        ...refundForm,
                        againstDnId: e.target.value,
                        currency: dn?.currency || 'USD',
                        amountFC: dn ? dn.amountFC - (dn.recoveredFC || 0) : 0,
                      });
                    }}
                    className="w-full text-xs p-2 rounded border border-slate-300 bg-white font-semibold"
                    required
                  >
                    <option value="">-- Choose Open Debit Note --</option>
                    {openDebitNotes.map(dn => (
                      <option key={dn.id} value={dn.id}>
                        {dn.dnNo} ({formatFC(dn.amountFC - (dn.recoveredFC || 0))} {dn.currency} pending @ {formatRate(dn.rate)})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Receipt Date *</label>
                  <input
                    type="date"
                    value={refundForm.date}
                    onChange={e => setRefundForm({ ...refundForm, date: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-slate-300"
                    required
                  />
                </div>

                {/* Amount FC */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Refund Amount (FC) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={refundForm.amountFC || ''}
                    onChange={e => setRefundForm({ ...refundForm, amountFC: parseFloat(e.target.value) || 0 })}
                    placeholder="e.g. 200"
                    className="w-full text-xs p-2 rounded border border-slate-300 font-extrabold"
                    required
                  />
                </div>

                {/* Actual Rate */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Actual Inward Bank Rate *
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={refundForm.actualExchangeRate || ''}
                    onChange={e => setRefundForm({ ...refundForm, actualExchangeRate: parseFloat(e.target.value) || 0 })}
                    placeholder="e.g. 88.00"
                    className="w-full text-xs p-2 rounded border border-slate-300 font-bold text-indigo-700"
                    required
                  />
                </div>

                {/* Bank Reference */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Bank Inward Ref / UTR</label>
                  <input
                    type="text"
                    value={refundForm.bankReferenceNo || ''}
                    onChange={e => setRefundForm({ ...refundForm, bankReferenceNo: e.target.value })}
                    placeholder="e.g. REF-HDFC-999"
                    className="w-full text-xs p-2 rounded border border-slate-300"
                  />
                </div>
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Remarks</label>
                <input
                  type="text"
                  value={refundForm.remarks || ''}
                  onChange={e => setRefundForm({ ...refundForm, remarks: e.target.value })}
                  placeholder="Notes..."
                  className="w-full text-xs p-2 rounded border border-slate-300"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowRefundModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm"
                >
                  Save Refund Receipt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Adjustment Modal */}
      {showAdjModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">Record Adjustment / Transfer</h3>
              <button onClick={() => setShowAdjModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleAdjSubmit} className="p-6 space-y-4">
              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Company *</label>
                  <select
                    value={adjForm.companyId}
                    onChange={e => setAdjForm({ ...adjForm, companyId: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-slate-300 bg-white"
                    required
                  >
                    {db.companies.filter(c => c.active).map(c => (
                      <option key={c.id} value={c.id}>{c.code} — {c.fullName}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Supplier *</label>
                  <select
                    value={adjForm.supplierId}
                    onChange={e => setAdjForm({ ...adjForm, supplierId: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-slate-300 bg-white"
                    required
                  >
                    {activeSuppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.vendorCode} — {s.supplierName}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Transfer From *</label>
                  <select
                    value={adjForm.fromId}
                    onChange={e => setAdjForm({ ...adjForm, fromId: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-slate-300 bg-white font-semibold"
                    required
                  >
                    <option value="">-- Choose Source PI/CI --</option>
                    {pIsForAdj.map(p => (
                      <option key={p.id} value={p.piNo}>PI: {p.piNo} ({formatFC(p.piValueFC)} {p.currency})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Transfer To *</label>
                  <select
                    value={adjForm.toId}
                    onChange={e => setAdjForm({ ...adjForm, toId: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-slate-300 bg-white font-semibold"
                    required
                  >
                    <option value="">-- Choose Target PI/CI --</option>
                    {pIsForAdj.map(p => (
                      <option key={p.id} value={p.piNo}>PI: {p.piNo}</option>
                    ))}
                    {cIsForAdj.map(c => (
                      <option key={c.id} value={c.ciNo}>CI: {c.ciNo}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Transfer Amount (FC) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={adjForm.amountFC || ''}
                    onChange={e => setAdjForm({ ...adjForm, amountFC: parseFloat(e.target.value) || 0 })}
                    placeholder="Amount to move"
                    className="w-full text-xs p-2 rounded border border-slate-300 font-bold"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Adjustment Date *</label>
                  <input
                    type="date"
                    value={adjForm.date}
                    onChange={e => setAdjForm({ ...adjForm, date: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-slate-300"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Remarks</label>
                <input
                  type="text"
                  value={adjForm.remarks || ''}
                  onChange={e => setAdjForm({ ...adjForm, remarks: e.target.value })}
                  placeholder="Reason for transfer..."
                  className="w-full text-xs p-2 rounded border border-slate-300"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowAdjModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm"
                >
                  Save Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
