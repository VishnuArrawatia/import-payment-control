import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { CommercialInvoice, Payment } from '../types';
import { formatFC, formatINR, formatDate, formatRate, round2 } from '../utils/formatters';
import { exportToExcel } from '../utils/excel';
import { suggestSWS, suggestIGST } from '../utils/boe';
import {
  Link2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Download,
  Search,
  Edit3,
  FileCheck,
  AlertCircle,
} from 'lucide-react';

type TraceSubTab = 'payment_chain' | 'ci_linkage';

export const TraceabilityScreen: React.FC = () => {
  const { db, engineResult, selectedCompanyId, savePayment, saveCI } = useApp();
  const { permissions } = useAuth();

  const [subTab, setSubTab] = useState<TraceSubTab>('payment_chain');
  const [supplierFilter, setSupplierFilter] = useState<string>('ALL');
  const [againstFilter, setAgainstFilter] = useState<'ALL' | 'PI' | 'CI'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'COMPLETE' | 'BOE_PENDING' | 'CI_PENDING'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Quick Link PI/CI Modal for a Payment
  const [linkingPayment, setLinkingPayment] = useState<Payment | null>(null);
  const [linkMode, setLinkMode] = useState<'PI' | 'CI'>('CI');
  const [targetPiId, setTargetPiId] = useState<string>('');
  const [targetCiId, setTargetCiId] = useState<string>('');
  const [modalError, setModalError] = useState<string | null>(null);

  // Quick Enter BOE Modal for a Commercial Invoice
  const [editingBoeCi, setEditingBoeCi] = useState<CommercialInvoice | null>(null);
  const [boeForm, setBoeForm] = useState({
    boeNo: '',
    boeDate: '',
    portCode: 'INNSA1',
    boeExchangeRate: 95.0,
    assessableValueINR: 0,
    customsDutyINR: 0,
    swsINR: 0,
    igstINR: 0,
    taxPaidDate: '',
    linkedPiId: '',
  });

  // Quick Link CI to PI Modal
  const [linkingCi, setLinkingCi] = useState<CommercialInvoice | null>(null);
  const [ciTargetPiId, setCiTargetPiId] = useState<string>('');

  const bankLabel = (bankId: string) => {
    const b = db.bankAccounts.find(x => x.id === bankId);
    return b ? `${b.bankName} - ${b.accountNumber.slice(-4)}` : bankId;
  };

  const filteredSuppliers = useMemo(
    () => db.suppliers.filter(s => selectedCompanyId === 'ALL' || s.companyId === selectedCompanyId),
    [db.suppliers, selectedCompanyId]
  );

  // Build Payment -> PI -> CI -> BOE traceability rows
  const paymentChains = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return db.payments
      .filter(p => {
        if (selectedCompanyId !== 'ALL' && p.companyId !== selectedCompanyId) return false;
        if (supplierFilter !== 'ALL' && p.supplierId !== supplierFilter) return false;
        if (againstFilter !== 'ALL' && p.paymentAgainst !== againstFilter) return false;
        return true;
      })
      .map(p => {
        const comp = db.companies.find(c => c.id === p.companyId);
        const supp = db.suppliers.find(s => s.id === p.supplierId);
        const allocs = engineResult.allocations.filter(a => a.paymentId === p.id);
        const unappliedChunk = engineResult.unappliedPayments.find(u => u.paymentId === p.id);
        const unappliedFC = unappliedChunk?.remainingFC || 0;

        // Resolve CIs & Opening Payables settled
        const settledItems = allocs.map(a => {
          const isOb = a.ciId.startsWith('OB-');
          const ob = isOb ? db.openingBalances.find(o => `OB-${o.id}` === a.ciId) : undefined;
          const ci = !isOb ? db.commercialInvoices.find(c => c.id === a.ciId) : undefined;
          const sub = !isOb ? db.boeSubmissions.find(s => s.paymentId === p.id && s.ciId === a.ciId) : undefined;
          const isRealBoe = isOb
            ? Boolean(ob?.boeNo && !ob.boeNo.startsWith('PENDING-'))
            : Boolean(a.boeNo && !a.boeNo.startsWith('PENDING-'));

          return {
            allocId: a.id,
            isOb,
            ciId: a.ciId,
            ciObj: ci,
            docNo: isOb ? (ob?.referenceNo || a.boeNo) : (ci?.ciNo || a.ciId),
            docDate: a.ciDate,
            boeNo: a.boeNo,
            boeDate: a.boeDate,
            isRealBoe,
            allocatedFC: a.amountFC,
            realizedGL: a.realizedGainLossINR,
            idpmsStatus: sub?.idpmsStatus || 'Pending',
          };
        });

        // Resolve linked PI (directly on payment, or via settled CIs)
        const directPi = p.linkedPiId ? db.proformaInvoices.find(pi => pi.id === p.linkedPiId) : undefined;
        const ciLinkedPis = allocs
          .map(a => db.commercialInvoices.find(c => c.id === a.ciId)?.linkedPiId)
          .filter(Boolean)
          .map(id => db.proformaInvoices.find(pi => pi.id === id))
          .filter(Boolean);
        const linkedPiText = directPi
          ? `${directPi.piNo} (${formatDate(directPi.piDate)})`
          : ciLinkedPis.length > 0
            ? Array.from(new Set(ciLinkedPis.map(x => `${x!.piNo}`))).join(', ')
            : '-';

        // Determine chain status
        let chainStatus: 'COMPLETE' | 'BOE_PENDING' | 'CI_PENDING' = 'COMPLETE';
        let statusLabel = 'BOE Linked';
        const hasPendingBoeCi = settledItems.some(item => !item.isOb && !item.isRealBoe);
        const firstPendingCiItem = settledItems.find(item => !item.isOb && !item.isRealBoe);

        if (settledItems.length === 0) {
          chainStatus = 'CI_PENDING';
          statusLabel = p.paymentAgainst === 'PI' ? 'CI & BOE Pending (PI Advance)' : 'Unapplied / CI Pending';
        } else if (hasPendingBoeCi) {
          chainStatus = 'BOE_PENDING';
          statusLabel = 'CI Settled • BOE No Pending';
        } else if (unappliedFC > 0) {
          chainStatus = 'CI_PENDING';
          statusLabel = `Partial (${formatFC(unappliedFC)} FC Unapplied)`;
        } else if (settledItems.every(i => i.isOb)) {
          chainStatus = 'COMPLETE';
          statusLabel = 'Opening Balance Settled';
        }

        const totalGL = settledItems.reduce((s, i) => s + i.realizedGL, 0);

        return {
          payment: p,
          companyCode: comp?.code || '',
          supplierName: supp?.supplierName || '',
          vendorCode: supp?.vendorCode || '',
          bankText: bankLabel(p.bankAccountId),
          linkedPiText,
          settledItems,
          unappliedFC,
          totalGL,
          chainStatus,
          statusLabel,
          firstPendingCi: firstPendingCiItem?.ciObj || null,
        };
      })
      .filter(row => {
        if (statusFilter !== 'ALL' && row.chainStatus !== statusFilter) return false;
        if (q) {
          const hit =
            row.payment.bankReferenceNo.toLowerCase().includes(q) ||
            row.supplierName.toLowerCase().includes(q) ||
            row.linkedPiText.toLowerCase().includes(q) ||
            row.settledItems.some(i => i.docNo.toLowerCase().includes(q) || i.boeNo.toLowerCase().includes(q));
          if (!hit) return false;
        }
        return true;
      });
  }, [db, engineResult, selectedCompanyId, supplierFilter, againstFilter, statusFilter, searchQuery]);

  // Commercial Invoice linkage table rows
  const ciRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return db.commercialInvoices
      .filter(ci => {
        if (selectedCompanyId !== 'ALL' && ci.companyId !== selectedCompanyId) return false;
        if (supplierFilter !== 'ALL' && ci.supplierId !== supplierFilter) return false;
        return true;
      })
      .map(ci => {
        const comp = db.companies.find(c => c.id === ci.companyId);
        const supp = db.suppliers.find(s => s.id === ci.supplierId);
        const pi = ci.linkedPiId ? db.proformaInvoices.find(p => p.id === ci.linkedPiId) : undefined;
        const st = engineResult.ciStates.get(ci.id);
        const allocPayments = (st?.allocations || []).map(a => {
          const pay = db.payments.find(p => p.id === a.paymentId);
          return `${pay?.bankReferenceNo || a.paymentId} (${formatFC(a.amountFC)})`;
        });
        const isRealBoe = Boolean(ci.boeNo && !ci.boeNo.startsWith('PENDING-'));
        const sub = db.boeSubmissions.find(s => s.ciId === ci.id || s.boeNo === ci.boeNo);

        return {
          ci,
          companyCode: comp?.code || '',
          supplierName: supp?.supplierName || '',
          piNo: pi?.piNo || (ci.linkedPiSplits && ci.linkedPiSplits.length > 0 ? 'Multi-PI Split' : '-'),
          allocatedFC: st?.allocatedFC || 0,
          balanceFC: st?.balanceFC || 0,
          realizedGL: st?.realizedGainLossINR || 0,
          allocPaymentsText: allocPayments.join(', ') || '-',
          isRealBoe,
          idpmsStatus: sub?.idpmsStatus || 'Pending',
        };
      })
      .filter(r => !q || r.ci.ciNo.toLowerCase().includes(q) || r.ci.boeNo.toLowerCase().includes(q) || r.supplierName.toLowerCase().includes(q));
  }, [db, engineResult, selectedCompanyId, supplierFilter, searchQuery]);

  const kpis = useMemo(() => {
    const total = paymentChains.length;
    const complete = paymentChains.filter(r => r.chainStatus === 'COMPLETE').length;
    const boePending = paymentChains.filter(r => r.chainStatus === 'BOE_PENDING').length;
    const ciPending = paymentChains.filter(r => r.chainStatus === 'CI_PENDING').length;
    return { total, complete, boePending, ciPending };
  }, [paymentChains]);

  const handleOpenLinkPayment = (p: Payment) => {
    setModalError(null);
    setLinkingPayment(p);
    setLinkMode(p.paymentAgainst);
    setTargetPiId(p.linkedPiId || '');
    setTargetCiId(p.linkedCiId || '');
  };

  const handleSavePaymentLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkingPayment) return;
    if (linkMode === 'PI' && !targetPiId) {
      setModalError('Please select a Proforma Invoice (PI) to link this payment.');
      return;
    }

    const updated: Payment = {
      ...linkingPayment,
      paymentAgainst: linkMode,
      linkedPiId: linkMode === 'PI' ? targetPiId : undefined,
      linkedCiId: linkMode === 'CI' ? (targetCiId || undefined) : undefined,
      paymentMode: linkMode === 'PI' && linkingPayment.paymentMode === 'Balance' ? 'Advance' : linkingPayment.paymentMode,
    };

    const res = savePayment(updated);
    if (!res.success) {
      setModalError(res.error || 'Failed to update payment linkage.');
      return;
    }
    setLinkingPayment(null);
  };

  const handleOpenEditBoe = (ci: CommercialInvoice) => {
    setModalError(null);
    setEditingBoeCi(ci);
    setBoeForm({
      boeNo: ci.boeNo.startsWith('PENDING-') ? '' : ci.boeNo,
      boeDate: ci.boeDate || ci.ciDate,
      portCode: ci.portCode || 'INNSA1',
      boeExchangeRate: ci.boeExchangeRate,
      assessableValueINR: ci.assessableValueINR || ci.purchaseINR || 0,
      customsDutyINR: ci.customsDutyINR || 0,
      swsINR: ci.swsINR || 0,
      igstINR: ci.igstINR || 0,
      taxPaidDate: ci.taxPaidDate || '',
      linkedPiId: ci.linkedPiId || '',
    });
  };

  const handleSaveBoe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBoeCi) return;
    if (!boeForm.boeNo.trim() || !boeForm.boeDate || !boeForm.boeExchangeRate || boeForm.boeExchangeRate <= 0) {
      setModalError('Valid Customs BOE No, BOE Date, and BOE Exchange Rate (> 0) are required.');
      return;
    }

    const customsDutyINR = round2(Number(boeForm.customsDutyINR || 0));
    const swsINR = round2(Number(boeForm.swsINR || 0));
    const igstINR = round2(Number(boeForm.igstINR || 0));
    const updatedCi: CommercialInvoice = {
      ...editingBoeCi,
      boeNo: boeForm.boeNo.trim().toUpperCase(),
      boeDate: boeForm.boeDate,
      portCode: (boeForm.portCode || 'INNSA1').trim().toUpperCase(),
      boeExchangeRate: Number(boeForm.boeExchangeRate),
      assessableValueINR:
        Number(boeForm.assessableValueINR || 0) > 0
          ? round2(Number(boeForm.assessableValueINR))
          : Math.round(editingBoeCi.ciValueFC * Number(boeForm.boeExchangeRate)),
      customsDutyINR,
      swsINR,
      igstINR,
      totalTaxINR: round2(customsDutyINR + swsINR + igstINR),
      taxPaidDate: boeForm.taxPaidDate || undefined,
      linkedPiId: boeForm.linkedPiId || editingBoeCi.linkedPiId,
    };

    const res = saveCI(updatedCi);
    if (!res.success) {
      setModalError(res.error || 'Failed to update BOE details.');
      return;
    }
    setEditingBoeCi(null);
  };

  const handleOpenLinkCi = (ci: CommercialInvoice) => {
    setModalError(null);
    setLinkingCi(ci);
    setCiTargetPiId(ci.linkedPiId || '');
  };

  const handleSaveCiLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkingCi) return;
    const res = saveCI({
      ...linkingCi,
      linkedPiId: ciTargetPiId,
    });
    if (!res.success) {
      setModalError(res.error || 'Failed to link CI to PI.');
      return;
    }
    setLinkingCi(null);
  };

  const handleExport = () => {
    if (subTab === 'payment_chain') {
      exportToExcel(
        paymentChains.map(r => ({
          Company: r.companyCode,
          Bank: r.bankText,
          'Payment Date': formatDate(r.payment.paymentDate),
          'Bank Ref': r.payment.bankReferenceNo,
          Supplier: r.supplierName,
          'Payment Against': r.payment.paymentAgainst,
          'Paid FC': r.payment.amountFC,
          'Rate': r.payment.actualExchangeRate,
          'Paid INR': r.payment.inrAmount,
          'Linked PI': r.linkedPiText,
          'Settled CIs / Refs': r.settledItems.map(i => `${i.docNo} (${formatFC(i.allocatedFC)})`).join('; ') || '-',
          'BOE Numbers': r.settledItems.map(i => i.boeNo).join('; ') || '-',
          'Unapplied FC': r.unappliedFC,
          'Realized FX G/L': r.totalGL,
          Status: r.statusLabel,
        })),
        'PI_CI_BOE_Payment_Traceability'
      );
    } else {
      exportToExcel(
        ciRows.map(r => ({
          Company: r.companyCode,
          Supplier: r.supplierName,
          'CI No': r.ci.ciNo,
          'CI Date': formatDate(r.ci.ciDate),
          'Linked PI': r.piNo,
          'BOE No': r.ci.boeNo,
          'BOE Date': formatDate(r.ci.boeDate),
          'Port': r.ci.portCode || '-',
          'CI FC': r.ci.ciValueFC,
          'Purchase INR': r.ci.purchaseINR,
          'Settled HDFC Payments': r.allocPaymentsText,
          'Open Balance FC': r.balanceFC,
          'Realized FX G/L': r.realizedGL,
          'IDPMS Status': r.idpmsStatus,
        })),
        'CI_PI_BOE_Linkage'
      );
    }
  };

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-2xl shadow-xs border border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <Link2 className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-extrabold text-slate-900">
              PI ↔ CI ↔ BOE ↔ Bank Payment Traceability
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Track whether each remittance went against PI or CI, connect PIs to CIs after shipment, and verify Customs BOE numbers
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setSubTab('payment_chain')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              subTab === 'payment_chain' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Payment → PI → CI → BOE ({paymentChains.length})
          </button>
          <button
            onClick={() => setSubTab('ci_linkage')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              subTab === 'ci_linkage' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            CI ↔ PI &amp; BOE Master ({ciRows.length})
          </button>
          <button
            onClick={handleExport}
            className="flex items-center space-x-1 text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl border border-slate-300"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel</span>
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold uppercase text-slate-500">Total Bank Remittances</span>
          <div className="text-2xl font-extrabold font-mono text-slate-900 mt-1">{kpis.total}</div>
          <span className="text-[11px] text-slate-400">Filtered payments tracked</span>
        </div>
        <div className="bg-emerald-50/70 p-4 rounded-2xl border border-emerald-200 shadow-xs">
          <span className="text-[11px] font-bold uppercase text-emerald-800 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Full Chain Complete
          </span>
          <div className="text-2xl font-extrabold font-mono text-emerald-900 mt-1">{kpis.complete}</div>
          <span className="text-[11px] text-emerald-700">Payment linked with verified BOE / OB</span>
        </div>
        <div className={`p-4 rounded-2xl border shadow-xs ${kpis.boePending > 0 ? 'bg-amber-50 border-amber-300' : 'bg-white border-slate-200'}`}>
          <span className="text-[11px] font-bold uppercase text-amber-800 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> BOE No Pending Entry
          </span>
          <div className="text-2xl font-extrabold font-mono text-amber-900 mt-1">{kpis.boePending}</div>
          <span className="text-[11px] text-amber-700">CI settled, real Customs BOE No awaiting input</span>
        </div>
        <div className={`p-4 rounded-2xl border shadow-xs ${kpis.ciPending > 0 ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200'}`}>
          <span className="text-[11px] font-bold uppercase text-indigo-800 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" /> CI &amp; BOE Pending (PI Adv)
          </span>
          <div className="text-2xl font-extrabold font-mono text-indigo-900 mt-1">{kpis.ciPending}</div>
          <span className="text-[11px] text-indigo-700">Link CI when shipment arrives</span>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-1.5">
            <span className="font-semibold text-slate-600">Supplier:</span>
            <select
              value={supplierFilter}
              onChange={e => setSupplierFilter(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded px-2 py-1 font-medium max-w-[200px]"
            >
              <option value="ALL">All Suppliers</option>
              {filteredSuppliers.map(s => (
                <option key={s.id} value={s.id}>{s.vendorCode} - {s.supplierName}</option>
              ))}
            </select>
          </div>

          {subTab === 'payment_chain' && (
            <>
              <div className="flex items-center space-x-1.5">
                <span className="font-semibold text-slate-600">Mode:</span>
                <select
                  value={againstFilter}
                  onChange={e => setAgainstFilter(e.target.value as any)}
                  className="bg-slate-50 border border-slate-300 rounded px-2 py-1 font-medium"
                >
                  <option value="ALL">All (PI &amp; CI)</option>
                  <option value="PI">Against PI (Advance)</option>
                  <option value="CI">Against CI / Bill</option>
                </select>
              </div>

              <div className="flex items-center space-x-1.5">
                <span className="font-semibold text-slate-600">Chain Status:</span>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value as any)}
                  className="bg-slate-50 border border-slate-300 rounded px-2 py-1 font-medium"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="COMPLETE">Complete (Verified BOE / OB)</option>
                  <option value="BOE_PENDING">BOE No Pending Entry</option>
                  <option value="CI_PENDING">CI &amp; BOE Pending</option>
                </select>
              </div>
            </>
          )}
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
          <input
            type="text"
            placeholder="Search Bank Ref, PI, CI, BOE..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="text-xs pl-8 pr-3 py-1 rounded-lg border border-slate-300 w-56"
          />
        </div>
      </div>

      {/* Main Content Table */}
      {subTab === 'payment_chain' ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-semibold uppercase tracking-wider border-b">
                <tr>
                  <th className="px-3 py-2.5">Bank &amp; Payment Date</th>
                  <th className="px-3 py-2.5">Supplier</th>
                  <th className="px-3 py-2.5 text-right">Paid FC &amp; INR</th>
                  <th className="px-3 py-2.5">Against / Linked PI</th>
                  <th className="px-3 py-2.5">Settled CI(s) / Opening</th>
                  <th className="px-3 py-2.5">Customs BOE &amp; IDPMS</th>
                  <th className="px-3 py-2.5 text-center">Chain Status</th>
                  <th className="px-3 py-2.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {paymentChains.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                      No payments match the selected filters.
                    </td>
                  </tr>
                ) : (
                  paymentChains.map(row => (
                    <tr key={row.payment.id} className="hover:bg-slate-50/80">
                      <td className="px-3 py-2.5">
                        <div className="font-bold text-slate-900">{row.payment.bankReferenceNo}</div>
                        <div className="text-[11px] text-slate-500">{formatDate(row.payment.paymentDate)} • {row.bankText}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-slate-900">{row.supplierName}</div>
                        <div className="text-[10px] text-slate-400">{row.companyCode} • {row.vendorCode}</div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">
                        <div className="font-extrabold text-slate-900">{formatFC(row.payment.amountFC)} {row.payment.currency}</div>
                        <div className="text-[10px] text-slate-500">{formatINR(row.payment.inrAmount, 0, true)} @ {formatRate(row.payment.actualExchangeRate, 2)}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          row.payment.paymentAgainst === 'PI' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {row.payment.paymentAgainst}
                        </span>
                        <div className="text-[11px] text-slate-700 mt-0.5 font-semibold">PI: {row.linkedPiText}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        {row.settledItems.length === 0 ? (
                          <span className="text-amber-700 font-semibold text-[11px]">Unapplied: {formatFC(row.payment.amountFC)} FC</span>
                        ) : (
                          <div className="space-y-0.5">
                            {row.settledItems.map(it => (
                              <div key={it.allocId} className="text-[11px]">
                                <span className={`font-bold ${it.isOb ? 'text-slate-600' : 'text-indigo-700'}`}>
                                  {it.isOb ? 'OB' : 'CI'}: {it.docNo}
                                </span>{' '}
                                <span className="text-slate-500 font-mono">({formatFC(it.allocatedFC)})</span>
                              </div>
                            ))}
                            {row.unappliedFC > 0 && (
                              <div className="text-[10px] text-indigo-700 font-bold">
                                + {formatFC(row.unappliedFC)} FC Advance Unapplied
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {row.settledItems.length === 0 ? (
                          <span className="text-slate-400 text-[11px]">- (Link CI first)</span>
                        ) : (
                          <div className="space-y-0.5">
                            {row.settledItems.map(it => (
                              <div key={it.allocId} className="flex items-center gap-1.5 text-[11px]">
                                <span className={`font-mono font-bold ${!it.isOb && !it.isRealBoe ? 'text-amber-700 bg-amber-50 px-1 rounded' : 'text-slate-900'}`}>
                                  {it.boeNo}
                                </span>
                                <span className={`text-[9px] px-1 rounded font-semibold ${
                                  it.idpmsStatus === 'Settled' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                                }`}>
                                  {it.idpmsStatus}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          row.chainStatus === 'COMPLETE'
                            ? 'bg-emerald-100 text-emerald-800'
                            : row.chainStatus === 'BOE_PENDING'
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-indigo-100 text-indigo-800'
                        }`}>
                          {row.statusLabel}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center space-x-1">
                        {permissions.canRecordPayment && (
                          <button
                            onClick={() => handleOpenLinkPayment(row.payment)}
                            className="px-2 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded border border-slate-300"
                            title="Link payment to specific PI or CI"
                          >
                            Link PI/CI
                          </button>
                        )}
                        {permissions.canCreateCI && row.firstPendingCi && (
                          <button
                            onClick={() => handleOpenEditBoe(row.firstPendingCi!)}
                            className="px-2 py-1 text-[11px] font-bold bg-amber-600 hover:bg-amber-700 text-white rounded shadow-2xs"
                            title="Enter official Customs BOE No"
                          >
                            Enter BOE
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-semibold uppercase tracking-wider border-b">
                <tr>
                  <th className="px-3 py-2.5">Company &amp; Supplier</th>
                  <th className="px-3 py-2.5">CI No &amp; Date</th>
                  <th className="px-3 py-2.5">Linked PI</th>
                  <th className="px-3 py-2.5">Customs BOE No &amp; Date</th>
                  <th className="px-3 py-2.5 text-right">CI Value &amp; INR</th>
                  <th className="px-3 py-2.5">Settled HDFC Payment(s)</th>
                  <th className="px-3 py-2.5 text-right">Open Bal FC</th>
                  <th className="px-3 py-2.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {ciRows.map(r => (
                  <tr key={r.ci.id} className="hover:bg-slate-50/80">
                    <td className="px-3 py-2.5">
                      <div className="font-bold text-slate-900">{r.supplierName}</div>
                      <div className="text-[10px] text-slate-400">{r.companyCode}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-bold text-indigo-700">{r.ci.ciNo}</div>
                      <div className="text-[10px] text-slate-400">{formatDate(r.ci.ciDate)}</div>
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-slate-800">{r.piNo}</td>
                    <td className="px-3 py-2.5">
                      <div className={`font-mono font-bold ${r.isRealBoe ? 'text-emerald-700' : 'text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded inline-block'}`}>
                        {r.ci.boeNo}
                      </div>
                      <div className="text-[10px] text-slate-400">{formatDate(r.ci.boeDate)} {r.ci.portCode ? `(${r.ci.portCode})` : ''}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      <div className="font-extrabold text-slate-900">{formatFC(r.ci.ciValueFC)} {r.ci.currency}</div>
                      <div className="text-[10px] text-slate-500">{formatINR(r.ci.purchaseINR, 0, true)}</div>
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-slate-700 max-w-[200px] truncate" title={r.allocPaymentsText}>
                      {r.allocPaymentsText}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-amber-700">{formatFC(r.balanceFC)}</td>
                    <td className="px-3 py-2.5 text-center space-x-1">
                      {permissions.canCreateCI && (
                        <>
                          <button
                            onClick={() => handleOpenLinkCi(r.ci)}
                            className="px-2 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded border border-slate-300"
                          >
                            Link PI
                          </button>
                          <button
                            onClick={() => handleOpenEditBoe(r.ci)}
                            className={`px-2 py-1 text-[11px] font-bold rounded ${
                              r.isRealBoe ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-amber-600 text-white hover:bg-amber-700'
                            }`}
                          >
                            {r.isRealBoe ? 'Edit BOE' : 'Enter BOE'}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal 1: Link Payment to PI / CI */}
      {linkingPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Link2 className="w-4 h-4 text-indigo-600" />
                Link Remittance {linkingPayment.bankReferenceNo}
              </h3>
              <button onClick={() => setLinkingPayment(null)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            {modalError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleSavePaymentLink} className="space-y-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div><strong>Amount:</strong> {formatFC(linkingPayment.amountFC)} {linkingPayment.currency} ({formatINR(linkingPayment.inrAmount, 0, true)})</div>
                <div><strong>Date:</strong> {formatDate(linkingPayment.paymentDate)} • {bankLabel(linkingPayment.bankAccountId)}</div>
              </div>

              <div className="flex items-center space-x-4 font-bold">
                <label className="flex items-center space-x-1.5 cursor-pointer">
                  <input type="radio" checked={linkMode === 'PI'} onChange={() => setLinkMode('PI')} />
                  <span>Against PI (Advance)</span>
                </label>
                <label className="flex items-center space-x-1.5 cursor-pointer">
                  <input type="radio" checked={linkMode === 'CI'} onChange={() => setLinkMode('CI')} />
                  <span>Against CI / Bill</span>
                </label>
              </div>

              {linkMode === 'PI' ? (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Select Proforma Invoice (PI) *</label>
                  <select
                    value={targetPiId}
                    onChange={e => setTargetPiId(e.target.value)}
                    className="w-full p-2 rounded-lg border border-slate-300 bg-white font-semibold"
                    required
                  >
                    <option value="">-- Select PI --</option>
                    {db.proformaInvoices
                      .filter(p => p.companyId === linkingPayment.companyId && p.supplierId === linkingPayment.supplierId && p.currency === linkingPayment.currency)
                      .map(p => (
                        <option key={p.id} value={p.id}>{p.piNo} ({formatFC(p.piValueFC)} {p.currency} • {formatDate(p.piDate)})</option>
                      ))}
                  </select>
                  <span className="text-[11px] text-slate-400 block mt-1">
                    Note: When CI is booked later and linked to this PI, BOE will auto-connect.
                  </span>
                </div>
              ) : (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Select Specific CI (or leave Auto FIFO)</label>
                  <select
                    value={targetCiId}
                    onChange={e => setTargetCiId(e.target.value)}
                    className="w-full p-2 rounded-lg border border-slate-300 bg-white font-semibold"
                  >
                    <option value="">-- FIFO Auto-Allocate to Opening Cr + Unlinked CIs --</option>
                    {db.commercialInvoices
                      .filter(c => c.companyId === linkingPayment.companyId && c.supplierId === linkingPayment.supplierId && c.currency === linkingPayment.currency)
                      .map(c => (
                        <option key={c.id} value={c.id}>{c.ciNo} (BOE: {c.boeNo} • {formatFC(c.ciValueFC)} {c.currency})</option>
                      ))}
                  </select>
                </div>
              )}

              <div className="pt-3 border-t flex justify-end space-x-2">
                <button type="button" onClick={() => setLinkingPayment(null)} className="px-3 py-1.5 bg-slate-100 rounded-lg font-semibold">Cancel</button>
                <button type="submit" className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700">Save Linkage</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Enter Real Customs BOE Details */}
      {editingBoeCi && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-amber-600" />
                Enter Customs BOE for CI: {editingBoeCi.ciNo}
              </h3>
              <button onClick={() => setEditingBoeCi(null)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            {modalError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleSaveBoe} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Customs BOE Number *</label>
                <input
                  type="text"
                  value={boeForm.boeNo}
                  onChange={e => setBoeForm({ ...boeForm, boeNo: e.target.value })}
                  placeholder="e.g. 8845120"
                  className="w-full p-2 rounded-lg border border-slate-300 font-bold uppercase font-mono"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">BOE Date *</label>
                  <input
                    type="date"
                    value={boeForm.boeDate}
                    onChange={e => setBoeForm({ ...boeForm, boeDate: e.target.value })}
                    className="w-full p-2 rounded-lg border border-slate-300"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Port Code *</label>
                  <input
                    type="text"
                    value={boeForm.portCode}
                    onChange={e => setBoeForm({ ...boeForm, portCode: e.target.value })}
                    placeholder="INNSA1 / INBOM4"
                    className="w-full p-2 rounded-lg border border-slate-300 uppercase"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">BOE Customs Rate *</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={boeForm.boeExchangeRate}
                    onChange={e => setBoeForm({ ...boeForm, boeExchangeRate: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2 rounded-lg border border-slate-300 font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Total BOE Ass. Value INR</label>
                  <input
                    type="number"
                    step="0.01"
                    value={boeForm.assessableValueINR || ''}
                    onChange={e => setBoeForm({ ...boeForm, assessableValueINR: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2 rounded-lg border border-slate-300 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Custom Duty (BCD) INR</label>
                  <input
                    type="number"
                    step="0.01"
                    value={boeForm.customsDutyINR || ''}
                    onChange={e => setBoeForm({ ...boeForm, customsDutyINR: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2 rounded-lg border border-slate-300 font-mono"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-700">SWS INR</label>
                    <button
                      type="button"
                      onClick={() => setBoeForm({ ...boeForm, swsINR: suggestSWS(boeForm.customsDutyINR) })}
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200"
                    >
                      10%
                    </button>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    value={boeForm.swsINR || ''}
                    onChange={e => setBoeForm({ ...boeForm, swsINR: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2 rounded-lg border border-slate-300 font-mono"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-700">IGST / GST INR</label>
                    <button
                      type="button"
                      onClick={() => {
                        const effAss =
                          boeForm.assessableValueINR > 0
                            ? boeForm.assessableValueINR
                            : Math.round(editingBoeCi.ciValueFC * Number(boeForm.boeExchangeRate || 0));
                        setBoeForm({
                          ...boeForm,
                          igstINR: suggestIGST(effAss, boeForm.customsDutyINR, boeForm.swsINR, 18),
                        });
                      }}
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200"
                    >
                      18%
                    </button>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    value={boeForm.igstINR || ''}
                    onChange={e => setBoeForm({ ...boeForm, igstINR: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2 rounded-lg border border-slate-300 font-mono text-emerald-700 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tax Paid Date</label>
                  <input
                    type="date"
                    value={boeForm.taxPaidDate}
                    onChange={e => setBoeForm({ ...boeForm, taxPaidDate: e.target.value })}
                    className="w-full p-2 rounded-lg border border-slate-300"
                  />
                </div>
                <div className="col-span-2 p-2.5 bg-slate-100 rounded-lg flex items-center justify-between">
                  <span className="font-semibold text-slate-700">Total Tax Amount (BCD + SWS + IGST):</span>
                  <span className="font-extrabold font-mono text-slate-900">
                    {formatINR(round2(boeForm.customsDutyINR + boeForm.swsINR + boeForm.igstINR))}
                  </span>
                </div>
              </div>
              <div className="pt-3 border-t flex justify-end space-x-2">
                <button type="button" onClick={() => setEditingBoeCi(null)} className="px-3 py-1.5 bg-slate-100 rounded-lg font-semibold">Cancel</button>
                <button type="submit" className="px-4 py-1.5 bg-amber-600 text-white rounded-lg font-bold hover:bg-amber-700">Save BOE Details</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Link CI to PI */}
      {linkingCi && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-indigo-600" />
                Link CI {linkingCi.ciNo} to Proforma Invoice (PI)
              </h3>
              <button onClick={() => setLinkingCi(null)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            {modalError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
                {modalError}
              </div>
            )}

            <form onSubmit={handleSaveCiLink} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Select Proforma Invoice (PI)</label>
                <select
                  value={ciTargetPiId}
                  onChange={e => setCiTargetPiId(e.target.value)}
                  className="w-full p-2 rounded-lg border border-slate-300 bg-white font-semibold"
                >
                  <option value="">-- Direct Purchase / No Linked PI --</option>
                  {db.proformaInvoices
                    .filter(p => p.companyId === linkingCi.companyId && p.supplierId === linkingCi.supplierId && p.currency === linkingCi.currency)
                    .map(p => (
                      <option key={p.id} value={p.id}>{p.piNo} ({formatFC(p.piValueFC)} {p.currency})</option>
                    ))}
                </select>
              </div>
              <div className="pt-3 border-t flex justify-end space-x-2">
                <button type="button" onClick={() => setLinkingCi(null)} className="px-3 py-1.5 bg-slate-100 rounded-lg font-semibold">Cancel</button>
                <button type="submit" className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700">Save PI Link</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
