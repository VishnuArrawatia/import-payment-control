import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { ShipmentPlan, ShipmentItemLine } from '../types';
import { formatFC, formatINR, formatDate, round2 } from '../utils/formatters';
import { exportToExcel } from '../utils/excel';
import { computeShipmentDutyEstimate } from '../utils/purchaseEngine';
import {
  Ship,
  Plus,
  Download,
  Search,
  CheckCircle2,
  PackageCheck,
  Edit3,
  AlertCircle,
  Clock,
} from 'lucide-react';

function addDaysISO(dateStr: string, days: number): string {
  if (!dateStr) return '';
  const dt = new Date(`${dateStr}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().split('T')[0];
}

export const ShipmentPlannerScreen: React.FC = () => {
  const { db, materialBalances, engineResult, selectedCompanyId, saveShipment, markShipmentReceived } = useApp();
  const { permissions } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [modeFilter, setModeFilter] = useState('ALL');
  const [portFilter, setPortFilter] = useState('ALL');
  const [detentionFilter, setDetentionFilter] = useState<'ALL' | 'ALERT' | 'EXPIRED'>('ALL');
  const [etaFrom, setEtaFrom] = useState('');
  const [etaTo, setEtaTo] = useState('');

  // Add / Edit Shipment Modal
  const [showModal, setShowModal] = useState(false);
  const [editingShp, setEditingShp] = useState<ShipmentPlan | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<ShipmentPlan>>({
    companyId: selectedCompanyId !== 'ALL' ? selectedCompanyId : db.companies[0]?.id || '',
    piId: '',
    supplierId: '',
    currency: 'USD',
    shipmentRefNo: '',
    mode: 'Sea',
    dispatchDate: new Date().toISOString().split('T')[0],
    etaPortDate: '',
    expectedDutyDate: '',
    expectedDeliveryDate: '',
    portCode: 'INNSA1',
    blAwbNo: '',
    containerNo: '',
    estimatedExchangeRate: 95.0,
    status: 'Dispatched',
    items: [],
    remarks: '',
  });

  // Partial / GRN Receive Modal
  const [receivingShp, setReceivingShp] = useState<ShipmentPlan | null>(null);
  const [recDate, setRecDate] = useState(new Date().toISOString().split('T')[0]);
  const [recGrn, setRecGrn] = useState('');
  const [recLines, setRecLines] = useState<Array<{ lineId: string; receivedQty: number; shortQty: number }>>([]);
  const [recError, setRecError] = useState<string | null>(null);

  const scopedShipments = useMemo(
    () => (db.shipments || []).filter(s => selectedCompanyId === 'ALL' || s.companyId === selectedCompanyId),
    [db.shipments, selectedCompanyId]
  );

  const availablePorts = useMemo(() => {
    const s = new Set<string>();
    for (const shp of scopedShipments) {
      if (shp.portCode) s.add(shp.portCode.toUpperCase());
    }
    return Array.from(s).sort();
  }, [scopedShipments]);

  const filteredShipments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return scopedShipments.filter(s => {
      if (supplierFilter !== 'ALL' && s.supplierId !== supplierFilter) return false;
      if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
      if (modeFilter !== 'ALL' && s.mode !== modeFilter) return false;
      if (portFilter !== 'ALL' && (s.portCode || '').toUpperCase() !== portFilter) return false;
      if (detentionFilter !== 'ALL') {
        const risk = engineResult.containerDetentionRisks.find(r => r.shipmentId === s.id);
        if (!risk) return false;
        if (detentionFilter === 'EXPIRED' && risk.riskLevel !== 'Expired') return false;
        if (detentionFilter === 'ALERT' && risk.riskLevel !== 'Expired' && risk.riskLevel !== 'Critical' && risk.riskLevel !== 'Warning') return false;
      }
      if (etaFrom && (!s.etaPortDate || s.etaPortDate < etaFrom)) return false;
      if (etaTo && (!s.etaPortDate || s.etaPortDate > etaTo)) return false;
      if (q) {
        const pi = db.proformaInvoices.find(p => p.id === s.piId);
        const supp = db.suppliers.find(sup => sup.id === s.supplierId);
        const itemStr = s.items.map(i => `${i.itemCode} ${i.itemName}`).join(' ');
        const hay = `${s.shipmentRefNo} ${s.blAwbNo || ''} ${pi?.piNo || ''} ${supp?.supplierName || ''} ${itemStr}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [scopedShipments, supplierFilter, statusFilter, modeFilter, portFilter, etaFrom, etaTo, searchQuery, db.proformaInvoices, db.suppliers]);

  const availablePIs = db.proformaInvoices.filter(
    p => !formData.companyId || p.companyId === formData.companyId
  );

  const loadPiIntoForm = (piId: string) => {
    const pi = db.proformaInvoices.find(p => p.id === piId);
    if (!pi) return;
    const piBalance = materialBalances.piBalances.find(b => b.pi.id === pi.id);

    let items: ShipmentItemLine[] = [];
    if (pi.items && pi.items.length > 0) {
      items = pi.items.map(line => {
        const balRow = piBalance?.itemLines.find(r => r.lineId === line.lineId);
        const remQty = balRow ? Math.max(0, round2(line.orderedQty - balRow.receivedQty - balRow.inTransitQty)) : line.orderedQty;
        const disp = remQty > 0 ? remQty : line.orderedQty;
        return {
          lineId: `SHPI-${Date.now()}-${Math.floor(Math.random() * 10000)}-${line.lineId}`,
          piLineId: line.lineId,
          itemId: line.itemId,
          itemCode: line.itemCode,
          itemName: line.itemName,
          supplierItemCode: line.supplierItemCode,
          supplierItemName: line.supplierItemName,
          hsnCode: line.hsnCode,
          uom: line.uom,
          dispatchedQty: disp,
          unitPriceFC: line.unitPriceFC,
          amountFC: round2(disp * line.unitPriceFC),
          bcdRatePct: line.bcdRatePct,
          igstRatePct: line.igstRatePct,
          igcrEligible: line.igcrEligible,
          igcrBcdRatePct: line.igcrBcdRatePct,
          receivedQty: 0,
          shortQty: 0,
        };
      });
    } else {
      items = [
        {
          lineId: `SHPI-${Date.now()}`,
          itemCode: pi.piNo,
          itemName: pi.remarks || `Goods against ${pi.piNo}`,
          hsnCode: '8504',
          uom: 'LOT',
          dispatchedQty: 1,
          unitPriceFC: pi.piValueFC,
          amountFC: pi.piValueFC,
          bcdRatePct: 7.5,
          igstRatePct: 18,
          igcrEligible: false,
          igcrBcdRatePct: 0,
          receivedQty: 0,
          shortQty: 0,
        },
      ];
    }

    const dispDate = formData.dispatchDate || new Date().toISOString().split('T')[0];
    const eta = pi.expectedShipmentDate || addDaysISO(dispDate, 14);

    setFormData(prev => ({
      ...prev,
      companyId: pi.companyId,
      piId: pi.id,
      supplierId: pi.supplierId,
      currency: pi.currency,
      etaPortDate: eta,
      expectedDutyDate: addDaysISO(eta, 2),
      expectedDeliveryDate: addDaysISO(eta, 4),
      items,
    }));
  };

  const openAddShipment = () => {
    const compId = selectedCompanyId !== 'ALL' ? selectedCompanyId : db.companies[0]?.id || '';
    const nextNum = String((db.shipments || []).length + 1).padStart(3, '0');
    const firstPi = db.proformaInvoices.find(p => p.companyId === compId && !p.isClosed);
    const today = new Date().toISOString().split('T')[0];

    setEditingShp(null);
    setModalError(null);
    setFormData({
      companyId: compId,
      piId: firstPi?.id || '',
      supplierId: firstPi?.supplierId || '',
      currency: firstPi?.currency || 'USD',
      shipmentRefNo: `SHP-2627-${nextNum}`,
      mode: 'Sea',
      dispatchDate: today,
      etaPortDate: addDaysISO(today, 14),
      expectedDutyDate: addDaysISO(today, 16),
      expectedDeliveryDate: addDaysISO(today, 18),
      portCode: 'INNSA1',
      blAwbNo: '',
      containerNo: '',
      shippingLine: 'COSCO Shipping',
      containerType: '40ft HQ',
      freeDetentionDays: 14,
      portFreeDemurrageDays: 5,
      dischargeDate: '',
      emptyReturnedDate: '',
      estimatedExchangeRate: 95.0,
      status: 'Dispatched',
      items: [],
      remarks: '',
    });
    if (firstPi) {
      setTimeout(() => loadPiIntoForm(firstPi.id), 0);
    }
    setShowModal(true);
  };

  const openEditShipment = (shp: ShipmentPlan) => {
    setEditingShp(shp);
    setModalError(null);
    setFormData({ ...shp, items: shp.items.map(i => ({ ...i })) });
    setShowModal(true);
  };

  const modalDutyEstimate = useMemo(
    () => computeShipmentDutyEstimate(formData.items || [], Number(formData.estimatedExchangeRate || 0)),
    [formData.items, formData.estimatedExchangeRate]
  );

  const handleSaveShipment = (e: React.FormEvent) => {
    e.preventDefault();
    const lines = (formData.items || []).filter(i => Number(i.dispatchedQty) > 0);
    if (!formData.companyId || !formData.piId || !formData.shipmentRefNo?.trim() || lines.length === 0) {
      setModalError('PI, Shipment Ref No, and at least one item line with Dispatched Qty > 0 are required.');
      return;
    }

    const now = new Date().toISOString();
    const payload: ShipmentPlan = {
      id: editingShp ? editingShp.id : `SHP-${Date.now()}`,
      companyId: formData.companyId!,
      supplierId: formData.supplierId!,
      piId: formData.piId!,
      currency: formData.currency || 'USD',
      shipmentRefNo: formData.shipmentRefNo!.trim().toUpperCase(),
      mode: (formData.mode as ShipmentPlan['mode']) || 'Sea',
      dispatchDate: formData.dispatchDate || undefined,
      etaPortDate: formData.etaPortDate || undefined,
      expectedDutyDate: formData.expectedDutyDate || undefined,
      expectedDeliveryDate: formData.expectedDeliveryDate || undefined,
      portCode: (formData.portCode || 'INNSA1').trim().toUpperCase(),
      blAwbNo: formData.blAwbNo?.trim() || undefined,
      containerNo: formData.containerNo?.trim() || undefined,
      shippingLine: formData.shippingLine?.trim() || undefined,
      containerType: formData.containerType || '40ft HQ',
      freeDetentionDays: Number(formData.freeDetentionDays ?? 14),
      portFreeDemurrageDays: Number(formData.portFreeDemurrageDays ?? 5),
      dischargeDate: formData.dischargeDate || undefined,
      emptyReturnedDate: formData.emptyReturnedDate || undefined,
      estimatedExchangeRate: Number(formData.estimatedExchangeRate || 95),
      estimatedAssessableINR: modalDutyEstimate.assessableINR,
      estimatedBcdINR: modalDutyEstimate.bcdINR,
      estimatedSwsINR: modalDutyEstimate.swsINR,
      estimatedIgstINR: modalDutyEstimate.igstINR,
      estimatedTotalDutyINR: modalDutyEstimate.totalDutyINR,
      status: (formData.status as ShipmentPlan['status']) || 'Dispatched',
      actualReceiptDate: formData.actualReceiptDate,
      grnNo: formData.grnNo,
      linkedCiId: formData.linkedCiId,
      items: lines.map(i => ({ ...i, amountFC: round2(Number(i.dispatchedQty) * Number(i.unitPriceFC)) })),
      remarks: formData.remarks?.trim() || undefined,
      createdAt: editingShp?.createdAt || now,
      updatedAt: now,
    };

    const res = saveShipment(payload);
    if (!res.success) {
      setModalError(res.error || 'Failed to save shipment plan.');
      return;
    }
    setShowModal(false);
  };

  const handleOneClickReceive = (shp: ShipmentPlan) => {
    const today = new Date().toISOString().split('T')[0];
    if (!window.confirm(`Mark ALL items in ${shp.shipmentRefNo} as Received today (${formatDate(today)})?`)) return;
    markShipmentReceived(shp.id, { actualReceiptDate: today });
  };

  const openPartialReceiveModal = (shp: ShipmentPlan) => {
    setReceivingShp(shp);
    setRecDate(shp.actualReceiptDate || new Date().toISOString().split('T')[0]);
    setRecGrn(shp.grnNo || '');
    setRecLines(
      shp.items.map(i => ({
        lineId: i.lineId,
        receivedQty: i.receivedQty > 0 ? i.receivedQty : i.dispatchedQty,
        shortQty: i.shortQty || 0,
      }))
    );
    setRecError(null);
  };

  const handleConfirmPartialReceive = (e: React.FormEvent) => {
    e.preventDefault();
    if (!receivingShp || !recDate) {
      setRecError('Receipt date is required.');
      return;
    }
    const res = markShipmentReceived(receivingShp.id, {
      actualReceiptDate: recDate,
      grnNo: recGrn,
      itemReceipts: recLines,
    });
    if (!res.success) {
      setRecError(res.error || 'Failed to update receipt.');
      return;
    }
    setReceivingShp(null);
  };

  const handleExport = () => {
    exportToExcel(
      filteredShipments.map(s => {
        const comp = db.companies.find(c => c.id === s.companyId);
        const supp = db.suppliers.find(sup => sup.id === s.supplierId);
        const pi = db.proformaInvoices.find(p => p.id === s.piId);
        return {
          Company: comp?.code || '',
          Supplier: supp?.supplierName || '',
          'PI No': pi?.piNo || '-',
          'Shipment Ref': s.shipmentRefNo,
          Mode: s.mode,
          'AWB / BL No': s.blAwbNo || '-',
          Port: s.portCode,
          'Dispatch Date': s.dispatchDate ? formatDate(s.dispatchDate) : '-',
          'ETA India Port': s.etaPortDate ? formatDate(s.etaPortDate) : '-',
          'Expected Duty Date': s.expectedDutyDate ? formatDate(s.expectedDutyDate) : '-',
          'Expected Delivery Date': s.expectedDeliveryDate ? formatDate(s.expectedDeliveryDate) : '-',
          'Items & Qty': s.items.map(i => `${i.itemName} (${i.dispatchedQty} ${i.uom})`).join('; '),
          'Est Assessable INR': s.estimatedAssessableINR,
          'Est BCD + SWS INR': round2(s.estimatedBcdINR + s.estimatedSwsINR),
          'Est IGST INR': s.estimatedIgstINR,
          'Est Total Custom Duty INR': s.estimatedTotalDutyINR,
          Status: s.status,
          'Actual Receipt Date': s.actualReceiptDate ? formatDate(s.actualReceiptDate) : '-',
          'GRN No': s.grnNo || '-',
        };
      }),
      'Shipment_Duty_Planner'
    );
  };

  const { dutyCashflow } = materialBalances;

  return (
    <div className="p-6 space-y-4 max-w-[1440px] mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-2xl shadow-xs border border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <Ship className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-extrabold text-slate-900">
              PI Shipment, Dispatch, ETA Port &amp; Custom Duty Planner
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Track supplier dispatch, India port ETA, customs duty date &amp; cash-flow forecast, and mark 1-click Material Received ✓
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleExport}
            className="flex items-center space-x-1 text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg border border-slate-300"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel</span>
          </button>

          {permissions.canManagePurchase && (
            <button
              onClick={openAddShipment}
              className="flex items-center space-x-1 text-xs px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Plan / Dispatch Shipment</span>
            </button>
          )}
        </div>
      </div>

      {/* Upcoming Custom Duty Cash-Flow Radar */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-indigo-200 bg-indigo-50/40">
          <p className="text-[10px] font-bold uppercase text-indigo-700">Duty Due (Next 7 Days)</p>
          <p className="text-base font-extrabold text-indigo-900 font-mono mt-0.5">
            {formatINR(dutyCashflow.next7DaysINR)}
          </p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200">
          <p className="text-[10px] font-bold uppercase text-slate-400">Duty Due (Next 15 Days)</p>
          <p className="text-base font-extrabold text-slate-900 font-mono mt-0.5">
            {formatINR(dutyCashflow.next15DaysINR)}
          </p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200">
          <p className="text-[10px] font-bold uppercase text-slate-400">Duty Due (Next 30 Days)</p>
          <p className="text-base font-extrabold text-slate-900 font-mono mt-0.5">
            {formatINR(dutyCashflow.next30DaysINR)}
          </p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-amber-200 bg-amber-50/30">
          <p className="text-[10px] font-bold uppercase text-amber-800">Total Planned Duty</p>
          <p className="text-base font-extrabold text-amber-900 font-mono mt-0.5">
            {formatINR(dutyCashflow.totalUpcomingINR)}
          </p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200">
          <p className="text-[10px] font-bold uppercase text-slate-400">In-Transit Shipments</p>
          <p className="text-lg font-extrabold text-sky-700 mt-0.5">{dutyCashflow.inTransitCount}</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-rose-200 bg-rose-50/30">
          <p className="text-[10px] font-bold uppercase text-rose-700">Overdue / Delayed ETA</p>
          <p className="text-lg font-extrabold text-rose-700 mt-0.5">{dutyCashflow.overdueDispatchesCount}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex flex-wrap items-center gap-2.5 text-xs">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search Shipment / PI / AWB / Supplier / Item..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full text-xs pl-8 pr-3 py-1.5 rounded-lg border border-slate-300"
          />
        </div>
        <select
          value={supplierFilter}
          onChange={e => setSupplierFilter(e.target.value)}
          className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white max-w-[200px]"
        >
          <option value="ALL">All Suppliers</option>
          {db.suppliers
            .filter(s => selectedCompanyId === 'ALL' || s.companyId === selectedCompanyId)
            .map(s => (
              <option key={s.id} value={s.id}>{s.supplierName}</option>
            ))}
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
        >
          <option value="ALL">All Statuses</option>
          {['Planned', 'Dispatched', 'Arrived Port', 'Part Received', 'Received'].map(st => (
            <option key={st} value={st}>{st}</option>
          ))}
        </select>
        <select
          value={modeFilter}
          onChange={e => setModeFilter(e.target.value)}
          className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
        >
          <option value="ALL">All Modes</option>
          <option value="Sea">Sea</option>
          <option value="Air">Air</option>
          <option value="Courier">Courier</option>
        </select>

        <select
          value={detentionFilter}
          onChange={e => setDetentionFilter(e.target.value as any)}
          className={`text-xs px-2.5 py-1.5 rounded-lg border font-bold ${
            detentionFilter !== 'ALL'
              ? 'border-rose-400 bg-rose-50 text-rose-800'
              : 'border-slate-300 bg-white text-slate-700'
          }`}
        >
          <option value="ALL">All Demurrage/Detention</option>
          <option value="ALERT">Detention Alerts (Expired / Critical)</option>
          <option value="EXPIRED">Detention Expired (Penalty Risk!)</option>
        </select>
        <select
          value={portFilter}
          onChange={e => setPortFilter(e.target.value)}
          className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
        >
          <option value="ALL">All Ports</option>
          {availablePorts.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <div className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200">
          <span className="text-[11px] font-semibold text-slate-500">ETA:</span>
          <input type="date" value={etaFrom} onChange={e => setEtaFrom(e.target.value)} className="text-[11px] px-1 rounded border" />
          <span className="text-slate-400">to</span>
          <input type="date" value={etaTo} onChange={e => setEtaTo(e.target.value)} className="text-[11px] px-1 rounded border" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-100 text-slate-700 font-semibold uppercase tracking-wider border-b">
              <tr>
                <th className="px-3 py-2.5">Company / Supplier</th>
                <th className="px-3 py-2.5">PI &amp; Shipment Ref</th>
                <th className="px-3 py-2.5">Items &amp; Qty</th>
                <th className="px-3 py-2.5">Dispatch Date</th>
                <th className="px-3 py-2.5">ETA India Port</th>
                <th className="px-3 py-2.5">Expected Duty Date</th>
                <th className="px-3 py-2.5 text-right">Est. Custom Duty (INR)</th>
                <th className="px-3 py-2.5 text-center">Status / Receipt</th>
                <th className="px-3 py-2.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredShipments.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-400">
                    No Shipment Plans yet. Click "+ Plan / Dispatch Shipment" after creating a PI.
                  </td>
                </tr>
              ) : (
                filteredShipments.map(shp => {
                  const comp = db.companies.find(c => c.id === shp.companyId);
                  const supp = db.suppliers.find(s => s.id === shp.supplierId);
                  const pi = db.proformaInvoices.find(p => p.id === shp.piId);

                  return (
                    <tr key={shp.id} className="hover:bg-slate-50/80">
                      <td className="px-3 py-2.5">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 font-bold text-[10px] mr-1">
                          {comp?.code}
                        </span>
                        <span className="font-semibold text-slate-900">{supp?.supplierName}</span>
                        <div className="text-[10px] text-slate-400">Port: {shp.portCode} • {shp.mode}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-bold text-indigo-700">{pi?.piNo || shp.piId}</div>
                        <div className="font-mono text-[11px] font-semibold text-slate-800">{shp.shipmentRefNo}</div>
                        {shp.blAwbNo && <div className="text-[10px] text-slate-400">BL/AWB: {shp.blAwbNo}</div>}
                        {shp.mode === 'Sea' && (() => {
                          const detentionRisk = engineResult.containerDetentionRisks.find(r => r.shipmentId === shp.id);
                          return (
                            <div className="mt-1 pt-1 border-t border-slate-100 text-[10px]">
                              <div className="font-mono text-slate-600 font-semibold flex items-center gap-1 flex-wrap">
                                <span>{shp.containerNo || 'No Container #'}</span>
                                <span className="text-slate-400">({shp.containerType || '40ft HQ'})</span>
                              </div>
                              {shp.shippingLine && <div className="text-slate-400 text-[9px]">{shp.shippingLine}</div>}
                              {detentionRisk && (
                                <div className="mt-0.5">
                                  <span
                                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-extrabold ${
                                      detentionRisk.emptyReturnedDate
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : detentionRisk.riskLevel === 'Expired'
                                          ? 'bg-rose-600 text-white animate-pulse'
                                          : detentionRisk.riskLevel === 'Critical'
                                            ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                            : detentionRisk.riskLevel === 'Warning'
                                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    }`}
                                    title={`Free Days: ${detentionRisk.freeDetentionDays}d. Expiry: ${formatDate(detentionRisk.detentionExpiryDate)}`}
                                  >
                                    <Clock className="w-2.5 h-2.5" />
                                    <span>
                                      {detentionRisk.emptyReturnedDate
                                        ? 'Empty Returned ✓'
                                        : detentionRisk.riskLevel === 'Expired'
                                          ? `Detention Expired (${Math.abs(detentionRisk.daysRemaining)}d)`
                                          : `${detentionRisk.daysRemaining}d detention left`}
                                    </span>
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2.5">
                        {shp.items.slice(0, 2).map(it => (
                          <div key={it.lineId} className="text-[11px] leading-relaxed">
                            <span className="font-semibold text-slate-900">{it.itemName}</span>
                            <span className="text-[10px] font-mono text-indigo-700 bg-indigo-50 px-1 rounded ml-1" title="SAP Code">
                              {it.itemCode}
                            </span>
                            {it.supplierItemCode && (
                              <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-1 rounded ml-1" title="Supplier Part Code">
                                [Supp: {it.supplierItemCode}]
                              </span>
                            )}:{' '}
                            <span>{it.dispatchedQty} {it.uom}</span>
                            {it.receivedQty > 0 && (
                              <span className="text-emerald-700 ml-1">(Rec: {it.receivedQty})</span>
                            )}
                          </div>
                        ))}
                        {shp.items.length > 2 && (
                          <div className="text-[10px] text-slate-400">+{shp.items.length - 2} more</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{formatDate(shp.dispatchDate)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="font-semibold text-slate-900">{formatDate(shp.etaPortDate)}</div>
                        {shp.expectedDeliveryDate && (
                          <div className="text-[10px] text-slate-400">Del: {formatDate(shp.expectedDeliveryDate)}</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap font-bold text-amber-800">
                        {formatDate(shp.expectedDutyDate)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">
                        <div className="font-extrabold text-slate-900">{formatINR(shp.estimatedTotalDutyINR)}</div>
                        <div className="text-[10px] text-slate-400">
                          BCD+SWS: {formatINR(round2(shp.estimatedBcdINR + shp.estimatedSwsINR))} | IGST: {formatINR(shp.estimatedIgstINR)}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {shp.status === 'Received' ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Received ✓</span>
                            </span>
                            <div className="text-[10px] text-slate-500">{formatDate(shp.actualReceiptDate)}</div>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                            <Clock className="w-3 h-3" />
                            <span>{shp.status}</span>
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center space-y-1">
                        {permissions.canManagePurchase && shp.status !== 'Received' && (
                          <div className="flex flex-col gap-1 items-center">
                            <button
                              onClick={() => handleOneClickReceive(shp)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold shadow-2xs"
                            >
                              <PackageCheck className="w-3 h-3" />
                              <span>Received ✓</span>
                            </button>
                            <button
                              onClick={() => openPartialReceiveModal(shp)}
                              className="text-[10px] font-semibold text-amber-700 hover:underline"
                            >
                              Partial / Short GRN
                            </button>
                          </div>
                        )}
                        {permissions.canManagePurchase && (
                          <button
                            onClick={() => openEditShipment(shp)}
                            className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:underline font-semibold"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Edit Plan</span>
                          </button>
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

      {/* Add / Edit Shipment Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">
                {editingShp ? `Edit Shipment Plan: ${editingShp.shipmentRefNo}` : 'Plan / Dispatch Shipment against PI'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <form onSubmit={handleSaveShipment} className="p-6 overflow-y-auto space-y-4 text-xs">
              {modalError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Select Proforma Invoice (PI) *</label>
                  <select
                    value={formData.piId}
                    onChange={e => loadPiIntoForm(e.target.value)}
                    className="w-full p-2 rounded-lg border border-slate-300 bg-white font-semibold"
                    required
                  >
                    <option value="">-- Choose PI --</option>
                    {availablePIs.map(p => {
                      const s = db.suppliers.find(sup => sup.id === p.supplierId);
                      return (
                        <option key={p.id} value={p.id}>
                          {p.piNo} — {s?.supplierName} ({formatFC(p.piValueFC)} {p.currency})
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Shipment Ref No *</label>
                  <input
                    type="text"
                    value={formData.shipmentRefNo}
                    onChange={e => setFormData({ ...formData, shipmentRefNo: e.target.value })}
                    className="w-full p-2 rounded-lg border border-slate-300 font-mono font-bold uppercase"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Mode / Status</label>
                  <div className="flex gap-1.5">
                    <select
                      value={formData.mode}
                      onChange={e => setFormData({ ...formData, mode: e.target.value as ShipmentPlan['mode'] })}
                      className="w-1/2 p-2 rounded-lg border border-slate-300 bg-white"
                    >
                      <option value="Sea">Sea</option>
                      <option value="Air">Air</option>
                      <option value="Courier">Courier</option>
                    </select>
                    <select
                      value={formData.status}
                      onChange={e => setFormData({ ...formData, status: e.target.value as ShipmentPlan['status'] })}
                      className="w-1/2 p-2 rounded-lg border border-slate-300 bg-white"
                    >
                      <option value="Planned">Planned</option>
                      <option value="Dispatched">Dispatched</option>
                      <option value="Arrived Port">Arrived Port</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Supplier Dispatch Date</label>
                  <input
                    type="date"
                    value={formData.dispatchDate || ''}
                    onChange={e => setFormData({ ...formData, dispatchDate: e.target.value })}
                    className="w-full p-2 rounded-lg border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">ETA India Port</label>
                  <input
                    type="date"
                    value={formData.etaPortDate || ''}
                    onChange={e => {
                      const eta = e.target.value;
                      setFormData({
                        ...formData,
                        etaPortDate: eta,
                        expectedDutyDate: eta ? addDaysISO(eta, 2) : '',
                        expectedDeliveryDate: eta ? addDaysISO(eta, 4) : '',
                      });
                    }}
                    className="w-full p-2 rounded-lg border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Expected Duty Payment Date</label>
                  <input
                    type="date"
                    value={formData.expectedDutyDate || ''}
                    onChange={e => setFormData({ ...formData, expectedDutyDate: e.target.value })}
                    className="w-full p-2 rounded-lg border border-amber-300 bg-amber-50/40 font-semibold"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Expected Factory Delivery</label>
                  <input
                    type="date"
                    value={formData.expectedDeliveryDate || ''}
                    onChange={e => setFormData({ ...formData, expectedDeliveryDate: e.target.value })}
                    className="w-full p-2 rounded-lg border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Port Code *</label>
                  <input
                    type="text"
                    value={formData.portCode}
                    onChange={e => setFormData({ ...formData, portCode: e.target.value })}
                    className="w-full p-2 rounded-lg border border-slate-300 uppercase"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">BL / AWB No</label>
                  <input
                    type="text"
                    value={formData.blAwbNo || ''}
                    onChange={e => setFormData({ ...formData, blAwbNo: e.target.value })}
                    className="w-full p-2 rounded-lg border border-slate-300 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Container / Flight No</label>
                  <input
                    type="text"
                    value={formData.containerNo || ''}
                    onChange={e => setFormData({ ...formData, containerNo: e.target.value })}
                    className="w-full p-2 rounded-lg border border-slate-300 font-mono"
                    placeholder="e.g. COSU6123456"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Shipping Line</label>
                  <input
                    type="text"
                    value={formData.shippingLine || ''}
                    onChange={e => setFormData({ ...formData, shippingLine: e.target.value })}
                    className="w-full p-2 rounded-lg border border-slate-300"
                    placeholder="e.g. COSCO, Maersk, MSC, ONE"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Container Type</label>
                  <select
                    value={formData.containerType || '40ft HQ'}
                    onChange={e => setFormData({ ...formData, containerType: e.target.value as any })}
                    className="w-full p-2 rounded-lg border border-slate-300 bg-white"
                  >
                    <option value="40ft HQ">40ft High Cube (HQ)</option>
                    <option value="40ft GP">40ft General Purpose (GP)</option>
                    <option value="20ft GP">20ft General Purpose (GP)</option>
                    <option value="LCL">LCL (Less than Container)</option>
                    <option value="Air Cargo">Air Cargo</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Free Detention Days</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.freeDetentionDays ?? 14}
                    onChange={e => setFormData({ ...formData, freeDetentionDays: parseInt(e.target.value) || 14 })}
                    className="w-full p-2 rounded-lg border border-slate-300 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Discharge Date (Port)</label>
                  <input
                    type="date"
                    value={formData.dischargeDate || ''}
                    onChange={e => setFormData({ ...formData, dischargeDate: e.target.value })}
                    className="w-full p-2 rounded-lg border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Empty Returned Date</label>
                  <input
                    type="date"
                    value={formData.emptyReturnedDate || ''}
                    onChange={e => setFormData({ ...formData, emptyReturnedDate: e.target.value })}
                    className="w-full p-2 rounded-lg border border-emerald-300 bg-emerald-50/30"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Est. Customs FX Rate *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.estimatedExchangeRate || ''}
                    onChange={e => setFormData({ ...formData, estimatedExchangeRate: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2 rounded-lg border border-slate-300 font-mono font-bold text-indigo-700"
                    required
                  />
                </div>
              </div>

              {/* Item-wise Dispatch Quantities */}
              <div className="border rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-3 py-2 border-b font-bold text-slate-800">
                  Item-wise Dispatch Qty &amp; Duty Profile
                </div>
                <table className="w-full text-[11px] text-left">
                  <thead className="bg-slate-100 text-slate-600 font-bold uppercase border-b">
                    <tr>
                      <th className="px-3 py-2">Item</th>
                      <th className="px-3 py-2">HSN</th>
                      <th className="px-3 py-2 text-right">Dispatched Qty</th>
                      <th className="px-3 py-2 text-right">Rate FC</th>
                      <th className="px-3 py-2 text-right">Amount FC</th>
                      <th className="px-3 py-2 text-center">BCD% / IGST%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(formData.items || []).map((it, idx) => (
                      <tr key={it.lineId}>
                        <td className="px-3 py-2 font-semibold">{it.itemName}</td>
                        <td className="px-3 py-2 font-mono">{it.hsnCode}</td>
                        <td className="px-3 py-2 w-28">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={it.dispatchedQty}
                            onChange={e => {
                              const q = parseFloat(e.target.value) || 0;
                              const updated = (formData.items || []).map((x, i) =>
                                i === idx ? { ...x, dispatchedQty: q, amountFC: round2(q * Number(x.unitPriceFC)) } : x
                              );
                              setFormData({ ...formData, items: updated });
                            }}
                            className="w-full p-1 rounded border text-right font-mono font-bold"
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{it.unitPriceFC}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold">
                          {formatFC(it.dispatchedQty * it.unitPriceFC)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {it.igcrEligible ? `IGCR ${it.igcrBcdRatePct}%` : `${it.bcdRatePct}%`} / {it.igstRatePct}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Live Est Duty Summary */}
              <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-xl grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div>
                  <span className="text-[10px] font-bold uppercase text-indigo-700 block">Est. Assessable INR</span>
                  <span className="font-extrabold font-mono text-slate-900">{formatINR(modalDutyEstimate.assessableINR)}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-indigo-700 block">Est. BCD + SWS (10%)</span>
                  <span className="font-extrabold font-mono text-slate-900">
                    {formatINR(round2(modalDutyEstimate.bcdINR + modalDutyEstimate.swsINR))}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-indigo-700 block">Est. IGST (ITC)</span>
                  <span className="font-extrabold font-mono text-emerald-700">{formatINR(modalDutyEstimate.igstINR)}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-amber-800 block">Total Custom Duty</span>
                  <span className="font-extrabold font-mono text-amber-900 text-sm">{formatINR(modalDutyEstimate.totalDutyINR)}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-emerald-700 block">IGCR Duty Saving</span>
                  <span className="font-extrabold font-mono text-emerald-700">{formatINR(modalDutyEstimate.dutyForegoneINR)}</span>
                </div>
              </div>

              <div className="pt-3 border-t flex justify-end space-x-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 bg-slate-100 rounded-lg font-semibold">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700">
                  Save Shipment Plan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Partial / GRN Receive Modal */}
      {receivingShp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <PackageCheck className="w-4 h-4 text-emerald-600" />
                <span>Confirm Material Receipt — {receivingShp.shipmentRefNo}</span>
              </h3>
              <button onClick={() => setReceivingShp(null)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            {recError && <div className="p-2 bg-rose-50 text-rose-700 rounded border border-rose-200">{recError}</div>}

            <form onSubmit={handleConfirmPartialReceive} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Actual Receipt Date *</label>
                  <input type="date" value={recDate} onChange={e => setRecDate(e.target.value)} className="w-full p-2 rounded border" required />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">GRN / Store Receipt No</label>
                  <input type="text" value={recGrn} onChange={e => setRecGrn(e.target.value)} placeholder="e.g. GRN-2627-045" className="w-full p-2 rounded border font-mono" />
                </div>
              </div>

              <div className="border rounded-xl overflow-hidden">
                <table className="w-full text-[11px]">
                  <thead className="bg-slate-100 font-bold border-b">
                    <tr>
                      <th className="px-3 py-2 text-left">Item</th>
                      <th className="px-3 py-2 text-right">Dispatched</th>
                      <th className="px-3 py-2 text-right">Received Qty</th>
                      <th className="px-3 py-2 text-right">Short Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {receivingShp.items.map((it, idx) => {
                      const rl = recLines[idx] || { lineId: it.lineId, receivedQty: it.dispatchedQty, shortQty: 0 };
                      return (
                        <tr key={it.lineId}>
                          <td className="px-3 py-2 font-semibold">{it.itemName}</td>
                          <td className="px-3 py-2 text-right font-mono">{it.dispatchedQty} {it.uom}</td>
                          <td className="px-3 py-2 w-24">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={rl.receivedQty}
                              onChange={e => {
                                const val = parseFloat(e.target.value) || 0;
                                setRecLines(prev => prev.map((x, i) => (i === idx ? { ...x, receivedQty: val } : x)));
                              }}
                              className="w-full p-1 rounded border text-right font-mono font-bold text-emerald-700"
                            />
                          </td>
                          <td className="px-3 py-2 w-24">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={rl.shortQty}
                              onChange={e => {
                                const val = parseFloat(e.target.value) || 0;
                                setRecLines(prev => prev.map((x, i) => (i === idx ? { ...x, shortQty: val } : x)));
                              }}
                              className="w-full p-1 rounded border text-right font-mono text-rose-700"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="pt-3 border-t flex justify-end space-x-2">
                <button type="button" onClick={() => setReceivingShp(null)} className="px-4 py-2 bg-slate-100 rounded-lg font-semibold">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700">
                  Save Material Receipt ✓
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
