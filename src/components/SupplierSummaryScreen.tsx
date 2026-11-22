import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  formatFC,
  formatINR,
  formatDate,
} from '../utils/formatters';
import { exportToExcel } from '../utils/excel';
import { ALL_MASTER_SUPPLIERS } from '../data/allSuppliersList';
import {
  Users,
  Search,
  Download,
  Filter,
  Building2,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  DollarSign,
  FileSpreadsheet,
  Clock,
  Sparkles,
} from 'lucide-react';

interface SupplierSummaryRow {
  supplierId: string;
  vendorCode: string;
  partyName: string;
  country: string;
  companyId: string;
  openingUSD: number;
  openingCNY: number;
  openingINR: number;
  ciUSD: number;
  ciCNY: number;
  ciINR: number;
  paidUSD: number;
  paidCNY: number;
  paidINR: number;
  closingUSD: number;
  closingCNY: number;
  closingINRBook: number;
  closingINRMtm: number;
  fxGainLossINR: number;
  lcOpenUSD: number;
  lcOpenCNY: number;
  debitBalPIs: number;
  overduePIs: number;
  status: 'No activity' | 'Payable' | 'Advance Lying' | 'Overdue Alert' | 'Settled';
  hasActivity: boolean;
}

interface SupplierSummaryScreenProps {
  onNavigateToLedger?: (vendorCode: string) => void;
}

export const SupplierSummaryScreen: React.FC<SupplierSummaryScreenProps> = ({ onNavigateToLedger }) => {
  const { db, selectedCompanyId, asOfDate, engineResult } = useApp();

  // Filters
  const [filterCompany, setFilterCompany] = useState<string>(
    selectedCompanyId !== 'ALL' ? selectedCompanyId : 'ALL'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE_ONLY' | 'PAYABLE' | 'ADVANCE' | 'OVERDUE' | 'NO_ACTIVITY'>('ALL');
  const [currencyFilter, setCurrencyFilter] = useState<'ALL' | 'USD' | 'CNY'>('ALL');
  const [asOfDateVal, setAsOfDateVal] = useState<string>(asOfDate || new Date().toISOString().split('T')[0]);

  // Mark-to-market valuation rates
  const [mtmRateUSD, setMtmRateUSD] = useState<number>(87.5);
  const [mtmRateCNY, setMtmRateCNY] = useState<number>(12.2);

  // Combine registered suppliers from db and master seed list so all 35 suppliers are available
  const allMergedSuppliers = useMemo(() => {
    const existingCodes = new Set(db.suppliers.map(s => s.vendorCode.toUpperCase()));
    const list = [...db.suppliers];

    // Add any missing master suppliers from user list
    ALL_MASTER_SUPPLIERS.forEach(m => {
      if (!existingCodes.has(m.vendorCode.toUpperCase())) {
        const targetCompany = db.companies.find(c => c.code.toLowerCase() === (m.companyCode?.toLowerCase() || 'sakar')) || db.companies[0];
        list.push({
          id: `supp-seed-${m.vendorCode.toLowerCase()}`,
          companyId: targetCompany?.id || 'comp-sakar',
          vendorCode: m.vendorCode,
          supplierName: m.supplierName,
          country: m.country,
          defaultCurrency: m.defaultCurrency,
          active: true,
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-01T00:00:00.000Z',
        });
        existingCodes.add(m.vendorCode.toUpperCase());
      }
    });

    return list;
  }, [db.suppliers, db.companies]);

  // Calculate full supplier row data
  const supplierRows: SupplierSummaryRow[] = useMemo(() => {
    return allMergedSuppliers.map(supp => {
      // 1. Opening Balances
      const openings = db.openingBalances.filter(
        ob => ob.supplierId === supp.id || ob.supplierId === supp.vendorCode
      );

      let openingUSD = 0;
      let openingCNY = 0;
      let openingINR = 0;

      openings.forEach(ob => {
        const sign = ob.balanceType === 'Cr' ? 1 : -1;
        const amtFC = (ob.amountFC || 0) * sign;
        const amtINR = (ob.amountINR || 0) * sign;

        if (ob.currency === 'USD') openingUSD += amtFC;
        else if (ob.currency === 'CNY') openingCNY += amtFC;
        openingINR += amtINR;
      });

      // 2. Commercial Invoices (CI / Purchase)
      const cis = db.commercialInvoices.filter(
        ci => (ci.supplierId === supp.id || ci.supplierId === supp.vendorCode) &&
              ci.ciDate <= asOfDateVal
      );

      let ciUSD = 0;
      let ciCNY = 0;
      let ciINR = 0;

      cis.forEach(ci => {
        if (ci.currency === 'USD') ciUSD += ci.ciValueFC;
        else if (ci.currency === 'CNY') ciCNY += ci.ciValueFC;
        ciINR += ci.purchaseINR;
      });

      // 3. Payments Made
      const payments = db.payments.filter(
        p => (p.supplierId === supp.id || p.supplierId === supp.vendorCode) &&
             p.paymentDate <= asOfDateVal
      );

      let paidUSD = 0;
      let paidCNY = 0;
      let paidINR = 0;
      let lcOpenUSD = 0;
      let lcOpenCNY = 0;

      payments.forEach(p => {
        if (p.lcStatus === 'Open') {
          if (p.currency === 'USD') lcOpenUSD += p.amountFC;
          else if (p.currency === 'CNY') lcOpenCNY += p.amountFC;
          return;
        }

        if (p.currency === 'USD') paidUSD += p.amountFC;
        else if (p.currency === 'CNY') paidCNY += p.amountFC;
        paidINR += p.inrAmount;
      });

      // 4. Closing Balances
      const closingUSD = openingUSD + ciUSD - paidUSD;
      const closingCNY = openingCNY + ciCNY - paidCNY;
      const closingINRBook = openingINR + ciINR - paidINR;

      // 5. MTM Valuation & FX Gain / Loss
      const closingINRMtm = Math.round(
        (closingUSD * mtmRateUSD) + (closingCNY * mtmRateCNY)
      );
      const fxGainLossINR = closingINRBook - closingINRMtm;

      // 6. Debit-bal PIs (Advance paid with supplier where shipment pending)
      const suppPis = db.proformaInvoices.filter(
        pi => pi.supplierId === supp.id || pi.supplierId === supp.vendorCode
      );

      let debitBalPIs = 0;
      let overduePIs = 0;

      suppPis.forEach(pi => {
        const piPayments = payments.filter(p => p.linkedPiId === pi.id);
        const piPaidFC = piPayments.reduce((s, p) => s + p.amountFC, 0);
        const piCis = cis.filter(ci => ci.linkedPiId === pi.id);
        const piShippedFC = piCis.reduce((s, c) => s + c.ciValueFC, 0);

        if (piPaidFC > piShippedFC && !pi.isClosed) {
          debitBalPIs++;
        }
      });

      // Overdue CIs
      cis.forEach(ci => {
        const state = engineResult.ciStates.get(ci.id);
        if (state?.isOverdue) {
          overduePIs++;
        }
      });

      // 7. Status Classification
      const hasActivity =
        Math.abs(openingUSD) > 0.01 ||
        Math.abs(openingCNY) > 0.01 ||
        Math.abs(ciUSD) > 0.01 ||
        Math.abs(ciCNY) > 0.01 ||
        Math.abs(paidUSD) > 0.01 ||
        Math.abs(paidCNY) > 0.01 ||
        lcOpenUSD > 0 ||
        lcOpenCNY > 0;

      let status: SupplierSummaryRow['status'] = 'No activity';
      if (!hasActivity) {
        status = 'No activity';
      } else if (overduePIs > 0) {
        status = 'Overdue Alert';
      } else if (closingINRBook > 500) {
        status = 'Payable';
      } else if (closingINRBook < -500) {
        status = 'Advance Lying';
      } else {
        status = 'Settled';
      }

      return {
        supplierId: supp.id,
        vendorCode: supp.vendorCode,
        partyName: supp.supplierName,
        country: supp.country || 'China',
        companyId: supp.companyId,
        openingUSD,
        openingCNY,
        openingINR,
        ciUSD,
        ciCNY,
        ciINR,
        paidUSD,
        paidCNY,
        paidINR,
        closingUSD,
        closingCNY,
        closingINRBook,
        closingINRMtm,
        fxGainLossINR,
        lcOpenUSD,
        lcOpenCNY,
        debitBalPIs,
        overduePIs,
        status,
        hasActivity,
      };
    });
  }, [allMergedSuppliers, db.openingBalances, db.commercialInvoices, db.payments, db.proformaInvoices, asOfDateVal, mtmRateUSD, mtmRateCNY, engineResult.ciStates]);

  // Filtered rows based on user criteria
  const filteredRows = useMemo(() => {
    return supplierRows.filter(row => {
      // Company Filter
      if (filterCompany !== 'ALL' && row.companyId !== filterCompany) {
        return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          row.vendorCode.toLowerCase().includes(q) ||
          row.partyName.toLowerCase().includes(q) ||
          row.country.toLowerCase().includes(q);
        if (!matches) return false;
      }

      // Status Filter
      if (statusFilter === 'ACTIVE_ONLY' && !row.hasActivity) return false;
      if (statusFilter === 'PAYABLE' && row.status !== 'Payable') return false;
      if (statusFilter === 'ADVANCE' && row.status !== 'Advance Lying') return false;
      if (statusFilter === 'OVERDUE' && row.status !== 'Overdue Alert') return false;
      if (statusFilter === 'NO_ACTIVITY' && row.hasActivity) return false;

      // Currency Filter
      if (currencyFilter === 'USD') {
        const hasUSD = Math.abs(row.openingUSD) > 0 || row.ciUSD > 0 || row.paidUSD > 0 || row.lcOpenUSD > 0;
        if (!hasUSD && row.hasActivity) return false;
      } else if (currencyFilter === 'CNY') {
        const hasCNY = Math.abs(row.openingCNY) > 0 || row.ciCNY > 0 || row.paidCNY > 0 || row.lcOpenCNY > 0;
        if (!hasCNY && row.hasActivity) return false;
      }

      return true;
    });
  }, [supplierRows, filterCompany, searchQuery, statusFilter, currencyFilter]);

  // Totals Row
  const totals = useMemo(() => {
    return filteredRows.reduce(
      (acc, r) => {
        acc.openingUSD += r.openingUSD;
        acc.openingCNY += r.openingCNY;
        acc.openingINR += r.openingINR;
        acc.ciUSD += r.ciUSD;
        acc.ciCNY += r.ciCNY;
        acc.ciINR += r.ciINR;
        acc.paidUSD += r.paidUSD;
        acc.paidCNY += r.paidCNY;
        acc.paidINR += r.paidINR;
        acc.closingUSD += r.closingUSD;
        acc.closingCNY += r.closingCNY;
        acc.closingINRBook += r.closingINRBook;
        acc.closingINRMtm += r.closingINRMtm;
        acc.fxGainLossINR += r.fxGainLossINR;
        acc.lcOpenUSD += r.lcOpenUSD;
        acc.lcOpenCNY += r.lcOpenCNY;
        acc.debitBalPIs += r.debitBalPIs;
        acc.overduePIs += r.overduePIs;
        if (r.hasActivity) acc.activeCount++;
        return acc;
      },
      {
        openingUSD: 0,
        openingCNY: 0,
        openingINR: 0,
        ciUSD: 0,
        ciCNY: 0,
        ciINR: 0,
        paidUSD: 0,
        paidCNY: 0,
        paidINR: 0,
        closingUSD: 0,
        closingCNY: 0,
        closingINRBook: 0,
        closingINRMtm: 0,
        fxGainLossINR: 0,
        lcOpenUSD: 0,
        lcOpenCNY: 0,
        debitBalPIs: 0,
        overduePIs: 0,
        activeCount: 0,
      }
    );
  }, [filteredRows]);

  // Export to Excel handler
  const handleExportExcel = () => {
    const exportData = filteredRows.map(r => ({
      'Vendor Code': r.vendorCode,
      'Party Name': r.partyName,
      'Opening USD': r.openingUSD ? Number(r.openingUSD.toFixed(2)) : '-',
      'Opening CNY': r.openingCNY ? Number(r.openingCNY.toFixed(2)) : '-',
      'Opening INR': r.openingINR ? Math.round(r.openingINR) : '-',
      'CI USD': r.ciUSD ? Number(r.ciUSD.toFixed(2)) : '-',
      'CI CNY': r.ciCNY ? Number(r.ciCNY.toFixed(2)) : '-',
      'CI INR': r.ciINR ? Math.round(r.ciINR) : '-',
      'Paid USD': r.paidUSD ? Number(r.paidUSD.toFixed(2)) : '-',
      'Paid CNY': r.paidCNY ? Number(r.paidCNY.toFixed(2)) : '-',
      'Paid INR': r.paidINR ? Math.round(r.paidINR) : '-',
      'CLOSING USD': r.closingUSD ? Number(r.closingUSD.toFixed(2)) : '-',
      'CLOSING CNY': r.closingCNY ? Number(r.closingCNY.toFixed(2)) : '-',
      'Closing INR (book)': r.closingINRBook ? Math.round(r.closingINRBook) : '-',
      'Closing INR @ current rate': r.closingINRMtm ? Math.round(r.closingINRMtm) : '-',
      'FX Gain(+) / Loss(−) INR': r.fxGainLossINR ? Math.round(r.fxGainLossINR) : '-',
      'LC Open USD': r.lcOpenUSD ? Number(r.lcOpenUSD.toFixed(2)) : '-',
      'LC Open CNY': r.lcOpenCNY ? Number(r.lcOpenCNY.toFixed(2)) : '-',
      'Debit-bal PIs': r.debitBalPIs,
      'Overdue PIs': r.overduePIs,
      'Status': r.status,
    }));

    // Add Totals row
    exportData.push({
      'Vendor Code': 'TOTAL',
      'Party Name': `${filteredRows.length} Parties (${totals.activeCount} Active)`,
      'Opening USD': Number(totals.openingUSD.toFixed(2)),
      'Opening CNY': Number(totals.openingCNY.toFixed(2)),
      'Opening INR': Math.round(totals.openingINR),
      'CI USD': Number(totals.ciUSD.toFixed(2)),
      'CI CNY': Number(totals.ciCNY.toFixed(2)),
      'CI INR': Math.round(totals.ciINR),
      'Paid USD': Number(totals.paidUSD.toFixed(2)),
      'Paid CNY': Number(totals.paidCNY.toFixed(2)),
      'Paid INR': Math.round(totals.paidINR),
      'CLOSING USD': Number(totals.closingUSD.toFixed(2)),
      'CLOSING CNY': Number(totals.closingCNY.toFixed(2)),
      'Closing INR (book)': Math.round(totals.closingINRBook),
      'Closing INR @ current rate': Math.round(totals.closingINRMtm),
      'FX Gain(+) / Loss(−) INR': Math.round(totals.fxGainLossINR),
      'LC Open USD': Number(totals.lcOpenUSD.toFixed(2)),
      'LC Open CNY': Number(totals.lcOpenCNY.toFixed(2)),
      'Debit-bal PIs': totals.debitBalPIs,
      'Overdue PIs': totals.overduePIs,
      'Status': totals.closingINRBook > 0 ? 'Payable' : totals.closingINRBook < 0 ? 'Advance Lying' : 'Settled',
    });

    exportToExcel(exportData, `Supplier_Full_History_Position_${asOfDateVal}`, 'Supplier Summary');
  };

  const getStatusBadge = (status: SupplierSummaryRow['status']) => {
    switch (status) {
      case 'Payable':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            Payable
          </span>
        );
      case 'Advance Lying':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            Advance Lying
          </span>
        );
      case 'Overdue Alert':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 animate-pulse">
            <AlertTriangle className="w-2.5 h-2.5" />
            Overdue
          </span>
        );
      case 'Settled':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-2.5 h-2.5" />
            Settled
          </span>
        );
      case 'No activity':
      default:
        return (
          <span className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
            No activity
          </span>
        );
    }
  };

  return (
    <div className="space-y-5 animate-fade-in pb-12">
      {/* Top Banner / Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-5 rounded-3xl border border-slate-200/80 dark:border-white/10 shadow-sm">
        <div className="flex items-center space-x-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-600 text-white flex items-center justify-center shadow-lg shadow-indigo-600/25 shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black tracking-tight text-slate-900 dark:text-white">
                Supplier Full History & Position Report
              </h1>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 uppercase tracking-wider">
                Full Period
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Vendor-wise Opening, Invoices booked (CI), Remittances made, Closing Balances, MTM Valuation & Open LCs
            </p>
          </div>
        </div>

        {/* Top Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Export to Excel */}
          <button
            onClick={handleExportExcel}
            className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
            title="Download full 21-column report in Excel .xlsx format"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export to Excel (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Net Closing Book */}
        <div className="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200/80 dark:border-white/10 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider">
            <span>Net Closing (Book)</span>
            {totals.closingINRBook >= 0 ? (
              <span className="text-blue-500 font-extrabold">Payable</span>
            ) : (
              <span className="text-amber-500 font-extrabold">Advance</span>
            )}
          </div>
          <div className={`text-base font-black tracking-tight mt-1 truncate ${
            totals.closingINRBook > 0 ? 'text-blue-600 dark:text-blue-400' : totals.closingINRBook < 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300'
          }`}>
            {formatINR(totals.closingINRBook)}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            ${formatFC(totals.closingUSD)} • ¥{formatFC(totals.closingCNY)}
          </div>
        </div>

        {/* Total MTM Valuation */}
        <div className="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200/80 dark:border-white/10 shadow-2xs">
          <div className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider">
            Closing @ Current Rate
          </div>
          <div className="text-base font-black tracking-tight mt-1 text-indigo-600 dark:text-indigo-400 truncate">
            {formatINR(totals.closingINRMtm)}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            USD @ {mtmRateUSD} • CNY @ {mtmRateCNY}
          </div>
        </div>

        {/* FX Gain / Loss */}
        <div className="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200/80 dark:border-white/10 shadow-2xs">
          <div className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider">
            FX Gain(+) / Loss(−)
          </div>
          <div className={`text-base font-black tracking-tight mt-1 truncate ${
            totals.fxGainLossINR >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
          }`}>
            {totals.fxGainLossINR >= 0 ? '+' : ''}{formatINR(totals.fxGainLossINR)}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            Mark-to-market revaluation
          </div>
        </div>

        {/* Total CI Booked */}
        <div className="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200/80 dark:border-white/10 shadow-2xs">
          <div className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider">
            Total Invoices (CI)
          </div>
          <div className="text-base font-black tracking-tight mt-1 text-slate-900 dark:text-white truncate">
            {formatINR(totals.ciINR)}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            ${formatFC(totals.ciUSD)} • ¥{formatFC(totals.ciCNY)}
          </div>
        </div>

        {/* Total Payments Made */}
        <div className="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200/80 dark:border-white/10 shadow-2xs">
          <div className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider">
            Total Payments
          </div>
          <div className="text-base font-black tracking-tight mt-1 text-emerald-600 dark:text-emerald-400 truncate">
            {formatINR(totals.paidINR)}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            ${formatFC(totals.paidUSD)} • ¥{formatFC(totals.paidCNY)}
          </div>
        </div>

        {/* Active Parties */}
        <div className="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200/80 dark:border-white/10 shadow-2xs">
          <div className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider">
            Registered Parties
          </div>
          <div className="text-base font-black tracking-tight mt-1 text-slate-900 dark:text-white truncate">
            {filteredRows.length} <span className="text-xs text-slate-400 font-semibold">({totals.activeCount} active)</span>
          </div>
          <div className="text-[10px] text-rose-500 font-bold mt-0.5">
            {totals.overduePIs > 0 ? `⚠️ ${totals.overduePIs} Overdue PIs` : '✓ All compliant'}
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 rounded-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200/80 dark:border-white/10 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search Vendor Code / Party Name..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-slate-100 dark:bg-slate-800 pl-8 pr-3 py-1.5 rounded-xl text-xs font-semibold text-slate-900 dark:text-white border border-slate-200 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 w-56 sm:w-72"
            />
          </div>

          {/* Company Filter */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-semibold">
            <Building2 className="w-3.5 h-3.5 text-indigo-500 mr-2" />
            <select
              value={filterCompany}
              onChange={e => setFilterCompany(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-white dark:bg-slate-900">ALL Companies</option>
              {db.companies.map(c => (
                <option key={c.id} value={c.id} className="bg-white dark:bg-slate-900">
                  {c.code} — {c.fullName}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-semibold">
            <Filter className="w-3.5 h-3.5 text-slate-400 mr-2" />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="bg-transparent text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-white dark:bg-slate-900">All Statuses ({supplierRows.length})</option>
              <option value="ACTIVE_ONLY" className="bg-white dark:bg-slate-900">Active Only</option>
              <option value="PAYABLE" className="bg-white dark:bg-slate-900">Payable Only</option>
              <option value="ADVANCE" className="bg-white dark:bg-slate-900">Advance Lying Only</option>
              <option value="OVERDUE" className="bg-white dark:bg-slate-900">Overdue Alerts Only</option>
              <option value="NO_ACTIVITY" className="bg-white dark:bg-slate-900">No Activity</option>
            </select>
          </div>

          {/* Currency Filter */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-semibold">
            <span className="text-slate-500 mr-1.5 text-[11px]">Curr:</span>
            <select
              value={currencyFilter}
              onChange={e => setCurrencyFilter(e.target.value as any)}
              className="bg-transparent text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-white dark:bg-slate-900">ALL Currencies</option>
              <option value="USD" className="bg-white dark:bg-slate-900">USD Only</option>
              <option value="CNY" className="bg-white dark:bg-slate-900">CNY Only</option>
            </select>
          </div>
        </div>

        {/* As-Of Date & Valuation Rates */}
        <div className="flex items-center space-x-2 text-xs">
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-semibold">
            <Calendar className="w-3.5 h-3.5 text-slate-500 mr-2" />
            <span className="text-[10px] text-slate-500 mr-1.5 uppercase tracking-wider font-bold">As Of:</span>
            <input
              type="date"
              value={asOfDateVal}
              onChange={e => setAsOfDateVal(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer"
            />
          </div>

          {/* MTM USD Rate Input */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-white/10" title="Valuation exchange rate for USD">
            <span className="text-[10px] font-bold text-slate-500 mr-1">USD:</span>
            <input
              type="number"
              step="0.1"
              value={mtmRateUSD}
              onChange={e => setMtmRateUSD(parseFloat(e.target.value) || 87.5)}
              className="w-14 bg-transparent text-xs font-bold text-slate-900 dark:text-white focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Main 21-Column Data Table */}
      <div className="rounded-3xl border border-slate-200/80 dark:border-white/10 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl shadow-md overflow-hidden">
        <div className="overflow-x-auto max-h-[620px] overflow-y-auto custom-scrollbar">
          <table className="w-full text-xs text-left border-collapse select-text">
            <thead className="bg-[#1e3a5f] text-white font-bold uppercase tracking-wider text-[10px] sticky top-0 z-20 shadow-sm">
              <tr>
                <th className="px-3 py-3 border-r border-slate-600/50 whitespace-nowrap min-w-[85px] sticky left-0 z-30 bg-[#1e3a5f]">Vendor Code</th>
                <th className="px-3 py-3 border-r border-slate-600/50 whitespace-nowrap min-w-[200px] sticky left-[85px] z-30 bg-[#1e3a5f]">Party Name</th>
                <th className="px-2.5 py-3 text-right border-r border-slate-600/50 whitespace-nowrap min-w-[95px] bg-[#244773]">Opening USD</th>
                <th className="px-2.5 py-3 text-right border-r border-slate-600/50 whitespace-nowrap min-w-[95px] bg-[#244773]">Opening CNY</th>
                <th className="px-2.5 py-3 text-right border-r border-slate-600/50 whitespace-nowrap min-w-[105px] bg-[#244773]">Opening INR</th>
                <th className="px-2.5 py-3 text-right border-r border-slate-600/50 whitespace-nowrap min-w-[95px]">CI USD</th>
                <th className="px-2.5 py-3 text-right border-r border-slate-600/50 whitespace-nowrap min-w-[95px]">CI CNY</th>
                <th className="px-2.5 py-3 text-right border-r border-slate-600/50 whitespace-nowrap min-w-[105px]">CI INR</th>
                <th className="px-2.5 py-3 text-right border-r border-slate-600/50 whitespace-nowrap min-w-[95px] bg-[#1e453e]">Paid USD</th>
                <th className="px-2.5 py-3 text-right border-r border-slate-600/50 whitespace-nowrap min-w-[95px] bg-[#1e453e]">Paid CNY</th>
                <th className="px-2.5 py-3 text-right border-r border-slate-600/50 whitespace-nowrap min-w-[105px] bg-[#1e453e]">Paid INR</th>
                <th className="px-2.5 py-3 text-right border-r border-slate-600/50 whitespace-nowrap min-w-[100px] bg-[#1b3252]">CLOSING USD</th>
                <th className="px-2.5 py-3 text-right border-r border-slate-600/50 whitespace-nowrap min-w-[100px] bg-[#1b3252]">CLOSING CNY</th>
                <th className="px-2.5 py-3 text-right border-r border-slate-600/50 whitespace-nowrap min-w-[115px] bg-[#1b3252]">Closing INR (book)</th>
                <th className="px-2.5 py-3 text-right border-r border-slate-600/50 whitespace-nowrap min-w-[125px] bg-[#2e2640]">Closing @ current</th>
                <th className="px-2.5 py-3 text-right border-r border-slate-600/50 whitespace-nowrap min-w-[115px] bg-[#2e2640]">FX Gain/Loss INR</th>
                <th className="px-2.5 py-3 text-right border-r border-slate-600/50 whitespace-nowrap min-w-[90px]">LC Open USD</th>
                <th className="px-2.5 py-3 text-right border-r border-slate-600/50 whitespace-nowrap min-w-[90px]">LC Open CNY</th>
                <th className="px-2 py-3 text-center border-r border-slate-600/50 whitespace-nowrap min-w-[85px]">Debit-bal PIs</th>
                <th className="px-2 py-3 text-center border-r border-slate-600/50 whitespace-nowrap min-w-[80px]">Overdue PIs</th>
                <th className="px-3 py-3 text-center whitespace-nowrap min-w-[110px]">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-medium text-slate-700 dark:text-slate-300">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={21} className="px-4 py-16 text-center text-slate-400">
                    <Users className="w-10 h-10 mx-auto mb-2 opacity-30 text-indigo-500" />
                    <p className="font-bold text-sm">Koi party match nahi hui.</p>
                    <p className="text-xs text-slate-400 mt-1">Filters clear karein ya koi dusra keyword search karein.</p>
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, idx) => {
                  const isEven = idx % 2 === 0;
                  return (
                    <tr
                      key={row.vendorCode + idx}
                      className={`hover:bg-indigo-50/40 dark:hover:bg-white/[0.04] transition-colors ${
                        !row.hasActivity ? 'opacity-65' : ''
                      } ${isEven ? 'bg-transparent' : 'bg-slate-50/50 dark:bg-white/[0.01]'}`}
                    >
                      {/* Vendor Code (Sticky left 1) */}
                      <td className="px-3 py-2 border-r border-slate-200/70 dark:border-white/5 font-mono font-bold text-slate-900 dark:text-white sticky left-0 z-10 bg-white dark:bg-slate-900">
                        <div className="flex items-center justify-between">
                          <span>{row.vendorCode}</span>
                          {onNavigateToLedger && (
                            <button
                              onClick={() => onNavigateToLedger(row.vendorCode)}
                              className="text-[9px] text-indigo-600 dark:text-indigo-400 hover:underline ml-1 opacity-0 hover:opacity-100 transition-opacity"
                              title="Go to Ledger"
                            >
                              Ledger
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Party Name (Sticky left 2) */}
                      <td className="px-3 py-2 border-r border-slate-200/70 dark:border-white/5 font-semibold text-slate-900 dark:text-white sticky left-[85px] z-10 bg-white dark:bg-slate-900 truncate max-w-[220px]" title={row.partyName}>
                        {row.partyName}
                      </td>

                      {/* Opening USD */}
                      <td className="px-2.5 py-2 text-right border-r border-slate-200/70 dark:border-white/5 font-mono text-slate-600 dark:text-slate-400">
                        {row.openingUSD ? formatFC(row.openingUSD) : '-'}
                      </td>

                      {/* Opening CNY */}
                      <td className="px-2.5 py-2 text-right border-r border-slate-200/70 dark:border-white/5 font-mono text-slate-600 dark:text-slate-400">
                        {row.openingCNY ? formatFC(row.openingCNY) : '-'}
                      </td>

                      {/* Opening INR */}
                      <td className="px-2.5 py-2 text-right border-r border-slate-200/70 dark:border-white/5 font-mono text-slate-700 dark:text-slate-300 font-semibold">
                        {row.openingINR ? formatINR(row.openingINR) : '-'}
                      </td>

                      {/* CI USD */}
                      <td className="px-2.5 py-2 text-right border-r border-slate-200/70 dark:border-white/5 font-mono text-slate-900 dark:text-white">
                        {row.ciUSD ? formatFC(row.ciUSD) : '-'}
                      </td>

                      {/* CI CNY */}
                      <td className="px-2.5 py-2 text-right border-r border-slate-200/70 dark:border-white/5 font-mono text-slate-900 dark:text-white">
                        {row.ciCNY ? formatFC(row.ciCNY) : '-'}
                      </td>

                      {/* CI INR */}
                      <td className="px-2.5 py-2 text-right border-r border-slate-200/70 dark:border-white/5 font-mono text-slate-900 dark:text-white font-semibold">
                        {row.ciINR ? formatINR(row.ciINR) : '-'}
                      </td>

                      {/* Paid USD */}
                      <td className="px-2.5 py-2 text-right border-r border-slate-200/70 dark:border-white/5 font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                        {row.paidUSD ? formatFC(row.paidUSD) : '-'}
                      </td>

                      {/* Paid CNY */}
                      <td className="px-2.5 py-2 text-right border-r border-slate-200/70 dark:border-white/5 font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                        {row.paidCNY ? formatFC(row.paidCNY) : '-'}
                      </td>

                      {/* Paid INR */}
                      <td className="px-2.5 py-2 text-right border-r border-slate-200/70 dark:border-white/5 font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                        {row.paidINR ? formatINR(row.paidINR) : '-'}
                      </td>

                      {/* CLOSING USD */}
                      <td className={`px-2.5 py-2 text-right border-r border-slate-200/70 dark:border-white/5 font-mono font-bold ${
                        row.closingUSD > 0.01 ? 'text-blue-600 dark:text-blue-400' : row.closingUSD < -0.01 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'
                      }`}>
                        {Math.abs(row.closingUSD) > 0.01 ? formatFC(row.closingUSD) : '-'}
                      </td>

                      {/* CLOSING CNY */}
                      <td className={`px-2.5 py-2 text-right border-r border-slate-200/70 dark:border-white/5 font-mono font-bold ${
                        row.closingCNY > 0.01 ? 'text-blue-600 dark:text-blue-400' : row.closingCNY < -0.01 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'
                      }`}>
                        {Math.abs(row.closingCNY) > 0.01 ? formatFC(row.closingCNY) : '-'}
                      </td>

                      {/* Closing INR (book) */}
                      <td className={`px-2.5 py-2 text-right border-r border-slate-200/70 dark:border-white/5 font-mono font-extrabold ${
                        row.closingINRBook > 500 ? 'text-blue-600 dark:text-blue-400' : row.closingINRBook < -500 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500'
                      }`}>
                        {Math.abs(row.closingINRBook) > 1 ? formatINR(row.closingINRBook) : '-'}
                      </td>

                      {/* Closing INR @ current rate */}
                      <td className="px-2.5 py-2 text-right border-r border-slate-200/70 dark:border-white/5 font-mono font-bold text-slate-700 dark:text-slate-300">
                        {Math.abs(row.closingINRMtm) > 1 ? formatINR(row.closingINRMtm) : '-'}
                      </td>

                      {/* FX Gain(+) / Loss(−) INR */}
                      <td className={`px-2.5 py-2 text-right border-r border-slate-200/70 dark:border-white/5 font-mono font-bold ${
                        row.fxGainLossINR > 100 ? 'text-emerald-600 dark:text-emerald-400' : row.fxGainLossINR < -100 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'
                      }`}>
                        {Math.abs(row.fxGainLossINR) > 5 ? (
                          <span>{row.fxGainLossINR > 0 ? '+' : ''}{formatINR(row.fxGainLossINR)}</span>
                        ) : '-'}
                      </td>

                      {/* LC Open USD */}
                      <td className="px-2.5 py-2 text-right border-r border-slate-200/70 dark:border-white/5 font-mono text-purple-600 dark:text-purple-400 font-semibold">
                        {row.lcOpenUSD ? formatFC(row.lcOpenUSD) : '-'}
                      </td>

                      {/* LC Open CNY */}
                      <td className="px-2.5 py-2 text-right border-r border-slate-200/70 dark:border-white/5 font-mono text-purple-600 dark:text-purple-400 font-semibold">
                        {row.lcOpenCNY ? formatFC(row.lcOpenCNY) : '-'}
                      </td>

                      {/* Debit-bal PIs */}
                      <td className={`px-2 py-2 text-center border-r border-slate-200/70 dark:border-white/5 font-mono font-bold ${
                        row.debitBalPIs > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'
                      }`}>
                        {row.debitBalPIs}
                      </td>

                      {/* Overdue PIs */}
                      <td className={`px-2 py-2 text-center border-r border-slate-200/70 dark:border-white/5 font-mono font-bold ${
                        row.overduePIs > 0 ? 'text-rose-600 dark:text-rose-400 animate-pulse' : 'text-slate-400'
                      }`}>
                        {row.overduePIs}
                      </td>

                      {/* Status */}
                      <td className="px-3 py-2 text-center whitespace-nowrap">
                        {getStatusBadge(row.status)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Totals Row */}
            <tfoot className="bg-[#1e3a5f] text-white font-extrabold text-[11px] sticky bottom-0 z-20 shadow-lg border-t-2 border-indigo-400">
              <tr>
                <th className="px-3 py-3 text-left sticky left-0 z-30 bg-[#1e3a5f]">TOTAL</th>
                <th className="px-3 py-3 text-left sticky left-[85px] z-30 bg-[#1e3a5f] truncate">
                  {filteredRows.length} Parties ({totals.activeCount} Active)
                </th>
                <th className="px-2.5 py-3 text-right font-mono">{formatFC(totals.openingUSD)}</th>
                <th className="px-2.5 py-3 text-right font-mono">{formatFC(totals.openingCNY)}</th>
                <th className="px-2.5 py-3 text-right font-mono">{formatINR(totals.openingINR)}</th>
                <th className="px-2.5 py-3 text-right font-mono">{formatFC(totals.ciUSD)}</th>
                <th className="px-2.5 py-3 text-right font-mono">{formatFC(totals.ciCNY)}</th>
                <th className="px-2.5 py-3 text-right font-mono">{formatINR(totals.ciINR)}</th>
                <th className="px-2.5 py-3 text-right font-mono">{formatFC(totals.paidUSD)}</th>
                <th className="px-2.5 py-3 text-right font-mono">{formatFC(totals.paidCNY)}</th>
                <th className="px-2.5 py-3 text-right font-mono">{formatINR(totals.paidINR)}</th>
                <th className="px-2.5 py-3 text-right font-mono text-cyan-300">{formatFC(totals.closingUSD)}</th>
                <th className="px-2.5 py-3 text-right font-mono text-cyan-300">{formatFC(totals.closingCNY)}</th>
                <th className="px-2.5 py-3 text-right font-mono text-amber-300 font-black">{formatINR(totals.closingINRBook)}</th>
                <th className="px-2.5 py-3 text-right font-mono">{formatINR(totals.closingINRMtm)}</th>
                <th className="px-2.5 py-3 text-right font-mono">{totals.fxGainLossINR >= 0 ? '+' : ''}{formatINR(totals.fxGainLossINR)}</th>
                <th className="px-2.5 py-3 text-right font-mono">{formatFC(totals.lcOpenUSD)}</th>
                <th className="px-2.5 py-3 text-right font-mono">{formatFC(totals.lcOpenCNY)}</th>
                <th className="px-2 py-3 text-center font-mono">{totals.debitBalPIs}</th>
                <th className="px-2 py-3 text-center font-mono text-rose-300">{totals.overduePIs}</th>
                <th className="px-3 py-3 text-center">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/20 text-white">
                    {totals.closingINRBook > 0 ? 'Net Payable' : 'Net Advance'}
                  </span>
                </th>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};
