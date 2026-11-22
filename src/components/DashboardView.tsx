import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  formatFC,
  formatINR,
  formatDate,
  getDaysBetween,
} from '../utils/formatters';
import { exportToExcel } from '../utils/excel';
import { computeMonthEndValuation } from '../utils/engine';
import {
  TrendingDown,
  TrendingUp,
  AlertCircle,
  Clock,
  FileCheck2,
  Download,
  DollarSign,
  Layers,
  X,
  CreditCard,
  Ship,
  ShieldAlert,
  Calendar,
  Sparkles,
  ArrowUpRight,
  CheckCircle2,
  PieChart,
  Scale,
} from 'lucide-react';

export const DashboardView: React.FC = () => {
  const { db, engineResult, selectedCompanyId, asOfDate } = useApp();

  // Local filter states for Dashboard
  const [currencyFilter, setCurrencyFilter] = useState<string>('ALL');
  const [supplierFilter, setSupplierFilter] = useState<string>('ALL');
  const [bankAccountFilter, setBankAccountFilter] = useState<string>('ALL');

  // Drilldown modal state
  const [drilldownModal, setDrilldownModal] = useState<{
    title: string;
    items: Array<{ refNo: string; type: string; date: string; fc: number; inr: number; details: string }>;
  } | null>(null);

  const filteredSuppliers = useMemo(() => {
    return db.suppliers.filter(
      s => s.active && (selectedCompanyId === 'ALL' || s.companyId === selectedCompanyId)
    );
  }, [db.suppliers, selectedCompanyId]);

  const filteredBankAccounts = useMemo(() => {
    return db.bankAccounts.filter(
      b => b.active && (selectedCompanyId === 'ALL' || b.companyId === selectedCompanyId)
    );
  }, [db.bankAccounts, selectedCompanyId]);

  const companyMap = useMemo(() => new Map(db.companies.map(c => [c.id, c])), [db.companies]);
  const supplierMap = useMemo(() => new Map(db.suppliers.map(s => [s.id, s])), [db.suppliers]);
  const bankMap = useMemo(() => new Map(db.bankAccounts.map(b => [b.id, b])), [db.bankAccounts]);

  // Compute Dashboard Metrics
  const metrics = useMemo(() => {
    let totalPayableCrFC = 0;
    let payableUSD = 0;
    let payableCNY = 0;
    let totalPayableCrINR = 0;

    let overduePayableFC = 0;
    let overdueUSD = 0;
    let overdueCNY = 0;

    let dueNext30DaysFC = 0;
    let dueNext30DaysUSD = 0;
    let dueNext30DaysCNY = 0;

    let openBillsCount = 0;

    // 1a. Payables from CI states
    for (const [, state] of engineResult.ciStates) {
      if (selectedCompanyId !== 'ALL' && state.ci.companyId !== selectedCompanyId) continue;
      if (currencyFilter !== 'ALL' && state.ci.currency !== currencyFilter) continue;
      if (supplierFilter !== 'ALL' && state.ci.supplierId !== supplierFilter) continue;

      if (state.balanceFC > 0) {
        openBillsCount++;
        totalPayableCrFC += state.balanceFC;
        totalPayableCrINR += state.balanceINR;
        if (state.ci.currency === 'USD') payableUSD += state.balanceFC;
        else if (state.ci.currency === 'CNY') payableCNY += state.balanceFC;

        if (state.isOverdue) {
          overduePayableFC += state.balanceFC;
          if (state.ci.currency === 'USD') overdueUSD += state.balanceFC;
          else if (state.ci.currency === 'CNY') overdueCNY += state.balanceFC;
        } else if (state.dueDate) {
          const daysUntilDue = getDaysBetween(asOfDate, state.dueDate);
          if (daysUntilDue >= 0 && daysUntilDue <= 30) {
            dueNext30DaysFC += state.balanceFC;
            if (state.ci.currency === 'USD') dueNext30DaysUSD += state.balanceFC;
            else if (state.ci.currency === 'CNY') dueNext30DaysCNY += state.balanceFC;
          }
        }
      }
    }

    // 1b. Payables from Opening Balances (Cr)
    for (const [, obState] of engineResult.openingPayableStates) {
      if (selectedCompanyId !== 'ALL' && obState.ob.companyId !== selectedCompanyId) continue;
      if (currencyFilter !== 'ALL' && obState.ob.currency !== currencyFilter) continue;
      if (supplierFilter !== 'ALL' && obState.ob.supplierId !== supplierFilter) continue;

      if (obState.balanceFC > 0) {
        openBillsCount++;
        totalPayableCrFC += obState.balanceFC;
        totalPayableCrINR += obState.balanceINR;
        if (obState.ob.currency === 'USD') payableUSD += obState.balanceFC;
        else if (obState.ob.currency === 'CNY') payableCNY += obState.balanceFC;

        if (obState.isOverdue) {
          overduePayableFC += obState.balanceFC;
          if (obState.ob.currency === 'USD') overdueUSD += obState.balanceFC;
          else if (obState.ob.currency === 'CNY') overdueCNY += obState.balanceFC;
        }
      }
    }

    // 2. Advances / Excess (Dr) from ALL unapplied chunks
    let totalAdvanceDrFC = 0;
    let advanceUSD = 0;
    let advanceCNY = 0;
    let totalAdvanceDrINR = 0;

    for (const chunk of engineResult.unappliedPayments) {
      if (chunk.remainingFC <= 0) continue;
      if (selectedCompanyId !== 'ALL' && chunk.companyId !== selectedCompanyId) continue;
      if (currencyFilter !== 'ALL' && chunk.currency !== currencyFilter) continue;
      if (supplierFilter !== 'ALL' && chunk.supplierId !== supplierFilter) continue;
      if (bankAccountFilter !== 'ALL' && chunk.bankAccountId !== bankAccountFilter) continue;

      totalAdvanceDrFC += chunk.remainingFC;
      totalAdvanceDrINR += chunk.remainingFC * chunk.exactRate;
      if (chunk.currency === 'USD') advanceUSD += chunk.remainingFC;
      else if (chunk.currency === 'CNY') advanceCNY += chunk.remainingFC;
    }

    // 3. Advance still to be paid on open PIs
    let advanceStillToBePaidFC = 0;
    for (const [, state] of engineResult.piStates) {
      if (selectedCompanyId !== 'ALL' && state.pi.companyId !== selectedCompanyId) continue;
      if (currencyFilter !== 'ALL' && state.pi.currency !== currencyFilter) continue;
      if (supplierFilter !== 'ALL' && state.pi.supplierId !== supplierFilter) continue;

      if (!state.pi.isClosed) {
        const stillNeeded = Math.max(0, state.advanceRequiredFC - state.totalPaidFC);
        advanceStillToBePaidFC += stillNeeded;
      }
    }

    // 4. Open LCs
    let openLcFC = 0;
    let openLcINR = 0;
    for (const p of db.payments) {
      if (p.paymentMode === 'LC' && p.lcStatus !== 'Paid' && (p.paymentDate || '') <= asOfDate) {
        if (selectedCompanyId !== 'ALL' && p.companyId !== selectedCompanyId) continue;
        if (currencyFilter !== 'ALL' && p.currency !== currencyFilter) continue;
        if (supplierFilter !== 'ALL' && p.supplierId !== supplierFilter) continue;
        if (bankAccountFilter !== 'ALL' && p.bankAccountId !== bankAccountFilter) continue;
        openLcFC += p.amountFC;
        openLcINR += p.inrAmount;
      }
    }

    // 5. Debit Notes suggested
    let dnSuggestedCount = 0;
    let dnSuggestedFC = 0;
    for (const s of engineResult.suggestedDebitNotes) {
      if (selectedCompanyId !== 'ALL' && s.companyId !== selectedCompanyId) continue;
      if (currencyFilter !== 'ALL' && s.currency !== currencyFilter) continue;
      if (supplierFilter !== 'ALL' && s.supplierId !== supplierFilter) continue;
      dnSuggestedCount++;
      dnSuggestedFC += s.excessFC;
    }

    // 6. Debit Notes pending recovery
    let dnPendingRecoveryFC = 0;
    let dnPendingRecoveryINR = 0;
    for (const dn of db.debitNotes) {
      if ((dn.dnDate || '') > asOfDate) continue;
      if (selectedCompanyId !== 'ALL' && dn.companyId !== selectedCompanyId) continue;
      if (currencyFilter !== 'ALL' && dn.currency !== currencyFilter) continue;
      if (supplierFilter !== 'ALL' && dn.supplierId !== supplierFilter) continue;

      const pendingFC = dn.amountFC - (dn.recoveredFC || 0);
      if (pendingFC > 0 && dn.status !== 'Written Off') {
        dnPendingRecoveryFC += pendingFC;
        dnPendingRecoveryINR += pendingFC * dn.rate;
      }
    }

    // 7. BOEs pending submission to bank
    const boePendingSubmissionCount = db.commercialInvoices.filter(ci => {
      if ((ci.ciDate || '') > asOfDate) return false;
      if (selectedCompanyId !== 'ALL' && ci.companyId !== selectedCompanyId) return false;
      if (currencyFilter !== 'ALL' && ci.currency !== currencyFilter) return false;
      if (supplierFilter !== 'ALL' && ci.supplierId !== supplierFilter) return false;

      const sub = db.boeSubmissions.find(s => s.ciId === ci.id);
      return !sub || sub.idpmsStatus !== 'Settled';
    }).length;

    // 8. Realized FX Gain/Loss from Allocations + Refunds
    let realizedGL = 0;
    for (const alloc of engineResult.allocations) {
      if (alloc.realizedGainLossINR) {
        realizedGL += alloc.realizedGainLossINR;
      }
    }
    let filteredRefundFX = 0;
    for (const refund of db.refundReceipts) {
      if ((refund.date || '') > asOfDate) continue;
      if (selectedCompanyId !== 'ALL' && refund.companyId !== selectedCompanyId) continue;
      if (currencyFilter !== 'ALL' && refund.currency !== currencyFilter) continue;
      if (supplierFilter !== 'ALL' && refund.supplierId !== supplierFilter) continue;
      if (bankAccountFilter !== 'ALL' && refund.bankAccountId !== bankAccountFilter) continue;

      const dn = db.debitNotes.find(d => d.id === refund.againstDnId);
      if (dn) {
        const dnINR = refund.amountFC * dn.rate;
        const refundINR = refund.inrAmount || refund.amountFC * refund.actualExchangeRate;
        filteredRefundFX += Math.round(refundINR - dnINR);
      }
    }
    const totalRealizedGLWithRefund = Math.round((realizedGL + filteredRefundFX) * 100) / 100;

    // 9. Unrealized FX at latest configured month-end rate
    const targetCurr = currencyFilter === 'ALL' ? 'USD' : currencyFilter;
    const monthEndRates = [...db.monthEndRates]
      .filter(r => r.currency === targetCurr && r.monthEndDate <= asOfDate)
      .sort((a, b) => b.monthEndDate.localeCompare(a.monthEndDate));
    const latestRate = monthEndRates[0];
    const hasMonthEndRate = !!latestRate;
    const latestMonthEnd = latestRate ? latestRate.monthEndDate : '';
    const unrealizedFX = hasMonthEndRate
      ? computeMonthEndValuation(
          db,
          engineResult,
          latestMonthEnd,
          targetCurr,
          selectedCompanyId,
          supplierFilter
        ).totalUnrealizedFXINR
      : 0;

    return {
      totalPayableCrFC,
      payableUSD,
      payableCNY,
      totalPayableCrINR,
      openBillsCount,
      totalAdvanceDrFC,
      advanceUSD,
      advanceCNY,
      totalAdvanceDrINR,
      overduePayableFC,
      overdueUSD,
      overdueCNY,
      dueNext30DaysFC,
      dueNext30DaysUSD,
      dueNext30DaysCNY,
      netClosingUSD: payableUSD - advanceUSD,
      netClosingCNY: payableCNY - advanceCNY,
      netClosingINR: totalPayableCrINR - totalAdvanceDrINR,
      advanceStillToBePaidFC,
      openLcFC,
      openLcINR,
      dnSuggestedCount,
      dnSuggestedFC,
      dnPendingRecoveryFC,
      dnPendingRecoveryINR,
      boePendingSubmissionCount,
      totalRealizedGLWithRefund,
      unrealizedFX,
      hasMonthEndRate,
      latestMonthEnd,
    };
  }, [db, engineResult, selectedCompanyId, currencyFilter, supplierFilter, bankAccountFilter, asOfDate]);

  // Overall Compliance Health Dial (Reference Image 1: Circular Radial Meter)
  const complianceDial = useMemo(() => {
    const totalPayments = db.payments.length || 1;
    const settledPayments = db.payments.filter(p => {
      const allocs = engineResult.allocations.filter(a => a.paymentId === p.id);
      return allocs.length > 0 && allocs.every(a => !!a.boeNo && !a.boeNo.startsWith('PENDING-'));
    }).length;

    const overdueCount = engineResult.idpmsAdvanceAlerts.filter(a => a.status === 'Overdue' || a.status === 'Critical').length;
    const safeWindowCount = Math.max(0, totalPayments - settledPayments - overdueCount);

    const settledPct = Math.round((settledPayments / totalPayments) * 100);
    const safePct = Math.round((safeWindowCount / totalPayments) * 100);
    const atRiskPct = Math.max(0, 100 - settledPct - safePct);

    return {
      settledPct,
      safePct,
      atRiskPct,
      settledPayments,
      safeWindowCount,
      overdueCount,
      totalPayments,
    };
  }, [db.payments, engineResult.allocations, engineResult.idpmsAdvanceAlerts]);

  // Party-wise Closing Table Data
  const partyWiseData = useMemo(() => {
    const map = new Map<
      string,
      {
        companyId: string;
        supplierId: string;
        currency: string;
        drFC: number;
        crFC: number;
        drINR: number;
        crINR: number;
        latestValuationRate: number;
      }
    >();

    // Add Cr from open CIs
    for (const [, state] of engineResult.ciStates) {
      if (selectedCompanyId !== 'ALL' && state.ci.companyId !== selectedCompanyId) continue;
      if (currencyFilter !== 'ALL' && state.ci.currency !== currencyFilter) continue;
      if (supplierFilter !== 'ALL' && state.ci.supplierId !== supplierFilter) continue;

      if (state.balanceFC > 0) {
        const key = `${state.ci.companyId}___${state.ci.supplierId}___${state.ci.currency}`;
        const current = map.get(key) || {
          companyId: state.ci.companyId,
          supplierId: state.ci.supplierId,
          currency: state.ci.currency,
          drFC: 0,
          crFC: 0,
          drINR: 0,
          crINR: 0,
          latestValuationRate: 0,
        };
        current.crFC += state.balanceFC;
        current.crINR += state.balanceINR;
        map.set(key, current);
      }
    }

    // Add Cr from open Opening Balances (Cr)
    for (const [, obState] of engineResult.openingPayableStates) {
      if (selectedCompanyId !== 'ALL' && obState.ob.companyId !== selectedCompanyId) continue;
      if (currencyFilter !== 'ALL' && obState.ob.currency !== currencyFilter) continue;
      if (supplierFilter !== 'ALL' && obState.ob.supplierId !== supplierFilter) continue;

      if (obState.balanceFC > 0) {
        const key = `${obState.ob.companyId}___${obState.ob.supplierId}___${obState.ob.currency}`;
        const current = map.get(key) || {
          companyId: obState.ob.companyId,
          supplierId: obState.ob.supplierId,
          currency: obState.ob.currency,
          drFC: 0,
          crFC: 0,
          drINR: 0,
          crINR: 0,
          latestValuationRate: 0,
        };
        current.crFC += obState.balanceFC;
        current.crINR += obState.balanceINR;
        map.set(key, current);
      }
    }

    // Add Dr from ALL unapplied chunks
    for (const chunk of engineResult.unappliedPayments) {
      if (chunk.remainingFC <= 0) continue;
      if (selectedCompanyId !== 'ALL' && chunk.companyId !== selectedCompanyId) continue;
      if (currencyFilter !== 'ALL' && chunk.currency !== currencyFilter) continue;
      if (supplierFilter !== 'ALL' && chunk.supplierId !== supplierFilter) continue;
      if (bankAccountFilter !== 'ALL' && chunk.bankAccountId !== bankAccountFilter) continue;

      const key = `${chunk.companyId}___${chunk.supplierId}___${chunk.currency}`;
      const current = map.get(key) || {
        companyId: chunk.companyId,
        supplierId: chunk.supplierId,
        currency: chunk.currency,
        drFC: 0,
        crFC: 0,
        drINR: 0,
        crINR: 0,
        latestValuationRate: 0,
      };
      current.drFC += chunk.remainingFC;
      current.drINR += chunk.remainingFC * chunk.exactRate;
      map.set(key, current);
    }

    // Add Dr from pending Debit Notes
    for (const dn of db.debitNotes) {
      if ((dn.dnDate || '') > asOfDate) continue;
      if (selectedCompanyId !== 'ALL' && dn.companyId !== selectedCompanyId) continue;
      if (currencyFilter !== 'ALL' && dn.currency !== currencyFilter) continue;
      if (supplierFilter !== 'ALL' && dn.supplierId !== supplierFilter) continue;

      const pendingFC = dn.amountFC - (dn.recoveredFC || 0);
      if (pendingFC > 0 && dn.status !== 'Written Off') {
        const key = `${dn.companyId}___${dn.supplierId}___${dn.currency}`;
        const current = map.get(key) || {
          companyId: dn.companyId,
          supplierId: dn.supplierId,
          currency: dn.currency,
          drFC: 0,
          crFC: 0,
          drINR: 0,
          crINR: 0,
          latestValuationRate: 0,
        };
        current.drFC += pendingFC;
        current.drINR += pendingFC * dn.rate;
        map.set(key, current);
      }
    }

    return Array.from(map.values()).map(row => {
      const rateObj = db.monthEndRates
        .filter(r => r.currency === row.currency && r.monthEndDate <= asOfDate)
        .sort((a, b) => b.monthEndDate.localeCompare(a.monthEndDate))[0];

      const netFC = row.crFC - row.drFC;
      const netBookINR = row.crINR - row.drINR;

      let netValINR = netBookINR;
      let valRate = 0;
      if (rateObj) {
        valRate = rateObj.valuationRate;
        const crValINR = row.crFC * valRate;
        const drValINR = db.settings.revalueAdvancesAtMonthEnd ? row.drFC * valRate : row.drINR;
        netValINR = crValINR - drValINR;
      }

      return {
        ...row,
        netFC,
        netBookINR,
        netValINR,
        latestValuationRate: valRate,
      };
    });
  }, [db, engineResult, selectedCompanyId, currencyFilter, supplierFilter, bankAccountFilter, asOfDate]);

  // Ageing Breakdown
  const ageingPayables = useMemo(() => {
    const partyMap = new Map<
      string,
      {
        companyId: string;
        supplierId: string;
        currency: string;
        b1: number;
        b2: number;
        b3: number;
        b4: number;
        total: number;
      }
    >();

    for (const [, state] of engineResult.ciStates) {
      if (state.balanceFC <= 0) continue;
      if (selectedCompanyId !== 'ALL' && state.ci.companyId !== selectedCompanyId) continue;
      if (currencyFilter !== 'ALL' && state.ci.currency !== currencyFilter) continue;
      if (supplierFilter !== 'ALL' && state.ci.supplierId !== supplierFilter) continue;

      const key = `${state.ci.companyId}___${state.ci.supplierId}___${state.ci.currency}`;
      const row = partyMap.get(key) || {
        companyId: state.ci.companyId,
        supplierId: state.ci.supplierId,
        currency: state.ci.currency,
        b1: 0,
        b2: 0,
        b3: 0,
        b4: 0,
        total: 0,
      };

      const baseDate = db.settings.ageingBaseDateForPayables === 'boeDate'
        ? (state.ci.boeDate || state.ci.ciDate)
        : state.ci.ciDate;
      const days = getDaysBetween(baseDate, asOfDate);

      if (days <= 30) row.b1 += state.balanceFC;
      else if (days <= 60) row.b2 += state.balanceFC;
      else if (days <= 90) row.b3 += state.balanceFC;
      else row.b4 += state.balanceFC;

      row.total += state.balanceFC;
      partyMap.set(key, row);
    }

    return Array.from(partyMap.values());
  }, [engineResult, db.settings, selectedCompanyId, currencyFilter, supplierFilter, asOfDate]);

  const ageingAdvances = useMemo(() => {
    const partyMap = new Map<
      string,
      {
        companyId: string;
        supplierId: string;
        currency: string;
        b1: number;
        b2: number;
        b3: number;
        b4: number;
        total: number;
      }
    >();

    for (const chunk of engineResult.unappliedPayments) {
      if (chunk.remainingFC <= 0) continue;
      if (selectedCompanyId !== 'ALL' && chunk.companyId !== selectedCompanyId) continue;
      if (currencyFilter !== 'ALL' && chunk.currency !== currencyFilter) continue;
      if (supplierFilter !== 'ALL' && chunk.supplierId !== supplierFilter) continue;
      if (bankAccountFilter !== 'ALL' && chunk.bankAccountId !== bankAccountFilter) continue;

      const key = `${chunk.companyId}___${chunk.supplierId}___${chunk.currency}`;
      const row = partyMap.get(key) || {
        companyId: chunk.companyId,
        supplierId: chunk.supplierId,
        currency: chunk.currency,
        b1: 0,
        b2: 0,
        b3: 0,
        b4: 0,
        total: 0,
      };

      const days = getDaysBetween(chunk.date, asOfDate);
      if (days <= 30) row.b1 += chunk.remainingFC;
      else if (days <= 60) row.b2 += chunk.remainingFC;
      else if (days <= 90) row.b3 += chunk.remainingFC;
      else row.b4 += chunk.remainingFC;

      row.total += chunk.remainingFC;
      partyMap.set(key, row);
    }

    return Array.from(partyMap.values());
  }, [engineResult, selectedCompanyId, currencyFilter, supplierFilter, bankAccountFilter, asOfDate]);

  const handleExportPartyClosing = () => {
    const exportData = partyWiseData.map(r => ({
      Company: companyMap.get(r.companyId)?.code || r.companyId,
      'Vendor Code': supplierMap.get(r.supplierId)?.vendorCode || '',
      Supplier: supplierMap.get(r.supplierId)?.supplierName || '',
      Currency: r.currency,
      'Dr FC (Advance/Excess)': r.drFC,
      'Cr FC (Payable)': r.crFC,
      'Net FC': r.netFC,
      'Dr INR': Math.round(r.drINR),
      'Cr INR': Math.round(r.crINR),
      'Net INR (Book)': Math.round(r.netBookINR),
      'Net INR (Valuation)': Math.round(r.netValINR),
    }));
    exportToExcel(exportData, 'Party_Wise_Closing_Balances');
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header & Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white/95 dark:bg-slate-900/80 backdrop-blur-xl p-5 rounded-3xl shadow-sm border border-slate-200/80 dark:border-white/10 transition-colors">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-sky-400 text-white flex items-center justify-center shadow-sm">
              <Sparkles className="w-4 h-4 fill-white/20" />
            </div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">Executive Dashboard</h2>
            <span className="text-[10px] font-bold px-2.5 py-0.5 bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 rounded-full uppercase tracking-wider border border-indigo-200/60 dark:border-indigo-800/80">
              Live Overview
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
            Real-time financial positions, IDPMS 180-day compliance, container demurrage radar, and FX valuation
          </p>
        </div>

        {/* Global Filter Pills */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Currency Filter */}
          <div className="flex items-center space-x-2 text-xs bg-slate-50 dark:bg-slate-800/80 px-3 py-2 rounded-2xl border border-slate-200/80 dark:border-white/10 shadow-2xs">
            <span className="font-semibold text-slate-600 dark:text-slate-300 text-[11px]">Currency:</span>
            <select
              value={currencyFilter}
              onChange={e => setCurrencyFilter(e.target.value)}
              className="bg-transparent font-bold text-slate-900 dark:text-slate-100 focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">All Currencies</option>
              {db.currencies.map(c => (
                <option key={c.code} value={c.code} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                  {c.code} ({c.name})
                </option>
              ))}
            </select>
          </div>

          {/* Supplier Filter */}
          <div className="flex items-center space-x-2 text-xs bg-slate-50 dark:bg-slate-800/80 px-3 py-2 rounded-2xl border border-slate-200/80 dark:border-white/10 shadow-2xs">
            <span className="font-semibold text-slate-600 dark:text-slate-300 text-[11px]">Supplier:</span>
            <select
              value={supplierFilter}
              onChange={e => setSupplierFilter(e.target.value)}
              className="bg-transparent font-bold text-slate-900 dark:text-slate-100 max-w-[170px] truncate focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">All Suppliers</option>
              {filteredSuppliers.map(s => (
                <option key={s.id} value={s.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                  {s.vendorCode} - {s.supplierName}
                </option>
              ))}
            </select>
          </div>

          {/* Bank Account Filter */}
          <div className="flex items-center space-x-2 text-xs bg-slate-50 dark:bg-slate-800/80 px-3 py-2 rounded-2xl border border-slate-200/80 dark:border-white/10 shadow-2xs">
            <span className="font-semibold text-slate-600 dark:text-slate-300 text-[11px]">Bank:</span>
            <select
              value={bankAccountFilter}
              onChange={e => setBankAccountFilter(e.target.value)}
              className="bg-transparent font-bold text-slate-900 dark:text-slate-100 focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">All Accounts</option>
              {filteredBankAccounts.map(b => (
                <option key={b.id} value={b.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                  {b.bankName} - {b.accountNumber.slice(-4)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Primary KPI Cards Grid - Vibrant Modern Gradients (Ref Image 1 & 3) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Cr (Payables) - Electric Blue Tile */}
        <div className="rounded-3xl p-5 text-white shadow-lg shadow-blue-600/20 bg-gradient-to-br from-blue-600 via-indigo-600 to-indigo-800 relative overflow-hidden group hover:-translate-y-1 transition-all duration-300">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-100">Total Payables (Cr)</span>
            <div className="w-9 h-9 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center text-white border border-white/20">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-2xl font-black font-mono tracking-tight text-white drop-shadow-xs">
                ${formatFC(metrics.payableUSD)} <span className="text-xs font-sans font-semibold text-blue-200">USD</span>
              </span>
              {metrics.payableCNY > 0 && (
                <span className="text-xl font-black font-mono tracking-tight text-amber-200 drop-shadow-xs border-l border-white/20 pl-2">
                  ¥{formatFC(metrics.payableCNY)} <span className="text-xs font-sans font-semibold text-amber-100">CNY</span>
                </span>
              )}
            </div>
            <div className="text-xs font-bold text-blue-100 font-mono mt-1 flex items-center justify-between">
              <span>Book: {formatINR(metrics.totalPayableCrINR, 0, true)}</span>
              {metrics.payableCNY > 0 && (
                <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded text-white font-mono">USD + CNY</span>
              )}
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-[11px] text-blue-100 border-t border-white/15 pt-2.5">
            <span>Open Bills: <strong className="text-white font-bold">{metrics.openBillsCount}</strong></span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white backdrop-blur-sm">
              Payable to Suppliers
            </span>
          </div>
        </div>

        {/* Card 2: Total Dr (Advances/Excess) - Royal Purple Tile */}
        <div className="rounded-3xl p-5 text-white shadow-lg shadow-purple-600/20 bg-gradient-to-br from-purple-600 via-indigo-600 to-purple-800 relative overflow-hidden group hover:-translate-y-1 transition-all duration-300">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-purple-100">Advances / Excess (Dr)</span>
            <div className="w-9 h-9 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center text-white border border-white/20">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-2xl font-black font-mono tracking-tight text-white drop-shadow-xs">
                ${formatFC(metrics.advanceUSD)} <span className="text-xs font-sans font-semibold text-purple-200">USD</span>
              </span>
              {metrics.advanceCNY > 0 && (
                <span className="text-xl font-black font-mono tracking-tight text-emerald-200 drop-shadow-xs border-l border-white/20 pl-2">
                  ¥{formatFC(metrics.advanceCNY)} <span className="text-xs font-sans font-semibold text-emerald-100">CNY</span>
                </span>
              )}
            </div>
            <div className="text-xs font-bold text-purple-100 font-mono mt-1 flex items-center justify-between">
              <span>Book: {formatINR(metrics.totalAdvanceDrINR, 0, true)}</span>
              {metrics.advanceCNY > 0 && (
                <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded text-white font-mono">USD + CNY</span>
              )}
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-[11px] text-purple-100 border-t border-white/15 pt-2.5">
            <span>Our funds with suppliers</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white backdrop-blur-sm">
              Debit Balance
            </span>
          </div>
        </div>

        {/* Card 3: Overdue Payables & IDPMS Urgency - Sunset Coral Tile */}
        <div className="rounded-3xl p-5 text-white shadow-lg shadow-rose-600/20 bg-gradient-to-br from-rose-500 via-orange-500 to-amber-600 relative overflow-hidden group hover:-translate-y-1 transition-all duration-300">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-100">Overdue Payables</span>
            <div className="w-9 h-9 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center text-white border border-white/20">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-2xl font-black font-mono tracking-tight text-white drop-shadow-xs">
                ${formatFC(metrics.overdueUSD)} <span className="text-xs font-sans font-semibold text-rose-200">USD</span>
              </span>
              {metrics.overdueCNY > 0 && (
                <span className="text-xl font-black font-mono tracking-tight text-amber-200 drop-shadow-xs border-l border-white/20 pl-2">
                  ¥{formatFC(metrics.overdueCNY)} <span className="text-xs font-sans font-semibold text-amber-100">CNY</span>
                </span>
              )}
            </div>
            <div className="text-xs font-bold text-rose-100 font-mono mt-1">
              Due &le;30d: ${formatFC(metrics.dueNext30DaysUSD)} USD {metrics.dueNext30DaysCNY > 0 ? `| ¥${formatFC(metrics.dueNext30DaysCNY)} CNY` : ''}
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-[11px] text-rose-100 border-t border-white/15 pt-2.5">
            <span>Critical Timeline</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white backdrop-blur-sm animate-pulse">
              Urgent Review
            </span>
          </div>
        </div>

        {/* Card 4: Realized FX Position - Emerald/Teal Tile */}
        <div className="rounded-3xl p-5 text-white shadow-lg shadow-emerald-600/20 bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 relative overflow-hidden group hover:-translate-y-1 transition-all duration-300">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-100">Realized FX Gain / (Loss)</span>
            <div className="w-9 h-9 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center text-white border border-white/20">
              {metrics.totalRealizedGLWithRefund >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black font-mono tracking-tight text-white drop-shadow-xs">
              {formatINR(metrics.totalRealizedGLWithRefund, 0, true)}
            </div>
            <div className="text-xs font-bold text-emerald-100 font-mono mt-1">
              Unrealized: {metrics.hasMonthEndRate ? formatINR(metrics.unrealizedFX, 0, true) : 'Config in Masters'}
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-[11px] text-emerald-100 border-t border-white/15 pt-2.5">
            <span className="truncate">{metrics.hasMonthEndRate ? `As of: ${formatDate(metrics.latestMonthEnd)}` : 'Auto-derived FX'}</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white backdrop-blur-sm">
              Live Engine
            </span>
          </div>
        </div>
      </div>

      {/* Net Closing Position Summary Strip (USD & CNY Dual Currency Breakup) */}
      <div className="bg-white/95 dark:bg-slate-900/80 backdrop-blur-xl p-4 rounded-3xl border border-slate-200/80 dark:border-white/10 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <span>Net Closing Position (As-on Date)</span>
              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                metrics.netClosingINR >= 0 ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200' : 'bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200'
              }`}>
                {metrics.netClosingINR >= 0 ? '+ Net Payable to Suppliers' : '− Net Advance with Suppliers'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Net balance across all commercial invoices, open PIs, and advance remittances
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          {/* USD Net */}
          <div className="px-3.5 py-1.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-white/10">
            <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Net USD</span>
            <span className={`text-base font-black font-mono tracking-tight ${metrics.netClosingUSD >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-purple-600 dark:text-purple-400'}`}>
              {metrics.netClosingUSD >= 0 ? '+' : '−'}${formatFC(Math.abs(metrics.netClosingUSD))} USD
            </span>
          </div>

          {/* CNY Net */}
          <div className="px-3.5 py-1.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-white/10">
            <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Net CNY</span>
            <span className={`text-base font-black font-mono tracking-tight ${metrics.netClosingCNY >= 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {metrics.netClosingCNY >= 0 ? '+' : '−'}¥{formatFC(Math.abs(metrics.netClosingCNY))} CNY
            </span>
          </div>

          {/* Book INR Net */}
          <div className="px-3.5 py-1.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-white/10">
            <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Net Book INR</span>
            <span className={`text-base font-black font-mono tracking-tight ${metrics.netClosingINR >= 0 ? 'text-slate-900 dark:text-white' : 'text-purple-700 dark:text-purple-300'}`}>
              {metrics.netClosingINR >= 0 ? '+' : '−'}{formatINR(Math.abs(metrics.netClosingINR), 0, true)}
            </span>
          </div>
        </div>
      </div>

      {/* Middle Section: Circular Radial Gauge + Operational Quick Badges (Ref Image 1 & 3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Widget 1: Circular Radial Compliance Dial (Matching Image 1 "Project Status" gauge) */}
        <div className="bg-white/95 dark:bg-slate-900/80 backdrop-blur-xl p-5 rounded-3xl border border-slate-200/80 dark:border-white/10 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                IDPMS & Customs Health
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Overall settlement & regulatory compliance meter
              </p>
            </div>
            <div className="w-7 h-7 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <PieChart className="w-4 h-4" />
            </div>
          </div>

          {/* SVG Circular Radial Progress Ring */}
          <div className="flex items-center justify-center py-4">
            <div className="relative w-44 h-44 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 120 120">
                {/* Background Track */}
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  strokeWidth="10"
                  className="stroke-slate-100 dark:stroke-slate-800"
                  fill="transparent"
                />
                {/* Settled / Matched Track (Blue) */}
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  strokeWidth="10"
                  strokeDasharray={`${(complianceDial.settledPct * 3.14159).toFixed(1)} 314.16`}
                  strokeDashoffset="0"
                  strokeLinecap="round"
                  className="stroke-blue-600 dark:stroke-blue-500 transition-all duration-1000 ease-out"
                  fill="transparent"
                />
                {/* Safe Window Track (Purple) */}
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  strokeWidth="10"
                  strokeDasharray={`${(complianceDial.safePct * 3.14159).toFixed(1)} 314.16`}
                  strokeDashoffset={`-${(complianceDial.settledPct * 3.14159).toFixed(1)}`}
                  strokeLinecap="round"
                  className="stroke-purple-600 dark:stroke-purple-500 transition-all duration-1000 ease-out"
                  fill="transparent"
                />
                {/* At Risk Track (Coral/Rose) */}
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  strokeWidth="10"
                  strokeDasharray={`${(complianceDial.atRiskPct * 3.14159).toFixed(1)} 314.16`}
                  strokeDashoffset={`-${((complianceDial.settledPct + complianceDial.safePct) * 3.14159).toFixed(1)}`}
                  strokeLinecap="round"
                  className="stroke-rose-500 dark:stroke-rose-400 transition-all duration-1000 ease-out"
                  fill="transparent"
                />
              </svg>

              {/* Center Gauge Stats */}
              <div className="absolute flex flex-col items-center justify-center text-center">
                <span className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                  {complianceDial.settledPct}%
                </span>
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Settled Score
                </span>
              </div>
            </div>
          </div>

          {/* Breakdown Pills (Ref Image 1) */}
          <div className="space-y-2 border-t border-slate-200/70 dark:border-white/10 pt-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                <span className="text-slate-600 dark:text-slate-300 font-medium">100% Settled / Knocked Off</span>
              </div>
              <span className="font-bold font-mono text-slate-900 dark:text-white">{complianceDial.settledPct}%</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-600"></span>
                <span className="text-slate-600 dark:text-slate-300 font-medium">Within Safe 180d Window</span>
              </div>
              <span className="font-bold font-mono text-slate-900 dark:text-white">{complianceDial.safePct}%</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                <span className="text-slate-600 dark:text-slate-300 font-medium">Critical / Overdue Attention</span>
              </div>
              <span className="font-bold font-mono text-rose-600 dark:text-rose-400">{complianceDial.atRiskPct}%</span>
            </div>
          </div>
        </div>

        {/* Widget 2: Operational Action Cards Grid */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Card A: Pending Adv on Open PIs */}
          <div className="bg-white/95 dark:bg-slate-900/80 backdrop-blur-xl p-5 rounded-3xl border border-slate-200/80 dark:border-white/10 shadow-sm flex flex-col justify-between hover:border-indigo-400/50 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Pending Adv on Open PIs
              </span>
              <div className="w-8 h-8 rounded-2xl bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="my-2">
              <div className="text-xl font-black text-slate-900 dark:text-white font-mono">
                {formatFC(metrics.advanceStillToBePaidFC)} <span className="text-xs font-sans text-slate-400">FC</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Required before vendor dispatches cargo</p>
            </div>
            <div className="border-t border-slate-100 dark:border-white/5 pt-2 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 flex items-center justify-between">
              <span>Purchase Desk Order Follow-up</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Card B: Open LC Commitments */}
          <div className="bg-white/95 dark:bg-slate-900/80 backdrop-blur-xl p-5 rounded-3xl border border-slate-200/80 dark:border-white/10 shadow-sm flex flex-col justify-between hover:border-cyan-400/50 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Open LC Commitments
              </span>
              <div className="w-8 h-8 rounded-2xl bg-cyan-50 dark:bg-cyan-950/70 text-cyan-600 dark:text-cyan-400 flex items-center justify-center">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div className="my-2">
              <div className="text-xl font-black text-slate-900 dark:text-white font-mono">
                {formatFC(metrics.openLcFC)} <span className="text-xs font-sans text-slate-400">FC</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono">{formatINR(metrics.openLcINR, 0, true)}</p>
            </div>
            <div className="border-t border-slate-100 dark:border-white/5 pt-2 text-[11px] font-semibold text-cyan-600 dark:text-cyan-400 flex items-center justify-between">
              <span>Bank Letter of Credit Margin</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Card C: Debit Notes Suggested (Short Ship) */}
          <div className={`p-5 rounded-3xl border shadow-sm flex flex-col justify-between transition-all ${
            metrics.dnSuggestedCount > 0
              ? 'bg-amber-50/70 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800/80'
              : 'bg-white/95 dark:bg-slate-900/80 backdrop-blur-xl border-slate-200/80 dark:border-white/10'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider">
                DN Suggested (Short Ship)
              </span>
              <div className="w-8 h-8 rounded-2xl bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 flex items-center justify-center">
                <AlertCircle className="w-4 h-4" />
              </div>
            </div>
            <div className="my-2">
              <div className="text-xl font-black text-amber-900 dark:text-amber-200 font-mono">
                {metrics.dnSuggestedCount} DNs • {formatFC(metrics.dnSuggestedFC)} FC
              </div>
              <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">Short-received cargo vs advance payment</p>
            </div>
            <div className="border-t border-amber-200/60 dark:border-amber-800/60 pt-2 text-[11px] font-semibold text-amber-800 dark:text-amber-300 flex items-center justify-between">
              <span>Auto-generated Debit Recovery</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Card D: BOE Bank Submissions Pending */}
          <div className="bg-white/95 dark:bg-slate-900/80 backdrop-blur-xl p-5 rounded-3xl border border-slate-200/80 dark:border-white/10 shadow-sm flex flex-col justify-between hover:border-emerald-400/50 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                BOE Bank Submission
              </span>
              <div className="w-8 h-8 rounded-2xl bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <FileCheck2 className="w-4 h-4" />
              </div>
            </div>
            <div className="my-2">
              <div className="text-xl font-black text-slate-900 dark:text-white font-mono">
                {metrics.boePendingSubmissionCount} BOEs
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Pending IDPMS bank knock-off letters</p>
            </div>
            <div className="border-t border-slate-100 dark:border-white/5 pt-2 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center justify-between">
              <span>Authorized Dealer AD Submission</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>
      </div>

      {/* Dual Operational Radars: RBI 180-Day IDPMS & Container Detention */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Radar 1: RBI IDPMS 180-Day Advance Remittance Compliance */}
        <div className="bg-white/95 dark:bg-slate-900/80 backdrop-blur-xl rounded-3xl shadow-sm border border-slate-200/80 dark:border-white/10 overflow-hidden">
          <div className="p-4 border-b border-slate-200/80 dark:border-white/10 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/40">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-2xl bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 flex items-center justify-center font-bold">
                <ShieldAlert className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <span>RBI IDPMS 180-Day Advance Remittance Radar</span>
                  {engineResult.idpmsAdvanceAlerts.some(a => a.status === 'Overdue') && (
                    <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[9px] font-extrabold animate-pulse">
                      OVERDUE ALERT
                    </span>
                  )}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                  RBI Master Direction: Match BOE within 180 days of foreign remittance
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[9px] font-bold text-slate-600 dark:text-slate-300 uppercase">Unsettled</span>
              <div className="text-xs font-black text-slate-900 dark:text-white font-mono">
                {engineResult.idpmsAdvanceAlerts.length} Remittances
              </div>
            </div>
          </div>

          <div className="p-4 space-y-3">
            {engineResult.idpmsAdvanceAlerts.length === 0 ? (
              <div className="py-8 text-center text-slate-400 dark:text-slate-500 text-xs flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>All advance remittances are 100% matched with BOE in IDPMS. Zero risk!</span>
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {engineResult.idpmsAdvanceAlerts.slice(0, 5).map(alert => (
                  <div
                    key={alert.paymentId}
                    className="p-3 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-white dark:hover:bg-slate-800 flex items-center justify-between text-xs transition-colors"
                  >
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <span>{alert.supplierName}</span>
                        {alert.linkedPiNo && (
                          <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono font-semibold">({alert.linkedPiNo})</span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-2 mt-0.5">
                        <span>Paid: {formatDate(alert.paymentDate)}</span>
                        <span>•</span>
                        <span>Due: {formatDate(alert.dueDate180)}</span>
                        <span>•</span>
                        <span>{alert.bankName}</span>
                      </div>
                    </div>

                    <div className="text-right space-y-1">
                      <div className="font-black text-slate-900 dark:text-white font-mono">
                        {formatFC(alert.unsettledAmountFC)} {alert.currency}
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold ${
                          alert.status === 'Overdue'
                            ? 'bg-rose-600 text-white animate-pulse'
                            : alert.status === 'Critical'
                              ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
                              : alert.status === 'Warning'
                                ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                                : 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300'
                        }`}
                      >
                        <Clock className="w-2.5 h-2.5" />
                        <span>
                          {alert.status === 'Overdue'
                            ? `Overdue (+${alert.daysElapsed - 180}d)`
                            : `${alert.daysRemaining}d left (180d)`}
                        </span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Radar 2: Shipping Line Container Detention Risk Radar */}
        <div className="bg-white/95 dark:bg-slate-900/80 backdrop-blur-xl rounded-3xl shadow-sm border border-slate-200/80 dark:border-white/10 overflow-hidden">
          <div className="p-4 border-b border-slate-200/80 dark:border-white/10 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/40">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-2xl bg-amber-50 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 flex items-center justify-center font-bold">
                <Ship className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <span>Shipping Line Container Detention Radar</span>
                  {engineResult.containerDetentionRisks.some(r => r.riskLevel === 'Expired') && (
                    <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[9px] font-extrabold animate-pulse">
                      PENALTY RISK
                    </span>
                  )}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                  Monitor 14-day free container return days to avoid $50–$150/day shipping line detention
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[9px] font-bold text-slate-600 dark:text-slate-300 uppercase">Active Sea</span>
              <div className="text-xs font-black text-slate-900 dark:text-white font-mono">
                {engineResult.containerDetentionRisks.length} Containers
              </div>
            </div>
          </div>

          <div className="p-4 space-y-3">
            {engineResult.containerDetentionRisks.length === 0 ? (
              <div className="py-8 text-center text-slate-400 dark:text-slate-500 text-xs flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>No active sea containers at risk of demurrage or detention.</span>
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {engineResult.containerDetentionRisks.slice(0, 5).map(risk => (
                  <div
                    key={risk.shipmentId}
                    className="p-3 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-white dark:hover:bg-slate-800 flex items-center justify-between text-xs transition-colors"
                  >
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <span className="font-mono text-indigo-600 dark:text-indigo-400">{risk.containerNo || risk.shipmentRefNo}</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">({risk.containerType})</span>
                        <span className="text-slate-400">•</span>
                        <span className="text-slate-600 dark:text-slate-300">{risk.shippingLine}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-2 mt-0.5">
                        <span>Discharged: {formatDate(risk.dischargeDate)}</span>
                        <span>•</span>
                        <span>Detention Expiry: {formatDate(risk.detentionExpiryDate)}</span>
                        <span>•</span>
                        <span>PI: {risk.piNo}</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold ${
                          risk.emptyReturnedDate
                            ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300'
                            : risk.riskLevel === 'Expired'
                              ? 'bg-rose-600 text-white animate-pulse'
                              : risk.riskLevel === 'Critical'
                                ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
                                : risk.riskLevel === 'Warning'
                                  ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                                  : 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300'
                        }`}
                      >
                        <Clock className="w-2.5 h-2.5" />
                        <span>
                          {risk.emptyReturnedDate
                            ? 'Empty Returned ✓'
                            : risk.riskLevel === 'Expired'
                              ? `Detention Expired (${Math.abs(risk.daysRemaining)}d)`
                              : `${risk.daysRemaining}d detention left`}
                        </span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Party-Wise Closing Balances Table */}
      <div className="bg-white/95 dark:bg-slate-900/80 backdrop-blur-xl rounded-3xl shadow-sm border border-slate-200/80 dark:border-white/10 overflow-hidden">
        <div className="p-5 border-b border-slate-200/80 dark:border-white/10 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/40">
          <div>
            <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
              Party-Wise Closing Balances
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
              Consolidated Dr / Cr balances in foreign currency, book INR, and revalued at latest month-end rate (click row to drill down)
            </p>
          </div>
          <button
            onClick={handleExportPartyClosing}
            className="flex items-center space-x-1.5 text-xs font-bold px-3.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xs hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export to Excel</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-100/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider border-b border-slate-200/80 dark:border-white/10">
              <tr>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Supplier Name</th>
                <th className="px-3 py-3">Curr</th>
                <th className="px-3 py-3 text-right bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300">Dr FC (Advance/Excess)</th>
                <th className="px-3 py-3 text-right bg-amber-50/50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300">Cr FC (Payable)</th>
                <th className="px-3 py-3 text-right font-black">Net FC</th>
                <th className="px-3 py-3 text-right bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300">Dr INR</th>
                <th className="px-3 py-3 text-right bg-amber-50/50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300">Cr INR</th>
                <th className="px-3 py-3 text-right font-black">Net INR (Book)</th>
                <th className="px-4 py-3 text-right font-black text-indigo-700 dark:text-indigo-400">Net INR (Valuation)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-medium text-slate-700 dark:text-slate-300">
              {partyWiseData.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-400 dark:text-slate-500">
                    No transactions match current filters.
                  </td>
                </tr>
              ) : (
                partyWiseData.map((row, idx) => {
                  const comp = companyMap.get(row.companyId);
                  const supp = supplierMap.get(row.supplierId);
                  return (
                    <tr
                      key={idx}
                      className="hover:bg-slate-50/90 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
                      onClick={() => {
                        const items: Array<{ refNo: string; type: string; date: string; fc: number; inr: number; details: string }> = [];

                        // Opening Balances
                        db.openingBalances
                          .filter(ob => ob.companyId === row.companyId && ob.supplierId === row.supplierId && ob.currency === row.currency && (ob.referenceDate || '') <= asOfDate)
                          .forEach(ob => {
                            const obSt = engineResult.openingPayableStates.get(ob.id);
                            items.push({
                              refNo: ob.referenceNo,
                              type: `Opening (${ob.balanceType})`,
                              date: ob.originalDocumentDate || ob.referenceDate,
                              fc: ob.amountFC,
                              inr: ob.amountINR,
                              details: ob.balanceType === 'Cr'
                                ? `Rate: ${ob.rate} | Open Bal FC: ${formatFC(obSt?.balanceFC)}`
                                : `Advance B/F | Rate: ${ob.rate}`,
                            });
                          });

                        // CIs
                        db.commercialInvoices
                          .filter(c => c.companyId === row.companyId && c.supplierId === row.supplierId && c.currency === row.currency && (c.ciDate || '') <= asOfDate)
                          .forEach(c => {
                            const st = engineResult.ciStates.get(c.id);
                            items.push({
                              refNo: c.ciNo,
                              type: 'Purchase / CI',
                              date: c.ciDate,
                              fc: c.ciValueFC,
                              inr: c.purchaseINR,
                              details: `BOE: ${c.boeNo} @ ${c.boeExchangeRate} | Bal FC: ${formatFC(st?.balanceFC)}`,
                            });
                          });

                        // Payments
                        db.payments
                          .filter(p => p.companyId === row.companyId && p.supplierId === row.supplierId && p.currency === row.currency && (p.paymentDate || '') <= asOfDate)
                          .forEach(p => {
                            const b = bankMap.get(p.bankAccountId);
                            const bankLabel = b ? `${b.bankName} - ${b.accountNumber.slice(-4)}` : p.bankAccountId;
                            items.push({
                              refNo: p.bankReferenceNo || p.id,
                              type: `Payment (${p.paymentAgainst})`,
                              date: p.paymentDate,
                              fc: p.amountFC,
                              inr: p.inrAmount,
                              details: `Rate: ${p.actualExchangeRate} | Bank: ${bankLabel}`,
                            });
                          });

                        // Debit Notes
                        db.debitNotes
                          .filter(d => d.companyId === row.companyId && d.supplierId === row.supplierId && d.currency === row.currency && (d.dnDate || '') <= asOfDate)
                          .forEach(d => {
                            items.push({
                              refNo: d.dnNo,
                              type: 'Debit Note',
                              date: d.dnDate,
                              fc: d.amountFC,
                              inr: d.inrAmount,
                              details: `${d.reason} | Status: ${d.status}`,
                            });
                          });

                        items.sort((a, b) => a.date.localeCompare(b.date));

                        setDrilldownModal({
                          title: `${supp?.supplierName} (${row.currency}) - Underlying Transactions`,
                          items,
                        });
                      }}
                    >
                      <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">{comp?.code}</td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-slate-900 dark:text-white">{supp?.supplierName}</span>
                        <span className="text-slate-400 font-mono text-[11px] ml-1.5">({supp?.vendorCode})</span>
                      </td>
                      <td className="px-3 py-3 font-bold text-slate-700 dark:text-slate-300">{row.currency}</td>
                      <td className="px-3 py-3 text-right font-semibold font-mono text-emerald-700 dark:text-emerald-400 bg-emerald-50/20 dark:bg-emerald-950/10">
                        {formatFC(row.drFC)}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold font-mono text-amber-700 dark:text-amber-400 bg-amber-50/20 dark:bg-amber-950/10">
                        {formatFC(row.crFC)}
                      </td>
                      <td className="px-3 py-3 text-right font-bold font-mono text-slate-900 dark:text-white">
                        {formatFC(Math.abs(row.netFC))} <span className="text-[10px] text-slate-400 font-sans">{row.netFC > 0 ? 'Cr' : row.netFC < 0 ? 'Dr' : ''}</span>
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-emerald-800 dark:text-emerald-300 bg-emerald-50/20 dark:bg-emerald-950/10">
                        {formatINR(row.drINR)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-amber-800 dark:text-amber-300 bg-amber-50/20 dark:bg-amber-950/10">
                        {formatINR(row.crINR)}
                      </td>
                      <td className="px-3 py-3 text-right font-bold font-mono text-slate-900 dark:text-white">
                        {formatINR(row.netBookINR)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold font-mono text-indigo-700 dark:text-indigo-400">
                        {row.latestValuationRate > 0 ? formatINR(row.netValINR) : <span className="text-[10px] text-slate-400 font-sans">Book (No rate)</span>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {partyWiseData.length > 0 && (
              <tfoot className="bg-slate-100/90 dark:bg-slate-800/90 font-bold text-slate-900 dark:text-white border-t-2 border-slate-300 dark:border-white/20">
                <tr>
                  <td colSpan={3} className="px-4 py-2.5 text-right uppercase tracking-wider">
                    Total:
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-emerald-800 dark:text-emerald-300 bg-emerald-100/50 dark:bg-emerald-950/30">
                    {formatFC(partyWiseData.reduce((s, r) => s + r.drFC, 0))}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-amber-800 dark:text-amber-300 bg-amber-100/50 dark:bg-amber-950/30">
                    {formatFC(partyWiseData.reduce((s, r) => s + r.crFC, 0))}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">
                    {formatFC(Math.abs(partyWiseData.reduce((s, r) => s + r.netFC, 0)))}{' '}
                    <span className="text-[10px] font-sans">
                      {partyWiseData.reduce((s, r) => s + r.netFC, 0) >= 0 ? 'Cr' : 'Dr'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-emerald-800 dark:text-emerald-300 bg-emerald-100/50 dark:bg-emerald-950/30">
                    {formatINR(partyWiseData.reduce((s, r) => s + r.drINR, 0))}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-amber-800 dark:text-amber-300 bg-amber-100/50 dark:bg-amber-950/30">
                    {formatINR(partyWiseData.reduce((s, r) => s + r.crINR, 0))}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">
                    {formatINR(partyWiseData.reduce((s, r) => s + r.netBookINR, 0))}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-indigo-700 dark:text-indigo-400">
                    {formatINR(partyWiseData.reduce((s, r) => s + r.netValINR, 0))}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Ageing Tables: Payables (Cr) & Advances (Dr) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white/95 dark:bg-slate-900/80 backdrop-blur-xl rounded-3xl shadow-sm border border-slate-200/80 dark:border-white/10 overflow-hidden">
          <div className="p-4 border-b border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-slate-800/40 flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Ageing: Payables (Cr)
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                Aged from {db.settings.ageingBaseDateForPayables === 'boeDate' ? 'BOE Date' : 'CI Date'}
              </p>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 bg-rose-50 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-200/80 dark:border-rose-800 rounded-full">
              &gt; 90 Days Alert
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider border-b border-slate-200/80 dark:border-white/10 text-[10px]">
                <tr>
                  <th className="px-4 py-2.5">Supplier</th>
                  <th className="px-2.5 py-2.5">Curr</th>
                  <th className="px-2.5 py-2.5 text-right font-mono">&lt; 30d</th>
                  <th className="px-2.5 py-2.5 text-right font-mono">31-60d</th>
                  <th className="px-2.5 py-2.5 text-right font-mono">61-90d</th>
                  <th className="px-2.5 py-2.5 text-right font-bold text-rose-700 dark:text-rose-400 bg-rose-50/50 dark:bg-rose-950/20 font-mono">&gt; 90d</th>
                  <th className="px-4 py-2.5 text-right font-bold font-mono">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-medium text-slate-700 dark:text-slate-300">
                {ageingPayables.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-slate-400 dark:text-slate-500">
                      No open payables.
                    </td>
                  </tr>
                ) : (
                  ageingPayables.map((r, i) => {
                    const supp = supplierMap.get(r.supplierId);
                    return (
                      <tr key={i} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-4 py-2.5 font-semibold text-slate-900 dark:text-white truncate max-w-[140px]">
                          {supp?.supplierName}
                        </td>
                        <td className="px-2.5 py-2.5 font-bold text-slate-700 dark:text-slate-300">{r.currency}</td>
                        <td className="px-2.5 py-2.5 text-right font-mono text-slate-700 dark:text-slate-300">{formatFC(r.b1)}</td>
                        <td className="px-2.5 py-2.5 text-right font-mono text-slate-700 dark:text-slate-300">{formatFC(r.b2)}</td>
                        <td className="px-2.5 py-2.5 text-right font-mono text-slate-700 dark:text-slate-300">{formatFC(r.b3)}</td>
                        <td className={`px-2.5 py-2.5 text-right font-bold font-mono ${
                          r.b4 > 0 ? 'bg-rose-100/70 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300' : 'text-slate-400'
                        }`}>
                          {formatFC(r.b4)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold font-mono text-slate-900 dark:text-white">{formatFC(r.total)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white/95 dark:bg-slate-900/80 backdrop-blur-xl rounded-3xl shadow-sm border border-slate-200/80 dark:border-white/10 overflow-hidden">
          <div className="p-4 border-b border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-slate-800/40 flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Ageing: Advances & Excess (Dr)
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Aged from unapplied remittance date (FIFO)</p>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800 rounded-full">
              Debit Position
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider border-b border-slate-200/80 dark:border-white/10 text-[10px]">
                <tr>
                  <th className="px-4 py-2.5">Supplier</th>
                  <th className="px-2.5 py-2.5">Curr</th>
                  <th className="px-2.5 py-2.5 text-right font-mono">&lt; 30d</th>
                  <th className="px-2.5 py-2.5 text-right font-mono">31-60d</th>
                  <th className="px-2.5 py-2.5 text-right font-mono">61-90d</th>
                  <th className="px-2.5 py-2.5 text-right font-bold text-rose-700 dark:text-rose-400 bg-rose-50/50 dark:bg-rose-950/20 font-mono">&gt; 90d</th>
                  <th className="px-4 py-2.5 text-right font-bold font-mono">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-medium text-slate-700 dark:text-slate-300">
                {ageingAdvances.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-slate-400 dark:text-slate-500">
                      No unapplied advances.
                    </td>
                  </tr>
                ) : (
                  ageingAdvances.map((r, i) => {
                    const supp = supplierMap.get(r.supplierId);
                    return (
                      <tr key={i} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-4 py-2.5 font-semibold text-slate-900 dark:text-white truncate max-w-[140px]">
                          {supp?.supplierName}
                        </td>
                        <td className="px-2.5 py-2.5 font-bold text-slate-700 dark:text-slate-300">{r.currency}</td>
                        <td className="px-2.5 py-2.5 text-right font-mono text-slate-700 dark:text-slate-300">{formatFC(r.b1)}</td>
                        <td className="px-2.5 py-2.5 text-right font-mono text-slate-700 dark:text-slate-300">{formatFC(r.b2)}</td>
                        <td className="px-2.5 py-2.5 text-right font-mono text-slate-700 dark:text-slate-300">{formatFC(r.b3)}</td>
                        <td className={`px-2.5 py-2.5 text-right font-bold font-mono ${
                          r.b4 > 0 ? 'bg-rose-100/70 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300' : 'text-slate-400'
                        }`}>
                          {formatFC(r.b4)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold font-mono text-slate-900 dark:text-white">{formatFC(r.total)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Drill-down Modal */}
      {drilldownModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-white/10 w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800/50">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">{drilldownModal.title}</h3>
              <button
                onClick={() => setDrilldownModal(null)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200/80 dark:border-white/10">
                  <tr>
                    <th className="px-3 py-2.5">Ref / Doc No</th>
                    <th className="px-3 py-2.5">Type</th>
                    <th className="px-3 py-2.5">Date</th>
                    <th className="px-3 py-2.5 text-right">Amount FC</th>
                    <th className="px-3 py-2.5 text-right">Amount INR</th>
                    <th className="px-3 py-2.5">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5 text-slate-700 dark:text-slate-300">
                  {drilldownModal.items.map((it, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-3 py-2.5 font-bold text-slate-900 dark:text-white">{it.refNo}</td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">{it.type}</td>
                      <td className="px-3 py-2.5">{formatDate(it.date)}</td>
                      <td className="px-3 py-2.5 text-right font-bold font-mono">{formatFC(it.fc)}</td>
                      <td className="px-3 py-2.5 text-right font-bold font-mono">{formatINR(it.inr)}</td>
                      <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">{it.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-800/50 flex justify-end">
              <button
                onClick={() => setDrilldownModal(null)}
                className="px-5 py-2 bg-slate-800 dark:bg-slate-700 text-white text-xs font-bold rounded-xl hover:bg-slate-700 dark:hover:bg-slate-600 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
