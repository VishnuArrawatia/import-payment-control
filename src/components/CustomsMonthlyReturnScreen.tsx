import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { formatFC, formatINR, formatDate, round2 } from '../utils/formatters';
import { exportMultiSheetExcel } from '../utils/excel';
import { computeCustomsMonthlyReturn } from '../utils/purchaseEngine';
import {
  FileBarChart2,
  Download,
  Printer,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Ship,
} from 'lucide-react';

type ReturnTab = 'part_a' | 'part_b' | 'part_c';

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

export const CustomsMonthlyReturnScreen: React.FC = () => {
  const { db, engineResult, selectedCompanyId, asOfDate } = useApp();

  const [periodType, setPeriodType] = useState<'monthly' | 'quarterly'>('monthly');
  const [year, setYear] = useState<number>(2026);
  const [periodIndex, setPeriodIndex] = useState<number>(7); // July 2026 default
  const [portFilter, setPortFilter] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<ReturnTab>('part_a');

  const availablePorts = useMemo(() => {
    const s = new Set<string>();
    for (const ci of db.commercialInvoices) {
      if (ci.portCode) s.add(ci.portCode.trim().toUpperCase());
    }
    return Array.from(s).sort();
  }, [db.commercialInvoices]);

  const ret = useMemo(
    () =>
      computeCustomsMonthlyReturn(
        db,
        engineResult,
        periodType,
        year,
        periodIndex,
        selectedCompanyId,
        portFilter,
        asOfDate
      ),
    [db, engineResult, periodType, year, periodIndex, selectedCompanyId, portFilter, asOfDate]
  );

  const handleExportReturn = () => {
    const summarySheet = [
      { Metric: 'Return Period', Value: ret.periodLabel },
      { Metric: 'Date Range', Value: `${formatDate(ret.startDate)} to ${formatDate(ret.endDate)}` },
      { Metric: 'Company Filter', Value: selectedCompanyId === 'ALL' ? 'ALL' : db.companies.find(c => c.id === selectedCompanyId)?.code || selectedCompanyId },
      { Metric: 'Port Filter', Value: portFilter },
      { Metric: 'Total BOEs Filed', Value: ret.partA.boeCount },
      { Metric: 'Tax Invoice Value (INR)', Value: ret.partA.taxInvoiceValueINR },
      { Metric: 'Total BOE Assessable Value (INR)', Value: ret.partA.assessableValueINR },
      { Metric: 'Custom Duty / BCD (INR)', Value: ret.partA.bcdINR },
      { Metric: 'SWS (INR)', Value: ret.partA.swsINR },
      { Metric: 'IGST Paid - GSTR-2B ITC Eligible (INR)', Value: ret.partA.igstItcINR },
      { Metric: 'Total Customs Duty Outflow (INR)', Value: ret.partA.totalTaxINR },
      { Metric: 'Outward Remittances in Period (INR)', Value: ret.partB.remittanceINR },
      { Metric: 'RBI Advances >= 180 Days Breach Count', Value: ret.partB.breach180Count },
      { Metric: 'Upcoming Planned Duty (INR)', Value: ret.partC.upcomingDutyINR },
    ];

    const boeSheet = ret.partA.boeRows.map(r => ({
      Company: r.companyCode,
      Supplier: r.supplierName,
      'BOE No': r.boeNo,
      'BOE Date': formatDate(r.boeDate),
      'Invoice No': r.ciNo,
      'Invoice Date': formatDate(r.ciDate),
      Port: r.portCode,
      Currency: r.currency,
      'Invoice FC': r.ciValueFC,
      'Tax Invoice Value INR': r.taxInvoiceValueINR,
      'Assessable Value INR': r.assessableValueINR,
      'BCD INR': r.bcdINR,
      'SWS INR': r.swsINR,
      'IGST INR (ITC)': r.igstINR,
      'Total Tax INR': r.totalTaxINR,
      'Tax Paid Date': r.taxPaidDate ? formatDate(r.taxPaidDate) : 'Pending',
      Status: r.status,
      IDPMS: r.idpmsStatus,
    }));

    const hsnSheet = ret.partA.hsnSummary.map(h => ({
      'HSN Code': h.hsnCode,
      Description: h.description,
      UOM: h.uom,
      'Total Qty': h.totalQty,
      'Assessable Value INR': h.assessableValueINR,
      'BCD INR': h.bcdINR,
      'SWS INR': h.swsINR,
      'IGST INR': h.igstINR,
      'Total Tax INR': h.totalTaxINR,
    }));

    const idpmsSheet = ret.partB.advancesOver150Days.map(a => ({
      Company: a.companyCode,
      Supplier: a.supplierName,
      'Bank Ref': a.bankRef,
      'Payment Date': formatDate(a.paymentDate),
      Currency: a.currency,
      'Unapplied FC': a.remainingFC,
      'Age Days': a.ageDays,
      Compliance: a.isBreach180 ? 'RBI 180-Day Breach' : '150+ Days Warning',
    }));

    const upcomingSheet = ret.partC.upcomingShipments.map(s => ({
      Company: db.companies.find(c => c.id === s.companyId)?.code || '',
      Supplier: db.suppliers.find(sup => sup.id === s.supplierId)?.supplierName || '',
      'Shipment Ref': s.shipmentRefNo,
      Port: s.portCode,
      'ETA Port': s.etaPortDate ? formatDate(s.etaPortDate) : '-',
      'Expected Duty Date': s.expectedDutyDate ? formatDate(s.expectedDutyDate) : '-',
      'Est Assessable INR': s.estimatedAssessableINR,
      'Est BCD + SWS INR': round2(s.estimatedBcdINR + s.estimatedSwsINR),
      'Est IGST INR': s.estimatedIgstINR,
      'Est Total Duty INR': s.estimatedTotalDutyINR,
      Status: s.status,
    }));

    exportMultiSheetExcel(
      [
        { name: 'Summary', data: summarySheet },
        { name: 'BOE_Details', data: boeSheet },
        { name: 'HSN_Summary', data: hsnSheet },
        { name: 'IDPMS_Status', data: idpmsSheet },
        { name: 'Upcoming_Duty', data: upcomingSheet },
      ],
      `Customs_Monthly_Return_${ret.periodLabel.replace(/\s+/g, '_')}`
    );
  };

  return (
    <div className="p-6 space-y-5 max-w-[1440px] mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-2xl shadow-xs border border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <FileBarChart2 className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-extrabold text-slate-900">
              Customs Monthly / Quarterly Return &amp; GSTR-2B Reconciliation
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Monthly Customs BOE summary, HSN-wise duty breakup, IGST ITC credit (GSTR-2B), RBI IDPMS 180-day compliance &amp; next-month duty forecast
          </p>
        </div>

        <div className="no-print flex items-center space-x-2">
          <button
            onClick={() => window.print()}
            className="flex items-center space-x-1.5 text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl border border-slate-300"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print / PDF</span>
          </button>

          <button
            onClick={handleExportReturn}
            className="flex items-center space-x-1.5 text-xs px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Multi-Sheet Return (Excel)</span>
          </button>
        </div>
      </div>

      {/* Period Filter Bar */}
      <div className="no-print bg-white p-3.5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-slate-100 p-1 rounded-lg font-bold">
            <button
              onClick={() => {
                setPeriodType('monthly');
                setPeriodIndex(7);
              }}
              className={`px-3 py-1 rounded-md ${periodType === 'monthly' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600'}`}
            >
              Monthly Return
            </button>
            <button
              onClick={() => {
                setPeriodType('quarterly');
                setPeriodIndex(2);
              }}
              className={`px-3 py-1 rounded-md ${periodType === 'quarterly' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600'}`}
            >
              Quarterly Return (FY)
            </button>
          </div>

          <select
            value={year}
            onChange={e => setYear(parseInt(e.target.value, 10))}
            className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-bold"
          >
            {[2025, 2026, 2027].map(y => (
              <option key={y} value={y}>{periodType === 'quarterly' ? `FY ${y}-${String(y + 1).slice(-2)}` : y}</option>
            ))}
          </select>

          {periodType === 'monthly' ? (
            <select
              value={periodIndex}
              onChange={e => setPeriodIndex(parseInt(e.target.value, 10))}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold"
            >
              {MONTH_NAMES.map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
          ) : (
            <select
              value={periodIndex}
              onChange={e => setPeriodIndex(parseInt(e.target.value, 10))}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold"
            >
              <option value={1}>Q1 (Apr – Jun)</option>
              <option value={2}>Q2 (Jul – Sep)</option>
              <option value={3}>Q3 (Oct – Dec)</option>
              <option value={4}>Q4 (Jan – Mar)</option>
            </select>
          )}

          <select
            value={portFilter}
            onChange={e => setPortFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
          >
            <option value="ALL">All Customs Ports ({availablePorts.length})</option>
            {availablePorts.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        <span className="text-[11px] font-bold text-slate-500">
          Period: <strong className="text-slate-900">{ret.periodLabel}</strong> ({formatDate(ret.startDate)} – {formatDate(ret.endDate)})
        </span>
      </div>

      {/* 6 KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200">
          <p className="text-[10px] font-bold uppercase text-slate-400">BOEs Filed</p>
          <p className="text-xl font-extrabold text-slate-900 mt-0.5">{ret.partA.boeCount}</p>
          <p className="text-[10px] text-slate-500">{ret.partA.taxPaidCount} Paid • {ret.partA.taxPendingCount} Pending</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200">
          <p className="text-[10px] font-bold uppercase text-slate-400">Assessable Value</p>
          <p className="text-base font-extrabold font-mono text-indigo-700 mt-0.5">{formatINR(ret.partA.assessableValueINR)}</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200">
          <p className="text-[10px] font-bold uppercase text-slate-400">BCD + SWS (Landed)</p>
          <p className="text-base font-extrabold font-mono text-amber-700 mt-0.5">
            {formatINR(round2(ret.partA.bcdINR + ret.partA.swsINR))}
          </p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/40">
          <p className="text-[10px] font-bold uppercase text-emerald-800">IGST Paid (GSTR-2B ITC)</p>
          <p className="text-base font-extrabold font-mono text-emerald-700 mt-0.5">{formatINR(ret.partA.igstItcINR)}</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200">
          <p className="text-[10px] font-bold uppercase text-slate-400">Total Duty Outflow</p>
          <p className="text-base font-extrabold font-mono text-slate-900 mt-0.5">{formatINR(ret.partA.totalTaxINR)}</p>
        </div>
        <div className={`bg-white p-3.5 rounded-xl border ${ret.partB.breach180Count > 0 ? 'border-rose-300 bg-rose-50/40' : 'border-slate-200'}`}>
          <p className="text-[10px] font-bold uppercase text-slate-500">Remittances / 180d Alert</p>
          <p className="text-base font-extrabold font-mono text-slate-900 mt-0.5">{ret.partB.remittanceCount} Txns</p>
          <p className={`text-[10px] font-bold ${ret.partB.breach180Count > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
            {ret.partB.breach180Count} RBI ≥180d Alerts
          </p>
        </div>
      </div>

      {/* Sub-Tabs */}
      <div className="no-print flex flex-wrap gap-2">
        {[
          { id: 'part_a' as const, label: `Part A: BOE, IGST ITC & HSN Summary (${ret.partA.boeCount})` },
          { id: 'part_b' as const, label: `Part B: Remittances vs BOE & 180d IDPMS Alerts (${ret.partB.advancesOver150Days.length})` },
          { id: 'part_c' as const, label: `Part C: Upcoming Planned Duty Forecast (${ret.partC.upcomingShipments.length})` },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
              activeTab === t.id ? 'bg-indigo-600 text-white shadow-xs' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'part_a' && (
        <div className="space-y-5">
          {/* BOE Details */}
          <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b font-bold text-xs text-slate-800 uppercase tracking-wider">
              Part A1: Bill of Entry Details &amp; IGST Credit Eligibility ({ret.periodLabel})
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-semibold uppercase border-b">
                  <tr>
                    <th className="px-3 py-2">Company / Supplier</th>
                    <th className="px-3 py-2">BOE No &amp; Date</th>
                    <th className="px-3 py-2">Invoice No</th>
                    <th className="px-3 py-2 text-right">Assessable INR</th>
                    <th className="px-3 py-2 text-right">BCD INR</th>
                    <th className="px-3 py-2 text-right">SWS INR</th>
                    <th className="px-3 py-2 text-right text-emerald-800">IGST (ITC)</th>
                    <th className="px-3 py-2 text-right">Total Tax</th>
                    <th className="px-3 py-2">Tax Paid Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ret.partA.boeRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                        No BOEs recorded in {ret.periodLabel}.
                      </td>
                    </tr>
                  ) : (
                    ret.partA.boeRows.map(r => (
                      <tr key={r.ciId} className="hover:bg-slate-50/80">
                        <td className="px-3 py-2">
                          <span className="font-bold text-slate-900">{r.companyCode}</span> • {r.supplierName}
                          <div className="text-[10px] text-slate-400">Port: {r.portCode}</div>
                        </td>
                        <td className="px-3 py-2 font-mono font-bold text-indigo-700">
                          {r.boeNo} <span className="text-slate-400 font-normal">({formatDate(r.boeDate)})</span>
                        </td>
                        <td className="px-3 py-2 font-semibold">{r.ciNo}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatINR(r.assessableValueINR)}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatINR(r.bcdINR)}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatINR(r.swsINR)}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700">{formatINR(r.igstINR)}</td>
                        <td className="px-3 py-2 text-right font-mono font-extrabold text-slate-900">{formatINR(r.totalTaxINR)}</td>
                        <td className="px-3 py-2">
                          {r.taxPaidDate ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                              {formatDate(r.taxPaidDate)}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                              {r.status}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* HSN Summary */}
          <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b font-bold text-xs text-slate-800 uppercase tracking-wider">
              Part A2: HSN-wise Customs Duty &amp; IGST Summary
            </div>
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-semibold uppercase border-b">
                <tr>
                  <th className="px-3 py-2">HSN Code</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2 text-right">Qty / UOM</th>
                  <th className="px-3 py-2 text-right">Assessable INR</th>
                  <th className="px-3 py-2 text-right">BCD INR</th>
                  <th className="px-3 py-2 text-right">SWS INR</th>
                  <th className="px-3 py-2 text-right">IGST INR</th>
                  <th className="px-3 py-2 text-right">Total Tax INR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ret.partA.hsnSummary.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-slate-400">No HSN data for this period.</td>
                  </tr>
                ) : (
                  ret.partA.hsnSummary.map(h => (
                    <tr key={h.hsnCode}>
                      <td className="px-3 py-2 font-mono font-bold text-indigo-700">{h.hsnCode}</td>
                      <td className="px-3 py-2">{h.description}</td>
                      <td className="px-3 py-2 text-right font-mono">{h.totalQty} {h.uom}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatINR(h.assessableValueINR)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatINR(h.bcdINR)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatINR(h.swsINR)}</td>
                      <td className="px-3 py-2 text-right font-mono text-emerald-700 font-bold">{formatINR(h.igstINR)}</td>
                      <td className="px-3 py-2 text-right font-mono font-extrabold">{formatINR(h.totalTaxINR)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'part_b' && (
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b flex items-center justify-between text-xs">
            <span className="font-bold text-slate-800 uppercase tracking-wider">
              RBI FEMA / IDPMS Compliance — Open Advance Remittances Aged ≥ 150 Days (as of {formatDate(asOfDate)})
            </span>
            <span className="font-semibold text-slate-600">
              Period Remittances: <strong>{formatINR(ret.partB.remittanceINR)}</strong> | BOE Settled/Submitted:{' '}
              <strong>{ret.partB.idpmsSettledCount}</strong> / {ret.partA.boeCount}
            </span>
          </div>
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-100 text-slate-700 font-semibold uppercase border-b">
              <tr>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Supplier</th>
                <th className="px-3 py-2">Bank Ref</th>
                <th className="px-3 py-2">Payment Date</th>
                <th className="px-3 py-2 text-right">Unapplied FC</th>
                <th className="px-3 py-2 text-right">Age (Days)</th>
                <th className="px-3 py-2 text-center">RBI Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ret.partB.advancesOver150Days.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-emerald-700 font-semibold">
                    <CheckCircle2 className="w-4 h-4 inline mr-1" /> Zero open advance remittances aged 150+ days.
                  </td>
                </tr>
              ) : (
                ret.partB.advancesOver150Days.map(a => (
                  <tr key={a.paymentId} className={a.isBreach180 ? 'bg-rose-50/50' : ''}>
                    <td className="px-3 py-2 font-bold">{a.companyCode}</td>
                    <td className="px-3 py-2 font-semibold">{a.supplierName}</td>
                    <td className="px-3 py-2 font-mono">{a.bankRef}</td>
                    <td className="px-3 py-2">{formatDate(a.paymentDate)}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold">
                      {formatFC(a.remainingFC)} {a.currency}
                    </td>
                    <td className="px-3 py-2 text-right font-extrabold text-rose-700">{a.ageDays}d</td>
                    <td className="px-3 py-2 text-center">
                      {a.isBreach180 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold">
                          <AlertTriangle className="w-3 h-3" />
                          <span>RBI 180d Breach</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                          <Clock className="w-3 h-3" />
                          <span>Approaching 180d</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'part_c' && (
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b flex items-center justify-between text-xs">
            <span className="font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Ship className="w-4 h-4 text-indigo-600" />
              <span>Upcoming Planned Customs Duty Liability (Active In-Transit Shipments)</span>
            </span>
            <span className="font-extrabold text-amber-800 font-mono">
              Total Expected Outflow: {formatINR(ret.partC.upcomingDutyINR)}
            </span>
          </div>
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-100 text-slate-700 font-semibold uppercase border-b">
              <tr>
                <th className="px-3 py-2">Company / Supplier</th>
                <th className="px-3 py-2">Shipment Ref</th>
                <th className="px-3 py-2">Port / Mode</th>
                <th className="px-3 py-2">ETA Port</th>
                <th className="px-3 py-2">Expected Duty Date</th>
                <th className="px-3 py-2 text-right">Est. Assessable INR</th>
                <th className="px-3 py-2 text-right">Est. BCD + SWS</th>
                <th className="px-3 py-2 text-right">Est. IGST (ITC)</th>
                <th className="px-3 py-2 text-right">Total Duty Outflow</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ret.partC.upcomingShipments.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                    No active planned/in-transit shipments queued for duty payment.
                  </td>
                </tr>
              ) : (
                ret.partC.upcomingShipments.map(s => (
                  <tr key={s.id}>
                    <td className="px-3 py-2 font-semibold">
                      {db.companies.find(c => c.id === s.companyId)?.code} •{' '}
                      {db.suppliers.find(sup => sup.id === s.supplierId)?.supplierName}
                    </td>
                    <td className="px-3 py-2 font-mono font-bold text-indigo-700">{s.shipmentRefNo}</td>
                    <td className="px-3 py-2">{s.portCode} ({s.mode})</td>
                    <td className="px-3 py-2">{formatDate(s.etaPortDate)}</td>
                    <td className="px-3 py-2 font-bold text-amber-800">{formatDate(s.expectedDutyDate)}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatINR(s.estimatedAssessableINR)}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatINR(round2(s.estimatedBcdINR + s.estimatedSwsINR))}</td>
                    <td className="px-3 py-2 text-right font-mono text-emerald-700">{formatINR(s.estimatedIgstINR)}</td>
                    <td className="px-3 py-2 text-right font-mono font-extrabold text-slate-900">{formatINR(s.estimatedTotalDutyINR)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
