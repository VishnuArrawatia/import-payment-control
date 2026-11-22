import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { formatFC, formatINR, formatDate, formatRate } from '../utils/formatters';
import { exportMultiSheetExcel } from '../utils/excel';
import {
  TrendingUp,
  TrendingDown,
  Scale,
  Calendar,
  Building2,
  Search,
  Download,
  Filter,
  DollarSign,
  ArrowUpRight,
  Calculator,
  Layers,
  CheckCircle2,
  FileSpreadsheet,
  BookOpen,
} from 'lucide-react';

interface FxGainLossScreenProps {
  onNavigateToLedger?: (vendorCode: string) => void;
}

export const FxGainLossScreen: React.FC<FxGainLossScreenProps> = ({ onNavigateToLedger }) => {
  const { db, engineResult, selectedCompanyId, asOfDate } = useApp();

  // Local filter states
  const [activeTab, setActiveTab] = useState<'realized' | 'unrealized' | 'supplier_summary'>('realized');
  const [currencyFilter, setCurrencyFilter] = useState<string>('ALL');
  const [fromDate, setFromDate] = useState<string>('2026-04-01');
  const [toDate, setToDate] = useState<string>(asOfDate || new Date().toISOString().split('T')[0]);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Year-End MTM Valuation Rates (Defaults from Month-End rate master or reasonable defaults)
  const defaultUsdMtmRate = useMemo(() => {
    const r = db.monthEndRates.find(m => m.currency === 'USD');
    return r ? r.valuationRate : 88.0;
  }, [db.monthEndRates]);

  const defaultCnyMtmRate = useMemo(() => {
    const r = db.monthEndRates.find(m => m.currency === 'CNY');
    return r ? r.valuationRate : 12.1;
  }, [db.monthEndRates]);

  const [usdMtmRate, setUsdMtmRate] = useState<number>(defaultUsdMtmRate);
  const [cnyMtmRate, setCnyMtmRate] = useState<number>(defaultCnyMtmRate);

  // Supplier and Bank Lookup Maps
  const supplierMap = useMemo(() => new Map(db.suppliers.map(s => [s.id, s])), [db.suppliers]);
  const companyMap = useMemo(() => new Map(db.companies.map(c => [c.id, c])), [db.companies]);
  const paymentMap = useMemo(() => new Map(db.payments.map(p => [p.id, p])), [db.payments]);
  const bankMap = useMemo(() => new Map(db.bankAccounts.map(b => [b.id, b])), [db.bankAccounts]);
  const ciMap = useMemo(() => new Map(db.commercialInvoices.map(c => [c.id, c])), [db.commercialInvoices]);
  const obMap = useMemo(() => new Map(db.openingBalances.map(o => [o.id, o])), [db.openingBalances]);

  // 1. BILL-WISE REALIZED FX ALLOCATIONS
  const realizedRows = useMemo(() => {
    const rows = [];

    for (const alloc of engineResult.allocations) {
      if (selectedCompanyId !== 'ALL' && alloc.companyId !== selectedCompanyId) continue;
      if (currencyFilter !== 'ALL' && alloc.currency !== currencyFilter) continue;
      if (alloc.paymentDate && (alloc.paymentDate < fromDate || alloc.paymentDate > toDate)) continue;

      const supp = supplierMap.get(alloc.supplierId);
      const comp = companyMap.get(alloc.companyId);
      const pmt = paymentMap.get(alloc.paymentId);
      const bank = pmt ? bankMap.get(pmt.bankAccountId) : undefined;
      const ci = alloc.ciId ? ciMap.get(alloc.ciId) : undefined;
      const ob = !ci && alloc.paymentId ? obMap.get(alloc.paymentId) : undefined;

      const docNo = ci ? ci.ciNo : (ob ? (ob.referenceNo || 'Opening Cr') : 'Bill');
      const docDate = ci ? ci.ciDate : (ob ? (ob.originalDocumentDate || ob.referenceDate) : alloc.ciDate);
      const boeNo = alloc.boeNo || (ci ? ci.boeNo : '-');

      const billRate = alloc.boeRate;
      const paidRate = alloc.paymentRate;
      const settledFC = alloc.amountFC;
      const billValueINR = Math.round(settledFC * billRate);
      const paidValueINR = Math.round(settledFC * paidRate);
      const realizedGL = alloc.realizedGainLossINR; // positive = gain, negative = loss

      const swiftNo = pmt?.swiftNo || (pmt?.utrSwiftRef?.startsWith('SWIFT') ? pmt.utrSwiftRef : '');
      const utrNo = pmt?.utrNo || (!pmt?.utrSwiftRef?.startsWith('SWIFT') ? pmt?.utrSwiftRef : '') || pmt?.bankReferenceNo || '';

      // Search match
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const str = `${supp?.vendorCode || ''} ${supp?.supplierName || ''} ${docNo} ${boeNo} ${swiftNo} ${utrNo} ${pmt?.bankReferenceNo || ''}`.toLowerCase();
        if (!str.includes(q)) continue;
      }

      rows.push({
        id: alloc.id,
        companyCode: comp?.code || 'SVN',
        vendorCode: supp?.vendorCode || 'V-UNK',
        supplierName: supp?.supplierName || 'Unknown Supplier',
        currency: alloc.currency,
        docNo,
        docDate,
        boeNo,
        boeDate: alloc.boeDate || (ci ? ci.boeDate : '-'),
        settledFC,
        billRate,
        billValueINR,
        paymentDate: alloc.paymentDate,
        bankName: bank ? `${bank.bankName} (${bank.accountNumber.slice(-4)})` : 'Bank Outward',
        bankRefNo: pmt?.bankReferenceNo || '-',
        utrNo: utrNo || '-',
        swiftNo: swiftNo || '-',
        paidRate,
        paidValueINR,
        realizedGL,
        isGain: realizedGL >= 0,
      });
    }

    // Sort by payment date descending
    return rows.sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || ''));
  }, [engineResult.allocations, selectedCompanyId, currencyFilter, fromDate, toDate, searchQuery, supplierMap, companyMap, paymentMap, bankMap, ciMap, obMap]);

  // 2. YEAR-END UNREALIZED (MTM) REVALUATION WORKING (OPEN BILLS & ADVANCES)
  const unrealizedRows = useMemo(() => {
    const rows = [];

    // 2a. Open Commercial Invoices (Payables)
    for (const [, state] of engineResult.ciStates) {
      if (selectedCompanyId !== 'ALL' && state.ci.companyId !== selectedCompanyId) continue;
      if (currencyFilter !== 'ALL' && state.ci.currency !== currencyFilter) continue;
      if (state.ci.ciDate && state.ci.ciDate > toDate) continue;
      if (state.balanceFC <= 0) continue; // Only open balances

      const supp = supplierMap.get(state.ci.supplierId);
      const comp = companyMap.get(state.ci.companyId);
      const curr = state.ci.currency;
      const closingMtmRate = curr === 'USD' ? usdMtmRate : cnyMtmRate;
      const bookRate = state.ci.boeExchangeRate;
      const openFC = state.balanceFC;
      const bookValueINR = Math.round(openFC * bookRate);
      const revaluedINR = Math.round(openFC * closingMtmRate);
      // For a payable, if closing rate > book rate, you pay more => LOSS (-). Formula: openFC * (bookRate - closingRate)
      const unrealizedGL = Math.round(openFC * (bookRate - closingMtmRate));

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const str = `${supp?.vendorCode || ''} ${supp?.supplierName || ''} ${state.ci.ciNo} ${state.ci.boeNo || ''}`.toLowerCase();
        if (!str.includes(q)) continue;
      }

      rows.push({
        id: `MTM-CI-${state.ci.id}`,
        companyCode: comp?.code || 'SVN',
        vendorCode: supp?.vendorCode || 'V-UNK',
        supplierName: supp?.supplierName || 'Unknown Supplier',
        docType: 'Commercial Invoice (Payable)',
        docNo: state.ci.ciNo,
        docDate: state.ci.ciDate,
        boeNo: state.ci.boeNo || '-',
        currency: curr,
        totalDocFC: state.ci.ciValueFC,
        bookingRate: bookRate,
        openFC,
        bookValueINR,
        closingMtmRate,
        revaluedINR,
        unrealizedGL,
        isGain: unrealizedGL >= 0,
        isDebit: false,
      });
    }

    // 2b. Open Opening Balances (Cr Payables)
    for (const [, state] of engineResult.openingPayableStates) {
      if (selectedCompanyId !== 'ALL' && state.ob.companyId !== selectedCompanyId) continue;
      if (currencyFilter !== 'ALL' && state.ob.currency !== currencyFilter) continue;
      const obDate = state.ob.originalDocumentDate || state.ob.referenceDate;
      if (obDate && obDate > toDate) continue;
      if (state.balanceFC <= 0) continue;

      const supp = supplierMap.get(state.ob.supplierId);
      const comp = companyMap.get(state.ob.companyId);
      const curr = state.ob.currency;
      const closingMtmRate = curr === 'USD' ? usdMtmRate : cnyMtmRate;
      const bookRate = state.ob.rate;
      const openFC = state.balanceFC;
      const bookValueINR = Math.round(openFC * bookRate);
      const revaluedINR = Math.round(openFC * closingMtmRate);
      const unrealizedGL = Math.round(openFC * (bookRate - closingMtmRate));

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const str = `${supp?.vendorCode || ''} ${supp?.supplierName || ''} ${state.ob.referenceNo || ''}`.toLowerCase();
        if (!str.includes(q)) continue;
      }

      rows.push({
        id: `MTM-OB-${state.ob.id}`,
        companyCode: comp?.code || 'SVN',
        vendorCode: supp?.vendorCode || 'V-UNK',
        supplierName: supp?.supplierName || 'Unknown Supplier',
        docType: 'Opening Balance (Payable)',
        docNo: state.ob.referenceNo || 'OB-Cr',
        docDate: obDate,
        boeNo: '-',
        currency: curr,
        totalDocFC: state.ob.amountFC,
        bookingRate: bookRate,
        openFC,
        bookValueINR,
        closingMtmRate,
        revaluedINR,
        unrealizedGL,
        isGain: unrealizedGL >= 0,
        isDebit: false,
      });
    }

    // 2c. Open Advances / Excess Payments (Dr with Suppliers)
    for (const chunk of engineResult.unappliedPayments) {
      if (selectedCompanyId !== 'ALL' && chunk.companyId !== selectedCompanyId) continue;
      if (currencyFilter !== 'ALL' && chunk.currency !== currencyFilter) continue;
      if (chunk.date && chunk.date > toDate) continue;
      if (chunk.remainingFC <= 0) continue;

      const supp = supplierMap.get(chunk.supplierId);
      const comp = companyMap.get(chunk.companyId);
      const curr = chunk.currency;
      const closingMtmRate = curr === 'USD' ? usdMtmRate : cnyMtmRate;
      const bookRate = chunk.exactRate;
      const openFC = chunk.remainingFC;
      const bookValueINR = Math.round(openFC * bookRate);
      const revaluedINR = Math.round(openFC * closingMtmRate);
      // For an Advance (Debit Asset), if closing rate > book rate, currency appreciated => GAIN (+). Formula: openFC * (closingRate - bookRate)
      const unrealizedGL = Math.round(openFC * (closingMtmRate - bookRate));

      const pmt = paymentMap.get(chunk.paymentId);
      const swiftNo = pmt?.swiftNo || (pmt?.utrSwiftRef?.startsWith('SWIFT') ? pmt.utrSwiftRef : '');
      const utrNo = pmt?.utrNo || (!pmt?.utrSwiftRef?.startsWith('SWIFT') ? pmt?.utrSwiftRef : '') || pmt?.bankReferenceNo || '';

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const str = `${supp?.vendorCode || ''} ${supp?.supplierName || ''} ${pmt?.bankReferenceNo || ''} ${swiftNo} ${utrNo}`.toLowerCase();
        if (!str.includes(q)) continue;
      }

      rows.push({
        id: `MTM-ADV-${chunk.paymentId}`,
        companyCode: comp?.code || 'SVN',
        vendorCode: supp?.vendorCode || 'V-UNK',
        supplierName: supp?.supplierName || 'Unknown Supplier',
        docType: 'Advance Payment (Debit Bal)',
        docNo: pmt?.bankReferenceNo || `PAY-ADV-${chunk.paymentId.slice(-6)}`,
        docDate: chunk.date,
        boeNo: `UTR: ${utrNo || swiftNo || '-'}`,
        currency: curr,
        totalDocFC: pmt?.amountFC || openFC,
        bookingRate: bookRate,
        openFC,
        bookValueINR,
        closingMtmRate,
        revaluedINR,
        unrealizedGL,
        isGain: unrealizedGL >= 0,
        isDebit: true,
      });
    }

    return rows.sort((a, b) => a.vendorCode.localeCompare(b.vendorCode));
  }, [engineResult.ciStates, engineResult.openingPayableStates, engineResult.unappliedPayments, selectedCompanyId, currencyFilter, toDate, searchQuery, usdMtmRate, cnyMtmRate, supplierMap, companyMap, paymentMap]);

  // 3. VENDOR-WISE CONSOLIDATED SUMMARY
  const supplierSummaryRows = useMemo(() => {
    const map = new Map<
      string,
      {
        vendorCode: string;
        supplierName: string;
        realizedUsdINR: number;
        realizedCnyINR: number;
        totalRealizedINR: number;
        unrealizedUsdINR: number;
        unrealizedCnyINR: number;
        totalUnrealizedINR: number;
        netTotalFxINR: number;
        settledBillsCount: number;
        openBillsCount: number;
      }
    >();

    // Accumulate Realized
    for (const r of realizedRows) {
      const current = map.get(r.vendorCode) || {
        vendorCode: r.vendorCode,
        supplierName: r.supplierName,
        realizedUsdINR: 0,
        realizedCnyINR: 0,
        totalRealizedINR: 0,
        unrealizedUsdINR: 0,
        unrealizedCnyINR: 0,
        totalUnrealizedINR: 0,
        netTotalFxINR: 0,
        settledBillsCount: 0,
        openBillsCount: 0,
      };

      if (r.currency === 'USD') current.realizedUsdINR += r.realizedGL;
      else if (r.currency === 'CNY') current.realizedCnyINR += r.realizedGL;
      current.totalRealizedINR += r.realizedGL;
      current.settledBillsCount++;
      map.set(r.vendorCode, current);
    }

    // Accumulate Unrealized
    for (const u of unrealizedRows) {
      const current = map.get(u.vendorCode) || {
        vendorCode: u.vendorCode,
        supplierName: u.supplierName,
        realizedUsdINR: 0,
        realizedCnyINR: 0,
        totalRealizedINR: 0,
        unrealizedUsdINR: 0,
        unrealizedCnyINR: 0,
        totalUnrealizedINR: 0,
        netTotalFxINR: 0,
        settledBillsCount: 0,
        openBillsCount: 0,
      };

      if (u.currency === 'USD') current.unrealizedUsdINR += u.unrealizedGL;
      else if (u.currency === 'CNY') current.unrealizedCnyINR += u.unrealizedGL;
      current.totalUnrealizedINR += u.unrealizedGL;
      current.openBillsCount++;
      map.set(u.vendorCode, current);
    }

    const list = Array.from(map.values()).map(v => ({
      ...v,
      netTotalFxINR: v.totalRealizedINR + v.totalUnrealizedINR,
    }));

    return list.sort((a, b) => a.vendorCode.localeCompare(b.vendorCode));
  }, [realizedRows, unrealizedRows]);

  // Aggregate Totals
  const totals = useMemo(() => {
    let totRealizedINR = 0;
    let totRealizedUsdINR = 0;
    let totRealizedCnyINR = 0;
    let totSettledFC = 0;
    let totBillINR = 0;
    let totPaidINR = 0;

    for (const r of realizedRows) {
      totRealizedINR += r.realizedGL;
      if (r.currency === 'USD') totRealizedUsdINR += r.realizedGL;
      else if (r.currency === 'CNY') totRealizedCnyINR += r.realizedGL;
      totSettledFC += r.settledFC;
      totBillINR += r.billValueINR;
      totPaidINR += r.paidValueINR;
    }

    let totUnrealizedINR = 0;
    let totUnrealizedUsdINR = 0;
    let totUnrealizedCnyINR = 0;
    let totOpenFC = 0;
    let totBookINR = 0;
    let totRevaluedINR = 0;

    for (const u of unrealizedRows) {
      totUnrealizedINR += u.unrealizedGL;
      if (u.currency === 'USD') totUnrealizedUsdINR += u.unrealizedGL;
      else if (u.currency === 'CNY') totUnrealizedCnyINR += u.unrealizedGL;
      totOpenFC += u.openFC;
      totBookINR += u.bookValueINR;
      totRevaluedINR += u.revaluedINR;
    }

    const netTotalFxINR = totRealizedINR + totUnrealizedINR;

    return {
      totRealizedINR,
      totRealizedUsdINR,
      totRealizedCnyINR,
      totSettledFC,
      totBillINR,
      totPaidINR,
      totUnrealizedINR,
      totUnrealizedUsdINR,
      totUnrealizedCnyINR,
      totOpenFC,
      totBookINR,
      totRevaluedINR,
      netTotalFxINR,
      realizedCount: realizedRows.length,
      unrealizedCount: unrealizedRows.length,
    };
  }, [realizedRows, unrealizedRows]);

  // Excel Multi-Sheet Export for Auditors
  const handleExportAuditorExcel = () => {
    const sheet1Data = realizedRows.map((r, i) => ({
      'S.No': i + 1,
      Company: r.companyCode,
      'Vendor Code': r.vendorCode,
      'Supplier Name': r.supplierName,
      Currency: r.currency,
      'Bill (CI) No': r.docNo,
      'Bill Date': r.docDate,
      'BOE No': r.boeNo,
      'BOE Date': r.boeDate,
      'Settled FC': r.settledFC,
      'Bill Rate': r.billRate,
      'Bill Value INR': r.billValueINR,
      'Payment Date': r.paymentDate,
      'Bank Account': r.bankName,
      'Bank Ref No': r.bankRefNo,
      'UTR No': r.utrNo,
      'SWIFT No': r.swiftNo,
      'Bank Paid Rate': r.paidRate,
      'Paid Value INR': r.paidValueINR,
      'Realized Gain(+) / Loss(−) INR': r.realizedGL,
      Classification: r.isGain ? 'GAIN (Credit P&L)' : 'LOSS (Debit P&L)',
      'Suggested Accounting JV': r.isGain
        ? `Dr Supplier ${r.vendorCode} ${r.billValueINR} | Cr Bank ${r.paidValueINR} | Cr Realized FX Gain ${r.realizedGL}`
        : `Dr Supplier ${r.vendorCode} ${r.billValueINR} | Dr Realized FX Loss ${Math.abs(r.realizedGL)} | Cr Bank ${r.paidValueINR}`,
    }));

    const sheet2Data = unrealizedRows.map((u, i) => ({
      'S.No': i + 1,
      Company: u.companyCode,
      'Vendor Code': u.vendorCode,
      'Supplier Name': u.supplierName,
      'Document Type': u.docType,
      'Document / Bill No': u.docNo,
      'Doc Date': u.docDate,
      'BOE / Ref': u.boeNo,
      Currency: u.currency,
      'Total Doc FC': u.totalDocFC,
      'Booking Rate': u.bookingRate,
      'Outstanding Open FC': u.openFC,
      'Book Value INR': u.bookValueINR,
      'Closing MTM Rate (31-Mar)': u.closingMtmRate,
      'Revalued Closing INR': u.revaluedINR,
      'Unrealized Gain(+) / Loss(−) INR': u.unrealizedGL,
      Classification: u.isGain ? 'UNREALIZED GAIN' : 'UNREALIZED LOSS',
      'AS-11 Accounting Treatment': u.isGain
        ? `Provision for Unrealized FX Gain (Credit P&L / Reserve)`
        : `Provision for Unrealized FX Loss (Debit P&L / Liability)`,
    }));

    const sheet3Data = supplierSummaryRows.map((s, i) => ({
      'S.No': i + 1,
      'Vendor Code': s.vendorCode,
      'Supplier Name': s.supplierName,
      'Realized FX USD (INR)': s.realizedUsdINR,
      'Realized FX CNY (INR)': s.realizedCnyINR,
      'Total Realized FX INR': s.totalRealizedINR,
      'Unrealized MTM FX INR': s.totalUnrealizedINR,
      'NET TOTAL FX IMPACT INR': s.netTotalFxINR,
      'Settled Bills Count': s.settledBillsCount,
      'Open Bills Revalued': s.openBillsCount,
    }));

    exportMultiSheetExcel(
      [
        { name: 'Realized_BillWise_FX', data: sheet1Data },
        { name: 'YearEnd_MTM_Valuation', data: sheet2Data },
        { name: 'Vendor_Consolidated_Summary', data: sheet3Data },
      ],
      `FX_Gain_Loss_Statement_Audit_Working_${toDate}`
    );
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto animate-fade-in">
      {/* Top Header Card with Radiant Gradient */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-3xl border border-indigo-500/20 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="flex flex-wrap items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center space-x-2.5 mb-2">
              <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-indigo-500/30 text-indigo-300 border border-indigo-400/30 backdrop-blur-md">
                AS-11 / Ind AS 21 Compliant
              </span>
              <span className="text-xs text-slate-400 font-mono">Realized & Year-End MTM Fluctuation Engine</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
              <span>Foreign Exchange Gain / Loss Statement</span>
              <Scale className="w-6 h-6 text-indigo-400" />
            </h1>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
              Bill-by-bill audit reconciliation between Commercial Invoice booking rates and Bank wire actual payment rates, plus Year-End Mark-to-Market (MTM) closing revaluation matching Trial Balance P&L.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={handleExportAuditorExcel}
              className="flex items-center space-x-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/25 active:scale-95 transition-all cursor-pointer border border-emerald-400/30"
              title="Download Complete 3-Sheet Excel Working for Statutory & Tax Auditors"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Export Audit Working (Excel)</span>
            </button>
          </div>
        </div>

        {/* Live Filter Controls Bar */}
        <div className="mt-6 pt-5 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Currency Filter */}
          <div className="bg-white/10 backdrop-blur-md px-3 py-2 rounded-2xl border border-white/10">
            <span className="text-[10px] uppercase font-bold text-slate-300 tracking-wider block mb-1">Currency</span>
            <select
              value={currencyFilter}
              onChange={e => setCurrencyFilter(e.target.value)}
              className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer w-full"
            >
              <option value="ALL" className="bg-slate-900 text-white">ALL Currencies (USD + CNY)</option>
              <option value="USD" className="bg-slate-900 text-white">USD Only ($)</option>
              <option value="CNY" className="bg-slate-900 text-white">CNY Only (¥)</option>
            </select>
          </div>

          {/* From Date */}
          <div className="bg-white/10 backdrop-blur-md px-3 py-2 rounded-2xl border border-white/10">
            <span className="text-[10px] uppercase font-bold text-slate-300 tracking-wider block mb-1">From Date (FY Start)</span>
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer w-full font-mono"
            />
          </div>

          {/* To Date / As Of Date */}
          <div className="bg-white/10 backdrop-blur-md px-3 py-2 rounded-2xl border border-white/10">
            <span className="text-[10px] uppercase font-bold text-slate-300 tracking-wider block mb-1">To Date (Year-End)</span>
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer w-full font-mono"
            />
          </div>

          {/* Closing USD MTM Rate */}
          <div className="bg-white/10 backdrop-blur-md px-3 py-2 rounded-2xl border border-white/10">
            <span className="text-[10px] uppercase font-bold text-blue-300 tracking-wider block mb-1">USD Year-End MTM Rate (₹)</span>
            <div className="flex items-center space-x-1.5">
              <span className="text-xs font-bold text-slate-400">₹</span>
              <input
                type="number"
                step="0.01"
                value={usdMtmRate}
                onChange={e => setUsdMtmRate(parseFloat(e.target.value) || 0)}
                className="bg-transparent text-xs font-black text-white focus:outline-none cursor-pointer w-full font-mono"
                title="Year-End closing exchange rate for USD (RBI / FEDAI rate as of 31-March)"
              />
            </div>
          </div>

          {/* Closing CNY MTM Rate */}
          <div className="bg-white/10 backdrop-blur-md px-3 py-2 rounded-2xl border border-white/10">
            <span className="text-[10px] uppercase font-bold text-amber-300 tracking-wider block mb-1">CNY Year-End MTM Rate (₹)</span>
            <div className="flex items-center space-x-1.5">
              <span className="text-xs font-bold text-slate-400">₹</span>
              <input
                type="number"
                step="0.01"
                value={cnyMtmRate}
                onChange={e => setCnyMtmRate(parseFloat(e.target.value) || 0)}
                className="bg-transparent text-xs font-black text-white focus:outline-none cursor-pointer w-full font-mono"
                title="Year-End closing exchange rate for CNY (RBI rate as of 31-March)"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Primary KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Realized Gain / Loss */}
        <div className={`rounded-3xl p-5 text-white shadow-lg relative overflow-hidden transition-all duration-300 ${
          totals.totRealizedINR >= 0
            ? 'bg-gradient-to-br from-emerald-600 via-teal-600 to-emerald-800 shadow-emerald-600/20'
            : 'bg-gradient-to-br from-rose-600 via-red-600 to-rose-800 shadow-rose-600/20'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-100">
              Realized FX Gain / (Loss)
            </span>
            <div className="w-9 h-9 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center text-white border border-white/20">
              {totals.totRealizedINR >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black font-mono tracking-tight text-white drop-shadow-xs">
              {totals.totRealizedINR >= 0 ? '+' : '−'}{formatINR(Math.abs(totals.totRealizedINR), 0, true)}
            </div>
            <div className="text-xs font-bold text-white/90 font-mono mt-1 flex items-center justify-between">
              <span>USD: {formatINR(totals.totRealizedUsdINR, 0, true)}</span>
              {totals.totRealizedCnyINR !== 0 && (
                <span>CNY: {formatINR(totals.totRealizedCnyINR, 0, true)}</span>
              )}
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-[11px] text-white/80 border-t border-white/15 pt-2.5">
            <span>Settled Allocations: <strong className="text-white">{totals.realizedCount}</strong></span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white backdrop-blur-sm">
              Actual Bank Payment
            </span>
          </div>
        </div>

        {/* Card 2: Year-End Unrealized (MTM) Gain / Loss */}
        <div className={`rounded-3xl p-5 text-white shadow-lg relative overflow-hidden transition-all duration-300 ${
          totals.totUnrealizedINR >= 0
            ? 'bg-gradient-to-br from-blue-600 via-indigo-600 to-blue-800 shadow-blue-600/20'
            : 'bg-gradient-to-br from-amber-600 via-orange-600 to-amber-800 shadow-amber-600/20'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-100">
              Year-End Unrealized MTM
            </span>
            <div className="w-9 h-9 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center text-white border border-white/20">
              <Calculator className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black font-mono tracking-tight text-white drop-shadow-xs">
              {totals.totUnrealizedINR >= 0 ? '+' : '−'}{formatINR(Math.abs(totals.totUnrealizedINR), 0, true)}
            </div>
            <div className="text-xs font-bold text-white/90 font-mono mt-1 flex items-center justify-between">
              <span>USD MTM @ ₹{usdMtmRate.toFixed(2)}</span>
              <span>CNY @ ₹{cnyMtmRate.toFixed(2)}</span>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-[11px] text-white/80 border-t border-white/15 pt-2.5">
            <span>Open Items Revalued: <strong className="text-white">{totals.unrealizedCount}</strong></span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white backdrop-blur-sm">
              31-Mar Balance Sheet
            </span>
          </div>
        </div>

        {/* Card 3: Net Total P&L FX Impact */}
        <div className="rounded-3xl p-5 text-white shadow-lg shadow-purple-600/20 bg-gradient-to-br from-purple-700 via-indigo-800 to-slate-900 relative overflow-hidden transition-all duration-300">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-purple-100">
              Net Total FX Impact (P&L)
            </span>
            <div className="w-9 h-9 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center text-white border border-white/20">
              <Scale className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black font-mono tracking-tight text-white drop-shadow-xs">
              {totals.netTotalFxINR >= 0 ? '+' : '−'}{formatINR(Math.abs(totals.netTotalFxINR), 0, true)}
            </div>
            <div className="text-xs font-bold text-purple-200 font-mono mt-1">
              {totals.netTotalFxINR >= 0 ? 'Net FX Fluctuation Credit' : 'Net FX Fluctuation Debit'}
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-[11px] text-purple-100 border-t border-white/15 pt-2.5">
            <span>Realized + Unrealized MTM</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white backdrop-blur-sm">
              Audited Ledger
            </span>
          </div>
        </div>

        {/* Card 4: Settlement Turnover */}
        <div className="rounded-3xl p-5 text-white shadow-lg shadow-slate-600/20 bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 relative overflow-hidden transition-all duration-300">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-200">
              Settled Bill Turnover
            </span>
            <div className="w-9 h-9 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center text-white border border-white/20">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black font-mono tracking-tight text-white drop-shadow-xs">
              {formatINR(totals.totBillINR, 0, true)}
            </div>
            <div className="text-xs font-bold text-slate-300 font-mono mt-1">
              Paid Outward: {formatINR(totals.totPaidINR, 0, true)}
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-[11px] text-slate-300 border-t border-white/15 pt-2.5">
            <span>Total Settled FC: <strong className="text-white font-mono">{formatFC(totals.totSettledFC)}</strong></span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white backdrop-blur-sm">
              100% Matched
            </span>
          </div>
        </div>
      </div>

      {/* Search and Tab Selector Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-white/10 shadow-sm">
        {/* Tab Buttons */}
        <div className="flex items-center space-x-2 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl">
          <button
            onClick={() => setActiveTab('realized')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'realized'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Bill-Wise Realized FX ({realizedRows.length})
          </button>
          <button
            onClick={() => setActiveTab('unrealized')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'unrealized'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Year-End MTM Revaluation ({unrealizedRows.length})
          </button>
          <button
            onClick={() => setActiveTab('supplier_summary')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'supplier_summary'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Supplier-Wise Summary ({supplierSummaryRows.length})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search Bill, Vendor, UTR, SWIFT..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-2xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
      </div>

      {/* TAB 1: BILL-WISE REALIZED FX TABLE */}
      {activeTab === 'realized' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Bill-Wise Realized FX Gain / Loss Working</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold">
                  Payment Date Wise Knock-Off
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Calculated as: <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">Settled FC × (Bill Customs Rate − Bank Applied Wire Rate)</code>
              </p>
            </div>
            <div className="text-xs font-mono font-bold text-slate-600 dark:text-slate-400">
              Total Realized FX:{' '}
              <span className={`font-black ${totals.totRealizedINR >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {totals.totRealizedINR >= 0 ? '+' : '−'}{formatINR(Math.abs(totals.totRealizedINR), 0, true)}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[600px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-bold uppercase text-[10px] tracking-wider sticky top-0 z-10 backdrop-blur-md">
                <tr>
                  <th className="p-3">#</th>
                  <th className="p-3">Company</th>
                  <th className="p-3">Vendor</th>
                  <th className="p-3">Curr</th>
                  <th className="p-3">Bill (CI) No & Date</th>
                  <th className="p-3">BOE No</th>
                  <th className="p-3 text-right">Settled FC</th>
                  <th className="p-3 text-right">Bill Rate (₹)</th>
                  <th className="p-3 text-right">Bill Book INR</th>
                  <th className="p-3">Payment Date</th>
                  <th className="p-3">Bank & Ref / SWIFT</th>
                  <th className="p-3 text-right">Paid Rate (₹)</th>
                  <th className="p-3 text-right">Paid INR</th>
                  <th className="p-3 text-right">Realized FX Gain / (Loss)</th>
                  <th className="p-3 text-center">Classification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-mono text-slate-700 dark:text-slate-300">
                {realizedRows.length === 0 ? (
                  <tr>
                    <td colSpan={15} className="p-8 text-center text-slate-400 font-sans">
                      No realized payment allocations found in selected date range. Record payments against CIs or adjust filters.
                    </td>
                  </tr>
                ) : (
                  realizedRows.map((r, i) => (
                    <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="p-3 text-slate-400 font-sans">{i + 1}</td>
                      <td className="p-3 font-bold font-sans">{r.companyCode}</td>
                      <td className="p-3 font-sans">
                        <div className="font-bold text-slate-900 dark:text-white">{r.vendorCode}</div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[140px]">{r.supplierName}</div>
                      </td>
                      <td className="p-3 font-bold text-slate-900 dark:text-white">{r.currency}</td>
                      <td className="p-3">
                        <div className="font-bold text-slate-900 dark:text-white">{r.docNo}</div>
                        <div className="text-[10px] text-slate-400">{formatDate(r.docDate)}</div>
                      </td>
                      <td className="p-3 text-slate-600 dark:text-slate-300">{r.boeNo}</td>
                      <td className="p-3 text-right font-black text-slate-900 dark:text-white">{formatFC(r.settledFC)}</td>
                      <td className="p-3 text-right font-semibold text-slate-600 dark:text-slate-300">{formatRate(r.billRate)}</td>
                      <td className="p-3 text-right font-semibold text-slate-900 dark:text-white">{formatINR(r.billValueINR, 0, true)}</td>
                      <td className="p-3">{formatDate(r.paymentDate)}</td>
                      <td className="p-3 font-sans">
                        <div className="font-semibold text-slate-900 dark:text-white truncate max-w-[150px]">{r.bankName}</div>
                        <div className="flex items-center gap-1 mt-0.5">
                          {r.swiftNo !== '-' && (
                            <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 font-bold">
                              {r.swiftNo}
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400 font-mono">{r.utrNo}</span>
                        </div>
                      </td>
                      <td className="p-3 text-right font-semibold text-slate-600 dark:text-slate-300">{formatRate(r.paidRate)}</td>
                      <td className="p-3 text-right font-semibold text-slate-900 dark:text-white">{formatINR(r.paidValueINR, 0, true)}</td>
                      <td className={`p-3 text-right font-black text-sm ${r.isGain ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {r.isGain ? '+' : '−'}{formatINR(Math.abs(r.realizedGL), 0, true)}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                          r.isGain
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                        }`}>
                          {r.isGain ? 'GAIN (+)' : 'LOSS (−)'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {realizedRows.length > 0 && (
                <tfoot className="bg-slate-100 dark:bg-slate-800 font-bold text-slate-900 dark:text-white border-t-2 border-slate-300 dark:border-white/20 sticky bottom-0 z-10">
                  <tr>
                    <td colSpan={6} className="p-3 uppercase text-right tracking-wider font-sans">
                      Totals ({realizedRows.length} Allocations):
                    </td>
                    <td className="p-3 text-right font-black font-mono">{formatFC(totals.totSettledFC)}</td>
                    <td className="p-3 text-right">-</td>
                    <td className="p-3 text-right font-black font-mono">{formatINR(totals.totBillINR, 0, true)}</td>
                    <td colSpan={3} className="p-3 text-right">-</td>
                    <td className="p-3 text-right font-black font-mono">{formatINR(totals.totPaidINR, 0, true)}</td>
                    <td className={`p-3 text-right font-black font-mono text-sm ${totals.totRealizedINR >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {totals.totRealizedINR >= 0 ? '+' : '−'}{formatINR(Math.abs(totals.totRealizedINR), 0, true)}
                    </td>
                    <td className="p-3 text-center text-[10px] font-sans font-bold">
                      {totals.totRealizedINR >= 0 ? 'NET GAIN' : 'NET LOSS'}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: YEAR-END MTM REVALUATION TABLE */}
      {activeTab === 'unrealized' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Year-End / Period-End MTM Revaluation Working (AS-11)</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 font-bold">
                  As of: {formatDate(toDate)}
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Revalues all open unpaid/part-paid Commercial Invoices & open supplier advances at 31-March closing rates (USD: ₹{usdMtmRate.toFixed(2)}, CNY: ₹{cnyMtmRate.toFixed(2)}).
              </p>
            </div>
            <div className="text-xs font-mono font-bold text-slate-600 dark:text-slate-400">
              Total Unrealized MTM FX:{' '}
              <span className={`font-black ${totals.totUnrealizedINR >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-amber-600 dark:text-amber-400'}`}>
                {totals.totUnrealizedINR >= 0 ? '+' : '−'}{formatINR(Math.abs(totals.totUnrealizedINR), 0, true)}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[600px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-bold uppercase text-[10px] tracking-wider sticky top-0 z-10 backdrop-blur-md">
                <tr>
                  <th className="p-3">#</th>
                  <th className="p-3">Company</th>
                  <th className="p-3">Vendor</th>
                  <th className="p-3">Document Type</th>
                  <th className="p-3">Doc / Bill No & Date</th>
                  <th className="p-3">BOE / Ref</th>
                  <th className="p-3">Curr</th>
                  <th className="p-3 text-right">Total Doc FC</th>
                  <th className="p-3 text-right">Booking Rate (₹)</th>
                  <th className="p-3 text-right">Outstanding Open FC</th>
                  <th className="p-3 text-right">Book Value INR</th>
                  <th className="p-3 text-right">Year-End MTM Rate (₹)</th>
                  <th className="p-3 text-right">Revalued Closing INR</th>
                  <th className="p-3 text-right">Unrealized MTM Gain / (Loss)</th>
                  <th className="p-3 text-center">Treatment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-mono text-slate-700 dark:text-slate-300">
                {unrealizedRows.length === 0 ? (
                  <tr>
                    <td colSpan={15} className="p-8 text-center text-slate-400 font-sans">
                      No open invoices or advances requiring year-end revaluation as of {formatDate(toDate)}.
                    </td>
                  </tr>
                ) : (
                  unrealizedRows.map((u, i) => (
                    <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="p-3 text-slate-400 font-sans">{i + 1}</td>
                      <td className="p-3 font-bold font-sans">{u.companyCode}</td>
                      <td className="p-3 font-sans">
                        <div className="font-bold text-slate-900 dark:text-white">{u.vendorCode}</div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[140px]">{u.supplierName}</div>
                      </td>
                      <td className="p-3 font-sans">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          u.isDebit ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}>
                          {u.docType}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-slate-900 dark:text-white">{u.docNo}</div>
                        <div className="text-[10px] text-slate-400">{formatDate(u.docDate)}</div>
                      </td>
                      <td className="p-3 text-slate-600 dark:text-slate-300">{u.boeNo}</td>
                      <td className="p-3 font-bold text-slate-900 dark:text-white">{u.currency}</td>
                      <td className="p-3 text-right text-slate-500">{formatFC(u.totalDocFC)}</td>
                      <td className="p-3 text-right font-semibold text-slate-600 dark:text-slate-300">{formatRate(u.bookingRate)}</td>
                      <td className="p-3 text-right font-black text-slate-900 dark:text-white">{formatFC(u.openFC)}</td>
                      <td className="p-3 text-right font-semibold text-slate-900 dark:text-white">{formatINR(u.bookValueINR, 0, true)}</td>
                      <td className="p-3 text-right font-bold text-indigo-600 dark:text-indigo-400">{formatRate(u.closingMtmRate)}</td>
                      <td className="p-3 text-right font-semibold text-slate-900 dark:text-white">{formatINR(u.revaluedINR, 0, true)}</td>
                      <td className={`p-3 text-right font-black text-sm ${u.isGain ? 'text-blue-600 dark:text-blue-400' : 'text-amber-600 dark:text-amber-400'}`}>
                        {u.isGain ? '+' : '−'}{formatINR(Math.abs(u.unrealizedGL), 0, true)}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                          u.isGain
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        }`}>
                          {u.isGain ? 'GAIN' : 'LOSS'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {unrealizedRows.length > 0 && (
                <tfoot className="bg-slate-100 dark:bg-slate-800 font-bold text-slate-900 dark:text-white border-t-2 border-slate-300 dark:border-white/20 sticky bottom-0 z-10">
                  <tr>
                    <td colSpan={9} className="p-3 uppercase text-right tracking-wider font-sans">
                      Totals ({unrealizedRows.length} Open Items):
                    </td>
                    <td className="p-3 text-right font-black font-mono">{formatFC(totals.totOpenFC)}</td>
                    <td className="p-3 text-right font-black font-mono">{formatINR(totals.totBookINR, 0, true)}</td>
                    <td className="p-3 text-right">-</td>
                    <td className="p-3 text-right font-black font-mono">{formatINR(totals.totRevaluedINR, 0, true)}</td>
                    <td className={`p-3 text-right font-black font-mono text-sm ${totals.totUnrealizedINR >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      {totals.totUnrealizedINR >= 0 ? '+' : '−'}{formatINR(Math.abs(totals.totUnrealizedINR), 0, true)}
                    </td>
                    <td className="p-3 text-center text-[10px] font-sans font-bold">
                      {totals.totUnrealizedINR >= 0 ? 'PROVISION GAIN' : 'PROVISION LOSS'}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: SUPPLIER-WISE SUMMARY TABLE */}
      {activeTab === 'supplier_summary' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Supplier-Wise Consolidated Foreign Exchange Summary</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 font-bold">
                  Party Fluctuation Ledger
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Consolidated FX gain/loss position per supplier for statutory audit matching and year-end trial balance sign-off.
              </p>
            </div>
            <div className="text-xs font-mono font-bold text-slate-600 dark:text-slate-400">
              Net Total FX Impact:{' '}
              <span className={`font-black ${totals.netTotalFxINR >= 0 ? 'text-purple-600 dark:text-purple-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {totals.netTotalFxINR >= 0 ? '+' : '−'}{formatINR(Math.abs(totals.netTotalFxINR), 0, true)}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[600px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-bold uppercase text-[10px] tracking-wider sticky top-0 z-10 backdrop-blur-md">
                <tr>
                  <th className="p-3">#</th>
                  <th className="p-3">Vendor Code</th>
                  <th className="p-3">Party Name</th>
                  <th className="p-3 text-right">Realized FX USD (₹)</th>
                  <th className="p-3 text-right">Realized FX CNY (₹)</th>
                  <th className="p-3 text-right">Total Realized FX (₹)</th>
                  <th className="p-3 text-right">Unrealized MTM FX (₹)</th>
                  <th className="p-3 text-right">NET FX GAIN / (LOSS) (₹)</th>
                  <th className="p-3 text-center">Settled / Open</th>
                  <th className="p-3 text-center">Ledger Drilldown</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-mono text-slate-700 dark:text-slate-300">
                {supplierSummaryRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-slate-400 font-sans">
                      No supplier transactions found.
                    </td>
                  </tr>
                ) : (
                  supplierSummaryRows.map((s, i) => (
                    <tr key={s.vendorCode} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="p-3 text-slate-400 font-sans">{i + 1}</td>
                      <td className="p-3 font-bold font-mono text-indigo-600 dark:text-indigo-400">{s.vendorCode}</td>
                      <td className="p-3 font-sans font-bold text-slate-900 dark:text-white">{s.supplierName}</td>
                      <td className={`p-3 text-right font-semibold ${s.realizedUsdINR >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {s.realizedUsdINR !== 0 ? (s.realizedUsdINR >= 0 ? '+' : '−') + formatINR(Math.abs(s.realizedUsdINR), 0, true) : '−'}
                      </td>
                      <td className={`p-3 text-right font-semibold ${s.realizedCnyINR >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {s.realizedCnyINR !== 0 ? (s.realizedCnyINR >= 0 ? '+' : '−') + formatINR(Math.abs(s.realizedCnyINR), 0, true) : '−'}
                      </td>
                      <td className={`p-3 text-right font-black ${s.totalRealizedINR >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {s.totalRealizedINR !== 0 ? (s.totalRealizedINR >= 0 ? '+' : '−') + formatINR(Math.abs(s.totalRealizedINR), 0, true) : '−'}
                      </td>
                      <td className={`p-3 text-right font-black ${s.totalUnrealizedINR >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-amber-600 dark:text-amber-400'}`}>
                        {s.totalUnrealizedINR !== 0 ? (s.totalUnrealizedINR >= 0 ? '+' : '−') + formatINR(Math.abs(s.totalUnrealizedINR), 0, true) : '−'}
                      </td>
                      <td className={`p-3 text-right font-black text-sm ${s.netTotalFxINR >= 0 ? 'text-purple-600 dark:text-purple-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {s.netTotalFxINR !== 0 ? (s.netTotalFxINR >= 0 ? '+' : '−') + formatINR(Math.abs(s.netTotalFxINR), 0, true) : '−'}
                      </td>
                      <td className="p-3 text-center font-sans text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="font-bold text-slate-800 dark:text-slate-200">{s.settledBillsCount}</span> settled / <span className="font-bold text-slate-800 dark:text-slate-200">{s.openBillsCount}</span> open
                      </td>
                      <td className="p-3 text-center">
                        {onNavigateToLedger && (
                          <button
                            onClick={() => onNavigateToLedger(s.vendorCode)}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 text-[11px] font-bold transition-all cursor-pointer border border-slate-200/80 dark:border-white/10"
                            title="Open detailed party ledger statement"
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                            <span>Ledger</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {supplierSummaryRows.length > 0 && (
                <tfoot className="bg-slate-100 dark:bg-slate-800 font-bold text-slate-900 dark:text-white border-t-2 border-slate-300 dark:border-white/20 sticky bottom-0 z-10">
                  <tr>
                    <td colSpan={3} className="p-3 uppercase text-right tracking-wider font-sans">
                      Consolidated Net Totals:
                    </td>
                    <td className="p-3 text-right font-black font-mono">
                      {totals.totRealizedUsdINR >= 0 ? '+' : '−'}{formatINR(Math.abs(totals.totRealizedUsdINR), 0, true)}
                    </td>
                    <td className="p-3 text-right font-black font-mono">
                      {totals.totRealizedCnyINR >= 0 ? '+' : '−'}{formatINR(Math.abs(totals.totRealizedCnyINR), 0, true)}
                    </td>
                    <td className={`p-3 text-right font-black font-mono text-sm ${totals.totRealizedINR >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {totals.totRealizedINR >= 0 ? '+' : '−'}{formatINR(Math.abs(totals.totRealizedINR), 0, true)}
                    </td>
                    <td className={`p-3 text-right font-black font-mono text-sm ${totals.totUnrealizedINR >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      {totals.totUnrealizedINR >= 0 ? '+' : '−'}{formatINR(Math.abs(totals.totUnrealizedINR), 0, true)}
                    </td>
                    <td className={`p-3 text-right font-black font-mono text-base ${totals.netTotalFxINR >= 0 ? 'text-purple-600 dark:text-purple-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {totals.netTotalFxINR >= 0 ? '+' : '−'}{formatINR(Math.abs(totals.netTotalFxINR), 0, true)}
                    </td>
                    <td colSpan={2} className="p-3 text-center text-[10px] font-sans font-bold">
                      {totals.netTotalFxINR >= 0 ? 'NET CREDIT TO P&L' : 'NET DEBIT TO P&L'}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
