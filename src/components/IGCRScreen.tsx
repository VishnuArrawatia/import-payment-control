import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { IGCRLot, IGCRConsumptionType } from '../types';
import { formatINR, formatDate, round2 } from '../utils/formatters';
import { exportToExcel } from '../utils/excel';
import { computeIGCRForm3 } from '../utils/purchaseEngine';
import {
  ShieldCheck,
  RefreshCw,
  Plus,
  Download,
  Printer,
  Trash2,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Factory,
} from 'lucide-react';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const IGCRScreen: React.FC = () => {
  const {
    db,
    selectedCompanyId,
    asOfDate,
    saveIGCRLot,
    syncIGCRLotsFromBOEs,
    saveIGCRConsumption,
    deleteIGCRConsumption,
  } = useApp();
  const { permissions } = useAuth();

  const [periodType, setPeriodType] = useState<'monthly' | 'quarterly'>('quarterly');
  const [year, setYear] = useState<number>(2026);
  const [periodIndex, setPeriodIndex] = useState<number>(2); // Q2 Jul-Sep 2026
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [notice, setNotice] = useState<string | null>(null);

  // Add/Edit Lot Modal
  const [showLotModal, setShowLotModal] = useState(false);
  const [editingLot, setEditingLot] = useState<IGCRLot | null>(null);
  const [lotError, setLotError] = useState<string | null>(null);
  const [lotForm, setLotForm] = useState<Partial<IGCRLot>>({
    companyId: selectedCompanyId !== 'ALL' ? selectedCompanyId : db.companies[0]?.id || '',
    boeNo: '',
    boeDate: new Date().toISOString().split('T')[0],
    portCode: 'INNSA1',
    invoiceNo: '',
    invoiceSerialNo: '1',
    itemSerialNo: '1',
    itemDescription: '',
    hsnCode: '8504',
    uom: 'PCS',
    specifiedPurpose: 'Manufacturing of Finished Goods',
    notificationNo: '50/2017-Cus',
    qtyImported: 100,
    clearanceDate: new Date().toISOString().split('T')[0],
    assessableValueINR: 0,
    normalBcdRatePct: 10,
    concessionalBcdRatePct: 0,
    bcdForegoneINR: 0,
    otherDutyForegoneINR: 0,
    igstForegoneINR: 0,
    cessForegoneINR: 0,
    qtyReceived: 100,
    receiptDate: new Date().toISOString().split('T')[0],
    utilizationMonths: 6,
  });

  // Log Consumption Modal
  const [showConsModal, setShowConsModal] = useState(false);
  const [consError, setConsError] = useState<string | null>(null);
  const [consForm, setConsForm] = useState<{
    lotId: string;
    date: string;
    type: IGCRConsumptionType;
    qty: number;
    documentNo: string;
    differentialDutyPaidINR: number;
    interestPaidINR: number;
    remarks: string;
  }>({
    lotId: '',
    date: new Date().toISOString().split('T')[0],
    type: 'MANUFACTURE_DOMESTIC',
    qty: 0,
    documentNo: '',
    differentialDutyPaidINR: 0,
    interestPaidINR: 0,
    remarks: '',
  });

  const igcrResult = useMemo(
    () => computeIGCRForm3(db, periodType, year, periodIndex, selectedCompanyId, asOfDate),
    [db, periodType, year, periodIndex, selectedCompanyId, asOfDate]
  );

  const visibleRows = useMemo(() => {
    return igcrResult.rows.filter(r => {
      if (statusFilter === 'ALL') return true;
      if (statusFilter === 'SHORT_IGCR2') return r.igcr2Alert;
      if (statusFilter === 'ACTIVE_STOCK') return r.closingStockFactory21 > 0;
      return r.expiryStatus === statusFilter;
    });
  }, [igcrResult.rows, statusFilter]);

  const activeCompanyMeta =
    selectedCompanyId !== 'ALL' ? db.companies.find(c => c.id === selectedCompanyId) : db.companies[0];

  const handleSyncFromBOEs = () => {
    const res = syncIGCRLotsFromBOEs();
    setNotice(
      res.createdCount > 0
        ? `Auto-created ${res.createdCount} IGCR lot(s) from eligible Bills of Entry.`
        : 'All IGCR-eligible BOEs are already synced. Use "+ Add IGCR Lot" to record manual IGCR imports.'
    );
  };

  const openAddLot = () => {
    const compId = selectedCompanyId !== 'ALL' ? selectedCompanyId : db.companies[0]?.id || '';
    const today = new Date().toISOString().split('T')[0];
    setEditingLot(null);
    setLotError(null);
    setLotForm({
      companyId: compId,
      boeNo: '',
      boeDate: today,
      portCode: 'INNSA1',
      invoiceNo: '',
      invoiceSerialNo: '1',
      itemSerialNo: '1',
      itemDescription: '',
      hsnCode: '8504',
      uom: 'PCS',
      specifiedPurpose: 'Manufacturing of Finished Goods',
      notificationNo: '50/2017-Cus',
      qtyImported: 100,
      clearanceDate: today,
      assessableValueINR: 100000,
      normalBcdRatePct: 10,
      concessionalBcdRatePct: 0,
      bcdForegoneINR: 10000,
      otherDutyForegoneINR: 1000,
      igstForegoneINR: 0,
      cessForegoneINR: 0,
      qtyReceived: 100,
      receiptDate: today,
      utilizationMonths: 6,
    });
    setShowLotModal(true);
  };

  const handleAutoComputeForegone = () => {
    const ass = Number(lotForm.assessableValueINR || 0);
    const diffPct = Math.max(0, Number(lotForm.normalBcdRatePct || 0) - Number(lotForm.concessionalBcdRatePct || 0));
    const bcdFg = round2((ass * diffPct) / 100);
    const swsFg = round2(bcdFg * 0.1);
    setLotForm(prev => ({
      ...prev,
      bcdForegoneINR: bcdFg,
      otherDutyForegoneINR: swsFg,
    }));
  };

  const handleSaveLot = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lotForm.companyId || !lotForm.boeNo?.trim() || !lotForm.hsnCode?.trim() || !lotForm.itemDescription?.trim()) {
      setLotError('Company, BOE No, HSN Code, and Item Description are required.');
      return;
    }

    const now = new Date().toISOString();
    const bcdFg = round2(Number(lotForm.bcdForegoneINR || 0));
    const otherFg = round2(Number(lotForm.otherDutyForegoneINR || 0));
    const igstFg = round2(Number(lotForm.igstForegoneINR || 0));
    const cessFg = round2(Number(lotForm.cessForegoneINR || 0));
    const qtyImp = Number(lotForm.qtyImported || 0);
    const qtyRec = Number(lotForm.qtyReceived || 0);

    const payload: IGCRLot = {
      id: editingLot ? editingLot.id : `IGCR-${Date.now()}`,
      companyId: lotForm.companyId!,
      boeNo: lotForm.boeNo!.trim().toUpperCase(),
      boeDate: lotForm.boeDate || now.split('T')[0],
      portCode: (lotForm.portCode || 'INNSA1').trim().toUpperCase(),
      invoiceNo: lotForm.invoiceNo?.trim() || lotForm.boeNo!.trim().toUpperCase(),
      invoiceSerialNo: lotForm.invoiceSerialNo || '1',
      itemSerialNo: lotForm.itemSerialNo || '1',
      itemDescription: lotForm.itemDescription!.trim(),
      hsnCode: lotForm.hsnCode!.trim(),
      uom: (lotForm.uom || 'PCS').toUpperCase(),
      specifiedPurpose: lotForm.specifiedPurpose || 'Manufacturing',
      notificationNo: lotForm.notificationNo,
      qtyImported: qtyImp,
      clearanceDate: lotForm.clearanceDate || lotForm.boeDate || now.split('T')[0],
      assessableValueINR: round2(Number(lotForm.assessableValueINR || 0)),
      normalBcdRatePct: Number(lotForm.normalBcdRatePct || 0),
      concessionalBcdRatePct: Number(lotForm.concessionalBcdRatePct || 0),
      bcdForegoneINR: bcdFg,
      otherDutyForegoneINR: otherFg,
      igstForegoneINR: igstFg,
      cessForegoneINR: cessFg,
      totalDutyForegoneINR: round2(bcdFg + otherFg + igstFg + cessFg),
      qtyReceived: qtyRec,
      receiptDate: lotForm.receiptDate || undefined,
      qtyNotReceived: round2(Math.max(0, qtyImp - qtyRec)),
      utilizationMonths: Number(lotForm.utilizationMonths || 6),
      createdAt: editingLot?.createdAt || now,
      updatedAt: now,
    };

    const res = saveIGCRLot(payload);
    if (!res.success) {
      setLotError(res.error || 'Failed to save IGCR lot.');
      return;
    }
    setShowLotModal(false);
  };

  const openConsModal = (lotId?: string) => {
    const activeLot =
      (lotId && igcrResult.rows.find(r => r.lot.id === lotId)) ||
      igcrResult.rows.find(r => r.closingStockFactory21 > 0) ||
      igcrResult.rows[0];

    setConsError(null);
    setConsForm({
      lotId: activeLot?.lot.id || '',
      date: new Date().toISOString().split('T')[0],
      type: 'MANUFACTURE_DOMESTIC',
      qty: activeLot ? activeLot.closingStockFactory21 : 0,
      documentNo: '',
      differentialDutyPaidINR: 0,
      interestPaidINR: 0,
      remarks: '',
    });
    setShowConsModal(true);
  };

  const handleSaveConsumption = (e: React.FormEvent) => {
    e.preventDefault();
    const targetRow = igcrResult.rows.find(r => r.lot.id === consForm.lotId);
    if (!targetRow) {
      setConsError('Select a valid IGCR lot.');
      return;
    }
    const now = new Date().toISOString();
    const res = saveIGCRConsumption({
      id: `IGCRC-${Date.now()}`,
      companyId: targetRow.lot.companyId,
      lotId: consForm.lotId,
      date: consForm.date,
      type: consForm.type,
      qty: Number(consForm.qty),
      documentNo: consForm.documentNo.trim() || undefined,
      differentialDutyPaidINR:
        consForm.type === 'CLEARED_ON_DUTY' ? Number(consForm.differentialDutyPaidINR || 0) : undefined,
      interestPaidINR:
        consForm.type === 'CLEARED_ON_DUTY' ? Number(consForm.interestPaidINR || 0) : undefined,
      remarks: consForm.remarks.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    });

    if (!res.success) {
      setConsError(res.error || 'Failed to record consumption.');
      return;
    }
    setShowConsModal(false);
  };

  const handleExportIGCR3 = () => {
    // Official ICEGATE Form IGCR-3 Part II Columns (1) to (21) - In-House Consumption Only
    const data: Record<string, unknown>[] = visibleRows.map(({ lot, ...r }) => ({
      '(1) BE Number': lot.boeNo,
      '(2) BE Date': formatDate(lot.boeDate),
      '(3) Port of Import': lot.portCode,
      '(4) Invoice S.No.': lot.invoiceSerialNo,
      '(5) Item S.No.': lot.itemSerialNo,
      '(6) Description of Goods': `${lot.itemDescription} (HSN ${lot.hsnCode})`,
      '(7) Specified Purpose': lot.specifiedPurpose,
      '(8) Qty of Import': lot.qtyImported,
      '(9) Date of Clearance': formatDate(lot.clearanceDate),
      '(10) Value of Goods (INR)': lot.assessableValueINR,
      '(11) BCD Duty Foregone (INR)': lot.bcdForegoneINR,
      '(12) Other Customs Duties Foregone (INR)': lot.otherDutyForegoneINR,
      '(13) IGST Duty Foregone (INR)': lot.igstForegoneINR,
      '(14) Cess Duty Foregone (INR)': lot.cessForegoneINR,
      '(15) Qty Received': lot.qtyReceived,
      '(16) Date of Receipt': lot.receiptDate ? formatDate(lot.receiptDate) : '-',
      '(17) Qty Not Received (IGCR-2)': lot.qtyNotReceived,
      '(18) Total Qty Used for Intended Purpose': r.totalUsed18,
      '(18A) Used - Domestic Mfg': r.usedDomestic18A,
      '(18B) Supply to End-Use Recipient': r.usedEndUse18B,
      '(18C) Used - Export Mfg': r.usedExport18C,
      '(19) Goods Re-Exported Qty': r.reExported19,
      '(20) Cleared on Payment of Duty Qty': r.clearedOnDuty20,
      '(21) Qty Pending in Factory Stock': r.closingStockFactory21,
      'Utilization Due Date': formatDate(r.dueDate),
      Status: r.expiryStatus,
    }));

    if (data.length > 0) {
      data.push({
        '(1) BE Number': 'TOTAL',
        '(2) BE Date': '',
        '(3) Port of Import': '',
        '(4) Invoice S.No.': '',
        '(5) Item S.No.': '',
        '(6) Description of Goods': `${visibleRows.length} IGCR Lot(s)`,
        '(7) Specified Purpose': '',
        '(8) Qty of Import': round2(visibleRows.reduce((s, r) => s + r.lot.qtyImported, 0)),
        '(9) Date of Clearance': '',
        '(10) Value of Goods (INR)': round2(visibleRows.reduce((s, r) => s + r.lot.assessableValueINR, 0)),
        '(11) BCD Duty Foregone (INR)': round2(visibleRows.reduce((s, r) => s + r.lot.bcdForegoneINR, 0)),
        '(12) Other Customs Duties Foregone (INR)': round2(visibleRows.reduce((s, r) => s + r.lot.otherDutyForegoneINR, 0)),
        '(13) IGST Duty Foregone (INR)': round2(visibleRows.reduce((s, r) => s + r.lot.igstForegoneINR, 0)),
        '(14) Cess Duty Foregone (INR)': round2(visibleRows.reduce((s, r) => s + r.lot.cessForegoneINR, 0)),
        '(15) Qty Received': round2(visibleRows.reduce((s, r) => s + r.lot.qtyReceived, 0)),
        '(16) Date of Receipt': '',
        '(17) Qty Not Received (IGCR-2)': round2(visibleRows.reduce((s, r) => s + r.lot.qtyNotReceived, 0)),
        '(18) Total Qty Used for Intended Purpose': round2(visibleRows.reduce((s, r) => s + r.totalUsed18, 0)),
        '(18A) Used - Domestic Mfg': round2(visibleRows.reduce((s, r) => s + r.usedDomestic18A, 0)),
        '(18B) Supply to End-Use Recipient': round2(visibleRows.reduce((s, r) => s + r.usedEndUse18B, 0)),
        '(18C) Used - Export Mfg': round2(visibleRows.reduce((s, r) => s + r.usedExport18C, 0)),
        '(19) Goods Re-Exported Qty': round2(visibleRows.reduce((s, r) => s + r.reExported19, 0)),
        '(20) Cleared on Payment of Duty Qty': round2(visibleRows.reduce((s, r) => s + r.clearedOnDuty20, 0)),
        '(21) Qty Pending in Factory Stock': round2(visibleRows.reduce((s, r) => s + r.closingStockFactory21, 0)),
        'Utilization Due Date': '',
        Status: '',
      });
    }

    exportToExcel(data, `Form_IGCR3_${igcrResult.periodLabel.replace(/\s+/g, '_')}`, 'Form IGCR-3 Part II');
  };

  const { bondSummary } = igcrResult;
  const allPeriodConsumptions = (db.igcrConsumptions || []).filter(
    c =>
      (selectedCompanyId === 'ALL' || c.companyId === selectedCompanyId) &&
      c.date >= igcrResult.startDate &&
      c.date <= igcrResult.endDate
  );

  return (
    <div className="p-6 space-y-5 max-w-[1440px] mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-2xl shadow-xs border border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <h2 className="text-base font-extrabold text-slate-900">
              IGCR Rules 2022 — In-House Consumption Register &amp; Form IGCR-3
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Track Concessional Duty Foregone, Bond Utilization, In-House Factory Consumption (Col 18A/18B/18C), Short Receipts (IGCR-2) &amp; ICEGATE Form IGCR-3 Export
          </p>
        </div>

        <div className="no-print flex flex-wrap items-center gap-2">
          {permissions.canManageIGCR && (
            <>
              <button
                onClick={handleSyncFromBOEs}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded-xl border border-slate-300"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Sync from IGCR BOEs</span>
              </button>
              <button
                onClick={openAddLot}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl border border-indigo-200"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add IGCR Lot</span>
              </button>
              <button
                onClick={() => openConsModal()}
                disabled={igcrResult.rows.length === 0}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-xs"
              >
                <Factory className="w-3.5 h-3.5" />
                <span>+ Log Consumption</span>
              </button>
            </>
          )}
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1 text-xs px-3 py-1.5 bg-slate-100 text-slate-700 font-semibold rounded-xl border border-slate-300"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print</span>
          </button>
          <button
            onClick={handleExportIGCR3}
            className="flex items-center gap-1.5 text-xs px-3.5 py-1.5 bg-slate-900 hover:bg-black text-white font-bold rounded-xl"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Form IGCR-3</span>
          </button>
        </div>
      </div>

      {notice && (
        <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-900 flex items-center justify-between">
          <span className="font-semibold">{notice}</span>
          <button onClick={() => setNotice(null)} className="font-bold">✕</button>
        </div>
      )}

      {/* Company IGCR Continuity Bond Meter */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs grid grid-cols-2 md:grid-cols-6 gap-4 items-center text-xs">
        <div>
          <span className="text-[10px] font-bold uppercase text-slate-400 block">IIN / Continuity Bond</span>
          <span className="font-bold text-slate-900 block">
            {activeCompanyMeta?.igcrIIN || 'Configure in Masters'}
          </span>
          <span className="text-[10px] text-slate-500">Bond No: {activeCompanyMeta?.igcrBondNo || '-'}</span>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase text-slate-400 block">Total Bond Limit</span>
          <span className="text-base font-extrabold font-mono text-slate-900">
            {formatINR(bondSummary.totalBondValueINR)}
          </span>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase text-amber-700 block">Active Duty Locked</span>
          <span className="text-base font-extrabold font-mono text-amber-700">
            {formatINR(bondSummary.activeDutyForegoneINR)}
          </span>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase text-emerald-700 block">Available Bond Balance</span>
          <span className="text-base font-extrabold font-mono text-emerald-700">
            {formatINR(bondSummary.availableBondINR)}
          </span>
        </div>
        <div className="col-span-2">
          <div className="flex justify-between text-[11px] font-bold mb-1">
            <span>Bond Utilization ({bondSummary.utilizationPct}%)</span>
            <span className="text-rose-700">
              {bondSummary.expiredCount} Expired • {bondSummary.expiringSoonCount} Expiring ≤60d • {bondSummary.igcr2ShortCount} Short (IGCR-2)
            </span>
          </div>
          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                bondSummary.utilizationPct > 85 ? 'bg-rose-600' : bondSummary.utilizationPct > 60 ? 'bg-amber-500' : 'bg-emerald-600'
              }`}
              style={{ width: `${Math.min(100, bondSummary.utilizationPct)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Period & Status Filters */}
      <div className="no-print bg-white p-3.5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex bg-slate-100 p-1 rounded-lg font-bold">
            <button
              onClick={() => {
                setPeriodType('monthly');
                setPeriodIndex(7);
              }}
              className={`px-3 py-1 rounded-md ${periodType === 'monthly' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600'}`}
            >
              Monthly View
            </button>
            <button
              onClick={() => {
                setPeriodType('quarterly');
                setPeriodIndex(2);
              }}
              className={`px-3 py-1 rounded-md ${periodType === 'quarterly' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600'}`}
            >
              Quarterly Statement (ICEGATE)
            </button>
          </div>

          <select value={year} onChange={e => setYear(parseInt(e.target.value, 10))} className="px-2.5 py-1.5 rounded-lg border border-slate-300 font-bold">
            {[2025, 2026, 2027].map(y => (
              <option key={y} value={y}>{periodType === 'quarterly' ? `FY ${y}-${String(y + 1).slice(-2)}` : y}</option>
            ))}
          </select>

          {periodType === 'monthly' ? (
            <select value={periodIndex} onChange={e => setPeriodIndex(parseInt(e.target.value, 10))} className="px-2.5 py-1.5 rounded-lg border border-slate-300 font-semibold">
              {MONTH_NAMES.map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
          ) : (
            <select value={periodIndex} onChange={e => setPeriodIndex(parseInt(e.target.value, 10))} className="px-2.5 py-1.5 rounded-lg border border-slate-300 font-semibold">
              <option value={1}>Q1 (Apr – Jun)</option>
              <option value={2}>Q2 (Jul – Sep)</option>
              <option value={3}>Q3 (Oct – Dec)</option>
              <option value={4}>Q4 (Jan – Mar)</option>
            </select>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'ALL', label: `All (${igcrResult.rows.length})` },
            { id: 'ACTIVE_STOCK', label: 'In Factory Stock' },
            { id: 'Expiring Soon', label: 'Expiring ≤60d' },
            { id: 'Expired', label: 'Expired' },
            { id: 'Fully Utilized', label: 'Utilized' },
            { id: 'SHORT_IGCR2', label: 'Short (IGCR-2)' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                statusFilter === f.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Form IGCR-3 Part II Table */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-50 border-b text-xs font-bold text-slate-800 flex justify-between">
          <span>FORM IGCR-3 — Part II (In-House Consumption • {igcrResult.periodLabel})</span>
          <span className="text-slate-500 font-normal">
            {formatDate(igcrResult.startDate)} to {formatDate(igcrResult.endDate)}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] text-left border-collapse">
            <thead className="bg-slate-100 text-slate-700 font-semibold uppercase border-b">
              <tr>
                <th className="px-2.5 py-2">(1-3) BE No / Date / Port</th>
                <th className="px-2.5 py-2">(6-7) Goods / HSN / End-Use</th>
                <th className="px-2.5 py-2 text-right">(8) Imported</th>
                <th className="px-2.5 py-2 text-right">(10) Ass. Value</th>
                <th className="px-2.5 py-2 text-right">(11-14) Duty Foregone</th>
                <th className="px-2.5 py-2 text-right">(15-17) Rec / Short</th>
                <th className="px-2.5 py-2 text-right">(18A) Dom Mfg</th>
                <th className="px-2.5 py-2 text-right">(18B/C) End-Use / Exp</th>
                <th className="px-2.5 py-2 text-right">(19-20) Re-Exp / Duty Clr</th>
                <th className="px-2.5 py-2 text-right bg-indigo-50/50 text-indigo-900">(21) Factory Stock</th>
                <th className="px-2.5 py-2 text-center">Deadline / Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-slate-400">
                    No IGCR lots recorded yet. Click "Sync from IGCR BOEs" or "+ Add IGCR Lot".
                  </td>
                </tr>
              ) : (
                visibleRows.map(row => {
                  const { lot } = row;
                  return (
                    <tr key={lot.id} className="hover:bg-slate-50/80">
                      <td className="px-2.5 py-2">
                        <div className="font-mono font-bold text-indigo-700">{lot.boeNo}</div>
                        <div className="text-[10px] text-slate-400">
                          {formatDate(lot.boeDate)} • {lot.portCode}
                        </div>
                      </td>
                      <td className="px-2.5 py-2 max-w-[200px]">
                        <div className="font-semibold text-slate-900 truncate">{lot.itemDescription}</div>
                        <div className="text-[10px] text-slate-400">
                          HSN {lot.hsnCode} • {lot.specifiedPurpose}
                        </div>
                      </td>
                      <td className="px-2.5 py-2 text-right font-mono">
                        {lot.qtyImported} {lot.uom}
                      </td>
                      <td className="px-2.5 py-2 text-right font-mono">{formatINR(lot.assessableValueINR)}</td>
                      <td className="px-2.5 py-2 text-right font-mono font-bold text-amber-800">
                        {formatINR(lot.totalDutyForegoneINR)}
                        <div className="text-[9px] text-slate-400 font-normal">
                          BCD: {formatINR(lot.bcdForegoneINR)}
                        </div>
                      </td>
                      <td className="px-2.5 py-2 text-right font-mono">
                        <span className="text-emerald-700 font-bold">{lot.qtyReceived}</span>
                        {lot.qtyNotReceived > 0 && (
                          <div className="text-[10px] text-rose-700 font-bold">Short: {lot.qtyNotReceived} (IGCR-2)</div>
                        )}
                      </td>
                      <td className="px-2.5 py-2 text-right font-mono font-semibold">{row.usedDomestic18A}</td>
                      <td className="px-2.5 py-2 text-right font-mono">
                        {row.usedEndUse18B} / {row.usedExport18C}
                      </td>
                      <td className="px-2.5 py-2 text-right font-mono">
                        {row.reExported19} / {row.clearedOnDuty20}
                      </td>
                      <td className="px-2.5 py-2 text-right font-mono font-extrabold text-indigo-900 bg-indigo-50/30">
                        {row.closingStockFactory21} {lot.uom}
                      </td>
                      <td className="px-2.5 py-2 text-center space-y-1">
                        <div>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              row.expiryStatus === 'Fully Utilized'
                                ? 'bg-emerald-100 text-emerald-800'
                                : row.expiryStatus === 'Expired'
                                  ? 'bg-rose-100 text-rose-800'
                                  : row.expiryStatus === 'Expiring Soon'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-sky-100 text-sky-800'
                            }`}
                          >
                            {row.expiryStatus === 'Fully Utilized' ? (
                              <>
                                <CheckCircle2 className="w-2.5 h-2.5 inline mr-0.5" /> Utilized
                              </>
                            ) : (
                              <>
                                {row.expiryStatus} ({row.daysRemaining}d)
                              </>
                            )}
                          </span>
                        </div>
                        <div className="text-[9px] text-slate-400">Due: {formatDate(row.dueDate)}</div>
                        {permissions.canManageIGCR && row.closingStockFactory21 > 0 && (
                          <button
                            onClick={() => openConsModal(lot.id)}
                            className="text-[10px] font-bold text-emerald-700 hover:underline"
                          >
                            + Consume
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {visibleRows.length > 0 && (
              <tfoot className="bg-slate-100 font-extrabold text-slate-900 border-t-2">
                <tr>
                  <td colSpan={2} className="px-2.5 py-2 text-right uppercase">
                    TOTAL ({visibleRows.length} Lots):
                  </td>
                  <td className="px-2.5 py-2 text-right font-mono">
                    {round2(visibleRows.reduce((s, r) => s + r.lot.qtyImported, 0))}
                  </td>
                  <td className="px-2.5 py-2 text-right font-mono">
                    {formatINR(round2(visibleRows.reduce((s, r) => s + r.lot.assessableValueINR, 0)))}
                  </td>
                  <td className="px-2.5 py-2 text-right font-mono text-amber-800">
                    {formatINR(round2(visibleRows.reduce((s, r) => s + r.lot.totalDutyForegoneINR, 0)))}
                  </td>
                  <td className="px-2.5 py-2 text-right font-mono">
                    {round2(visibleRows.reduce((s, r) => s + r.lot.qtyReceived, 0))}
                  </td>
                  <td className="px-2.5 py-2 text-right font-mono">
                    {round2(visibleRows.reduce((s, r) => s + r.usedDomestic18A, 0))}
                  </td>
                  <td className="px-2.5 py-2 text-right font-mono">
                    {round2(visibleRows.reduce((s, r) => s + r.usedEndUse18B + r.usedExport18C, 0))}
                  </td>
                  <td className="px-2.5 py-2 text-right font-mono">
                    {round2(visibleRows.reduce((s, r) => s + r.reExported19 + r.clearedOnDuty20, 0))}
                  </td>
                  <td className="px-2.5 py-2 text-right font-mono text-indigo-900">
                    {round2(visibleRows.reduce((s, r) => s + r.closingStockFactory21, 0))}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Period Consumption Audit Log */}
      {allPeriodConsumptions.length > 0 && (
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b text-xs font-bold text-slate-800">
            In-House Factory Consumption Log ({igcrResult.periodLabel})
          </div>
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100 text-slate-600 uppercase font-bold border-b">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">BOE No &amp; Item</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2">Production / Invoice Doc No</th>
                <th className="px-3 py-2 text-right">Diff Duty + Int</th>
                <th className="px-3 py-2 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {allPeriodConsumptions.map(c => {
                const lot = (db.igcrLots || []).find(l => l.id === c.lotId);
                return (
                  <tr key={c.id}>
                    <td className="px-3 py-2">{formatDate(c.date)}</td>
                    <td className="px-3 py-2 font-semibold">{lot?.boeNo} — {lot?.itemDescription}</td>
                    <td className="px-3 py-2">{c.type}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold">{c.qty} {lot?.uom}</td>
                    <td className="px-3 py-2">{c.documentNo || '-'}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {formatINR(round2((c.differentialDutyPaidINR || 0) + (c.interestPaidINR || 0)))}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {permissions.canManageIGCR && (
                        <button onClick={() => deleteIGCRConsumption(c.id)} className="text-rose-600 p-1 hover:bg-rose-50 rounded">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal 1: Add / Edit IGCR Lot */}
      {showLotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b bg-slate-50 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Record IGCR Inward Import Lot</h3>
              <button onClick={() => setShowLotModal(false)} className="text-slate-400 font-bold">✕</button>
            </div>
            <form onSubmit={handleSaveLot} className="p-6 overflow-y-auto space-y-3 text-xs">
              {lotError && (
                <div className="p-2.5 bg-rose-50 text-rose-700 rounded border border-rose-200 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  <span>{lotError}</span>
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Company *</label>
                  <select
                    value={lotForm.companyId}
                    onChange={e => setLotForm({ ...lotForm, companyId: e.target.value })}
                    className="w-full p-2 rounded border bg-white"
                  >
                    {db.companies.filter(c => c.active).map(c => (
                      <option key={c.id} value={c.id}>{c.code}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1">BE Number *</label>
                  <input
                    type="text"
                    value={lotForm.boeNo}
                    onChange={e => setLotForm({ ...lotForm, boeNo: e.target.value })}
                    className="w-full p-2 rounded border font-mono font-bold uppercase"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">BE / Clearance Date *</label>
                  <input
                    type="date"
                    value={lotForm.boeDate}
                    onChange={e => setLotForm({ ...lotForm, boeDate: e.target.value, clearanceDate: e.target.value })}
                    className="w-full p-2 rounded border"
                    required
                  />
                </div>
                <div className="col-span-2">
                  <label className="block font-semibold mb-1">Description of Goods *</label>
                  <input
                    type="text"
                    value={lotForm.itemDescription}
                    onChange={e => setLotForm({ ...lotForm, itemDescription: e.target.value })}
                    className="w-full p-2 rounded border"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">HSN / UOM *</label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={lotForm.hsnCode}
                      onChange={e => setLotForm({ ...lotForm, hsnCode: e.target.value })}
                      className="w-2/3 p-2 rounded border font-mono"
                      required
                    />
                    <input
                      type="text"
                      value={lotForm.uom}
                      onChange={e => setLotForm({ ...lotForm, uom: e.target.value })}
                      className="w-1/3 p-2 rounded border uppercase"
                    />
                  </div>
                </div>
                <div>
                  <label className="block font-semibold mb-1">Port / Notification</label>
                  <input
                    type="text"
                    value={lotForm.portCode}
                    onChange={e => setLotForm({ ...lotForm, portCode: e.target.value })}
                    className="w-full p-2 rounded border uppercase"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Specified End-Use</label>
                  <input
                    type="text"
                    value={lotForm.specifiedPurpose}
                    onChange={e => setLotForm({ ...lotForm, specifiedPurpose: e.target.value })}
                    className="w-full p-2 rounded border"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Assessable Value INR *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={lotForm.assessableValueINR || ''}
                    onChange={e => setLotForm({ ...lotForm, assessableValueINR: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2 rounded border font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Normal vs IGCR BCD %</label>
                  <div className="flex gap-1.5 items-center">
                    <input
                      type="number"
                      step="0.1"
                      value={lotForm.normalBcdRatePct ?? 10}
                      onChange={e => setLotForm({ ...lotForm, normalBcdRatePct: parseFloat(e.target.value) || 0 })}
                      className="w-1/2 p-2 rounded border font-mono"
                    />
                    <input
                      type="number"
                      step="0.1"
                      value={lotForm.concessionalBcdRatePct ?? 0}
                      onChange={e => setLotForm({ ...lotForm, concessionalBcdRatePct: parseFloat(e.target.value) || 0 })}
                      className="w-1/2 p-2 rounded border font-mono"
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <label className="font-semibold">BCD Foregone INR</label>
                    <button type="button" onClick={handleAutoComputeForegone} className="text-[10px] font-bold text-indigo-600 underline">
                      Auto Calc
                    </button>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    value={lotForm.bcdForegoneINR || ''}
                    onChange={e => setLotForm({ ...lotForm, bcdForegoneINR: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2 rounded border font-mono font-bold text-amber-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Other (SWS) Foregone INR</label>
                  <input
                    type="number"
                    step="0.01"
                    value={lotForm.otherDutyForegoneINR || ''}
                    onChange={e => setLotForm({ ...lotForm, otherDutyForegoneINR: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2 rounded border font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Qty Imported *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={lotForm.qtyImported || ''}
                    onChange={e => setLotForm({ ...lotForm, qtyImported: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2 rounded border font-mono font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Qty Received in Factory</label>
                  <input
                    type="number"
                    step="0.01"
                    value={lotForm.qtyReceived ?? 0}
                    onChange={e => setLotForm({ ...lotForm, qtyReceived: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2 rounded border font-mono font-bold text-emerald-700"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Receipt Date / Months Limit</label>
                  <div className="flex gap-1.5">
                    <input
                      type="date"
                      value={lotForm.receiptDate || ''}
                      onChange={e => setLotForm({ ...lotForm, receiptDate: e.target.value })}
                      className="w-2/3 p-2 rounded border"
                    />
                    <input
                      type="number"
                      min="1"
                      value={lotForm.utilizationMonths || 6}
                      onChange={e => setLotForm({ ...lotForm, utilizationMonths: parseInt(e.target.value, 10) || 6 })}
                      className="w-1/3 p-2 rounded border text-center"
                      title="Utilization Window in Months"
                    />
                  </div>
                </div>
              </div>
              <div className="pt-3 border-t flex justify-end space-x-2">
                <button type="button" onClick={() => setShowLotModal(false)} className="px-4 py-2 bg-slate-100 rounded-lg font-semibold">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700">Save IGCR Lot</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Log In-House Consumption */}
      {showConsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Factory className="w-4 h-4 text-emerald-600" />
                <span>Log In-House Factory IGCR Consumption</span>
              </h3>
              <button onClick={() => setShowConsModal(false)} className="text-slate-400 font-bold">✕</button>
            </div>
            {consError && (
              <div className="p-2.5 bg-rose-50 text-rose-700 rounded border border-rose-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{consError}</span>
              </div>
            )}
            <form onSubmit={handleSaveConsumption} className="space-y-3">
              <div>
                <label className="block font-semibold mb-1">IGCR Lot (BOE &amp; Available Factory Stock) *</label>
                <select
                  value={consForm.lotId}
                  onChange={e => {
                    const row = igcrResult.rows.find(r => r.lot.id === e.target.value);
                    setConsForm({
                      ...consForm,
                      lotId: e.target.value,
                      qty: row ? row.closingStockFactory21 : 0,
                    });
                  }}
                  className="w-full p-2 rounded border bg-white font-semibold"
                  required
                >
                  {igcrResult.rows.map(r => (
                    <option key={r.lot.id} value={r.lot.id}>
                      BOE {r.lot.boeNo} — {r.lot.itemDescription} (Avail: {r.closingStockFactory21} {r.lot.uom})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Consumption Date *</label>
                  <input
                    type="date"
                    value={consForm.date}
                    onChange={e => setConsForm({ ...consForm, date: e.target.value })}
                    className="w-full p-2 rounded border"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Quantity *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={consForm.qty || ''}
                    onChange={e => setConsForm({ ...consForm, qty: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2 rounded border font-mono font-bold"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">Utilization / Disposal Category *</label>
                <select
                  value={consForm.type}
                  onChange={e => setConsForm({ ...consForm, type: e.target.value as IGCRConsumptionType })}
                  className="w-full p-2 rounded border bg-white font-semibold"
                >
                  <option value="MANUFACTURE_DOMESTIC">(18A) Used for Manufacturing — Domestic Supply</option>
                  <option value="END_USE_SUPPLY">(18B) Supplied to Specified End-Use Recipient</option>
                  <option value="MANUFACTURE_EXPORT">(18C) Used for Manufacturing — Export Goods</option>
                  <option value="RE_EXPORT">(19) Unutilized Goods Re-Exported</option>
                  <option value="CLEARED_ON_DUTY">(20) Cleared on Paying Differential Duty + Interest</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1">Production Batch / Tax Invoice / Shipping Bill Ref</label>
                <input
                  type="text"
                  value={consForm.documentNo}
                  onChange={e => setConsForm({ ...consForm, documentNo: e.target.value })}
                  placeholder="e.g. BATCH-2608 / INV-441"
                  className="w-full p-2 rounded border"
                />
              </div>

              {consForm.type === 'CLEARED_ON_DUTY' && (
                <div className="grid grid-cols-2 gap-3 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                  <div>
                    <label className="block font-semibold mb-1">Differential Duty Paid INR</label>
                    <input
                      type="number"
                      step="0.01"
                      value={consForm.differentialDutyPaidINR || ''}
                      onChange={e =>
                        setConsForm({ ...consForm, differentialDutyPaidINR: parseFloat(e.target.value) || 0 })
                      }
                      className="w-full p-1.5 rounded border bg-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1">Interest Paid INR</label>
                    <input
                      type="number"
                      step="0.01"
                      value={consForm.interestPaidINR || ''}
                      onChange={e => setConsForm({ ...consForm, interestPaidINR: parseFloat(e.target.value) || 0 })}
                      className="w-full p-1.5 rounded border bg-white font-mono"
                    />
                  </div>
                </div>
              )}

              <div className="pt-3 border-t flex justify-end space-x-2">
                <button type="button" onClick={() => setShowConsModal(false)} className="px-4 py-2 bg-slate-100 rounded-lg font-semibold">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700">
                  Save Consumption Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
