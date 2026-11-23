import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { CommercialInvoice } from '../types';
import { formatFC, formatINR, formatDate, formatRate, round2 } from '../utils/formatters';
import { exportToExcel } from '../utils/excel';
import { computeBOETaxTotals, suggestSWS, suggestIGST, BOETaxStatus } from '../utils/boe';
import {
  ClipboardList,
  Download,
  Printer,
  Search,
  RotateCcw,
  ArrowUpDown,
  Edit3,
  CheckCircle2,
  Clock,
  AlertTriangle,
  AlertCircle,
  FileCheck,
  FileSpreadsheet,
} from 'lucide-react';
import { ExcelBatchGridModal } from './ExcelBatchGridModal';

type SortField =
  | 'boeDate'
  | 'ciDate'
  | 'taxInvoiceValueINR'
  | 'assessableValueINR'
  | 'totalTaxINR'
  | 'taxPaidDate';

type DateFieldFilter = 'boeDate' | 'ciDate' | 'taxPaidDate';
type StatusFilter = 'ALL' | BOETaxStatus;

export const BOERegisterScreen: React.FC = () => {
  const { db, selectedCompanyId, saveCI } = useApp();
  const { permissions } = useAuth();

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [supplierFilter, setSupplierFilter] = useState<string>('ALL');
  const [portFilter, setPortFilter] = useState<string>('ALL');
  const [currencyFilter, setCurrencyFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [dateField, setDateField] = useState<DateFieldFilter>('boeDate');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  // Sorting
  const [sortField, setSortField] = useState<SortField>('boeDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Edit BOE & Customs Tax Modal
  const [editingCi, setEditingCi] = useState<CommercialInvoice | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [formState, setFormState] = useState({
    boeNo: '',
    boeDate: '',
    portCode: 'INNSA1',
    boeExchangeRate: 95.0,
    taxInvoiceValueINR: 0,
    assessableValueINR: 0,
    customsDutyINR: 0,
    swsINR: 0,
    igstINR: 0,
    taxPaidDate: '',
    challanNo: '',
  });

  const companyCIs = useMemo(
    () => db.commercialInvoices.filter(ci => selectedCompanyId === 'ALL' || ci.companyId === selectedCompanyId),
    [db.commercialInvoices, selectedCompanyId]
  );

  const filteredSuppliers = useMemo(
    () => db.suppliers.filter(s => selectedCompanyId === 'ALL' || s.companyId === selectedCompanyId),
    [db.suppliers, selectedCompanyId]
  );

  const availablePorts = useMemo(() => {
    const set = new Set<string>();
    for (const ci of companyCIs) {
      const p = (ci.portCode || '').trim().toUpperCase();
      if (p) set.add(p);
    }
    return Array.from(set).sort();
  }, [companyCIs]);

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    supplierFilter !== 'ALL' ||
    portFilter !== 'ALL' ||
    currencyFilter !== 'ALL' ||
    statusFilter !== 'ALL' ||
    fromDate !== '' ||
    toDate !== '';

  const resetFilters = () => {
    setSearchQuery('');
    setSupplierFilter('ALL');
    setPortFilter('ALL');
    setCurrencyFilter('ALL');
    setStatusFilter('ALL');
    setDateField('boeDate');
    setFromDate('');
    setToDate('');
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  // Base enriched rows matching non-status filters (used to compute live status counts)
  const baseRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return companyCIs
      .filter(ci => {
        if (supplierFilter !== 'ALL' && ci.supplierId !== supplierFilter) return false;
        if (currencyFilter !== 'ALL' && ci.currency !== currencyFilter) return false;
        if (portFilter !== 'ALL' && (ci.portCode || '').trim().toUpperCase() !== portFilter) return false;

        const dtVal =
          dateField === 'boeDate'
            ? ci.boeDate || ''
            : dateField === 'ciDate'
            ? ci.ciDate || ''
            : ci.taxPaidDate || '';

        if (fromDate && (!dtVal || dtVal < fromDate)) return false;
        if (toDate && (!dtVal || dtVal > toDate)) return false;

        if (q) {
          const supp = db.suppliers.find(s => s.id === ci.supplierId);
          const hay = [
            ci.boeNo,
            ci.ciNo,
            ci.portCode,
            ci.challanNo || '',
            ci.tallyVoucherNo || '',
            supp?.supplierName || '',
            supp?.vendorCode || '',
          ]
            .join(' ')
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .map(ci => {
        const comp = db.companies.find(c => c.id === ci.companyId);
        const supp = db.suppliers.find(s => s.id === ci.supplierId);
        const pi = ci.linkedPiId ? db.proformaInvoices.find(p => p.id === ci.linkedPiId) : undefined;
        const tax = computeBOETaxTotals(ci);
        return {
          ci,
          companyCode: comp?.code || '',
          supplierName: supp?.supplierName || '',
          vendorCode: supp?.vendorCode || '',
          piNo: pi?.piNo || '',
          tax,
        };
      });
  }, [
    companyCIs,
    db.companies,
    db.suppliers,
    db.proformaInvoices,
    supplierFilter,
    currencyFilter,
    portFilter,
    dateField,
    fromDate,
    toDate,
    searchQuery,
  ]);

  const statusCounts = useMemo(() => {
    let taxPaid = 0;
    let taxPending = 0;
    let boePending = 0;
    for (const r of baseRows) {
      if (r.tax.status === 'Tax Paid') taxPaid += 1;
      else if (r.tax.status === 'Tax Pending') taxPending += 1;
      else boePending += 1;
    }
    return {
      all: baseRows.length,
      taxPaid,
      taxPending,
      boePending,
    };
  }, [baseRows]);

  const rows = useMemo(() => {
    const filtered = statusFilter === 'ALL' ? baseRows : baseRows.filter(r => r.tax.status === statusFilter);
    const mult = sortDir === 'asc' ? 1 : -1;

    return [...filtered].sort((a, b) => {
      switch (sortField) {
        case 'boeDate':
          return (a.ci.boeDate || '').localeCompare(b.ci.boeDate || '') * mult;
        case 'ciDate':
          return (a.ci.ciDate || '').localeCompare(b.ci.ciDate || '') * mult;
        case 'taxPaidDate':
          return (a.ci.taxPaidDate || '').localeCompare(b.ci.taxPaidDate || '') * mult;
        case 'taxInvoiceValueINR':
          return (a.tax.taxInvoiceValueINR - b.tax.taxInvoiceValueINR) * mult;
        case 'assessableValueINR':
          return (a.tax.assessableValueINR - b.tax.assessableValueINR) * mult;
        case 'totalTaxINR':
          return (a.tax.totalTaxINR - b.tax.totalTaxINR) * mult;
      }
    });
  }, [baseRows, statusFilter, sortField, sortDir]);

  // Summary metrics over visible filtered rows
  const totals = useMemo(() => {
    let totalFC = 0;
    let taxInvoiceValueINR = 0;
    let assessableValueINR = 0;
    let customsDutyINR = 0;
    let swsINR = 0;
    let igstINR = 0;
    let totalTaxINR = 0;
    let paidCount = 0;
    let pendingCount = 0;

    for (const r of rows) {
      totalFC += r.ci.ciValueFC || 0;
      taxInvoiceValueINR += r.tax.taxInvoiceValueINR;
      assessableValueINR += r.tax.assessableValueINR;
      customsDutyINR += r.tax.customsDutyINR;
      swsINR += r.tax.swsINR;
      igstINR += r.tax.igstINR;
      totalTaxINR += r.tax.totalTaxINR;
      if (r.tax.status === 'Tax Paid') paidCount += 1;
      else pendingCount += 1;
    }

    return {
      totalFC: round2(totalFC),
      taxInvoiceValueINR: round2(taxInvoiceValueINR),
      assessableValueINR: round2(assessableValueINR),
      customsDutyINR: round2(customsDutyINR),
      swsINR: round2(swsINR),
      igstINR: round2(igstINR),
      totalTaxINR: round2(totalTaxINR),
      paidCount,
      pendingCount,
    };
  }, [rows]);

  const openEditModal = (ci: CommercialInvoice) => {
    const computed = computeBOETaxTotals(ci);
    setModalError(null);
    setEditingCi(ci);
    setFormState({
      boeNo: ci.boeNo.startsWith('PENDING-') ? '' : ci.boeNo,
      boeDate: ci.boeDate || ci.ciDate,
      portCode: ci.portCode || 'INNSA1',
      boeExchangeRate: ci.boeExchangeRate,
      taxInvoiceValueINR: ci.taxInvoiceValueINR || 0,
      assessableValueINR: ci.assessableValueINR || computed.assessableValueINR,
      customsDutyINR: computed.customsDutyINR,
      swsINR: computed.swsINR,
      igstINR: computed.igstINR,
      taxPaidDate: ci.taxPaidDate || '',
      challanNo: ci.challanNo || '',
    });
  };

  const handleSaveModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCi) return;
    if (!formState.boeNo.trim() || !formState.boeDate || !formState.portCode.trim() || formState.boeExchangeRate <= 0) {
      setModalError('BOE No, BOE Date, Port Code, and BOE Exchange Rate (> 0) are required.');
      return;
    }

    const updatedCi: CommercialInvoice = {
      ...editingCi,
      boeNo: formState.boeNo.trim().toUpperCase(),
      boeDate: formState.boeDate,
      portCode: formState.portCode.trim().toUpperCase(),
      boeExchangeRate: Number(formState.boeExchangeRate),
      taxInvoiceValueINR: formState.taxInvoiceValueINR > 0 ? round2(Number(formState.taxInvoiceValueINR)) : undefined,
      assessableValueINR:
        formState.assessableValueINR > 0
          ? round2(Number(formState.assessableValueINR))
          : Math.round(editingCi.ciValueFC * Number(formState.boeExchangeRate)),
      customsDutyINR: round2(Number(formState.customsDutyINR || 0)),
      swsINR: round2(Number(formState.swsINR || 0)),
      igstINR: round2(Number(formState.igstINR || 0)),
      taxPaidDate: formState.taxPaidDate || undefined,
      challanNo: formState.challanNo.trim() || undefined,
    };

    const res = saveCI(updatedCi);
    if (!res.success) {
      setModalError(res.error || 'Failed to update Bill of Entry.');
      return;
    }
    setEditingCi(null);
  };

  const handleExport = () => {
    const exportRows: Record<string, unknown>[] = rows.map(r => ({
      Company: r.companyCode,
      Supplier: r.supplierName,
      'Vendor Code': r.vendorCode,
      'Port Code': r.ci.portCode || '-',
      'BOE No': r.ci.boeNo,
      'BOE Date': formatDate(r.ci.boeDate),
      'Invoice No': r.ci.ciNo,
      'Invoice Date': formatDate(r.ci.ciDate),
      Currency: r.ci.currency,
      'Invoice FC': r.ci.ciValueFC,
      'BOE Rate': r.ci.boeExchangeRate,
      'Tax Invoice Value (INR)': r.tax.taxInvoiceValueINR,
      'Total BOE Ass. Value (INR)': r.tax.assessableValueINR,
      'Custom Duty (INR)': r.tax.customsDutyINR,
      'SWS (INR)': r.tax.swsINR,
      'IGST / GST Amount (INR)': r.tax.igstINR,
      'Total Tax Amount (INR)': r.tax.totalTaxINR,
      'Tax Paid Date': r.ci.taxPaidDate ? formatDate(r.ci.taxPaidDate) : 'Pending',
      'Challan No': r.ci.challanNo || '-',
      Status: r.tax.status,
    }));

    if (exportRows.length > 0) {
      exportRows.push({
        Company: 'TOTAL',
        Supplier: `${rows.length} BOE(s)`,
        'Vendor Code': '',
        'Port Code': '',
        'BOE No': '',
        'BOE Date': '',
        'Invoice No': '',
        'Invoice Date': '',
        Currency: '',
        'Invoice FC': totals.totalFC,
        'BOE Rate': '',
        'Tax Invoice Value (INR)': totals.taxInvoiceValueINR,
        'Total BOE Ass. Value (INR)': totals.assessableValueINR,
        'Custom Duty (INR)': totals.customsDutyINR,
        'SWS (INR)': totals.swsINR,
        'IGST / GST Amount (INR)': totals.igstINR,
        'Total Tax Amount (INR)': totals.totalTaxINR,
        'Tax Paid Date': '',
        'Challan No': '',
        Status: '',
      });
    }

    exportToExcel(exportRows, 'Bill_of_Entry_Register', 'BOE Register');
  };

  // Modal live preview calculations
  const modalBaseAssVal = editingCi
    ? formState.assessableValueINR > 0
      ? Number(formState.assessableValueINR)
      : Math.round(editingCi.ciValueFC * Number(formState.boeExchangeRate || 0))
    : 0;
  const modalTotalTax = round2(
    Number(formState.customsDutyINR || 0) + Number(formState.swsINR || 0) + Number(formState.igstINR || 0)
  );

  return (
    <div className="p-6 space-y-5 max-w-[1440px] mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-2xl shadow-xs border border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-extrabold text-slate-900">Bill of Entry (BOE) Register &amp; Customs Tax Ledger</h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Track BOE No, Invoice No, Tax Invoice Value, Assessable Value, Custom Duty (BCD), SWS, IGST (ITC), Total Tax &amp; Tax Paid Date
          </p>
        </div>

        <div className="no-print flex items-center space-x-2">
          <button
            onClick={() => window.print()}
            className="flex items-center space-x-1.5 text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl border border-slate-300 transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print / PDF</span>
          </button>

          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center space-x-1.5 text-xs px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold rounded-xl border border-emerald-300 transition-colors shadow-xs cursor-pointer"
            title="Batch upload Customs BOE Register from Excel"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Upload BOE Register</span>
          </button>

          <button
            onClick={handleExport}
            className="flex items-center space-x-1.5 text-xs px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-xs transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* KPI Cards (6 cards) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[10px] font-bold uppercase text-slate-400">Total BOEs</p>
          <p className="text-lg font-extrabold text-slate-900 mt-0.5">{rows.length}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {totals.paidCount} Tax Paid • {totals.pendingCount} Pending
          </p>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[10px] font-bold uppercase text-slate-400">Tax Invoice Value</p>
          <p className="text-base font-extrabold text-slate-900 font-mono mt-0.5">
            {formatINR(totals.taxInvoiceValueINR)}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">{formatFC(totals.totalFC)} FC total</p>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[10px] font-bold uppercase text-slate-400">Total BOE Ass. Value</p>
          <p className="text-base font-extrabold text-indigo-700 font-mono mt-0.5">
            {formatINR(totals.assessableValueINR)}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">Customs valuation</p>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[10px] font-bold uppercase text-slate-400">Custom Duty &amp; SWS</p>
          <p className="text-base font-extrabold text-amber-700 font-mono mt-0.5">
            {formatINR(round2(totals.customsDutyINR + totals.swsINR))}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">
            BCD {formatINR(totals.customsDutyINR)} • SWS {formatINR(totals.swsINR)}
          </p>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[10px] font-bold uppercase text-slate-400">IGST / GST (ITC)</p>
          <p className="text-base font-extrabold text-emerald-700 font-mono mt-0.5">
            {formatINR(totals.igstINR)}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">GSTR-2B ITC eligible</p>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[10px] font-bold uppercase text-slate-400">Total Tax Amount</p>
          <p className="text-base font-extrabold text-slate-900 font-mono mt-0.5">
            {formatINR(totals.totalTaxINR)}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">BCD + SWS + IGST</p>
        </div>
      </div>

      {/* Interactive Filter Bar */}
      <div className="no-print bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs space-y-3 text-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search */}
          <div className="relative flex-1 min-w-[230px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search BOE No / Invoice No / Supplier / Port / Challan..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Supplier Filter */}
          <select
            value={supplierFilter}
            onChange={e => setSupplierFilter(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white max-w-[230px]"
          >
            <option value="ALL">All Suppliers ({filteredSuppliers.length})</option>
            {filteredSuppliers.map(s => (
              <option key={s.id} value={s.id}>
                {s.vendorCode} — {s.supplierName}
              </option>
            ))}
          </select>

          {/* Port Code Filter */}
          <select
            value={portFilter}
            onChange={e => setPortFilter(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
          >
            <option value="ALL">All Ports ({availablePorts.length})</option>
            {availablePorts.map(port => (
              <option key={port} value={port}>
                {port}
              </option>
            ))}
          </select>

          {/* Currency Filter */}
          <select
            value={currencyFilter}
            onChange={e => setCurrencyFilter(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
          >
            <option value="ALL">All Currencies</option>
            {db.currencies.map(c => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </select>

          {/* Date Range Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200">
            <select
              value={dateField}
              onChange={e => setDateField(e.target.value as DateFieldFilter)}
              className="text-[11px] font-semibold bg-transparent text-slate-700 focus:outline-none"
            >
              <option value="boeDate">BOE Date</option>
              <option value="ciDate">Invoice Date</option>
              <option value="taxPaidDate">Tax Paid Date</option>
            </select>
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              title="From Date"
              className="text-[11px] px-1.5 py-0.5 rounded border border-slate-300 bg-white"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              title="To Date"
              className="text-[11px] px-1.5 py-0.5 rounded border border-slate-300 bg-white"
            />
          </div>

          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold border border-rose-200"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>

        {/* Status Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">Status:</span>
          {[
            { id: 'ALL' as const, label: `All (${statusCounts.all})`, activeCls: 'bg-slate-800 text-white' },
            { id: 'Tax Paid' as const, label: `Tax Paid (${statusCounts.taxPaid})`, activeCls: 'bg-emerald-600 text-white' },
            { id: 'Tax Pending' as const, label: `Tax Pending (${statusCounts.taxPending})`, activeCls: 'bg-amber-600 text-white' },
            { id: 'BOE Pending' as const, label: `BOE Pending (${statusCounts.boePending})`, activeCls: 'bg-rose-600 text-white' },
          ].map(pill => (
            <button
              key={pill.id}
              onClick={() => setStatusFilter(pill.id)}
              className={`px-3 py-1 rounded-full text-[11px] font-bold transition-colors ${
                statusFilter === pill.id ? pill.activeCls : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      {/* Web Ledger Table */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-100 text-slate-700 font-semibold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-3 py-2.5">Company / Party</th>
                <th className="px-3 py-2.5">BOE No.</th>
                <th className="px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => toggleSort('boeDate')}
                    className="inline-flex items-center gap-1 hover:text-indigo-700 font-semibold uppercase"
                  >
                    <span>BOE Date</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="px-3 py-2.5">Invoice No.</th>
                <th className="px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => toggleSort('ciDate')}
                    className="inline-flex items-center gap-1 hover:text-indigo-700 font-semibold uppercase"
                  >
                    <span>Invoice Date</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="px-3 py-2.5 text-right">
                  <button
                    type="button"
                    onClick={() => toggleSort('taxInvoiceValueINR')}
                    className="inline-flex items-center gap-1 hover:text-indigo-700 font-semibold uppercase"
                  >
                    <span>Tax Invoice Value</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="px-3 py-2.5 text-right">
                  <button
                    type="button"
                    onClick={() => toggleSort('assessableValueINR')}
                    className="inline-flex items-center gap-1 hover:text-indigo-700 font-semibold uppercase"
                  >
                    <span>Total BOE Ass. Value</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="px-3 py-2.5 text-right">Custom Duty</th>
                <th className="px-3 py-2.5 text-right">SWS</th>
                <th className="px-3 py-2.5 text-right">IGST / GST Amt</th>
                <th className="px-3 py-2.5 text-right">
                  <button
                    type="button"
                    onClick={() => toggleSort('totalTaxINR')}
                    className="inline-flex items-center gap-1 hover:text-indigo-700 font-semibold uppercase"
                  >
                    <span>Total Tax Amount</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => toggleSort('taxPaidDate')}
                    className="inline-flex items-center gap-1 hover:text-indigo-700 font-semibold uppercase"
                  >
                    <span>Tax Paid Date</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="no-print px-3 py-2.5 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-4 py-10 text-center text-slate-400">
                    No Bill of Entry records match your current filters.
                  </td>
                </tr>
              ) : (
                rows.map(({ ci, companyCode, supplierName, vendorCode, piNo, tax }) => (
                  <tr key={ci.id} className="hover:bg-slate-50/90 transition-colors">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 text-[10px] font-bold">
                          {companyCode}
                        </span>
                        <span className="font-semibold text-slate-900">{supplierName}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {vendorCode} • Port: {ci.portCode || '-'}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-mono">
                      <div className={`font-bold ${tax.isPendingBoe ? 'text-amber-700' : 'text-indigo-700'}`}>
                        {ci.boeNo}
                      </div>
                      {tax.isPendingBoe && (
                        <span className="inline-block text-[10px] font-sans font-semibold text-amber-700">Pending</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{formatDate(ci.boeDate)}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-bold text-slate-900">{ci.ciNo}</div>
                      {piNo && <div className="text-[10px] text-indigo-600">PI: {piNo}</div>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{formatDate(ci.ciDate)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      <div className="font-bold text-slate-900">{formatINR(tax.taxInvoiceValueINR)}</div>
                      <div className="text-[10px] text-slate-400">
                        {formatFC(ci.ciValueFC)} {ci.currency} @ {formatRate(ci.boeExchangeRate)}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-slate-800">
                      {formatINR(tax.assessableValueINR)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-700">{formatINR(tax.customsDutyINR)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-700">{formatINR(tax.swsINR)}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-emerald-700">
                      {formatINR(tax.igstINR)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-extrabold text-slate-900">
                      {formatINR(tax.totalTaxINR)}
                    </td>
                    <td className="px-3 py-2.5">
                      {tax.status === 'Tax Paid' ? (
                        <div className="space-y-0.5">
                          <div className="text-[11px] font-bold text-slate-900">{formatDate(ci.taxPaidDate)}</div>
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            <span>Tax Paid</span>
                          </span>
                          {ci.challanNo && <div className="text-[10px] text-slate-400">Challan: {ci.challanNo}</div>}
                        </div>
                      ) : tax.status === 'BOE Pending' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold">
                          <AlertTriangle className="w-3 h-3" />
                          <span>BOE Pending</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                          <Clock className="w-3 h-3" />
                          <span>Tax Pending</span>
                        </span>
                      )}
                    </td>
                    <td className="no-print px-3 py-2.5 text-center">
                      {permissions.canCreateCI ? (
                        <button
                          onClick={() => openEditModal(ci)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold transition-colors"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Edit BOE / Tax</span>
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-400">View Only</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="bg-slate-100 font-extrabold text-slate-900 border-t-2 border-slate-300 text-xs">
                <tr>
                  <td colSpan={5} className="px-3 py-2.5 text-right uppercase tracking-wide">
                    TOTAL ({rows.length} BOE{rows.length === 1 ? '' : 's'}):
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">{formatINR(totals.taxInvoiceValueINR)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-indigo-800">
                    {formatINR(totals.assessableValueINR)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">{formatINR(totals.customsDutyINR)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{formatINR(totals.swsINR)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-emerald-700">{formatINR(totals.igstINR)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{formatINR(totals.totalTaxINR)}</td>
                  <td colSpan={2} className="px-3 py-2.5"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Edit BOE & Customs Tax Modal */}
      {editingCi && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-indigo-600" />
                <span>Update Bill of Entry &amp; Customs Duty — Invoice {editingCi.ciNo}</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingCi(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="p-6 overflow-y-auto space-y-4 text-xs">
              {modalError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* Read-only Invoice Context */}
              <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <span className="text-[10px] font-bold uppercase text-indigo-700 block">Company</span>
                  <span className="font-bold text-slate-900">
                    {db.companies.find(c => c.id === editingCi.companyId)?.code}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-indigo-700 block">Supplier</span>
                  <span className="font-bold text-slate-900">
                    {db.suppliers.find(s => s.id === editingCi.supplierId)?.supplierName}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-indigo-700 block">Invoice No &amp; Date</span>
                  <span className="font-bold text-slate-900">
                    {editingCi.ciNo} ({formatDate(editingCi.ciDate)})
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-indigo-700 block">Invoice Value</span>
                  <span className="font-bold text-slate-900">
                    {formatFC(editingCi.ciValueFC)} {editingCi.currency}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">BOE Number *</label>
                  <input
                    type="text"
                    value={formState.boeNo}
                    onChange={e => setFormState({ ...formState, boeNo: e.target.value })}
                    placeholder="e.g. 8845120"
                    className="w-full p-2 rounded-lg border border-slate-300 font-mono font-bold uppercase"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">BOE Date *</label>
                  <input
                    type="date"
                    value={formState.boeDate}
                    onChange={e => setFormState({ ...formState, boeDate: e.target.value })}
                    className="w-full p-2 rounded-lg border border-slate-300"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Port Code *</label>
                  <input
                    type="text"
                    value={formState.portCode}
                    onChange={e => setFormState({ ...formState, portCode: e.target.value })}
                    placeholder="INNSA1 / INBOM4"
                    className="w-full p-2 rounded-lg border border-slate-300 uppercase font-semibold"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">BOE Customs Rate *</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={formState.boeExchangeRate || ''}
                    onChange={e => setFormState({ ...formState, boeExchangeRate: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2 rounded-lg border border-slate-300 font-bold text-indigo-700"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tax Invoice Value (INR)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formState.taxInvoiceValueINR || ''}
                    onChange={e =>
                      setFormState({ ...formState, taxInvoiceValueINR: parseFloat(e.target.value) || 0 })
                    }
                    placeholder={`Auto: ${Math.round(editingCi.ciValueFC * Number(formState.boeExchangeRate || 0))}`}
                    className="w-full p-2 rounded-lg border border-slate-300 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Total BOE Assessable Value (INR)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formState.assessableValueINR || ''}
                    onChange={e =>
                      setFormState({ ...formState, assessableValueINR: parseFloat(e.target.value) || 0 })
                    }
                    placeholder={`Auto: ${Math.round(editingCi.ciValueFC * Number(formState.boeExchangeRate || 0))}`}
                    className="w-full p-2 rounded-lg border border-slate-300 font-mono font-semibold"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Custom Duty / BCD (INR)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formState.customsDutyINR || ''}
                    onChange={e => setFormState({ ...formState, customsDutyINR: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2 rounded-lg border border-slate-300 font-mono"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-700">SWS (INR)</label>
                    <button
                      type="button"
                      onClick={() => setFormState({ ...formState, swsINR: suggestSWS(formState.customsDutyINR) })}
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200"
                    >
                      10% of BCD
                    </button>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    value={formState.swsINR || ''}
                    onChange={e => setFormState({ ...formState, swsINR: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2 rounded-lg border border-slate-300 font-mono"
                  />
                </div>

                <div className="col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-700">IGST / GST Amount (INR)</label>
                    <div className="flex items-center gap-1">
                      {[18, 12, 5].map(pct => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() =>
                            setFormState({
                              ...formState,
                              igstINR: suggestIGST(modalBaseAssVal, formState.customsDutyINR, formState.swsINR, pct),
                            })
                          }
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                        >
                          {pct}% IGST
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    value={formState.igstINR || ''}
                    onChange={e => setFormState({ ...formState, igstINR: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2 rounded-lg border border-slate-300 font-mono font-bold text-emerald-700"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tax Paid Date</label>
                  <input
                    type="date"
                    value={formState.taxPaidDate}
                    onChange={e => setFormState({ ...formState, taxPaidDate: e.target.value })}
                    className="w-full p-2 rounded-lg border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">TR-6 / ICEGATE Challan No</label>
                  <input
                    type="text"
                    value={formState.challanNo}
                    onChange={e => setFormState({ ...formState, challanNo: e.target.value })}
                    placeholder="e.g. CHL-2026-00412"
                    className="w-full p-2 rounded-lg border border-slate-300 font-mono"
                  />
                </div>
              </div>

              {/* Live Total Tax Preview */}
              <div className="p-3 bg-slate-100 rounded-xl border border-slate-200 flex items-center justify-between">
                <span className="font-bold text-slate-700">Total Tax Amount (BCD + SWS + IGST):</span>
                <span className="text-base font-extrabold font-mono text-slate-900">{formatINR(modalTotalTax)}</span>
              </div>

              <div className="pt-3 border-t flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setEditingCi(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-xs"
                >
                  Save BOE &amp; Tax Details
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Excel Batch Upload Modal */}
      <ExcelBatchGridModal
        isOpen={showUploadModal}
        initialEntity="ci"
        onClose={() => setShowUploadModal(false)}
      />
    </div>
  );
};
