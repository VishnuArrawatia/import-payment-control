import React, { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  formatFC,
  formatINR,
  formatDate,
  getDaysBetween,
} from '../utils/formatters';
import { exportToExcel } from '../utils/excel';
import {
  Download,
  Printer,
  Table,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldAlert,
  Calendar,
  Layers,
  FileCheck2,
  CreditCard,
  Ship,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

export const KeyPositionScreen: React.FC = () => {
  const { db, engineResult, selectedCompanyId, asOfDate } = useApp();

  const companyMap = useMemo(() => new Map(db.companies.map(c => [c.id, c])), [db.companies]);

  // --- SECTION 1: KEY POSITION (as-on date) ---
  const keyPositionData = useMemo(() => {
    // USD, CNY, INR totals
    let openUSD = 0, openCNY = 0, openINR = 0;
    let ciUSD = 0, ciCNY = 0, ciINR = 0;
    let payUSD = 0, payCNY = 0, payINR = 0;

    // 1. Opening Balances
    db.openingBalances
      .filter(ob => selectedCompanyId === 'ALL' || ob.companyId === selectedCompanyId)
      .forEach(ob => {
        // Cr is payable (+), Dr is advance (-)
        const mult = ob.balanceType === 'Cr' ? 1 : -1;
        if (ob.currency === 'USD') openUSD += ob.amountFC * mult;
        else if (ob.currency === 'CNY') openCNY += ob.amountFC * mult;
        openINR += ob.amountINR * mult;
      });

    // 2. Commercial Invoices booked (+)
    db.commercialInvoices
      .filter(ci => (ci.ciDate || '') <= asOfDate && (selectedCompanyId === 'ALL' || ci.companyId === selectedCompanyId))
      .forEach(ci => {
        if (ci.currency === 'USD') ciUSD += ci.ciValueFC;
        else if (ci.currency === 'CNY') ciCNY += ci.ciValueFC;
        ciINR += ci.purchaseINR;
      });

    // 3. Payments made (-)
    db.payments
      .filter(p => (p.paymentDate || '') <= asOfDate && (selectedCompanyId === 'ALL' || p.companyId === selectedCompanyId))
      .forEach(p => {
        if (p.paymentMode === 'LC' && p.lcStatus !== 'Paid') return; // Open LC not yet paid out
        if (p.currency === 'USD') payUSD += p.amountFC;
        else if (p.currency === 'CNY') payCNY += p.amountFC;
        payINR += p.inrAmount;
      });

    const netCloseUSD = openUSD + ciUSD - payUSD;
    const netCloseCNY = openCNY + ciCNY - payCNY;
    const netCloseINR = openINR + ciINR - payINR;

    // Total Payable (Cr) from CI states + Opening Balances Cr
    let totalPayableUSD = 0, totalPayableCNY = 0, totalPayableINR = 0;
    let overduePayableUSD = 0, overduePayableCNY = 0, overduePayableINR = 0;
    let due30USD = 0, due30CNY = 0, due30INR = 0;

    for (const [, st] of engineResult.ciStates) {
      if (selectedCompanyId !== 'ALL' && st.ci.companyId !== selectedCompanyId) continue;
      if (st.balanceFC > 0) {
        if (st.ci.currency === 'USD') totalPayableUSD += st.balanceFC;
        else if (st.ci.currency === 'CNY') totalPayableCNY += st.balanceFC;
        totalPayableINR += st.balanceINR;

        if (st.isOverdue) {
          if (st.ci.currency === 'USD') overduePayableUSD += st.balanceFC;
          else if (st.ci.currency === 'CNY') overduePayableCNY += st.balanceFC;
          overduePayableINR += st.balanceINR;
        } else if (st.dueDate) {
          const diff = getDaysBetween(asOfDate, st.dueDate);
          if (diff >= 0 && diff <= 30) {
            if (st.ci.currency === 'USD') due30USD += st.balanceFC;
            else if (st.ci.currency === 'CNY') due30CNY += st.balanceFC;
            due30INR += st.balanceINR;
          }
        }
      }
    }

    for (const [, obSt] of engineResult.openingPayableStates) {
      if (selectedCompanyId !== 'ALL' && obSt.ob.companyId !== selectedCompanyId) continue;
      if (obSt.balanceFC > 0) {
        if (obSt.ob.currency === 'USD') totalPayableUSD += obSt.balanceFC;
        else if (obSt.ob.currency === 'CNY') totalPayableCNY += obSt.balanceFC;
        totalPayableINR += obSt.balanceINR;
        if (obSt.isOverdue) {
          if (obSt.ob.currency === 'USD') overduePayableUSD += obSt.balanceFC;
          else if (obSt.ob.currency === 'CNY') overduePayableCNY += obSt.balanceFC;
          overduePayableINR += obSt.balanceINR;
        }
      }
    }

    // Total Debit Bal / Advance with suppliers (Dr) from unapplied chunks
    let totalDebitUSD = 0, totalDebitCNY = 0, totalDebitINR = 0;
    let debitOnClosedPiUSD = 0, debitOnClosedPiCNY = 0, debitOnClosedPiINR = 0;

    for (const chunk of engineResult.unappliedPayments) {
      if (chunk.remainingFC <= 0) continue;
      if (selectedCompanyId !== 'ALL' && chunk.companyId !== selectedCompanyId) continue;

      if (chunk.currency === 'USD') totalDebitUSD += chunk.remainingFC;
      else if (chunk.currency === 'CNY') totalDebitCNY += chunk.remainingFC;
      totalDebitINR += chunk.remainingFC * chunk.exactRate;

      // Check if linked to closed PI
      if (chunk.piId) {
        const pi = db.proformaInvoices.find(p => p.id === chunk.piId);
        if (pi?.isClosed) {
          if (chunk.currency === 'USD') debitOnClosedPiUSD += chunk.remainingFC;
          else if (chunk.currency === 'CNY') debitOnClosedPiCNY += chunk.remainingFC;
          debitOnClosedPiINR += chunk.remainingFC * chunk.exactRate;
        }
      }
    }

    // Advance still to pay on open PIs
    let advStillPayUSD = 0, advStillPayCNY = 0;
    for (const [, st] of engineResult.piStates) {
      if (selectedCompanyId !== 'ALL' && st.pi.companyId !== selectedCompanyId) continue;
      if (!st.pi.isClosed) {
        const needed = Math.max(0, st.advanceRequiredFC - st.totalPaidFC);
        if (st.pi.currency === 'USD') advStillPayUSD += needed;
        else if (st.pi.currency === 'CNY') advStillPayCNY += needed;
      }
    }

    // Open LC commitments
    let openLcUSD = 0, openLcCNY = 0, openLcINR = 0;
    for (const p of db.payments) {
      if (p.paymentMode === 'LC' && p.lcStatus !== 'Paid' && (p.paymentDate || '') <= asOfDate) {
        if (selectedCompanyId !== 'ALL' && p.companyId !== selectedCompanyId) continue;
        if (p.currency === 'USD') openLcUSD += p.amountFC;
        else if (p.currency === 'CNY') openLcCNY += p.amountFC;
        openLcINR += p.inrAmount;
      }
    }

    return {
      openUSD, openCNY, openINR,
      ciUSD, ciCNY, ciINR,
      payUSD, payCNY, payINR,
      netCloseUSD, netCloseCNY, netCloseINR,
      totalPayableUSD, totalPayableCNY, totalPayableINR,
      totalDebitUSD, totalDebitCNY, totalDebitINR,
      debitOnClosedPiUSD, debitOnClosedPiCNY, debitOnClosedPiINR,
      overduePayableUSD, overduePayableCNY, overduePayableINR,
      due30USD, due30CNY, due30INR,
      advStillPayUSD, advStillPayCNY,
      openLcUSD, openLcCNY, openLcINR,
    };
  }, [db, engineResult, selectedCompanyId, asOfDate]);

  // --- SECTION 2: PI STATUS COUNT ---
  const piStatusCounts = useMemo(() => {
    const buckets: Record<string, { count: number; usd: number; cny: number }> = {
      'Advance Not Paid': { count: 0, usd: 0, cny: 0 },
      'Advance Part Paid': { count: 0, usd: 0, cny: 0 },
      'Advance Paid - Shipment Pending': { count: 0, usd: 0, cny: 0 },
      'Part Shipped - Advance Lying': { count: 0, usd: 0, cny: 0 },
      'Payment Due': { count: 0, usd: 0, cny: 0 },
      'Payment OVERDUE': { count: 0, usd: 0, cny: 0 },
      'DEBIT BAL - Recover / Adjust': { count: 0, usd: 0, cny: 0 },
      'Opening Debit Bal - Adjust': { count: 0, usd: 0, cny: 0 },
      'Settled': { count: 0, usd: 0, cny: 0 },
      'PI Open': { count: 0, usd: 0, cny: 0 },
    };

    for (const [, st] of engineResult.piStates) {
      if (selectedCompanyId !== 'ALL' && st.pi.companyId !== selectedCompanyId) continue;

      const curr = st.pi.currency;
      const bal = (st.totalPaidFC || 0) - (st.shippedFC || 0);

      // Map engine status into User Spreadsheet exact category
      let category = 'PI Open';
      if (st.status === 'Settled' || st.pi.isClosed) {
        category = 'Settled';
      } else if (st.status === 'Advance not paid') {
        category = 'Advance Not Paid';
      } else if (st.status === 'Advance part paid') {
        category = 'Advance Part Paid';
      } else if (st.status === 'Advance paid - shipment pending') {
        category = 'Advance Paid - Shipment Pending';
      } else if (st.status === 'Part shipped' && bal > 0) {
        category = 'Part Shipped - Advance Lying';
      } else if (st.status === 'Overdue') {
        category = 'Payment OVERDUE';
      } else if (st.status === 'Payment due') {
        category = 'Payment Due';
      } else if (st.suggestedDebitNoteFC > 0 || st.status === 'Excess paid - DN suggested') {
        category = 'DEBIT BAL - Recover / Adjust';
      }

      if (!buckets[category]) {
        buckets[category] = { count: 0, usd: 0, cny: 0 };
      }

      buckets[category].count += 1;
      if (curr === 'USD') buckets[category].usd += bal;
      else if (curr === 'CNY') buckets[category].cny += bal;

      // Track PI Open total
      if (!st.pi.isClosed && st.status !== 'Settled') {
        buckets['PI Open'].count += 1;
        if (curr === 'USD') buckets['PI Open'].usd += bal;
        else if (curr === 'CNY') buckets['PI Open'].cny += bal;
      }
    }

    // Opening Dr Balances
    db.openingBalances
      .filter(o => o.balanceType === 'Dr' && (selectedCompanyId === 'ALL' || o.companyId === selectedCompanyId))
      .forEach(o => {
        buckets['Opening Debit Bal - Adjust'].count += 1;
        if (o.currency === 'USD') buckets['Opening Debit Bal - Adjust'].usd += o.amountFC;
        else if (o.currency === 'CNY') buckets['Opening Debit Bal - Adjust'].cny += o.amountFC;
      });

    return buckets;
  }, [db.openingBalances, engineResult.piStates, selectedCompanyId]);

  // --- SECTION 3: BILL OF ENTRY (BOE) STATUS ---
  const boeStatusData = useMemo(() => {
    const categories: Record<string, { count: number; usd: number; cny: number; assessableINR: number; oldestDays: number }> = {
      'BOE Pending': { count: 0, usd: 0, cny: 0, assessableINR: 0, oldestDays: 0 },
      'Bank Submission Pending': { count: 0, usd: 0, cny: 0, assessableINR: 0, oldestDays: 0 },
      'Submitted - IDPMS Pending': { count: 0, usd: 0, cny: 0, assessableINR: 0, oldestDays: 0 },
      'Closed (IDPMS)': { count: 0, usd: 0, cny: 0, assessableINR: 0, oldestDays: 0 },
    };

    const subMap = new Map(db.boeSubmissions.map(s => [s.ciId, s]));

    for (const ci of db.commercialInvoices) {
      if ((ci.ciDate || '') > asOfDate) continue;
      if (selectedCompanyId !== 'ALL' && ci.companyId !== selectedCompanyId) continue;

      const sub = subMap.get(ci.id);
      const isBoePending = !ci.boeNo || ci.boeNo.startsWith('PENDING-');
      const isClosed = sub?.idpmsStatus === 'Settled';
      const isSubmitted = sub?.idpmsStatus === 'Submitted';

      let status = 'Bank Submission Pending';
      if (isBoePending) status = 'BOE Pending';
      else if (isClosed) status = 'Closed (IDPMS)';
      else if (isSubmitted) status = 'Submitted - IDPMS Pending';

      const days = getDaysBetween(ci.ciDate, asOfDate);

      categories[status].count += 1;
      if (ci.currency === 'USD') categories[status].usd += ci.ciValueFC;
      else if (ci.currency === 'CNY') categories[status].cny += ci.ciValueFC;
      categories[status].assessableINR += ci.assessableValueINR || ci.purchaseINR;
      if (days > categories[status].oldestDays) {
        categories[status].oldestDays = days;
      }
    }

    return categories;
  }, [db.commercialInvoices, db.boeSubmissions, selectedCompanyId, asOfDate]);

  // --- SECTION 4: COMPLIANCE ALERTS ---
  const complianceAlerts = useMemo(() => {
    let adv90Count = 0;
    let unpaid180Count = 0;
    let paymentErrorCount = 0;
    let openingErrorCount = 0;

    for (const [, st] of engineResult.piStates) {
      if (selectedCompanyId !== 'ALL' && st.pi.companyId !== selectedCompanyId) continue;
      if (st.complianceFlags.some(f => f.includes('> 90 days'))) adv90Count++;
      if (st.complianceFlags.some(f => f.includes('> 180 days'))) unpaid180Count++;
    }

    // Payment rows with missing actual rate or excess
    for (const p of db.payments) {
      if (!p.actualExchangeRate || p.actualExchangeRate <= 0 || !p.amountFC) paymentErrorCount++;
    }

    // Opening balances with missing rates
    for (const o of db.openingBalances) {
      if (!o.rate || o.rate <= 0 || !o.amountFC) openingErrorCount++;
    }

    // Missing valuation rates in Masters
    const missingValuationCount = db.currencies.filter(c => {
      const rate = db.monthEndRates.find(r => r.currency === c.code && r.monthEndDate <= asOfDate);
      return !rate;
    }).length;

    const totalPiCount = db.proformaInvoices.filter(
      p => selectedCompanyId === 'ALL' || p.companyId === selectedCompanyId
    ).length;

    return [
      { alert: 'Advance >90 din, BOE nahi', count: adv90Count, where: 'PI_Status → Compliance Flag' },
      { alert: 'Unpaid >180 din (IDPMS)', count: unpaid180Count, where: 'PI_Status → Compliance Flag' },
      { alert: 'Payment rows with error', count: paymentErrorCount, where: 'Payments → Check column' },
      { alert: 'Opening rows with error', count: openingErrorCount, where: 'Opening → Check column' },
      { alert: 'Valuation rate missing', count: missingValuationCount, where: 'Dashboard D6 / D7' },
      { alert: 'PIs listed / capacity', count: `${totalPiCount} PIs`, where: 'PI_Status rows' },
    ];
  }, [db, engineResult.piStates, selectedCompanyId, asOfDate]);

  // --- SECTION 5: MONTHLY — Shipments (CI) vs Payments (FY 2026-27) ---
  const monthlyData = useMemo(() => {
    const months = [
      { key: '2026-04', label: 'Apr-2026' },
      { key: '2026-05', label: 'May-2026' },
      { key: '2026-06', label: 'Jun-2026' },
      { key: '2026-07', label: 'Jul-2026' },
      { key: '2026-08', label: 'Aug-2026' },
      { key: '2026-09', label: 'Sep-2026' },
      { key: '2026-10', label: 'Oct-2026' },
      { key: '2026-11', label: 'Nov-2026' },
      { key: '2026-12', label: 'Dec-2026' },
      { key: '2027-01', label: 'Jan-2027' },
      { key: '2027-02', label: 'Feb-2027' },
      { key: '2027-03', label: 'Mar-2027' },
    ];

    return months.map(m => {
      let ciUSD = 0, ciCNY = 0, ciINR = 0;
      let paidUSD = 0, paidCNY = 0, paidINR = 0;
      let lcOpenedFC = 0;

      // CIs in this month
      db.commercialInvoices
        .filter(c => c.ciDate?.startsWith(m.key) && (selectedCompanyId === 'ALL' || c.companyId === selectedCompanyId))
        .forEach(c => {
          if (c.currency === 'USD') ciUSD += c.ciValueFC;
          else if (c.currency === 'CNY') ciCNY += c.ciValueFC;
          ciINR += c.purchaseINR;
        });

      // Payments in this month
      db.payments
        .filter(p => p.paymentDate?.startsWith(m.key) && (selectedCompanyId === 'ALL' || p.companyId === selectedCompanyId))
        .forEach(p => {
          if (p.paymentMode === 'LC' && p.lcStatus !== 'Paid') {
            lcOpenedFC += p.amountFC;
          } else {
            if (p.currency === 'USD') paidUSD += p.amountFC;
            else if (p.currency === 'CNY') paidCNY += p.amountFC;
            paidINR += p.inrAmount;
          }
        });

      return {
        month: m.label,
        ciUSD, ciCNY, ciINR,
        paidUSD, paidCNY, paidINR,
        lcOpenedFC,
      };
    });
  }, [db.commercialInvoices, db.payments, selectedCompanyId]);

  // Excel Export for entire Key Position
  const handleExportExcel = () => {
    const exportRows: any[] = [];

    exportRows.push({ Section: 'KEY POSITION (as-on date)', ColA: '', ColB: 'USD', ColC: 'CNY', ColD: 'INR (book)' });
    exportRows.push({ Section: 'Opening Balance (net)', ColB: keyPositionData.openUSD, ColC: keyPositionData.openCNY, ColD: Math.round(keyPositionData.openINR) });
    exportRows.push({ Section: 'CI / Shipments booked (+)', ColB: keyPositionData.ciUSD, ColC: keyPositionData.ciCNY, ColD: Math.round(keyPositionData.ciINR) });
    exportRows.push({ Section: 'Payments made (−)', ColB: keyPositionData.payUSD, ColC: keyPositionData.payCNY, ColD: Math.round(keyPositionData.payINR) });
    exportRows.push({ Section: 'NET CLOSING (+ payable / − debit)', ColB: keyPositionData.netCloseUSD, ColC: keyPositionData.netCloseCNY, ColD: Math.round(keyPositionData.netCloseINR) });
    exportRows.push({ Section: 'Total PAYABLE (PI-wise + balances)', ColB: keyPositionData.totalPayableUSD, ColC: keyPositionData.totalPayableCNY, ColD: Math.round(keyPositionData.totalPayableINR) });
    exportRows.push({ Section: 'Total DEBIT BAL / Advance with suppliers', ColB: keyPositionData.totalDebitUSD, ColC: keyPositionData.totalDebitCNY, ColD: Math.round(keyPositionData.totalDebitINR) });
    exportRows.push({ Section: '  of which: Debit bal on closed / fully shipped PI', ColB: keyPositionData.debitOnClosedPiUSD, ColC: keyPositionData.debitOnClosedPiCNY, ColD: Math.round(keyPositionData.debitOnClosedPiINR) });
    exportRows.push({ Section: 'Payment OVERDUE', ColB: keyPositionData.overduePayableUSD, ColC: keyPositionData.overduePayableCNY, ColD: Math.round(keyPositionData.overduePayableINR) });
    exportRows.push({ Section: 'Due in next 30 days', ColB: keyPositionData.due30USD, ColC: keyPositionData.due30CNY, ColD: Math.round(keyPositionData.due30INR) });
    exportRows.push({ Section: 'Advance still to pay (PI not shipped)', ColB: keyPositionData.advStillPayUSD, ColC: keyPositionData.advStillPayCNY, ColD: '-' });
    exportRows.push({ Section: 'LC Open (not yet paid)', ColB: keyPositionData.openLcUSD, ColC: keyPositionData.openLcCNY, ColD: Math.round(keyPositionData.openLcINR) });

    exportToExcel(exportRows, `Key_Position_Statement_${asOfDate}`);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Deck */}
      <div className="bg-white/95 dark:bg-slate-900/80 backdrop-blur-xl p-5 rounded-3xl shadow-sm border border-slate-200/80 dark:border-white/10 flex flex-wrap items-center justify-between gap-4 transition-colors">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold shadow-md shadow-blue-500/20">
              <Table className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white tracking-tight">
                KEY POSITION (As-On Date: {formatDate(asOfDate)})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Executive EXIM matrix: Net positions, PI status counts, BOE customs tracking, and monthly shipments
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
            <span>Export Key Position (Excel)</span>
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

      {/* TABLE 1: KEY POSITION (as-on date) */}
      <div className="bg-white/95 dark:bg-slate-900/80 backdrop-blur-xl rounded-3xl p-5 shadow-sm border border-slate-200/80 dark:border-white/10 overflow-hidden">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white mb-3 flex items-center justify-between">
          <span>1. KEY POSITION (as-on date)</span>
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 font-normal">
            Entity: {selectedCompanyId === 'ALL' ? 'ALL Companies' : companyMap.get(selectedCompanyId)?.code}
          </span>
        </h3>

        <div className="overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-white/10">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#1e3a8a] text-white font-bold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3 text-right font-mono">USD</th>
                <th className="px-4 py-3 text-right font-mono">CNY</th>
                <th className="px-4 py-3 text-right font-mono">INR (book)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-semibold text-slate-700 dark:text-slate-300">
              <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="px-4 py-2.5">Opening Balance (net)</td>
                <td className="px-4 py-2.5 text-right font-mono">{formatFC(keyPositionData.openUSD)}</td>
                <td className="px-4 py-2.5 text-right font-mono">{formatFC(keyPositionData.openCNY)}</td>
                <td className="px-4 py-2.5 text-right font-mono">{formatINR(keyPositionData.openINR)}</td>
              </tr>
              <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="px-4 py-2.5">CI / Shipments booked (+)</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-amber-700 dark:text-amber-400">{formatFC(keyPositionData.ciUSD)}</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-amber-700 dark:text-amber-400">{formatFC(keyPositionData.ciCNY)}</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-amber-700 dark:text-amber-400">{formatINR(keyPositionData.ciINR)}</td>
              </tr>
              <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="px-4 py-2.5">Payments made (−)</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-700 dark:text-emerald-400">{formatFC(keyPositionData.payUSD)}</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-700 dark:text-emerald-400">{formatFC(keyPositionData.payCNY)}</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-700 dark:text-emerald-400">{formatINR(keyPositionData.payINR)}</td>
              </tr>
              <tr className="bg-blue-50/70 dark:bg-blue-950/40 font-black text-blue-950 dark:text-blue-100 border-y border-blue-200 dark:border-blue-900">
                <td className="px-4 py-3 uppercase tracking-wider">NET CLOSING (+ payable / − debit)</td>
                <td className="px-4 py-3 text-right font-mono text-sm">{formatFC(keyPositionData.netCloseUSD)}</td>
                <td className="px-4 py-3 text-right font-mono text-sm">{formatFC(keyPositionData.netCloseCNY)}</td>
                <td className="px-4 py-3 text-right font-mono text-sm">{formatINR(keyPositionData.netCloseINR)}</td>
              </tr>
              <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="px-4 py-2.5">Total PAYABLE (PI-wise + balances)</td>
                <td className="px-4 py-2.5 text-right font-mono text-amber-800 dark:text-amber-400">{formatFC(keyPositionData.totalPayableUSD)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-amber-800 dark:text-amber-400">{formatFC(keyPositionData.totalPayableCNY)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-amber-800 dark:text-amber-400">{formatINR(keyPositionData.totalPayableINR)}</td>
              </tr>
              <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="px-4 py-2.5">Total DEBIT BAL / Advance with suppliers</td>
                <td className="px-4 py-2.5 text-right font-mono text-emerald-800 dark:text-emerald-400">{formatFC(keyPositionData.totalDebitUSD)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-emerald-800 dark:text-emerald-400">{formatFC(keyPositionData.totalDebitCNY)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-emerald-800 dark:text-emerald-400">{formatINR(keyPositionData.totalDebitINR)}</td>
              </tr>
              <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50 text-[11px] text-slate-500 dark:text-slate-400">
                <td className="px-6 py-2">of which: Debit bal on closed / fully shipped PI</td>
                <td className="px-4 py-2 text-right font-mono">{formatFC(keyPositionData.debitOnClosedPiUSD)}</td>
                <td className="px-4 py-2 text-right font-mono">{formatFC(keyPositionData.debitOnClosedPiCNY)}</td>
                <td className="px-4 py-2 text-right font-mono">{formatINR(keyPositionData.debitOnClosedPiINR)}</td>
              </tr>
              <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50 text-rose-700 dark:text-rose-400 font-bold bg-rose-50/30 dark:bg-rose-950/20">
                <td className="px-4 py-2.5">Payment OVERDUE</td>
                <td className="px-4 py-2.5 text-right font-mono">{formatFC(keyPositionData.overduePayableUSD)}</td>
                <td className="px-4 py-2.5 text-right font-mono">{formatFC(keyPositionData.overduePayableCNY)}</td>
                <td className="px-4 py-2.5 text-right font-mono">{formatINR(keyPositionData.overduePayableINR)}</td>
              </tr>
              <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="px-4 py-2.5">Due in next 30 days</td>
                <td className="px-4 py-2.5 text-right font-mono">{formatFC(keyPositionData.due30USD)}</td>
                <td className="px-4 py-2.5 text-right font-mono">{formatFC(keyPositionData.due30CNY)}</td>
                <td className="px-4 py-2.5 text-right font-mono">{formatINR(keyPositionData.due30INR)}</td>
              </tr>
              <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="px-4 py-2.5">Advance still to pay (PI not shipped)</td>
                <td className="px-4 py-2.5 text-right font-mono">{formatFC(keyPositionData.advStillPayUSD)}</td>
                <td className="px-4 py-2.5 text-right font-mono">{formatFC(keyPositionData.advStillPayCNY)}</td>
                <td className="px-4 py-2.5 text-right font-mono">-</td>
              </tr>
              <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="px-4 py-2.5">LC Open (not yet paid)</td>
                <td className="px-4 py-2.5 text-right font-mono">{formatFC(keyPositionData.openLcUSD)}</td>
                <td className="px-4 py-2.5 text-right font-mono">{formatFC(keyPositionData.openLcCNY)}</td>
                <td className="px-4 py-2.5 text-right font-mono">{formatINR(keyPositionData.openLcINR)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Grid: TABLE 2 (PI STATUS COUNT) + TABLE 3 (BOE STATUS) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* TABLE 2: PI STATUS COUNT */}
        <div className="bg-white/95 dark:bg-slate-900/80 backdrop-blur-xl rounded-3xl p-5 shadow-sm border border-slate-200/80 dark:border-white/10 overflow-hidden">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white mb-3">
            2. PI STATUS COUNT
          </h3>
          <div className="overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-white/10">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#1e3a8a] text-white font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="px-4 py-2.5">PI Status</th>
                  <th className="px-3 py-2.5 text-center">No. of PIs</th>
                  <th className="px-3 py-2.5 text-right font-mono">Balance USD</th>
                  <th className="px-3 py-2.5 text-right font-mono">Balance CNY</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-semibold text-slate-700 dark:text-slate-300">
                {Object.entries(piStatusCounts).map(([status, item], i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-2 font-medium">{status}</td>
                    <td className="px-3 py-2 text-center font-bold text-slate-900 dark:text-white">{item.count}</td>
                    <td className="px-3 py-2 text-right font-mono">{item.usd !== 0 ? formatFC(item.usd) : '-'}</td>
                    <td className="px-3 py-2 text-right font-mono">{item.cny !== 0 ? formatFC(item.cny) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* TABLE 3: BILL OF ENTRY (BOE) STATUS */}
        <div className="bg-white/95 dark:bg-slate-900/80 backdrop-blur-xl rounded-3xl p-5 shadow-sm border border-slate-200/80 dark:border-white/10 overflow-hidden">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white mb-3">
            3. BILL OF ENTRY (BOE) STATUS
          </h3>
          <div className="overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-white/10">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#1e3a8a] text-white font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="px-3 py-2.5">BOE Status</th>
                  <th className="px-2 py-2.5 text-center">No. of CIs</th>
                  <th className="px-3 py-2.5 text-right font-mono">CI Value USD</th>
                  <th className="px-3 py-2.5 text-right font-mono">CI Value CNY</th>
                  <th className="px-3 py-2.5 text-right font-mono">Assessable INR</th>
                  <th className="px-2 py-2.5 text-center">Oldest</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-semibold text-slate-700 dark:text-slate-300">
                {Object.entries(boeStatusData).map(([status, item], i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-3 py-2.5 font-medium">{status}</td>
                    <td className="px-2 py-2.5 text-center font-bold text-slate-900 dark:text-white">{item.count}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{item.usd > 0 ? formatFC(item.usd) : '-'}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{item.cny > 0 ? formatFC(item.cny) : '-'}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{item.assessableINR > 0 ? formatINR(item.assessableINR) : '-'}</td>
                    <td className="px-2 py-2.5 text-center text-slate-500 font-mono text-[11px]">{item.oldestDays > 0 ? `${item.oldestDays}d` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Grid: TABLE 4 (COMPLIANCE ALERTS) */}
      <div className="bg-white/95 dark:bg-slate-900/80 backdrop-blur-xl rounded-3xl p-5 shadow-sm border border-slate-200/80 dark:border-white/10 overflow-hidden">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white mb-3">
          4. COMPLIANCE ALERTS
        </h3>
        <div className="overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-white/10">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#1e3a8a] text-white font-bold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="px-4 py-2.5">Alert Description</th>
                <th className="px-4 py-2.5 text-center">Count / Severity</th>
                <th className="px-4 py-2.5">Kahan dekhna hai</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-semibold text-slate-700 dark:text-slate-300">
              {complianceAlerts.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-2.5 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                    <span>{row.alert}</span>
                  </td>
                  <td className="px-4 py-2.5 text-center font-bold font-mono">
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                      {row.count}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-indigo-700 dark:text-indigo-400 text-[11px]">
                    {row.where}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* TABLE 5: MONTHLY — Shipments (CI) vs Payments */}
      <div className="bg-white/95 dark:bg-slate-900/80 backdrop-blur-xl rounded-3xl p-5 shadow-sm border border-slate-200/80 dark:border-white/10 overflow-hidden">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white mb-3">
          5. MONTHLY — Shipments (CI) vs Payments (FY 2026-27)
        </h3>
        <div className="overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-white/10">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#1e3a8a] text-white font-bold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="px-3 py-3">Month</th>
                <th className="px-3 py-3 text-right font-mono">CI USD</th>
                <th className="px-3 py-3 text-right font-mono">CI CNY</th>
                <th className="px-3 py-3 text-right font-mono">CI INR</th>
                <th className="px-3 py-3 text-right font-mono">Paid USD</th>
                <th className="px-3 py-3 text-right font-mono">Paid CNY</th>
                <th className="px-3 py-3 text-right font-mono">Paid INR</th>
                <th className="px-3 py-3 text-right font-mono">LC Opened FC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-semibold text-slate-700 dark:text-slate-300">
              {monthlyData.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-3 py-2.5 font-bold text-slate-900 dark:text-white">{row.month}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{row.ciUSD > 0 ? formatFC(row.ciUSD) : '-'}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{row.ciCNY > 0 ? formatFC(row.ciCNY) : '-'}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{row.ciINR > 0 ? formatINR(row.ciINR) : '-'}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-emerald-700 dark:text-emerald-400">{row.paidUSD > 0 ? formatFC(row.paidUSD) : '-'}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-emerald-700 dark:text-emerald-400">{row.paidCNY > 0 ? formatFC(row.paidCNY) : '-'}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-emerald-700 dark:text-emerald-400">{row.paidINR > 0 ? formatINR(row.paidINR) : '-'}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-cyan-700 dark:text-cyan-400">{row.lcOpenedFC > 0 ? formatFC(row.lcOpenedFC) : '-'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-100/90 dark:bg-slate-800/90 font-bold text-slate-900 dark:text-white border-t-2 border-slate-300 dark:border-white/20">
              <tr>
                <td className="px-3 py-2.5 uppercase tracking-wider">Total (FY 26-27):</td>
                <td className="px-3 py-2.5 text-right font-mono">{formatFC(monthlyData.reduce((s, r) => s + r.ciUSD, 0))}</td>
                <td className="px-3 py-2.5 text-right font-mono">{formatFC(monthlyData.reduce((s, r) => s + r.ciCNY, 0))}</td>
                <td className="px-3 py-2.5 text-right font-mono">{formatINR(monthlyData.reduce((s, r) => s + r.ciINR, 0))}</td>
                <td className="px-3 py-2.5 text-right font-mono text-emerald-800 dark:text-emerald-300">{formatFC(monthlyData.reduce((s, r) => s + r.paidUSD, 0))}</td>
                <td className="px-3 py-2.5 text-right font-mono text-emerald-800 dark:text-emerald-300">{formatFC(monthlyData.reduce((s, r) => s + r.paidCNY, 0))}</td>
                <td className="px-3 py-2.5 text-right font-mono text-emerald-800 dark:text-emerald-300">{formatINR(monthlyData.reduce((s, r) => s + r.paidINR, 0))}</td>
                <td className="px-3 py-2.5 text-right font-mono text-cyan-800 dark:text-cyan-300">{formatFC(monthlyData.reduce((s, r) => s + r.lcOpenedFC, 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};
