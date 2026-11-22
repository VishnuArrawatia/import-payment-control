import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  formatFC,
  formatINR,
  formatDate,
  formatRate,
} from '../utils/formatters';
import { exportToExcel } from '../utils/excel';
import {
  Download,
  Printer,
  Search,
  Building2,
  Calendar,
  DollarSign,
  CreditCard,
  Receipt,
  FileSpreadsheet,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  FileCheck2,
  Filter,
} from 'lucide-react';

export const PartyLedgerScreen: React.FC = () => {
  const { db, selectedCompanyId, asOfDate } = useApp();

  // Filters (matching user specification)
  const [filterCompany, setFilterCompany] = useState<string>(
    selectedCompanyId !== 'ALL' ? selectedCompanyId : db.companies[0]?.id || 'ALL'
  );

  const availableSuppliers = useMemo(() => {
    return db.suppliers.filter(
      s => s.active && (filterCompany === 'ALL' || s.companyId === filterCompany)
    );
  }, [db.suppliers, filterCompany]);

  const [selectedVendorId, setSelectedVendorId] = useState<string>(() => {
    // Default to V00088 or first vendor
    const found = db.suppliers.find(s => s.vendorCode === 'V00088') || db.suppliers[0];
    return found?.id || '';
  });

  const [currencyFilter, setCurrencyFilter] = useState<'ALL' | 'USD' | 'CNY'>('ALL');
  const [fromDate, setFromDate] = useState<string>('2026-04-01');
  const [toDate, setToDate] = useState<string>(asOfDate || '2026-11-21');
  const [searchQuery, setSearchQuery] = useState('');

  // Auto-sync selectedVendorId if not in available list
  useMemo(() => {
    if (availableSuppliers.length > 0 && !availableSuppliers.some(s => s.id === selectedVendorId)) {
      setSelectedVendorId(availableSuppliers[0].id);
    }
  }, [availableSuppliers, selectedVendorId]);

  const activeSupplier = useMemo(() => {
    return db.suppliers.find(s => s.id === selectedVendorId);
  }, [db.suppliers, selectedVendorId]);

  const companyMap = useMemo(() => new Map(db.companies.map(c => [c.id, c])), [db.companies]);
  const piMap = useMemo(() => new Map(db.proformaInvoices.map(p => [p.id, p])), [db.proformaInvoices]);
  const ciMap = useMemo(() => new Map(db.commercialInvoices.map(c => [c.id, c])), [db.commercialInvoices]);
  const bankMap = useMemo(() => new Map(db.bankAccounts.map(b => [b.id, b])), [db.bankAccounts]);

  const bankLabel = (bankId?: string) => {
    if (!bankId) return '-';
    const b = bankMap.get(bankId);
    return b ? `${b.bankName} - ${b.accountNumber.slice(-4)}` : bankId;
  };

  // Compile Ledger Transactions & Cumulative Balances
  const ledgerResult = useMemo(() => {
    if (!activeSupplier) {
      return {
        openingUSD: 0,
        openingCNY: 0,
        openingINR: 0,
        billsUSD: 0,
        billsCNY: 0,
        billsINR: 0,
        paidUSD: 0,
        paidCNY: 0,
        paidINR: 0,
        closingUSD: 0,
        closingCNY: 0,
        closingINR: 0,
        rows: [],
      };
    }

    interface RawLedgerEntry {
      id: string;
      date: string;
      sortOrder: number;
      type: string;
      curr: 'USD' | 'CNY' | string;
      piNo: string;
      ciNo: string;
      billFC: number; // Cr (+)
      paymentFC: number; // Dr (-)
      billINR: number;
      paymentINR: number;
      utrLcBoe: string;
      lcOpenFC: number;
      remarks: string;
    }

    const allEntries: RawLedgerEntry[] = [];

    // 1. Opening Balances
    db.openingBalances
      .filter(ob => {
        if (ob.supplierId !== selectedVendorId) return false;
        if (filterCompany !== 'ALL' && ob.companyId !== filterCompany) return false;
        if (currencyFilter !== 'ALL' && ob.currency !== currencyFilter) return false;
        return true;
      })
      .forEach(ob => {
        const isCr = ob.balanceType === 'Cr';
        const isDr = ob.balanceType === 'Dr';
        allEntries.push({
          id: `OB-${ob.id}`,
          date: ob.originalDocumentDate || ob.referenceDate || '2026-04-01',
          sortOrder: 0,
          type: `Opening (${ob.balanceType})`,
          curr: ob.currency,
          piNo: ob.referenceType === 'PI' ? ob.referenceNo : '-',
          ciNo: ob.referenceType === 'CI' ? ob.referenceNo : '-',
          billFC: isCr ? ob.amountFC : 0,
          paymentFC: isDr ? ob.amountFC : 0,
          billINR: isCr ? ob.amountINR : 0,
          paymentINR: isDr ? ob.amountINR : 0,
          utrLcBoe: ob.boeNo || '-',
          lcOpenFC: 0,
          remarks: ob.remarks || `Opening ${ob.referenceType} @ rate ${formatRate(ob.rate)}`,
        });
      });

    // 2. Commercial Invoices (Bills booked) -> Credit (+)
    db.commercialInvoices
      .filter(ci => {
        if (ci.supplierId !== selectedVendorId) return false;
        if (filterCompany !== 'ALL' && ci.companyId !== filterCompany) return false;
        if (currencyFilter !== 'ALL' && ci.currency !== currencyFilter) return false;
        return true;
      })
      .forEach(ci => {
        const pi = piMap.get(ci.linkedPiId);
        allEntries.push({
          id: `CI-${ci.id}`,
          date: ci.ciDate,
          sortOrder: 1,
          type: 'Purchase (CI)',
          curr: ci.currency,
          piNo: pi?.piNo || '-',
          ciNo: ci.ciNo,
          billFC: ci.ciValueFC,
          paymentFC: 0,
          billINR: ci.purchaseINR,
          paymentINR: 0,
          utrLcBoe: ci.boeNo ? `BOE: ${ci.boeNo}` : 'BOE Pending',
          lcOpenFC: 0,
          remarks: `Port: ${ci.portCode || '-'} | BOE Rate: ${formatRate(ci.boeExchangeRate)}`,
        });
      });

    // 3. Payments made -> Debit (-)
    db.payments
      .filter(p => {
        if (p.supplierId !== selectedVendorId) return false;
        if (filterCompany !== 'ALL' && p.companyId !== filterCompany) return false;
        if (currencyFilter !== 'ALL' && p.currency !== currencyFilter) return false;
        return true;
      })
      .forEach(p => {
        const isLC = p.paymentMode === 'LC';
        const isLCPaid = isLC && p.lcStatus === 'Paid';
        const isLCOpen = isLC && p.lcStatus !== 'Paid';

        // An LC that is not yet paid does not reduce cash yet, but represents an LC Open commitment
        if (isLCOpen) {
          const linkedPI = p.linkedPiId ? piMap.get(p.linkedPiId) : undefined;
          allEntries.push({
            id: `LC-${p.id}`,
            date: p.paymentDate,
            sortOrder: 2,
            type: 'LC Opened (Commitment)',
            curr: p.currency,
            piNo: linkedPI?.piNo || '-',
            ciNo: '-',
            billFC: 0,
            paymentFC: 0,
            billINR: 0,
            paymentINR: 0,
            utrLcBoe: p.lcNo ? `LC: ${p.lcNo}` : 'LC Open',
            lcOpenFC: p.amountFC,
            remarks: `LC Open: ${p.lcOpenDate || '-'} | Bank: ${bankLabel(p.bankAccountId)}`,
          });
        } else {
          const linkedPI = p.linkedPiId ? piMap.get(p.linkedPiId) : undefined;
          allEntries.push({
            id: `PAY-${p.id}`,
            date: p.paymentDate,
            sortOrder: 2,
            type: `Payment (${p.paymentAgainst || p.paymentMode})`,
            curr: p.currency,
            piNo: linkedPI?.piNo || '-',
            ciNo: '-',
            billFC: 0,
            paymentFC: p.amountFC,
            billINR: 0,
            paymentINR: p.inrAmount,
            utrLcBoe: p.utrSwiftRef ? `UTR: ${p.utrSwiftRef}` : p.bankReferenceNo || '-',
            lcOpenFC: 0,
            remarks: `${bankLabel(p.bankAccountId)} | Rate: ${formatRate(p.actualExchangeRate)}`,
          });
        }
      });

    // 4. Debit Notes -> reduces payable (acts as Debit)
    db.debitNotes
      .filter(dn => {
        if (dn.supplierId !== selectedVendorId) return false;
        if (filterCompany !== 'ALL' && dn.companyId !== filterCompany) return false;
        if (currencyFilter !== 'ALL' && dn.currency !== currencyFilter) return false;
        return true;
      })
      .forEach(dn => {
        allEntries.push({
          id: `DN-${dn.id}`,
          date: dn.dnDate,
          sortOrder: 3,
          type: `Debit Note (${dn.recoveryMethod})`,
          curr: dn.currency,
          piNo: '-',
          ciNo: '-',
          billFC: 0,
          paymentFC: dn.amountFC,
          billINR: 0,
          paymentINR: dn.inrAmount,
          utrLcBoe: `DN: ${dn.dnNo}`,
          lcOpenFC: 0,
          remarks: `${dn.reason} @ rate ${formatRate(dn.rate)} (Status: ${dn.status})`,
        });
      });

    // 5. Refunds Received -> increases payable/reduces supplier advance (acts as Credit)
    db.refundReceipts
      .filter(rf => {
        if (rf.supplierId !== selectedVendorId) return false;
        if (filterCompany !== 'ALL' && rf.companyId !== filterCompany) return false;
        if (currencyFilter !== 'ALL' && rf.currency !== currencyFilter) return false;
        return true;
      })
      .forEach(rf => {
        allEntries.push({
          id: `RF-${rf.id}`,
          date: rf.date,
          sortOrder: 4,
          type: 'Refund Inward',
          curr: rf.currency,
          piNo: '-',
          ciNo: '-',
          billFC: rf.amountFC,
          paymentFC: 0,
          billINR: rf.inrAmount,
          paymentINR: 0,
          utrLcBoe: rf.bankReferenceNo || 'Refund',
          lcOpenFC: 0,
          remarks: `Refund received via ${bankLabel(rf.bankAccountId)} @ rate ${formatRate(rf.actualExchangeRate)}`,
        });
      });

    // 6. Journal Vouchers / Adjustments (JV)
    (db.adjustments || [])
      .filter(adj => {
        if (adj.supplierId !== selectedVendorId) return false;
        if (filterCompany !== 'ALL' && adj.companyId !== filterCompany) return false;
        if (currencyFilter !== 'ALL' && adj.currency !== currencyFilter) return false;
        return true;
      })
      .forEach(adj => {
        allEntries.push({
          id: `JV-${adj.id}`,
          date: adj.date,
          sortOrder: 5,
          type: 'JV / Adjustment',
          curr: adj.currency,
          piNo: adj.fromType === 'PI' ? (piMap.get(adj.fromId)?.piNo || adj.fromId) : (adj.toType === 'PI' ? (piMap.get(adj.toId)?.piNo || adj.toId) : '-'),
          ciNo: adj.fromType === 'CI' ? (ciMap.get(adj.fromId)?.ciNo || adj.fromId) : (adj.toType === 'CI' ? (ciMap.get(adj.toId)?.ciNo || adj.toId) : '-'),
          billFC: 0,
          paymentFC: 0,
          billINR: 0,
          paymentINR: 0,
          utrLcBoe: `JV: ${adj.id.slice(-6)}`,
          lcOpenFC: 0,
          remarks: `JV Transfer: ${adj.fromType} → ${adj.toType} (${formatFC(adj.amountFC)} ${adj.currency}) | ${adj.remarks || 'Inter-doc balance adjustment'}`,
        });
      });

    // Sort strictly chronologically by date, then sortOrder
    allEntries.sort((a, b) => a.date.localeCompare(b.date) || a.sortOrder - b.sortOrder);

    // Compute Opening (Transactions strictly BEFORE From Date)
    let openingUSD = 0;
    let openingCNY = 0;
    let openingINR = 0;

    const periodEntries: RawLedgerEntry[] = [];

    for (const e of allEntries) {
      if (e.date < fromDate) {
        // Net = Bill (Cr +) - Payment (Dr -)
        const netFC = e.billFC - e.paymentFC;
        const netINR = e.billINR - e.paymentINR;
        if (e.curr === 'USD') openingUSD += netFC;
        else if (e.curr === 'CNY') openingCNY += netFC;
        openingINR += netINR;
      } else if (e.date <= toDate) {
        periodEntries.push(e);
      }
    }

    // Now compute running cumulative balance across period entries
    let runUSD = openingUSD;
    let runCNY = openingCNY;
    let runINR = openingINR;

    let billsUSD = 0;
    let billsCNY = 0;
    let billsINR = 0;

    let paidUSD = 0;
    let paidCNY = 0;
    let paidINR = 0;

    interface ProcessedRow extends RawLedgerEntry {
      srNo: number;
      runningUSD: number;
      runningCNY: number;
      runningINR: number;
    }

    const rows: ProcessedRow[] = [];

    periodEntries.forEach((e, idx) => {
      if (e.curr === 'USD') {
        billsUSD += e.billFC;
        paidUSD += e.paymentFC;
        runUSD += e.billFC - e.paymentFC;
      } else if (e.curr === 'CNY') {
        billsCNY += e.billFC;
        paidCNY += e.paymentFC;
        runCNY += e.billFC - e.paymentFC;
      }

      billsINR += e.billINR;
      paidINR += e.paymentINR;
      runINR += e.billINR - e.paymentINR;

      rows.push({
        ...e,
        srNo: idx + 1,
        runningUSD: runUSD,
        runningCNY: runCNY,
        runningINR: runINR,
      });
    });

    const closingUSD = runUSD;
    const closingCNY = runCNY;
    const closingINR = runINR;

    return {
      openingUSD,
      openingCNY,
      openingINR,
      billsUSD,
      billsCNY,
      billsINR,
      paidUSD,
      paidCNY,
      paidINR,
      closingUSD,
      closingCNY,
      closingINR,
      rows,
    };
  }, [
    activeSupplier,
    selectedVendorId,
    filterCompany,
    currencyFilter,
    fromDate,
    toDate,
    db.openingBalances,
    db.commercialInvoices,
    db.payments,
    db.debitNotes,
    db.refundReceipts,
    piMap,
    bankMap,
  ]);

  // Filtered rows by search query
  const displayRows = useMemo(() => {
    if (!searchQuery.trim()) return ledgerResult.rows;
    const q = searchQuery.toLowerCase().trim();
    return ledgerResult.rows.filter(
      r =>
        r.ciNo.toLowerCase().includes(q) ||
        r.piNo.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q) ||
        r.utrLcBoe.toLowerCase().includes(q) ||
        r.remarks.toLowerCase().includes(q)
    );
  }, [ledgerResult.rows, searchQuery]);

  // Excel Export matching the user spreadsheet
  const handleExportExcel = () => {
    if (!activeSupplier) return;

    const compName = filterCompany === 'ALL' ? 'Consolidated' : companyMap.get(filterCompany)?.code || filterCompany;

    const summaryBlock = [
      { A: 'PARTY LEDGER — kis date ko, kaunsi PI / CI ke saamne kitna bill aur payment' },
      { A: `Company: ${compName}`, B: `Vendor Code: ${activeSupplier.vendorCode}`, C: `Party Name: ${activeSupplier.supplierName}`, D: `Country: ${activeSupplier.country || 'China'}` },
      { A: `Currency: ${currencyFilter}`, B: `From Date: ${fromDate}`, C: `To Date: ${toDate}` },
      {},
      { A: '', B: 'USD', C: 'CNY', D: 'INR (book)' },
      { A: 'Opening (From date se pehle)', B: ledgerResult.openingUSD, C: ledgerResult.openingCNY, D: Math.round(ledgerResult.openingINR) },
      { A: 'Bills / CI (+)', B: ledgerResult.billsUSD, C: ledgerResult.billsCNY, D: Math.round(ledgerResult.billsINR) },
      { A: 'Payments (−)', B: ledgerResult.paidUSD, C: ledgerResult.paidCNY, D: Math.round(ledgerResult.paidINR) },
      { A: 'CLOSING', B: ledgerResult.closingUSD, C: ledgerResult.closingCNY, D: Math.round(ledgerResult.closingINR) },
      {},
    ];

    const detailedRows = displayRows.map(r => ({
      '#': r.srNo,
      Date: r.date,
      Type: r.type,
      Curr: r.curr,
      'PI No': r.piNo,
      'CI No': r.ciNo,
      'Bill FC (Cr +)': r.billFC || '',
      'Payment FC (Dr −)': r.paymentFC || '',
      'Running USD': r.runningUSD,
      'Running CNY': r.runningCNY,
      'Bill INR': r.billINR || '',
      'Payment INR': r.paymentINR || '',
      'Running INR (book)': r.runningINR,
      'UTR / LC / BOE': r.utrLcBoe,
      'LC Open FC': r.lcOpenFC || '',
      Remarks: r.remarks,
    }));

    exportToExcel(detailedRows, `Party_Ledger_${activeSupplier.vendorCode}_${fromDate}_to_${toDate}`);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Banner & Control Deck (Ref Image 2: Yellow cells) */}
      <div className="bg-white/95 dark:bg-slate-900/80 backdrop-blur-xl p-5 rounded-3xl shadow-sm border border-slate-200/80 dark:border-white/10 transition-colors">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/70 dark:border-white/10 pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-amber-500 to-indigo-600 text-white flex items-center justify-center font-bold shadow-md shadow-amber-500/20">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900 dark:text-white tracking-tight">
                  PARTY LEDGER — Bill & Payment Statement
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  Date-wise, PI/CI-wise comprehensive running statement with dual-currency & book INR tracking
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleExportExcel}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-2xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export to Excel</span>
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-2xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-white/10 transition-all cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>
          </div>
        </div>

        {/* Yellow Filter Cells Selection Grid (Matching User Spreadsheet) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 mt-4 bg-amber-50/60 dark:bg-amber-950/20 p-4 rounded-2xl border border-amber-200/70 dark:border-amber-900/40">
          {/* Company */}
          <div>
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-amber-900 dark:text-amber-300 block mb-1">
              Company
            </label>
            <select
              value={filterCompany}
              onChange={e => setFilterCompany(e.target.value)}
              className="w-full bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-slate-100 px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-800/80 shadow-2xs focus:outline-none cursor-pointer"
            >
              <option value="ALL">ALL Companies (Consolidated)</option>
              {db.companies.map(c => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.fullName}
                </option>
              ))}
            </select>
          </div>

          {/* Vendor Code */}
          <div>
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-amber-900 dark:text-amber-300 block mb-1">
              Vendor Code (Supplier)
            </label>
            <select
              value={selectedVendorId}
              onChange={e => setSelectedVendorId(e.target.value)}
              className="w-full bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-slate-100 px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-800/80 shadow-2xs focus:outline-none cursor-pointer"
            >
              {availableSuppliers.map(s => (
                <option key={s.id} value={s.id}>
                  {s.vendorCode} — {s.supplierName} ({s.country || 'CN'})
                </option>
              ))}
            </select>
          </div>

          {/* Currency */}
          <div>
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-amber-900 dark:text-amber-300 block mb-1">
              Currency
            </label>
            <select
              value={currencyFilter}
              onChange={e => setCurrencyFilter(e.target.value as any)}
              className="w-full bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-slate-100 px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-800/80 shadow-2xs focus:outline-none cursor-pointer"
            >
              <option value="ALL">ALL Currencies (USD + CNY)</option>
              <option value="USD">USD Only</option>
              <option value="CNY">CNY Only</option>
            </select>
          </div>

          {/* From Date */}
          <div>
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-amber-900 dark:text-amber-300 block mb-1">
              From Date
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="w-full bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-slate-100 px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-800/80 shadow-2xs focus:outline-none cursor-pointer"
            />
          </div>

          {/* To Date */}
          <div>
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-amber-900 dark:text-amber-300 block mb-1">
              To Date
            </label>
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              className="w-full bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-slate-100 px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-800/80 shadow-2xs focus:outline-none cursor-pointer"
            />
          </div>
        </div>

        {/* Party Profile Header */}
        {activeSupplier && (
          <div className="mt-3.5 flex flex-wrap items-center justify-between px-2 text-xs">
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-slate-900 dark:text-white text-sm">
                {activeSupplier.supplierName}
              </span>
              <span className="font-mono text-indigo-700 dark:text-indigo-400 font-bold bg-indigo-50 dark:bg-indigo-950/70 px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800">
                {activeSupplier.vendorCode}
              </span>
              <span className="text-slate-400">•</span>
              <span className="text-slate-600 dark:text-slate-300">{activeSupplier.country || 'China'}</span>
            </div>
            <div className="text-slate-500 dark:text-slate-400 text-[11px]">
              Running logic: <span className="text-amber-700 dark:text-amber-400 font-bold">+ = Payable (Cr)</span>, <span className="text-emerald-700 dark:text-emerald-400 font-bold">− = Debit balance / Advance with supplier (Dr)</span>
            </div>
          </div>
        )}
      </div>

      {/* Summary Box: Opening, Bills, Payments, Closing (Exact Match for User Spreadsheet) */}
      <div className="bg-white/95 dark:bg-slate-900/80 backdrop-blur-xl rounded-3xl p-5 shadow-sm border border-slate-200/80 dark:border-white/10 overflow-hidden">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white mb-3 flex items-center justify-between">
          <span>Party Position Summary (USD • CNY • INR)</span>
          <span className="text-[11px] font-semibold text-slate-500 font-normal">
            Period: {formatDate(fromDate)} to {formatDate(toDate)}
          </span>
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-slate-100/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-white/10">
                <th className="px-4 py-2.5">Position Item</th>
                <th className="px-4 py-2.5 text-right font-mono">USD</th>
                <th className="px-4 py-2.5 text-right font-mono">CNY</th>
                <th className="px-4 py-2.5 text-right font-mono">INR (Book Value)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-semibold">
              <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">
                  Opening (From date se pehle)
                </td>
                <td className="px-4 py-2.5 text-right font-mono">{formatFC(ledgerResult.openingUSD)}</td>
                <td className="px-4 py-2.5 text-right font-mono">{formatFC(ledgerResult.openingCNY)}</td>
                <td className="px-4 py-2.5 text-right font-mono">{formatINR(ledgerResult.openingINR)}</td>
              </tr>
              <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 text-amber-800 dark:text-amber-300 bg-amber-50/20 dark:bg-amber-950/10">
                <td className="px-4 py-2.5 font-bold">
                  Bills / CI (+)
                </td>
                <td className="px-4 py-2.5 text-right font-mono font-bold">{formatFC(ledgerResult.billsUSD)}</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold">{formatFC(ledgerResult.billsCNY)}</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold">{formatINR(ledgerResult.billsINR)}</td>
              </tr>
              <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 text-emerald-800 dark:text-emerald-300 bg-emerald-50/20 dark:bg-emerald-950/10">
                <td className="px-4 py-2.5 font-bold">
                  Payments (−)
                </td>
                <td className="px-4 py-2.5 text-right font-mono font-bold">{formatFC(ledgerResult.paidUSD)}</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold">{formatFC(ledgerResult.paidCNY)}</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold">{formatINR(ledgerResult.paidINR)}</td>
              </tr>
              <tr className="bg-slate-100/90 dark:bg-slate-800/90 font-black text-slate-900 dark:text-white border-t-2 border-slate-300 dark:border-white/20">
                <td className="px-4 py-3 uppercase tracking-wider flex items-center justify-between">
                  <span>CLOSING BALANCE</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    ledgerResult.closingINR >= 0
                      ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                      : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                  }`}>
                    {ledgerResult.closingINR >= 0 ? '+ Payable (Cr)' : '− Debit Balance (Dr)'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-mono text-sm">{formatFC(ledgerResult.closingUSD)}</td>
                <td className="px-4 py-3 text-right font-mono text-sm">{formatFC(ledgerResult.closingCNY)}</td>
                <td className="px-4 py-3 text-right font-mono text-sm text-indigo-700 dark:text-indigo-400">
                  {formatINR(ledgerResult.closingINR)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Chronological Running Ledger Table (Exact 16 Columns) */}
      <div className="bg-white/95 dark:bg-slate-900/80 backdrop-blur-xl rounded-3xl p-5 shadow-sm border border-slate-200/80 dark:border-white/10 overflow-hidden space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
              Chronological Ledger Entries ({displayRows.length} Records)
            </h3>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search PI, CI, UTR, BOE..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-white/10 rounded-xl text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none w-56 shadow-2xs"
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-white/10">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-100/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200 dark:border-white/10">
              <tr>
                <th className="px-3 py-3 text-center">#</th>
                <th className="px-3 py-3">Date</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-2 py-3 text-center">Curr</th>
                <th className="px-3 py-3">PI No</th>
                <th className="px-3 py-3">CI No</th>
                <th className="px-3 py-3 text-right bg-amber-50/60 dark:bg-amber-950/20 text-amber-900 dark:text-amber-300 font-bold">
                  Bill FC (Cr +)
                </th>
                <th className="px-3 py-3 text-right bg-emerald-50/60 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-300 font-bold">
                  Payment FC (Dr −)
                </th>
                <th className="px-3 py-3 text-right font-black text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800/50">
                  Running USD
                </th>
                <th className="px-3 py-3 text-right font-black text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800/50">
                  Running CNY
                </th>
                <th className="px-3 py-3 text-right text-amber-900 dark:text-amber-300 bg-amber-50/40 dark:bg-amber-950/10">
                  Bill INR
                </th>
                <th className="px-3 py-3 text-right text-emerald-900 dark:text-emerald-300 bg-emerald-50/40 dark:bg-emerald-950/10">
                  Payment INR
                </th>
                <th className="px-3 py-3 text-right font-black text-indigo-700 dark:text-indigo-400 bg-indigo-50/30 dark:bg-indigo-950/20">
                  Running INR (book)
                </th>
                <th className="px-3 py-3">UTR / LC / BOE</th>
                <th className="px-3 py-3 text-right">LC Open FC</th>
                <th className="px-4 py-3">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-medium text-slate-700 dark:text-slate-300 text-xs">
              {displayRows.length === 0 ? (
                <tr>
                  <td colSpan={16} className="px-4 py-10 text-center text-slate-400 dark:text-slate-500">
                    No transactions found for the selected vendor and date range.
                  </td>
                </tr>
              ) : (
                displayRows.map(r => (
                  <tr
                    key={r.id}
                    className="hover:bg-slate-50/90 dark:hover:bg-slate-800/60 transition-colors"
                  >
                    <td className="px-3 py-2.5 text-center text-slate-400 font-mono text-[11px]">{r.srNo}</td>
                    <td className="px-3 py-2.5 font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                      {formatDate(r.date)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                        {r.type}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-center font-bold text-slate-800 dark:text-slate-200">
                      {r.curr}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-indigo-600 dark:text-indigo-400">
                      {r.piNo}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] font-semibold text-slate-900 dark:text-white">
                      {r.ciNo}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-amber-700 dark:text-amber-400 bg-amber-50/30 dark:bg-amber-950/10">
                      {r.billFC > 0 ? formatFC(r.billFC) : '-'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50/30 dark:bg-emerald-950/10">
                      {r.paymentFC > 0 ? formatFC(r.paymentFC) : '-'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900 dark:text-white bg-slate-50/60 dark:bg-slate-800/40">
                      {formatFC(r.runningUSD)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900 dark:text-white bg-slate-50/60 dark:bg-slate-800/40">
                      {formatFC(r.runningCNY)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-amber-800 dark:text-amber-300 bg-amber-50/20 dark:bg-amber-950/10">
                      {r.billINR > 0 ? formatINR(r.billINR) : '-'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-emerald-800 dark:text-emerald-300 bg-emerald-50/20 dark:bg-emerald-950/10">
                      {r.paymentINR > 0 ? formatINR(r.paymentINR) : '-'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-black text-indigo-700 dark:text-indigo-400 bg-indigo-50/20 dark:bg-indigo-950/10">
                      {formatINR(r.runningINR)}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {r.utrLcBoe}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-600 dark:text-slate-400">
                      {r.lcOpenFC > 0 ? formatFC(r.lcOpenFC) : '-'}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 text-[11px] max-w-xs truncate" title={r.remarks}>
                      {r.remarks}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
