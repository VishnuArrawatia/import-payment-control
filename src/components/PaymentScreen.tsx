import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { Payment, PaymentMode } from '../types';
import { formatFC, formatINR, formatDate, formatRate } from '../utils/formatters';
import { exportToExcel } from '../utils/excel';
import { Plus, Download, Search, AlertCircle, Copy, CreditCard, ShieldAlert, Clock, FileSpreadsheet, Save, CheckCircle2 } from 'lucide-react';
import { ExcelBatchGridModal } from './ExcelBatchGridModal';

export const PaymentScreen: React.FC = () => {
  const { db, engineResult, selectedCompanyId, savePayment } = useApp();
  const { permissions } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [rbiFilter, setRbiFilter] = useState<'ALL' | 'OVERDUE' | 'CRITICAL' | 'WARNING'>('ALL');
  const [showModal, setShowModal] = useState(false);
  const [showExcelGrid, setShowExcelGrid] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [rateWarning, setRateWarning] = useState<string | null>(null);
  const [saveNotification, setSaveNotification] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<Payment>>({
    companyId: selectedCompanyId !== 'ALL' ? selectedCompanyId : db.companies[0]?.id || '',
    bankAccountId: '',
    paymentDate: new Date().toISOString().split('T')[0],
    supplierId: '',
    currency: 'USD',
    amountFC: 0,
    actualExchangeRate: 85.0,
    inrAmount: 0,
    inrOverride: undefined,
    bankChargesINR: 0,
    gstOnChargesINR: 0,
    paymentAgainst: 'PI',
    linkedPiId: '',
    linkedCiId: '',
    paymentMode: 'Advance',
    bankReferenceNo: '',
    utrNo: '',
    swiftNo: '',
    utrSwiftRef: '',
    purposeCode: 'S0101',
    formA1RequestNo: '',
    remarks: '',
    lcNo: '',
    lcOpenDate: '',
    lcAmountFC: 0,
    lcDueDate: '',
    lcStatus: 'Open',
  });

  // Filtered dropdown lists based on selected company
  const activeBankAccounts = db.bankAccounts.filter(
    b => b.active && (!formData.companyId || b.companyId === formData.companyId)
  );

  const activeSuppliers = db.suppliers.filter(
    s => s.active && (!formData.companyId || s.companyId === formData.companyId)
  );

  const availablePIs = db.proformaInvoices.filter(
    p =>
      p.companyId === formData.companyId &&
      p.supplierId === formData.supplierId &&
      p.currency === formData.currency
  );

  const availableCIs = db.commercialInvoices.filter(
    c =>
      c.companyId === formData.companyId &&
      c.supplierId === formData.supplierId &&
      c.currency === formData.currency
  );

  // Auto-information details when PI or CI is chosen
  const linkedDetails = useMemo(() => {
    if (formData.paymentAgainst === 'PI' && formData.linkedPiId) {
      const pi = db.proformaInvoices.find(p => p.id === formData.linkedPiId);
      const st = engineResult.piStates.get(formData.linkedPiId);
      const bookedCIs = db.commercialInvoices.filter(
        c =>
          c.linkedPiId === formData.linkedPiId ||
          (c.linkedPiSplits && c.linkedPiSplits.some(s => s.piId === formData.linkedPiId))
      );
      return {
        type: 'PI' as const,
        pi,
        piState: st,
        bookedCIs,
        ci: null,
        ciState: null,
      };
    } else if (formData.paymentAgainst === 'CI' && formData.linkedCiId) {
      const ci = db.commercialInvoices.find(c => c.id === formData.linkedCiId);
      const st = engineResult.ciStates.get(formData.linkedCiId);
      const pi = ci ? db.proformaInvoices.find(p => p.id === ci.linkedPiId) : null;
      return {
        type: 'CI' as const,
        ci,
        ciState: st,
        pi,
        piState: null,
        bookedCIs: [],
      };
    }
    return null;
  }, [formData.paymentAgainst, formData.linkedPiId, formData.linkedCiId, db, engineResult]);

  // Check rate fluctuation (> 5% difference compared to last payment in this currency)
  const checkRateFluctuation = (newRate: number, curr: string) => {
    const pastPayments = db.payments
      .filter(p => p.currency === curr && p.actualExchangeRate > 0)
      .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));

    if (pastPayments.length > 0) {
      const lastRate = pastPayments[0].actualExchangeRate;
      const diffPercent = Math.abs((newRate - lastRate) / lastRate) * 100;
      if (diffPercent > 5) {
        setRateWarning(
          `Exchange rate (${newRate}) differs by ${diffPercent.toFixed(1)}% from last recorded rate (${lastRate}) for ${curr}. Please verify against bank advice.`
        );
        return;
      }
    }
    setRateWarning(null);
  };

  const handleOpenAdd = () => {
    setEditingPayment(null);
    setErrorMsg(null);
    setRateWarning(null);
    const compId = selectedCompanyId !== 'ALL' ? selectedCompanyId : db.companies[0]?.id || '';
    const banks = db.bankAccounts.filter(b => b.companyId === compId && b.active);
    const supps = db.suppliers.filter(s => s.companyId === compId && s.active);

    setFormData({
      companyId: compId,
      bankAccountId: banks[0]?.id || '',
      paymentDate: new Date().toISOString().split('T')[0],
      supplierId: supps[0]?.id || '',
      currency: supps[0]?.defaultCurrency || 'USD',
      amountFC: 0,
      actualExchangeRate: 85.0,
      inrAmount: 0,
      inrOverride: undefined,
      bankChargesINR: 0,
      gstOnChargesINR: 0,
      paymentAgainst: 'PI',
      linkedPiId: '',
      linkedCiId: '',
      paymentMode: 'Advance',
      bankReferenceNo: '',
      utrNo: '',
      swiftNo: '',
      utrSwiftRef: '',
      purposeCode: 'S0101',
      formA1RequestNo: '',
      remarks: '',
      lcNo: '',
      lcOpenDate: '',
      lcAmountFC: 0,
      lcDueDate: '',
      lcStatus: 'Open',
    });
    setShowModal(true);
  };

  const handleDuplicateLast = () => {
    const list = db.payments;
    if (list.length === 0) return;
    const last = list[list.length - 1];
    setEditingPayment(null);
    setErrorMsg(null);
    setRateWarning(null);
    setFormData({
      ...last,
      id: undefined,
      bankReferenceNo: `${last.bankReferenceNo}-COPY`,
      paymentDate: new Date().toISOString().split('T')[0],
    });
    setShowModal(true);
  };

  const handleEdit = (p: Payment) => {
    setEditingPayment(p);
    setErrorMsg(null);
    setRateWarning(null);
    setFormData({ ...p });
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.companyId || !formData.bankAccountId || !formData.supplierId || !formData.amountFC || formData.amountFC <= 0) {
      setErrorMsg('Please fill all mandatory fields (Company, Bank Account, Supplier, Amount FC > 0).');
      return;
    }
    if (!formData.actualExchangeRate || formData.actualExchangeRate <= 0) {
      setErrorMsg('Actual exchange rate must be greater than 0.');
      return;
    }

    const calculatedINR = formData.inrOverride ?? Math.round(Number(formData.amountFC) * Number(formData.actualExchangeRate));

    const payload: Payment = {
      id: editingPayment ? editingPayment.id : `PAY-${Date.now()}`,
      companyId: formData.companyId!,
      bankAccountId: formData.bankAccountId!,
      paymentDate: formData.paymentDate || new Date().toISOString().split('T')[0],
      supplierId: formData.supplierId!,
      currency: formData.currency || 'USD',
      amountFC: Number(formData.amountFC),
      actualExchangeRate: Number(formData.actualExchangeRate),
      inrAmount: calculatedINR,
      inrOverride: formData.inrOverride ? Number(formData.inrOverride) : undefined,
      bankChargesINR: Number(formData.bankChargesINR || 0),
      gstOnChargesINR: Number(formData.gstOnChargesINR || 0),
      paymentAgainst: formData.paymentAgainst || 'PI',
      linkedPiId: formData.paymentAgainst === 'PI' ? formData.linkedPiId : undefined,
      linkedCiId: formData.paymentAgainst === 'CI' ? formData.linkedCiId : undefined,
      paymentMode: (formData.paymentMode as PaymentMode) || 'Advance',
      bankReferenceNo: formData.bankReferenceNo ? formData.bankReferenceNo.trim() : `REF-${Date.now().toString().slice(-6)}`,
      utrNo: formData.utrNo ? formData.utrNo.trim() : undefined,
      swiftNo: formData.swiftNo ? formData.swiftNo.trim() : undefined,
      utrSwiftRef: formData.swiftNo ? `SWIFT:${formData.swiftNo.trim()}` : (formData.utrNo || formData.utrSwiftRef || undefined),
      purposeCode: formData.purposeCode || (formData.paymentAgainst === 'PI' ? 'S0101' : 'S0102'),
      formA1RequestNo: formData.formA1RequestNo || undefined,
      remarks: formData.remarks || undefined,
      lcNo: formData.paymentMode === 'LC' ? formData.lcNo : undefined,
      lcOpenDate: formData.paymentMode === 'LC' ? formData.lcOpenDate : undefined,
      lcAmountFC: formData.paymentMode === 'LC' ? Number(formData.lcAmountFC || formData.amountFC) : undefined,
      lcDueDate: formData.paymentMode === 'LC' ? formData.lcDueDate : undefined,
      lcStatus: formData.paymentMode === 'LC' ? formData.lcStatus : undefined,
      createdAt: editingPayment?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const res = savePayment(payload);
    if (!res.success) {
      setErrorMsg(res.error || 'Failed to record payment.');
      return;
    }

    setSaveNotification(`Payment ${payload.bankReferenceNo} (${payload.currency} ${payload.amountFC.toLocaleString()}) saved successfully to database!`);
    setTimeout(() => setSaveNotification(null), 4500);
    setShowModal(false);
  };

  // Filtered Payments
  const filteredPayments = db.payments.filter(p => {
    if (selectedCompanyId !== 'ALL' && p.companyId !== selectedCompanyId) return false;
    if (rbiFilter !== 'ALL') {
      const alert = engineResult.idpmsAdvanceAlerts.find(a => a.paymentId === p.id);
      if (!alert) return false;
      if (rbiFilter === 'OVERDUE' && alert.status !== 'Overdue') return false;
      if (rbiFilter === 'CRITICAL' && alert.status !== 'Critical') return false;
      if (rbiFilter === 'WARNING' && alert.status !== 'Warning' && alert.status !== 'Critical' && alert.status !== 'Overdue') return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const supp = db.suppliers.find(s => s.id === p.supplierId);
      return (
        p.bankReferenceNo.toLowerCase().includes(q) ||
        (p.swiftNo && p.swiftNo.toLowerCase().includes(q)) ||
        (p.utrNo && p.utrNo.toLowerCase().includes(q)) ||
        (p.utrSwiftRef && p.utrSwiftRef.toLowerCase().includes(q)) ||
        supp?.supplierName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleExport = () => {
    const data = filteredPayments.map(p => {
      const comp = db.companies.find(c => c.id === p.companyId);
      const supp = db.suppliers.find(s => s.id === p.supplierId);
      const bank = db.bankAccounts.find(b => b.id === p.bankAccountId);
      const pi = db.proformaInvoices.find(i => i.id === p.linkedPiId);
      const ci = db.commercialInvoices.find(i => i.id === p.linkedCiId);
      const pAllocs = engineResult.allocations.filter(a => a.paymentId === p.id);
      const linkedCIs = Array.from(
        new Set(
          pAllocs
            .map(a => db.commercialInvoices.find(c => c.id === a.ciId)?.ciNo || a.ciId)
            .filter(Boolean)
        )
      );
      const linkedBOEs = Array.from(new Set(pAllocs.map(a => a.boeNo).filter(Boolean)));
      return {
        Company: comp?.code,
        Bank: `${bank?.bankName} - ${bank?.accountNumber.slice(-4)}`,
        'Payment Date': formatDate(p.paymentDate),
        Supplier: supp?.supplierName,
        'Vendor Code': supp?.vendorCode,
        Currency: p.currency,
        'Amount FC': p.amountFC,
        'Actual Rate': p.actualExchangeRate,
        'Amount INR': p.inrAmount,
        'Against Type': p.paymentAgainst,
        'Linked Ref': p.paymentAgainst === 'PI' ? (pi?.piNo || 'On-Account PI') : (ci?.ciNo || 'FIFO / On-Account'),
        'Linked CI(s)': linkedCIs.join(', ') || (ci?.ciNo || '-'),
        'Linked BOE(s)': linkedBOEs.join(', ') || (ci?.boeNo || '-'),
        Mode: p.paymentMode,
        'Bank Ref No': p.bankReferenceNo,
        'SWIFT No': p.swiftNo || '',
        'UTR No': p.utrNo || '',
        'UTR / SWIFT': p.utrSwiftRef || '',
        'Purpose Code': p.purposeCode || '',
        'Form A1': p.formA1RequestNo || '',
        'LC Status': p.paymentMode === 'LC' ? p.lcStatus : '-',
      };
    });
    exportToExcel(data, 'Payment_Register');
  };

  return (
    <div className="p-6 space-y-4">
      {/* Top Save Confirmation Banner */}
      {saveNotification && (
        <div className="flex items-center justify-between p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 shadow-sm animate-fade-in">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="text-xs font-bold">{saveNotification}</span>
          </div>
          <button onClick={() => setSaveNotification(null)} className="text-emerald-700 hover:text-emerald-950 text-xs font-bold">
            Dismiss
          </button>
        </div>
      )}

      {/* Action Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-base font-bold text-slate-900">Import Outward Remittances & Payments</h2>
          <p className="text-xs text-slate-500">
            Book bank payments at actual bank advice exchange rate against PIs or CIs, with LC and purpose codes
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search Bank Ref / UTR / Party..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="text-xs pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 w-52 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* RBI 180-Day Filter */}
          <select
            value={rbiFilter}
            onChange={e => setRbiFilter(e.target.value as any)}
            className={`text-xs px-2.5 py-1.5 rounded-lg border font-bold ${
              rbiFilter !== 'ALL' ? 'border-rose-300 bg-rose-50 text-rose-800' : 'border-slate-300 bg-white text-slate-700'
            }`}
          >
            <option value="ALL">All Remittances</option>
            <option value="OVERDUE">RBI Overdue (&gt;180 Days)</option>
            <option value="CRITICAL">Critical (&lt;30 Days Left)</option>
            <option value="WARNING">Warning (31-90 Days Left)</option>
          </select>

          <button
            onClick={handleExport}
            className="flex items-center space-x-1 text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg border border-slate-300 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel</span>
          </button>

          {permissions.canRecordPayment ? (
            <>
              <button
                onClick={() => setShowExcelGrid(true)}
                className="flex items-center space-x-1.5 text-xs px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold rounded-lg border border-emerald-300 transition-colors shadow-2xs"
                title="Open Excel Batch Copy-Paste Editor for Payments"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>📋 Paste from Excel</span>
              </button>

              <button
                onClick={handleDuplicateLast}
                className="flex items-center space-x-1 text-xs px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium rounded-lg border border-indigo-200 transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Duplicate Last</span>
              </button>

              <button
                onClick={handleOpenAdd}
                className="flex items-center space-x-1 text-xs px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-sm transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Record Remittance</span>
              </button>
            </>
          ) : (
            <span className="text-[11px] font-semibold px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg">
              Read-Only Access
            </span>
          )}
        </div>
      </div>

      {/* Payment Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-100 text-slate-700 font-semibold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-3 py-2.5">Company</th>
                <th className="px-3 py-2.5">Bank Account</th>
                <th className="px-3 py-2.5">Date</th>
                <th className="px-3 py-2.5">Supplier</th>
                <th className="px-3 py-2.5">Against</th>
                <th className="px-3 py-2.5">Linked CI(s) & BOE</th>
                <th className="px-3 py-2.5 text-right">Amount FC</th>
                <th className="px-3 py-2.5 text-right">Actual Rate</th>
                <th className="px-3 py-2.5 text-right">Amount INR</th>
                <th className="px-3 py-2.5">Bank Ref / UTR</th>
                <th className="px-3 py-2.5">Mode</th>
                <th className="px-3 py-2.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-slate-400">
                    No payments recorded yet. Click "+ Record Remittance" to enter a payment.
                  </td>
                </tr>
              ) : (
                filteredPayments.map(p => {
                  const comp = db.companies.find(c => c.id === p.companyId);
                  const supp = db.suppliers.find(s => s.id === p.supplierId);
                  const bank = db.bankAccounts.find(b => b.id === p.bankAccountId);
                  const pi = db.proformaInvoices.find(i => i.id === p.linkedPiId);
                  const ci = db.commercialInvoices.find(i => i.id === p.linkedCiId);
                  const pAllocs = engineResult.allocations.filter(a => a.paymentId === p.id);
                  const piBookedCis = pi
                    ? db.commercialInvoices.filter(
                        c => c.linkedPiId === pi.id || c.linkedPiSplits?.some(s => s.piId === pi.id)
                      )
                    : [];

                  const isLC = p.paymentMode === 'LC';
                  const isOpenLC = isLC && p.lcStatus !== 'Paid';

                  // Collect unique linked CI -> BOE entries from live engine allocations (or direct link)
                  const allocTargets = Array.from(
                    new Map(
                      pAllocs.map(a => {
                        const targetCi = db.commercialInvoices.find(c => c.id === a.ciId);
                        const labelCi = targetCi ? targetCi.ciNo : a.ciId.replace(/^OB-/, 'OB:');
                        const boe = targetCi?.boeNo || a.boeNo || '';
                        const isPendingBoe = !boe || boe.startsWith('PENDING-');
                        return [a.ciId, { labelCi, boe, isPendingBoe, isOb: a.ciId.startsWith('OB-') }];
                      })
                    ).values()
                  );

                  return (
                    <tr key={p.id} className={`hover:bg-slate-50/80 transition-colors ${isOpenLC ? 'bg-amber-50/30' : ''}`}>
                      <td className="px-3 py-2.5 font-bold text-slate-900">{comp?.code}</td>
                      <td className="px-3 py-2.5 font-medium text-slate-800">
                        <div className="font-bold text-slate-900">{bank?.bankName}</div>
                        <div className="text-[10px] text-indigo-700 font-mono font-semibold">A/c: {bank?.accountNumber}</div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-700">{formatDate(p.paymentDate)}</td>
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-slate-900">{supp?.supplierName}</div>
                        <div className="text-[10px] text-slate-400">{supp?.vendorCode}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="font-bold text-indigo-700">
                          {p.paymentAgainst}: {p.paymentAgainst === 'PI' ? (pi?.piNo || 'On-Account') : (ci?.ciNo || 'FIFO / On-Account')}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {allocTargets.length > 0 ? (
                          <div className="space-y-1">
                            {allocTargets.slice(0, 2).map((t, idx) => (
                              <div key={idx} className="text-[11px] flex items-center gap-1 flex-wrap">
                                <span className="font-semibold text-slate-800">{t.labelCi}</span>
                                <span className="text-slate-400">→</span>
                                <span className={t.isPendingBoe ? 'text-amber-700 font-semibold' : 'text-emerald-700 font-semibold'}>
                                  {t.boe || 'No BOE'}
                                </span>
                              </div>
                            ))}
                            {allocTargets.length > 2 && (
                              <div className="text-[10px] text-slate-500">+{allocTargets.length - 2} more CI(s)</div>
                            )}
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                allocTargets.some(t => t.isPendingBoe)
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {allocTargets.some(t => t.isPendingBoe)
                                ? 'BOE Pending'
                                : allocTargets.every(t => t.isOb)
                                ? 'Opening Bill Linked'
                                : 'BOE Linked'}
                            </span>
                          </div>
                        ) : p.paymentAgainst === 'CI' && ci ? (
                          <div className="space-y-1">
                            <div className="text-[11px] font-semibold text-slate-800">
                              {ci.ciNo} → {ci.boeNo || 'No BOE'}
                            </div>
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                !ci.boeNo || ci.boeNo.startsWith('PENDING-')
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {!ci.boeNo || ci.boeNo.startsWith('PENDING-') ? 'BOE Pending' : 'BOE Linked'}
                            </span>
                          </div>
                        ) : p.paymentAgainst === 'PI' && pi ? (
                          piBookedCis.length > 0 ? (
                            <div className="space-y-1">
                              {piBookedCis.slice(0, 2).map(c => (
                                <div key={c.id} className="text-[11px] font-semibold text-slate-700">
                                  {c.ciNo} → {c.boeNo}
                                </div>
                              ))}
                              <span
                                className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                  piBookedCis.some(c => !c.boeNo || c.boeNo.startsWith('PENDING-'))
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                {piBookedCis.some(c => !c.boeNo || c.boeNo.startsWith('PENDING-')) ? 'BOE Pending' : 'CI Booked'}
                              </span>
                            </div>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800">
                              CI & BOE Pending
                            </span>
                          )
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">
                            Unapplied / Advance
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-extrabold text-slate-900">
                        {formatFC(p.amountFC)} <span className="text-[10px] text-slate-500 font-normal">{p.currency}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-slate-800">
                        {formatRate(p.actualExchangeRate)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-900">
                        {formatINR(p.inrAmount)}
                        {p.inrOverride && <span className="text-[10px] text-indigo-600 block">(Override)</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-bold text-slate-800">{p.bankReferenceNo}</div>
                        <div className="flex flex-col gap-0.5 mt-0.5">
                          {p.swiftNo && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-blue-800 bg-blue-50 border border-blue-200 px-1.5 py-0.2 rounded font-mono font-bold w-fit">
                              SWIFT: {p.swiftNo}
                            </span>
                          )}
                          {p.utrNo && (
                            <span className="text-[10px] text-slate-500 font-mono">
                              UTR: {p.utrNo}
                            </span>
                          )}
                          {!p.swiftNo && !p.utrNo && p.utrSwiftRef && (
                            <span className="text-[10px] text-slate-400 font-mono">{p.utrSwiftRef}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          isOpenLC ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {p.paymentMode} {isOpenLC ? '(Open LC)' : ''}
                        </span>
                        {(() => {
                          const idpmsAlert = engineResult.idpmsAdvanceAlerts.find(a => a.paymentId === p.id);
                          if (!idpmsAlert) return null;
                          return (
                            <div className="mt-1">
                              <span
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-extrabold shadow-2xs ${
                                  idpmsAlert.status === 'Overdue'
                                    ? 'bg-rose-600 text-white animate-pulse'
                                    : idpmsAlert.status === 'Critical'
                                      ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                      : idpmsAlert.status === 'Warning'
                                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                }`}
                                title={`RBI IDPMS 180-Day Rule: Due by ${formatDate(idpmsAlert.dueDate180)}. Unsettled: ${formatFC(idpmsAlert.unsettledAmountFC)} ${idpmsAlert.currency}`}
                              >
                                <Clock className="w-2.5 h-2.5" />
                                <span>
                                  {idpmsAlert.status === 'Overdue'
                                    ? `RBI Overdue (+${idpmsAlert.daysElapsed - 180}d)`
                                    : `${idpmsAlert.daysRemaining}d left (180d)`}
                                </span>
                              </span>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {permissions.canRecordPayment ? (
                          <button
                            onClick={() => handleEdit(p)}
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

      {/* Record Payment Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">
                {editingPayment ? `Edit Payment: ${editingPayment.bankReferenceNo}` : 'Record Import Outward Remittance'}
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

              {rateWarning && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-800 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600" />
                  <span>{rateWarning}</span>
                </div>
              )}

              <div className="grid grid-cols-3 gap-4">
                {/* Company */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Company *</label>
                  <select
                    value={formData.companyId}
                    onChange={e => {
                      const newCompId = e.target.value;
                      const compBanks = db.bankAccounts.filter(b => b.active && b.companyId === newCompId);
                      const compSupps = db.suppliers.filter(s => s.active && s.companyId === newCompId);
                      const firstSupp = compSupps[0];
                      setFormData({
                        ...formData,
                        companyId: newCompId,
                        bankAccountId: compBanks[0]?.id || '',
                        supplierId: firstSupp?.id || '',
                        currency: firstSupp?.defaultCurrency || formData.currency || 'USD',
                        linkedPiId: '',
                        linkedCiId: '',
                      });
                    }}
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Bank Account *</label>
                  <select
                    value={formData.bankAccountId}
                    onChange={e => setFormData({ ...formData, bankAccountId: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-slate-300 bg-white"
                    required
                  >
                    <option value="">-- Select Bank Account --</option>
                    {activeBankAccounts.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.bankName} — A/c: {b.accountNumber} ({b.branch})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Payment Date */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Remittance Date *</label>
                  <input
                    type="date"
                    value={formData.paymentDate}
                    onChange={e => setFormData({ ...formData, paymentDate: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-slate-300"
                    required
                  />
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
                    <option value="">-- Select Supplier --</option>
                    {activeSuppliers.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.vendorCode} — {s.supplierName}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Currency */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Currency *</label>
                  <select
                    value={formData.currency}
                    onChange={e => setFormData({ ...formData, currency: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-slate-300 bg-white"
                    required
                  >
                    {db.currencies.map(c => (
                      <option key={c.code} value={c.code}>{c.code} ({c.name})</option>
                    ))}
                  </select>
                </div>

                {/* Payment Mode */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Mode *</label>
                  <select
                    value={formData.paymentMode}
                    onChange={e => setFormData({ ...formData, paymentMode: e.target.value as PaymentMode })}
                    className="w-full text-xs p-2 rounded border border-slate-300 bg-white"
                  >
                    <option value="Advance">Advance (Partial/Full)</option>
                    <option value="Balance">Balance Payment</option>
                    <option value="Full advance">Full Advance</option>
                    <option value="LC">Letter of Credit (LC)</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              {/* Payment Against Choice */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                <div className="flex items-center space-x-4 text-xs font-semibold text-slate-700">
                  <span>Payment Against:</span>
                  <label className="flex items-center space-x-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="paymentAgainst"
                      value="PI"
                      checked={formData.paymentAgainst === 'PI'}
                      onChange={() => setFormData({ ...formData, paymentAgainst: 'PI' })}
                      className="text-indigo-600"
                    />
                    <span>Proforma Invoice (PI)</span>
                  </label>
                  <label className="flex items-center space-x-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="paymentAgainst"
                      value="CI"
                      checked={formData.paymentAgainst === 'CI'}
                      onChange={() => setFormData({ ...formData, paymentAgainst: 'CI' })}
                      className="text-indigo-600"
                    />
                    <span>Commercial Invoice / Bill (CI)</span>
                  </label>
                </div>

                {formData.paymentAgainst === 'PI' ? (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Select Proforma Invoice (PI)</label>
                    <select
                      value={formData.linkedPiId}
                      onChange={e => setFormData({ ...formData, linkedPiId: e.target.value })}
                      className="w-full text-xs p-2 rounded border border-slate-300 bg-white"
                    >
                      <option value="">-- Choose Linked PI --</option>
                      {availablePIs.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.piNo} (Val: {formatFC(p.piValueFC)} {p.currency} | Adv: {p.advancePercentage}%)
                        </option>
                      ))}
                    </select>

                    {linkedDetails && linkedDetails.type === 'PI' && (
                      <div className="mt-2 p-2.5 bg-white rounded border border-slate-200 text-xs text-slate-600 space-y-1.5">
                        <div>
                          <strong>PI Date:</strong> {formatDate(linkedDetails.pi?.piDate)} |{' '}
                          <strong>PI Value:</strong> {formatFC(linkedDetails.pi?.piValueFC)} {linkedDetails.pi?.currency} |{' '}
                          <strong>Adv Required:</strong> {linkedDetails.pi?.advancePercentage}% ({formatFC(linkedDetails.piState?.advanceRequiredFC)} {linkedDetails.pi?.currency})
                        </div>
                        <div>
                          <strong>Already Paid:</strong> {formatFC(linkedDetails.piState?.totalPaidFC)} {linkedDetails.pi?.currency} |{' '}
                          <strong>Booked CIs & BOEs:</strong>{' '}
                          {(linkedDetails.bookedCIs || []).length > 0 ? (
                            <span className="inline-flex flex-wrap gap-1.5 align-middle ml-1">
                              {linkedDetails.bookedCIs.map(c => {
                                const isPend = !c.boeNo || c.boeNo.startsWith('PENDING-');
                                return (
                                  <span
                                    key={c.id}
                                    className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                                      isPend ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                                    }`}
                                  >
                                    {c.ciNo} → BOE: {c.boeNo} ({formatDate(c.boeDate)})
                                  </span>
                                );
                              })}
                            </span>
                          ) : (
                            <span className="inline-block ml-1 px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-semibold">
                              CI & BOE Pending — link CI under this PI after shipment
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Select Commercial Invoice (CI)</label>
                    <select
                      value={formData.linkedCiId}
                      onChange={e => setFormData({ ...formData, linkedCiId: e.target.value })}
                      className="w-full text-xs p-2 rounded border border-slate-300 bg-white"
                    >
                      <option value="">-- Choose Linked CI --</option>
                      {availableCIs.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.ciNo} (Val: {formatFC(c.ciValueFC)} {c.currency} | BOE: {c.boeNo})
                        </option>
                      ))}
                    </select>

                    {linkedDetails && linkedDetails.type === 'CI' && (() => {
                      const ciRec = linkedDetails.ci;
                      const isPendingBoe = !ciRec?.boeNo || ciRec.boeNo.startsWith('PENDING-');
                      const amtFC = Number(formData.amountFC || 0);
                      const effPayRate =
                        formData.inrOverride && amtFC > 0
                          ? Number(formData.inrOverride) / amtFC
                          : Number(formData.actualExchangeRate || 0);
                      const allocFC = Math.min(amtFC, Number(linkedDetails.ciState?.balanceFC ?? ciRec?.ciValueFC ?? 0));
                      const projFxGL =
                        ciRec && allocFC > 0 && effPayRate > 0
                          ? Math.round(allocFC * (ciRec.boeExchangeRate - effPayRate) * 100) / 100
                          : null;

                      return (
                        <div className="mt-2 p-2.5 bg-white rounded border border-slate-200 text-xs text-slate-600 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span>
                              <strong>CI Date:</strong> {formatDate(ciRec?.ciDate)} |{' '}
                              <strong>Linked PI:</strong> {linkedDetails.pi?.piNo || 'Direct / No PI'}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                isPendingBoe ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {isPendingBoe ? 'BOE Pending Entry' : 'BOE Linked'}
                            </span>
                          </div>
                          <div>
                            <strong>BOE No:</strong> {ciRec?.boeNo || '-'} ({formatDate(ciRec?.boeDate)}) |{' '}
                            <strong>Port:</strong> {ciRec?.portCode || '-'} |{' '}
                            <strong>BOE Rate:</strong> {formatRate(ciRec?.boeExchangeRate)}
                          </div>
                          <div className="flex flex-wrap items-center gap-3">
                            <span>
                              <strong>CI Value:</strong> {formatFC(ciRec?.ciValueFC)} {ciRec?.currency}
                            </span>
                            <span>
                              <strong>Outstanding Balance:</strong>{' '}
                              <span className="font-bold text-amber-700">
                                {formatFC(linkedDetails.ciState?.balanceFC)} {ciRec?.currency} (Cr)
                              </span>
                            </span>
                            {projFxGL !== null && (
                              <span>
                                <strong>Projected Realized FX G/(L):</strong>{' '}
                                <span className={`font-bold ${projFxGL >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                  {formatINR(projFxGL, 2, true)}
                                </span>
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Amounts and Rates */}
              <div className="grid grid-cols-3 gap-4">
                {/* Amount FC */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Amount FC *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.amountFC || ''}
                    onChange={e => {
                      const val = parseFloat(e.target.value) || 0;
                      setFormData({
                        ...formData,
                        amountFC: val,
                        inrAmount: formData.inrOverride ?? Math.round(val * (formData.actualExchangeRate || 0)),
                      });
                    }}
                    placeholder="e.g. 3000"
                    className="w-full text-xs p-2 rounded border border-slate-300 font-extrabold text-slate-900"
                    required
                  />
                </div>

                {/* Actual Exchange Rate */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Actual Rate (per Bank Advice) *
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={formData.actualExchangeRate || ''}
                    onChange={e => {
                      const rate = parseFloat(e.target.value) || 0;
                      checkRateFluctuation(rate, formData.currency || 'USD');
                      setFormData({
                        ...formData,
                        actualExchangeRate: rate,
                        inrAmount: formData.inrOverride ?? Math.round((formData.amountFC || 0) * rate),
                      });
                    }}
                    placeholder="e.g. 85.00"
                    className="w-full text-xs p-2 rounded border border-slate-300 font-bold text-indigo-700"
                    required
                  />
                </div>

                {/* Auto Calculated INR */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Auto Calculated INR</label>
                  <input
                    type="text"
                    disabled
                    value={formatINR(Math.round((formData.amountFC || 0) * (formData.actualExchangeRate || 0)))}
                    className="w-full text-xs p-2 rounded border border-slate-200 bg-slate-100 font-bold text-slate-700"
                  />
                </div>

                {/* INR Override */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    INR as per Bank Advice (Override)
                  </label>
                  <input
                    type="number"
                    value={formData.inrOverride || ''}
                    onChange={e => setFormData({ ...formData, inrOverride: parseFloat(e.target.value) || undefined })}
                    placeholder="Optional exact INR"
                    className="w-full text-xs p-2 rounded border border-slate-300 text-indigo-900 font-semibold"
                  />
                </div>

                {/* Bank Charges */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Bank Charges INR</label>
                  <input
                    type="number"
                    value={formData.bankChargesINR || ''}
                    onChange={e => setFormData({ ...formData, bankChargesINR: parseFloat(e.target.value) || 0 })}
                    placeholder="e.g. 1500"
                    className="w-full text-xs p-2 rounded border border-slate-300"
                  />
                </div>

                {/* GST on Charges */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">GST on Charges INR</label>
                  <input
                    type="number"
                    value={formData.gstOnChargesINR || ''}
                    onChange={e => setFormData({ ...formData, gstOnChargesINR: parseFloat(e.target.value) || 0 })}
                    placeholder="e.g. 270"
                    className="w-full text-xs p-2 rounded border border-slate-300"
                  />
                </div>
              </div>

              {/* Bank Submission & Banking References */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                {/* Bank Ref No */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Bank Ref No *</label>
                  <input
                    type="text"
                    value={formData.bankReferenceNo}
                    onChange={e => setFormData({ ...formData, bankReferenceNo: e.target.value })}
                    placeholder="e.g. HDFC-ADV-101"
                    className="w-full text-xs p-2 rounded border border-slate-300 font-semibold bg-white"
                    required
                  />
                </div>

                {/* Bank UTR No */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Bank UTR No</label>
                  <input
                    type="text"
                    value={formData.utrNo || ''}
                    onChange={e => setFormData({ ...formData, utrNo: e.target.value })}
                    placeholder="e.g. HDFCN26105001234"
                    className="w-full text-xs p-2 rounded border border-slate-300 uppercase bg-white font-mono"
                  />
                </div>

                {/* SWIFT No */}
                <div>
                  <label className="block text-xs font-bold text-blue-800 mb-1 flex items-center gap-1">
                    <span>SWIFT No. / MT103</span>
                    <span className="text-[9px] bg-blue-100 text-blue-700 px-1 rounded font-normal">Foreign Wire</span>
                  </label>
                  <input
                    type="text"
                    value={formData.swiftNo || ''}
                    onChange={e => setFormData({ ...formData, swiftNo: e.target.value })}
                    placeholder="e.g. SWIFT-2026-9041"
                    className="w-full text-xs p-2 rounded border border-blue-300 focus:border-blue-500 uppercase bg-blue-50/40 font-mono font-bold text-blue-900"
                  />
                </div>

                {/* Purpose Code */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">RBI Purpose Code</label>
                  <input
                    type="text"
                    value={formData.purposeCode || 'S0101'}
                    onChange={e => setFormData({ ...formData, purposeCode: e.target.value })}
                    placeholder="e.g. S0101 / S0102"
                    className="w-full text-xs p-2 rounded border border-slate-300 uppercase bg-white"
                  />
                </div>

                {/* Form A1 */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Form A1 / Req No</label>
                  <input
                    type="text"
                    value={formData.formA1RequestNo || ''}
                    onChange={e => setFormData({ ...formData, formA1RequestNo: e.target.value })}
                    placeholder="e.g. A1-2026-0042"
                    className="w-full text-xs p-2 rounded border border-slate-300 bg-white"
                  />
                </div>
              </div>

              {/* LC Specific fields if mode is LC */}
              {formData.paymentMode === 'LC' && (
                <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-xl space-y-3">
                  <div className="text-xs font-bold text-amber-900 border-b border-amber-200 pb-1">
                    Letter of Credit (LC) Specifics
                  </div>
                  <div className="grid grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">LC Number</label>
                      <input
                        type="text"
                        value={formData.lcNo || ''}
                        onChange={e => setFormData({ ...formData, lcNo: e.target.value })}
                        placeholder="e.g. LC-889900"
                        className="w-full text-xs p-2 rounded border border-slate-300"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">LC Open Date</label>
                      <input
                        type="date"
                        value={formData.lcOpenDate || ''}
                        onChange={e => setFormData({ ...formData, lcOpenDate: e.target.value })}
                        className="w-full text-xs p-2 rounded border border-slate-300"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">LC Due Date</label>
                      <input
                        type="date"
                        value={formData.lcDueDate || ''}
                        onChange={e => setFormData({ ...formData, lcDueDate: e.target.value })}
                        className="w-full text-xs p-2 rounded border border-slate-300"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">LC Status</label>
                      <select
                        value={formData.lcStatus || 'Open'}
                        onChange={e => setFormData({ ...formData, lcStatus: e.target.value as 'Open' | 'Paid' })}
                        className="w-full text-xs p-2 rounded border border-slate-300 bg-white font-bold"
                      >
                        <option value="Open">Open (Commitment only, not yet debited)</option>
                        <option value="Paid">Paid (Matured & Debited by Bank)</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Remarks */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Remarks</label>
                <input
                  type="text"
                  value={formData.remarks || ''}
                  onChange={e => setFormData({ ...formData, remarks: e.target.value })}
                  placeholder="Notes, instructions..."
                  className="w-full text-xs p-2 rounded border border-slate-300"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center space-x-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Real-time disk persistence: Changes save instantly to database</span>
                </div>
                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex items-center space-x-1.5 px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm cursor-pointer active:scale-95 transition-all"
                  >
                    <Save className="w-4 h-4" />
                    <span>{editingPayment ? '💾 Save & Update Payment' : '💾 Save & Record Payment'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Excel Batch Grid Modal */}
      <ExcelBatchGridModal
        isOpen={showExcelGrid}
        initialEntity="payments"
        onClose={() => setShowExcelGrid(false)}
      />
    </div>
  );
};
