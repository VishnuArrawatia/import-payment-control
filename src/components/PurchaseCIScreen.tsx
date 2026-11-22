import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { CommercialInvoice, CommercialInvoiceLandedCost } from '../types';
import { formatFC, formatINR, formatDate, formatRate, round2, round4 } from '../utils/formatters';
import { exportToExcel } from '../utils/excel';
import { computeBOETaxTotals, suggestSWS, suggestIGST } from '../utils/boe';
import { computeCommercialInvoiceLandedCost, LandedCostInputItem } from '../utils/landedCost';
import { Plus, Download, Search, AlertCircle, Copy, Receipt, CheckCircle, Calculator, X, FileSpreadsheet } from 'lucide-react';
import { ExcelBatchGridModal } from './ExcelBatchGridModal';

export const PurchaseCIScreen: React.FC = () => {
  const { db, engineResult, selectedCompanyId, saveCI } = useApp();
  const { permissions } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showExcelGrid, setShowExcelGrid] = useState(false);
  const [editingCI, setEditingCI] = useState<CommercialInvoice | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Landed Cost Modal State
  const [landedCostCI, setLandedCostCI] = useState<CommercialInvoice | null>(null);
  const [lcConfig, setLcConfig] = useState<CommercialInvoiceLandedCost>({
    ciId: '',
    internationalFreightINR: 0,
    insuranceINR: 0,
    chaChargesINR: 0,
    portHandlingCfsINR: 0,
    localTransportINR: 0,
    otherChargesINR: 0,
    allocationMethod: 'value',
    updatedAt: new Date().toISOString(),
  });

  const openLandedCost = (ci: CommercialInvoice) => {
    setLandedCostCI(ci);
    setLcConfig(
      ci.landedCost || {
        ciId: ci.id,
        internationalFreightINR: 0,
        insuranceINR: 0,
        chaChargesINR: 0,
        portHandlingCfsINR: 0,
        localTransportINR: 0,
        otherChargesINR: 0,
        allocationMethod: 'value',
        updatedAt: new Date().toISOString(),
      }
    );
  };

  const landedCostItems: LandedCostInputItem[] = useMemo(() => {
    if (!landedCostCI) return [];
    const linkedPi = db.proformaInvoices.find(p => p.id === landedCostCI.linkedPiId);
    if (linkedPi?.items && linkedPi.items.length > 0) {
      return linkedPi.items.map(it => ({
        lineId: it.lineId,
        itemCode: it.itemCode,
        itemName: it.itemName,
        supplierItemCode: it.supplierItemCode,
        qty: Number(it.orderedQty || 0),
        uom: it.uom || 'PCS',
        unitPriceFC: Number(it.unitPriceFC || 0),
        amountFC: Number(it.amountFC || 0),
        currency: linkedPi.currency,
        bcdRatePct: it.bcdRatePct,
      }));
    }
    const shp = (db.shipments || []).find(s => s.linkedCiId === landedCostCI.id || s.piId === landedCostCI.linkedPiId);
    if (shp?.items && shp.items.length > 0) {
      return shp.items.map(it => ({
        lineId: it.lineId,
        itemCode: it.itemCode,
        itemName: it.itemName,
        supplierItemCode: it.supplierItemCode,
        qty: Number(it.dispatchedQty || it.receivedQty || 1),
        uom: it.uom || 'PCS',
        unitPriceFC: Number(it.unitPriceFC || 0),
        amountFC: Number(it.amountFC || 0),
        currency: shp.currency,
        bcdRatePct: it.bcdRatePct,
      }));
    }
    return [
      {
        lineId: 'CI-ITEM-1',
        itemCode: landedCostCI.ciNo,
        itemName: landedCostCI.remarks || `Imported Consignment as per ${landedCostCI.ciNo}`,
        qty: 1,
        uom: 'LOT',
        unitPriceFC: landedCostCI.ciValueFC,
        amountFC: landedCostCI.ciValueFC,
        currency: landedCostCI.currency,
        bcdRatePct: 7.5,
      },
    ];
  }, [landedCostCI, db.proformaInvoices, db.shipments]);

  const landedCostSummary = useMemo(() => {
    if (!landedCostCI) return null;
    return computeCommercialInvoiceLandedCost(landedCostCI, landedCostItems, lcConfig);
  }, [landedCostCI, landedCostItems, lcConfig]);

  const handleSaveLandedCost = () => {
    if (!landedCostCI) return;
    const updatedCI: CommercialInvoice = {
      ...landedCostCI,
      landedCost: {
        ...lcConfig,
        ciId: landedCostCI.id,
        updatedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    };
    saveCI(updatedCI);
    setLandedCostCI(null);
  };

  const handleExportLandedCostSheet = () => {
    if (!landedCostCI || !landedCostSummary) return;
    const rows = landedCostSummary.items.map(it => ({
      'CI No': landedCostCI.ciNo,
      'CI Date': formatDate(landedCostCI.ciDate),
      'BOE No': landedCostCI.boeNo,
      'Customs Rate (INR)': landedCostCI.boeExchangeRate,
      'Our Item Code (SAP)': it.itemCode,
      'Our Item Description (SAP)': it.itemName,
      'Supplier Item Code': it.supplierItemCode || '-',
      Quantity: it.qty,
      UOM: it.uom,
      'Unit Rate FC': it.unitPriceFC,
      Currency: it.currency,
      'FOB Value (INR)': it.fobAmountINR,
      'BCD Duty (INR)': it.bcdAmountINR,
      'SWS Duty (INR)': it.swsAmountINR,
      'Allocated Freight (INR)': it.allocatedFreightINR,
      'Allocated Insurance (INR)': it.allocatedInsuranceINR,
      'Allocated CHA Charges (INR)': it.allocatedChaINR,
      'Allocated Port/CFS Charges (INR)': it.allocatedPortCfsINR,
      'Allocated Local Transport (INR)': it.allocatedLocalTransportINR,
      'Other Expenses (INR)': it.allocatedOtherINR,
      'Total Landed Cost (INR)': it.totalLandedCostINR,
      'Landed Cost / Unit (INR)': it.landedCostPerUnitINR,
      'Landed Multiplier (x)': it.landedMultiplier,
    }));
    exportToExcel(rows, `Landed_Cost_Sheet_${landedCostCI.ciNo}`);
  };

  // Form State
  const [formData, setFormData] = useState<Partial<CommercialInvoice>>({
    companyId: selectedCompanyId !== 'ALL' ? selectedCompanyId : db.companies[0]?.id || '',
    supplierId: db.suppliers[0]?.id || '',
    currency: 'USD',
    ciNo: '',
    ciDate: new Date().toISOString().split('T')[0],
    ciValueFC: 0,
    linkedPiId: '',
    blDate: new Date().toISOString().split('T')[0],
    boeNo: '',
    boeDate: new Date().toISOString().split('T')[0],
    portCode: 'INNSA1',
    boeExchangeRate: 86.0,
    taxInvoiceValueINR: undefined,
    assessableValueINR: 0,
    customsDutyINR: 0,
    swsINR: 0,
    igstINR: 0,
    taxPaidDate: '',
    challanNo: '',
    purchaseINR: 0,
    tallyVoucherNo: '',
    remarks: '',
  });

  // Filtered suppliers for current company
  const activeSuppliers = db.suppliers.filter(
    s => s.active && (!formData.companyId || s.companyId === formData.companyId)
  );

  // Filtered open PIs for chosen company + supplier + currency
  const availablePIs = db.proformaInvoices.filter(
    pi =>
      pi.companyId === formData.companyId &&
      pi.supplierId === formData.supplierId &&
      pi.currency === formData.currency
  );

  // Live calculation of Advance Adjustment & Resulting Balance across Primary + Secondary PI splits
  const livePreview = useMemo(() => {
    const ciVal = Number(formData.ciValueFC || 0);
    const boeRate = Number(formData.boeExchangeRate || 0);
    const secondarySplits = (formData.linkedPiSplits || []).filter(
      s => s.piId && s.piId !== formData.linkedPiId && Number(s.amountFC) > 0
    );

    if ((!formData.linkedPiId && secondarySplits.length === 0) || ciVal <= 0) {
      return {
        alreadyPaidOnPI: 0,
        adjustedAdvance: 0,
        resultingCIBalance: ciVal,
        resultingPurchaseINR: Math.round(ciVal * boeRate),
      };
    }

    const getUnappliedForPi = (piId: string) =>
      engineResult.unappliedPayments
        .filter(c => c.piId === piId && c.remainingFC > 0)
        .reduce((s, c) => s + c.remainingFC, 0);

    let totalUnapplied = 0;
    let totalAdjusted = 0;
    const secondarySum = secondarySplits.reduce((s, x) => s + Number(x.amountFC || 0), 0);

    if (formData.linkedPiId) {
      const primaryAvail = getUnappliedForPi(formData.linkedPiId);
      const primaryCap = secondarySplits.length > 0 ? Math.max(0, ciVal - secondarySum) : ciVal;
      totalUnapplied += primaryAvail;
      totalAdjusted += Math.min(primaryAvail, primaryCap);
    }

    for (const sp of secondarySplits) {
      const spAvail = getUnappliedForPi(sp.piId);
      const spCap = Math.min(Number(sp.amountFC || 0), Math.max(0, ciVal - totalAdjusted));
      totalUnapplied += spAvail;
      totalAdjusted += Math.min(spAvail, spCap);
    }

    totalAdjusted = Math.min(ciVal, Math.round(totalAdjusted * 100) / 100);
    const balance = Math.max(0, Math.round((ciVal - totalAdjusted) * 100) / 100);

    return {
      alreadyPaidOnPI: Math.round(totalUnapplied * 100) / 100,
      adjustedAdvance: totalAdjusted,
      resultingCIBalance: balance,
      resultingPurchaseINR: Math.round(ciVal * boeRate),
    };
  }, [formData.linkedPiId, formData.linkedPiSplits, formData.ciValueFC, formData.boeExchangeRate, engineResult.unappliedPayments]);

  const handleOpenAdd = () => {
    setEditingCI(null);
    setErrorMsg(null);
    const compId = selectedCompanyId !== 'ALL' ? selectedCompanyId : db.companies[0]?.id || '';
    const supp = db.suppliers.find(s => s.active && s.companyId === compId);
    const openPI = db.proformaInvoices.find(p => p.companyId === compId && p.supplierId === supp?.id && !p.isClosed);

    setFormData({
      companyId: compId,
      supplierId: supp?.id || '',
      currency: supp?.defaultCurrency || 'USD',
      ciNo: '',
      ciDate: new Date().toISOString().split('T')[0],
      ciValueFC: 0,
      linkedPiId: openPI?.id || '',
      linkedPiSplits: undefined,
      blDate: new Date().toISOString().split('T')[0],
      boeNo: '',
      boeDate: new Date().toISOString().split('T')[0],
      portCode: 'INNSA1',
      boeExchangeRate: 95.0,
      taxInvoiceValueINR: undefined,
      assessableValueINR: 0,
      customsDutyINR: 0,
      swsINR: 0,
      igstINR: 0,
      taxPaidDate: '',
      challanNo: '',
      purchaseINR: 0,
      tallyVoucherNo: '',
      remarks: '',
    });
    setShowModal(true);
  };

  const handleDuplicateLast = () => {
    const list = db.commercialInvoices;
    if (list.length === 0) return;
    const last = list[list.length - 1];
    setEditingCI(null);
    setErrorMsg(null);
    setFormData({
      ...last,
      id: undefined,
      ciNo: `${last.ciNo}-NEW`,
      boeNo: `${last.boeNo}-NEW`,
      ciDate: new Date().toISOString().split('T')[0],
      boeDate: new Date().toISOString().split('T')[0],
    });
    setShowModal(true);
  };

  const handleEdit = (ci: CommercialInvoice) => {
    setEditingCI(ci);
    setErrorMsg(null);
    setFormData({ ...ci });
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.companyId || !formData.supplierId || !formData.ciNo || !formData.ciValueFC || formData.ciValueFC <= 0) {
      setErrorMsg('Please enter all required fields (Company, Supplier, CI No, CI Value > 0).');
      return;
    }
    if (!formData.boeNo || !formData.boeDate || !formData.boeExchangeRate || formData.boeExchangeRate <= 0) {
      setErrorMsg('BOE details (BOE No, BOE Date, Port Code, BOE Exchange Rate > 0) are mandatory before saving CI.');
      return;
    }

    const ciVal = Number(formData.ciValueFC);
    const secondarySplits = (formData.linkedPiSplits || [])
      .filter(s => s.piId && s.piId !== formData.linkedPiId && Number(s.amountFC) > 0)
      .map(s => ({ piId: s.piId, amountFC: Math.round(Number(s.amountFC) * 100) / 100 }));
    const secondarySum = Math.round(secondarySplits.reduce((s, x) => s + x.amountFC, 0) * 100) / 100;

    if (secondarySum > ciVal) {
      setErrorMsg(`Secondary PI split total (${secondarySum}) cannot exceed CI Value FC (${ciVal}).`);
      return;
    }

    let finalSplits: { piId: string; amountFC: number }[] | undefined = undefined;
    if (secondarySplits.length > 0) {
      if (formData.linkedPiId) {
        const primaryShare = Math.round(Math.max(0, ciVal - secondarySum) * 100) / 100;
        finalSplits = primaryShare > 0 ? [{ piId: formData.linkedPiId, amountFC: primaryShare }, ...secondarySplits] : secondarySplits;
      } else {
        finalSplits = secondarySplits;
      }
    }

    const customsDutyINR = round2(Number(formData.customsDutyINR || 0));
    const swsINR = round2(Number(formData.swsINR || 0));
    const igstINR = round2(Number(formData.igstINR || 0));
    const totalTaxINR = round2(customsDutyINR + swsINR + igstINR);

    const payload: CommercialInvoice = {
      id: editingCI ? editingCI.id : `CI-${Date.now()}`,
      companyId: formData.companyId!,
      supplierId: formData.supplierId!,
      currency: formData.currency || 'USD',
      ciNo: formData.ciNo.trim(),
      ciDate: formData.ciDate || new Date().toISOString().split('T')[0],
      ciValueFC: ciVal,
      linkedPiId: formData.linkedPiId || '',
      linkedPiSplits: finalSplits,
      blDate: formData.blDate || undefined,
      boeNo: formData.boeNo.trim(),
      boeDate: formData.boeDate || new Date().toISOString().split('T')[0],
      portCode: formData.portCode || 'INNSA1',
      boeExchangeRate: Number(formData.boeExchangeRate),
      taxInvoiceValueINR:
        formData.taxInvoiceValueINR && Number(formData.taxInvoiceValueINR) > 0
          ? round2(Number(formData.taxInvoiceValueINR))
          : undefined,
      assessableValueINR: Number(formData.assessableValueINR || Math.round(ciVal * Number(formData.boeExchangeRate))),
      customsDutyINR,
      swsINR,
      igstINR,
      totalTaxINR,
      taxPaidDate: formData.taxPaidDate || undefined,
      challanNo: formData.challanNo?.trim() || undefined,
      purchaseINR: Math.round(ciVal * Number(formData.boeExchangeRate)),
      tallyVoucherNo: formData.tallyVoucherNo || undefined,
      remarks: formData.remarks || undefined,
      createdAt: editingCI?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const res = saveCI(payload);
    if (!res.success) {
      setErrorMsg(res.error || 'Failed to save CI.');
      return;
    }

    setShowModal(false);
  };

  // Filtered CI list
  const filteredCIs = db.commercialInvoices.filter(ci => {
    if (selectedCompanyId !== 'ALL' && ci.companyId !== selectedCompanyId) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const supp = db.suppliers.find(s => s.id === ci.supplierId);
      return (
        ci.ciNo.toLowerCase().includes(q) ||
        ci.boeNo.toLowerCase().includes(q) ||
        supp?.supplierName.toLowerCase().includes(q) ||
        supp?.vendorCode.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleExport = () => {
    const data = filteredCIs.map(ci => {
      const st = engineResult.ciStates.get(ci.id);
      const comp = db.companies.find(c => c.id === ci.companyId);
      const supp = db.suppliers.find(s => s.id === ci.supplierId);
      const pi = db.proformaInvoices.find(p => p.id === ci.linkedPiId);
      const splitPis = (ci.linkedPiSplits || [])
        .filter(s => s.piId !== ci.linkedPiId)
        .map(s => {
          const sp = db.proformaInvoices.find(p => p.id === s.piId);
          return sp ? `${sp.piNo} (${formatFC(s.amountFC)})` : s.piId;
        });
      const allPiLabel = [pi?.piNo, ...splitPis].filter(Boolean).join(', ') || '-';
      const payRefs = Array.from(
        new Set(
          (st?.allocations || []).map(a => {
            const pay = db.payments.find(p => p.id === a.paymentId);
            return pay ? pay.bankReferenceNo : a.paymentId;
          })
        )
      ).join(', ');
      const boeTax = computeBOETaxTotals(ci);
      return {
        Company: comp?.code,
        Supplier: supp?.supplierName,
        'Vendor Code': supp?.vendorCode,
        'CI No': ci.ciNo,
        'CI Date': formatDate(ci.ciDate),
        'Linked PI(s)': allPiLabel,
        'Settled Bank Payment Refs': payRefs || '-',
        Currency: ci.currency,
        'CI Value FC': ci.ciValueFC,
        'BOE No': ci.boeNo,
        'BOE Date': formatDate(ci.boeDate),
        'BOE Rate': ci.boeExchangeRate,
        'Purchase INR': ci.purchaseINR,
        'Tax Invoice Value (INR)': boeTax.taxInvoiceValueINR,
        'BOE Ass. Value (INR)': boeTax.assessableValueINR,
        'Customs Duty (INR)': boeTax.customsDutyINR,
        'SWS INR': boeTax.swsINR,
        'IGST INR': boeTax.igstINR,
        'Total Tax INR': boeTax.totalTaxINR,
        'Tax Paid Date': ci.taxPaidDate ? formatDate(ci.taxPaidDate) : 'Pending',
        'Allocated FC': st?.allocatedFC,
        'Balance FC (Cr)': st?.balanceFC,
        'Realized FX G/L': st?.realizedGainLossINR,
        'Due Date': formatDate(st?.dueDate),
        Status: st?.status,
        'Tally Voucher': ci.tallyVoucherNo || '',
      };
    });
    exportToExcel(data, 'Purchase_CI_Register');
  };

  return (
    <div className="p-6 space-y-4">
      {/* Action Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-base font-bold text-slate-900">Purchase / Commercial Invoice (CI) & BOE Booking</h2>
          <p className="text-xs text-slate-500">
            Book commercial invoices with mandatory Bill of Entry (BOE) customs rate and duty details
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search CI / BOE / Supplier..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="text-xs pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 w-52 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <button
            onClick={handleExport}
            className="flex items-center space-x-1 text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg border border-slate-300 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel</span>
          </button>

          {permissions.canCreateCI ? (
            <>
              <button
                onClick={() => setShowExcelGrid(true)}
                className="flex items-center space-x-1.5 text-xs px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold rounded-lg border border-emerald-300 transition-colors shadow-2xs"
                title="Open Excel Batch Copy-Paste Editor for Purchase Bills"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>📋 Paste from Excel</span>
              </button>

              <button
                onClick={handleDuplicateLast}
                className="flex items-center space-x-1 text-xs px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium rounded-lg border border-indigo-200 transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Duplicate Last</span>
              </button>

              <button
                onClick={handleOpenAdd}
                className="flex items-center space-x-1 text-xs px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-sm transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Book CI Bill</span>
              </button>
            </>
          ) : (
            <span className="text-[11px] font-semibold px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg">
              Read-Only Access
            </span>
          )}
        </div>
      </div>

      {/* CI Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-100 text-slate-700 font-semibold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-3 py-2.5">Company</th>
                <th className="px-3 py-2.5">Supplier</th>
                <th className="px-3 py-2.5">CI No & Date</th>
                <th className="px-3 py-2.5">Linked PI</th>
                <th className="px-3 py-2.5">BOE No & Date</th>
                <th className="px-3 py-2.5 text-right">BOE Rate</th>
                <th className="px-3 py-2.5 text-right">CI Value FC</th>
                <th className="px-3 py-2.5 text-right">Purchase INR</th>
                <th className="px-3 py-2.5 text-right text-emerald-800 bg-emerald-50/40">Allocated FC</th>
                <th className="px-3 py-2.5 text-right text-amber-800 bg-amber-50/40">Balance FC (Cr)</th>
                <th className="px-3 py-2.5 text-right">Realized G/L</th>
                <th className="px-3 py-2.5 text-center">Status</th>
                <th className="px-3 py-2.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCIs.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-4 py-8 text-center text-slate-400">
                    No Commercial Invoices booked yet. Click "+ Book CI Bill" to create one.
                  </td>
                </tr>
              ) : (
                filteredCIs.map(ci => {
                  const comp = db.companies.find(c => c.id === ci.companyId);
                  const supp = db.suppliers.find(s => s.id === ci.supplierId);
                  const pi = db.proformaInvoices.find(p => p.id === ci.linkedPiId);
                  const state = engineResult.ciStates.get(ci.id);

                  let statusBadge = 'bg-slate-100 text-slate-700';
                  if (state?.status === 'Fully Paid') statusBadge = 'bg-emerald-100 text-emerald-800 font-bold';
                  else if (state?.status === 'Overdue') statusBadge = 'bg-rose-100 text-rose-800 font-bold';
                  else if (state?.status === 'Partially Paid') statusBadge = 'bg-sky-100 text-sky-800 font-semibold';
                  else statusBadge = 'bg-amber-100 text-amber-800 font-semibold';

                  return (
                    <tr key={ci.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-3 py-2.5 font-bold text-slate-900">{comp?.code}</td>
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-slate-900">{supp?.supplierName}</div>
                        <div className="text-[10px] text-slate-400">{supp?.vendorCode}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-bold text-indigo-600">{ci.ciNo}</div>
                        <div className="text-slate-400">{formatDate(ci.ciDate)}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        {(() => {
                          const extraSplits = (ci.linkedPiSplits || []).filter(s => s.piId !== ci.linkedPiId);
                          const payRefs = Array.from(
                            new Set(
                              (state?.allocations || []).map(a => {
                                const pay = db.payments.find(p => p.id === a.paymentId);
                                return pay ? pay.bankReferenceNo : a.paymentId;
                              })
                            )
                          );
                          return (
                            <div className="space-y-0.5">
                              <div className="font-semibold text-indigo-700">{pi?.piNo || '-'}</div>
                              {extraSplits.map((sp, i) => {
                                const spPi = db.proformaInvoices.find(p => p.id === sp.piId);
                                return (
                                  <div key={i} className="text-[10px] text-indigo-600">
                                    + {spPi?.piNo || sp.piId} ({formatFC(sp.amountFC)})
                                  </div>
                                );
                              })}
                              {payRefs.length > 0 && (
                                <div className="text-[10px] text-emerald-700 font-medium">
                                  Paid via: {payRefs.slice(0, 2).join(', ')}
                                  {payRefs.length > 2 ? ` +${payRefs.length - 2}` : ''}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className={`font-semibold ${ci.boeNo.startsWith('PENDING-') ? 'text-amber-700' : 'text-slate-900'}`}>
                          {ci.boeNo}
                        </div>
                        <div className="text-slate-400">{formatDate(ci.boeDate)} ({ci.portCode})</div>
                        {ci.boeNo.startsWith('PENDING-') && (
                          <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-semibold">
                            BOE Pending
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium">{formatRate(ci.boeExchangeRate)}</td>
                      <td className="px-3 py-2.5 text-right font-extrabold text-slate-900">
                        {formatFC(ci.ciValueFC)} <span className="text-[10px] text-slate-500 font-normal">{ci.currency}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-800">
                        {formatINR(ci.purchaseINR)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-emerald-700 bg-emerald-50/20">
                        {formatFC(state?.allocatedFC)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-amber-700 bg-amber-50/20">
                        {formatFC(state?.balanceFC)}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-bold ${(state?.realizedGainLossINR || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}>
                        {formatINR(state?.realizedGainLossINR, 0, true)}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] ${statusBadge}`}>
                          {state?.status || 'Active'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => openLandedCost(ci)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded font-bold text-[11px] border border-emerald-200 shadow-2xs"
                            title="Landed Cost Sheet (Per-unit true costing with Freight, CHA & BCD)"
                          >
                            <Calculator className="w-3 h-3" />
                            <span>Landed Cost</span>
                          </button>
                          {permissions.canCreateCI ? (
                            <button
                              onClick={() => handleEdit(ci)}
                              className="px-2 py-1 text-indigo-600 hover:text-indigo-800 font-semibold text-xs"
                            >
                              Edit
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-400">View</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Booking Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">
                {editingCI ? `Edit Commercial Invoice: ${editingCI.ciNo}` : 'Book Purchase Bill (Commercial Invoice & BOE)'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Live Status Header */}
              <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-lg grid grid-cols-4 gap-2 text-xs">
                <div>
                  <span className="text-slate-500 block text-[10px]">Unapplied Advance on PI</span>
                  <span className="font-bold text-slate-900">{formatFC(livePreview.alreadyPaidOnPI)} {formData.currency}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Advance to be Adjusted</span>
                  <span className="font-bold text-emerald-700">{formatFC(livePreview.adjustedAdvance)} {formData.currency}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Resulting CI Balance</span>
                  <span className="font-bold text-amber-700">{formatFC(livePreview.resultingCIBalance)} {formData.currency} (Cr)</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Purchase Value INR</span>
                  <span className="font-bold text-indigo-900">{formatINR(livePreview.resultingPurchaseINR, 0, true)}</span>
                </div>
              </div>

              {/* Secondary PI Splits (Multi-PI linkage on one CI) */}
              {availablePIs.some(p => p.id !== formData.linkedPiId) && (() => {
                const secondaryOptions = availablePIs.filter(p => p.id !== formData.linkedPiId);
                const secondaryRows = (formData.linkedPiSplits || []).filter(s => s.piId !== formData.linkedPiId);
                const secondarySum = secondaryRows.reduce((s, x) => s + Number(x.amountFC || 0), 0);
                const primaryShare = Math.max(0, Number(formData.ciValueFC || 0) - secondarySum);

                return (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700">
                        Multi-PI Split Linkage <span className="font-normal text-slate-500">(optional if 1 CI settles multiple PIs)</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const candidate =
                            secondaryOptions.find(p => !secondaryRows.some(r => r.piId === p.id)) || secondaryOptions[0];
                          if (!candidate) return;
                          setFormData({
                            ...formData,
                            linkedPiSplits: [...secondaryRows, { piId: candidate.id, amountFC: 0 }],
                          });
                        }}
                        className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 px-2 py-0.5 bg-indigo-50 rounded border border-indigo-200"
                      >
                        + Add Secondary PI Split
                      </button>
                    </div>

                    {secondaryRows.length > 0 && (
                      <div className="space-y-1.5">
                        {formData.linkedPiId && (
                          <div className="text-[11px] text-slate-600">
                            Primary PI Share: <strong className="text-indigo-700">{formatFC(primaryShare)} {formData.currency}</strong> | Secondary Total: <strong>{formatFC(secondarySum)} {formData.currency}</strong>
                          </div>
                        )}
                        {secondaryRows.map((row, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <select
                              value={row.piId}
                              onChange={e => {
                                const updated = secondaryRows.map((r, i) => (i === idx ? { ...r, piId: e.target.value } : r));
                                setFormData({ ...formData, linkedPiSplits: updated });
                              }}
                              className="flex-1 text-xs p-1.5 rounded border border-slate-300 bg-white"
                            >
                              {secondaryOptions.map(p => {
                                const unapp = engineResult.piStates.get(p.id)?.unappliedAdvanceFC || 0;
                                return (
                                  <option key={p.id} value={p.id}>
                                    {p.piNo} (Unapplied Adv: {formatFC(unapp)} {p.currency})
                                  </option>
                                );
                              })}
                            </select>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="Split FC"
                              value={row.amountFC || ''}
                              onChange={e => {
                                const val = parseFloat(e.target.value) || 0;
                                const updated = secondaryRows.map((r, i) => (i === idx ? { ...r, amountFC: val } : r));
                                setFormData({ ...formData, linkedPiSplits: updated });
                              }}
                              className="w-32 text-xs p-1.5 rounded border border-slate-300 bg-white font-semibold text-right"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const updated = secondaryRows.filter((_, i) => i !== idx);
                                setFormData({ ...formData, linkedPiSplits: updated.length > 0 ? updated : undefined });
                              }}
                              className="text-xs px-2 py-1 text-rose-600 hover:bg-rose-50 rounded font-bold"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="grid grid-cols-3 gap-4">
                {/* Company */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Company *</label>
                  <select
                    value={formData.companyId}
                    onChange={e => {
                      const newCompId = e.target.value;
                      const firstSupp = db.suppliers.find(s => s.active && s.companyId === newCompId);
                      setFormData({
                        ...formData,
                        companyId: newCompId,
                        supplierId: firstSupp?.id || '',
                        currency: firstSupp?.defaultCurrency || formData.currency || 'USD',
                        linkedPiId: '',
                        linkedPiSplits: undefined,
                      });
                    }}
                    className="w-full text-xs p-2 rounded border border-slate-300 bg-white"
                    required
                  >
                    {db.companies.filter(c => c.active).map(c => (
                      <option key={c.id} value={c.id}>{c.code} — {c.fullName}</option>
                    ))}
                  </select>
                </div>

                {/* Supplier */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Supplier *</label>
                  <select
                    value={formData.supplierId}
                    onChange={e => setFormData({ ...formData, supplierId: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-slate-300 bg-white"
                    required
                  >
                    {activeSuppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.vendorCode} — {s.supplierName}</option>
                    ))}
                  </select>
                </div>

                {/* Currency */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Currency *</label>
                  <select
                    value={formData.currency}
                    onChange={e => setFormData({ ...formData, currency: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-slate-300 bg-white"
                    required
                  >
                    {db.currencies.map(c => (
                      <option key={c.code} value={c.code}>{c.code} ({c.name})</option>
                    ))}
                  </select>
                </div>

                {/* Linked PI */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Primary Linked Proforma Invoice</label>
                  <select
                    value={formData.linkedPiId}
                    onChange={e => setFormData({ ...formData, linkedPiId: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-slate-300 bg-white"
                  >
                    <option value="">-- Direct Purchase / No Linked PI --</option>
                    {availablePIs.map(p => {
                      const unapplied = engineResult.piStates.get(p.id)?.unappliedAdvanceFC || 0;
                      return (
                        <option key={p.id} value={p.id}>
                          {p.piNo} (Val: {formatFC(p.piValueFC)} {p.currency} | Unapplied Adv: {formatFC(unapplied)})
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* CI No */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">CI Number *</label>
                  <input
                    type="text"
                    value={formData.ciNo}
                    onChange={e => setFormData({ ...formData, ciNo: e.target.value })}
                    placeholder="e.g. CI-1"
                    className="w-full text-xs p-2 rounded border border-slate-300 uppercase font-semibold"
                    required
                  />
                </div>

                {/* CI Date */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">CI Date *</label>
                  <input
                    type="date"
                    value={formData.ciDate}
                    onChange={e => setFormData({ ...formData, ciDate: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-slate-300"
                    required
                  />
                </div>

                {/* CI Value FC */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">CI Amount (FC) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.ciValueFC || ''}
                    onChange={e => setFormData({ ...formData, ciValueFC: parseFloat(e.target.value) || 0 })}
                    placeholder="e.g. 6000"
                    className="w-full text-xs p-2 rounded border border-slate-300 font-bold"
                    required
                  />
                </div>

                {/* BL / AWB Date */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">BL / AWB Date</label>
                  <input
                    type="date"
                    value={formData.blDate || ''}
                    onChange={e => setFormData({ ...formData, blDate: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-slate-300"
                  />
                </div>

                {/* Tally Voucher */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tally Voucher No</label>
                  <input
                    type="text"
                    value={formData.tallyVoucherNo || ''}
                    onChange={e => setFormData({ ...formData, tallyVoucherNo: e.target.value })}
                    placeholder="e.g. PUR-2627-0012"
                    className="w-full text-xs p-2 rounded border border-slate-300"
                  />
                </div>
              </div>

              {/* BOE Mandatory Section */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center space-x-2 text-xs font-bold text-slate-900 border-b border-slate-200 pb-2">
                  <Receipt className="w-4 h-4 text-indigo-600" />
                  <span>Customs Bill of Entry (BOE) Details (Mandatory)</span>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  {/* BOE No */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">BOE Number *</label>
                    <input
                      type="text"
                      value={formData.boeNo}
                      onChange={e => setFormData({ ...formData, boeNo: e.target.value })}
                      placeholder="e.g. B-111"
                      className="w-full text-xs p-2 rounded border border-slate-300 uppercase font-semibold"
                      required
                    />
                  </div>

                  {/* BOE Date */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">BOE Date *</label>
                    <input
                      type="date"
                      value={formData.boeDate}
                      onChange={e => setFormData({ ...formData, boeDate: e.target.value })}
                      className="w-full text-xs p-2 rounded border border-slate-300"
                      required
                    />
                  </div>

                  {/* Port Code */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Port Code *</label>
                    <input
                      type="text"
                      value={formData.portCode || 'INNSA1'}
                      onChange={e => setFormData({ ...formData, portCode: e.target.value })}
                      placeholder="e.g. INNSA1 (Nhava Sheva)"
                      className="w-full text-xs p-2 rounded border border-slate-300 uppercase"
                      required
                    />
                  </div>

                  {/* BOE Exchange Rate */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">BOE Customs Rate *</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={formData.boeExchangeRate || ''}
                      onChange={e => setFormData({ ...formData, boeExchangeRate: parseFloat(e.target.value) || 0 })}
                      placeholder="e.g. 86.00"
                      className="w-full text-xs p-2 rounded border border-slate-300 font-bold text-indigo-700"
                      required
                    />
                  </div>

                  {/* Tax Invoice Value INR (Optional) */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Tax Invoice Value INR (Optional)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.taxInvoiceValueINR || ''}
                      onChange={e => setFormData({ ...formData, taxInvoiceValueINR: parseFloat(e.target.value) || undefined })}
                      placeholder={`Auto: ${Math.round(Number(formData.ciValueFC || 0) * Number(formData.boeExchangeRate || 0))}`}
                      className="w-full text-xs p-2 rounded border border-slate-300"
                    />
                  </div>

                  {/* Assessable Value INR */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Total BOE Assessable Value INR</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.assessableValueINR || ''}
                      onChange={e => setFormData({ ...formData, assessableValueINR: parseFloat(e.target.value) || 0 })}
                      placeholder="Auto if 0"
                      className="w-full text-xs p-2 rounded border border-slate-300"
                    />
                  </div>

                  {/* Customs Duty INR */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Customs Duty (BCD) INR</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.customsDutyINR || ''}
                      onChange={e => setFormData({ ...formData, customsDutyINR: parseFloat(e.target.value) || 0 })}
                      placeholder="e.g. 50000"
                      className="w-full text-xs p-2 rounded border border-slate-300"
                    />
                  </div>

                  {/* SWS INR */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-slate-700">SWS INR</label>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, swsINR: suggestSWS(Number(formData.customsDutyINR || 0)) })}
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200"
                      >
                        10%
                      </button>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.swsINR || ''}
                      onChange={e => setFormData({ ...formData, swsINR: parseFloat(e.target.value) || 0 })}
                      placeholder="e.g. 5000"
                      className="w-full text-xs p-2 rounded border border-slate-300"
                    />
                  </div>

                  {/* IGST / GST Amount INR */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-slate-700">IGST / GST Amount INR</label>
                      <button
                        type="button"
                        onClick={() => {
                          const effAss =
                            Number(formData.assessableValueINR || 0) > 0
                              ? Number(formData.assessableValueINR)
                              : Math.round(Number(formData.ciValueFC || 0) * Number(formData.boeExchangeRate || 0));
                          setFormData({
                            ...formData,
                            igstINR: suggestIGST(
                              effAss,
                              Number(formData.customsDutyINR || 0),
                              Number(formData.swsINR || 0),
                              18
                            ),
                          });
                        }}
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                      >
                        18%
                      </button>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.igstINR || ''}
                      onChange={e => setFormData({ ...formData, igstINR: parseFloat(e.target.value) || 0 })}
                      placeholder="e.g. 199800"
                      className="w-full text-xs p-2 rounded border border-slate-300 font-semibold text-emerald-700"
                    />
                  </div>

                  {/* Tax Paid Date */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Tax Paid Date</label>
                    <input
                      type="date"
                      value={formData.taxPaidDate || ''}
                      onChange={e => setFormData({ ...formData, taxPaidDate: e.target.value })}
                      className="w-full text-xs p-2 rounded border border-slate-300"
                    />
                  </div>

                  {/* Challan No */}
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">TR-6 / ICEGATE Challan No</label>
                    <input
                      type="text"
                      value={formData.challanNo || ''}
                      onChange={e => setFormData({ ...formData, challanNo: e.target.value })}
                      placeholder="Optional customs duty challan reference"
                      className="w-full text-xs p-2 rounded border border-slate-300"
                    />
                  </div>

                  {/* Live Total Tax Summary */}
                  <div className="flex items-end">
                    <div className="w-full p-2 rounded bg-white border border-slate-200 flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-600">Total Tax Amount:</span>
                      <span className="font-extrabold font-mono text-slate-900">
                        {formatINR(
                          round2(
                            Number(formData.customsDutyINR || 0) +
                            Number(formData.swsINR || 0) +
                            Number(formData.igstINR || 0)
                          )
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Remarks</label>
                <input
                  type="text"
                  value={formData.remarks || ''}
                  onChange={e => setFormData({ ...formData, remarks: e.target.value })}
                  placeholder="Consignment details, container no..."
                  className="w-full text-xs p-2 rounded border border-slate-300"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm"
                >
                  {editingCI ? 'Update CI Bill' : 'Book CI Bill'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Landed Cost Sheet Modal */}
      {landedCostCI && landedCostSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-200">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                  <Calculator className="w-4 h-4 text-emerald-700" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                    <span>True Landed Cost Voucher (AS-2 / Ind AS Compliant)</span>
                    <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[10px] font-mono">
                      CI: {landedCostCI.ciNo}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-mono">
                      BOE: {landedCostCI.boeNo}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Allocates Customs Duty (BCD+SWS), International Freight, CHA agency fees, CFS, and Inward Transportation to item-wise unit cost
                  </p>
                </div>
              </div>
              <button
                onClick={() => setLandedCostCI(null)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1 rounded-lg hover:bg-slate-200"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto space-y-5 text-xs">
              {/* Summary Metrics Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[10px] text-slate-500 font-semibold uppercase">Invoice Base FOB</div>
                  <div className="text-sm font-extrabold text-slate-900 mt-0.5">
                    {formatFC(landedCostCI.ciValueFC)} {landedCostCI.currency}
                  </div>
                  <div className="text-[10px] text-slate-400">@ ₹{landedCostCI.boeExchangeRate} Customs Rate</div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[10px] text-slate-500 font-semibold uppercase">Base Purchase (INR)</div>
                  <div className="text-sm font-extrabold text-slate-900 mt-0.5">
                    {formatINR(landedCostSummary.totalFobINR)}
                  </div>
                  <div className="text-[10px] text-slate-400">Excl. Duties &amp; Taxes</div>
                </div>

                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                  <div className="text-[10px] text-amber-800 font-semibold uppercase">Duty Loaded (BCD+SWS)</div>
                  <div className="text-sm font-extrabold text-amber-900 mt-0.5">
                    {formatINR(landedCostSummary.totalNonCreditableDutyINR)}
                  </div>
                  <div className="text-[10px] text-amber-700">Non-Creditable Tax</div>
                </div>

                <div className="p-3 rounded-xl bg-sky-50 border border-sky-200">
                  <div className="text-[10px] text-sky-800 font-semibold uppercase">Freight, CHA &amp; CFS</div>
                  <div className="text-sm font-extrabold text-sky-900 mt-0.5">
                    {formatINR(
                      landedCostSummary.totalFreightINR +
                      landedCostSummary.totalInsuranceINR +
                      landedCostSummary.totalChaINR +
                      landedCostSummary.totalPortCfsINR +
                      landedCostSummary.totalLocalTransportINR +
                      landedCostSummary.totalOtherINR
                    )}
                  </div>
                  <div className="text-[10px] text-sky-700">Allocated Overheads</div>
                </div>

                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300">
                  <div className="text-[10px] text-emerald-800 font-bold uppercase">Grand Total Landed</div>
                  <div className="text-sm font-black text-emerald-900 mt-0.5">
                    {formatINR(landedCostSummary.grandTotalLandedINR)}
                  </div>
                  <div className="text-[10px] text-emerald-700 font-semibold">Total Factory Cost</div>
                </div>

                <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200">
                  <div className="text-[10px] text-indigo-800 font-bold uppercase">Landed Multiplier</div>
                  <div className="text-base font-black text-indigo-900 mt-0.5">
                    {landedCostSummary.averageLandedMultiplier}x
                  </div>
                  <div className="text-[10px] text-indigo-700">Cost Factor on FOB</div>
                </div>
              </div>

              {/* Expense Allocation Form */}
              <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                  <h4 className="font-bold text-slate-800 flex items-center gap-1.5">
                    <span>Inward Expenses &amp; Clearance Charges</span>
                    <span className="text-[10px] text-slate-500 font-normal">(Enter amounts from CHA bill, Freight invoices, &amp; Transport receipts)</span>
                  </h4>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-slate-700">Allocation Method:</span>
                    <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
                      <button
                        type="button"
                        onClick={() => setLcConfig({ ...lcConfig, allocationMethod: 'value' })}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-colors ${
                          lcConfig.allocationMethod === 'value'
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        By Item Value (FOB)
                      </button>
                      <button
                        type="button"
                        onClick={() => setLcConfig({ ...lcConfig, allocationMethod: 'quantity' })}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-colors ${
                          lcConfig.allocationMethod === 'quantity'
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        By Quantity
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      International Freight (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={lcConfig.internationalFreightINR || ''}
                      onChange={e => setLcConfig({ ...lcConfig, internationalFreightINR: parseFloat(e.target.value) || 0 })}
                      placeholder="0.00"
                      className="w-full p-2 rounded-lg border border-slate-300 font-mono text-right"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Marine Insurance (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={lcConfig.insuranceINR || ''}
                      onChange={e => setLcConfig({ ...lcConfig, insuranceINR: parseFloat(e.target.value) || 0 })}
                      placeholder="0.00"
                      className="w-full p-2 rounded-lg border border-slate-300 font-mono text-right"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      CHA Agency &amp; Filing (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={lcConfig.chaChargesINR || ''}
                      onChange={e => setLcConfig({ ...lcConfig, chaChargesINR: parseFloat(e.target.value) || 0 })}
                      placeholder="0.00"
                      className="w-full p-2 rounded-lg border border-slate-300 font-mono text-right font-bold text-indigo-700"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Port / CFS / THC (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={lcConfig.portHandlingCfsINR || ''}
                      onChange={e => setLcConfig({ ...lcConfig, portHandlingCfsINR: parseFloat(e.target.value) || 0 })}
                      placeholder="0.00"
                      className="w-full p-2 rounded-lg border border-slate-300 font-mono text-right"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Inward Local Transport (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={lcConfig.localTransportINR || ''}
                      onChange={e => setLcConfig({ ...lcConfig, localTransportINR: parseFloat(e.target.value) || 0 })}
                      placeholder="0.00"
                      className="w-full p-2 rounded-lg border border-slate-300 font-mono text-right font-bold text-emerald-700"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Other / Demurrage (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={lcConfig.otherChargesINR || ''}
                      onChange={e => setLcConfig({ ...lcConfig, otherChargesINR: parseFloat(e.target.value) || 0 })}
                      placeholder="0.00"
                      className="w-full p-2 rounded-lg border border-slate-300 font-mono text-right text-rose-700"
                    />
                  </div>
                </div>
              </div>

              {/* Item-wise Landed Cost Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <div className="bg-slate-100/90 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                  <span className="font-extrabold text-slate-800">
                    Item-wise Landed Cost Breakdown ({landedCostSummary.items.length} items)
                  </span>
                  <span className="text-[11px] text-slate-500">
                    All numbers in Indian Rupees (₹)
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] text-left">
                    <thead className="bg-slate-50 text-slate-600 font-bold uppercase border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2">Item Code &amp; Description</th>
                        <th className="px-2 py-2 text-right">Qty</th>
                        <th className="px-2 py-2 text-right">FOB (INR)</th>
                        <th className="px-2 py-2 text-right">BCD + SWS</th>
                        <th className="px-2 py-2 text-right">Freight &amp; Ins</th>
                        <th className="px-2 py-2 text-right">CHA &amp; Port</th>
                        <th className="px-2 py-2 text-right">Local Trp</th>
                        <th className="px-3 py-2 text-right font-extrabold bg-emerald-50/50">Total Landed (₹)</th>
                        <th className="px-3 py-2 text-right font-extrabold bg-indigo-50/50">Unit Landed (₹)</th>
                        <th className="px-2 py-2 text-center">Multiplier</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {landedCostSummary.items.map(row => (
                        <tr key={row.lineId} className="hover:bg-slate-50/80">
                          <td className="px-3 py-2">
                            <div className="font-bold text-slate-900">{row.itemName}</div>
                            <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1.5 flex-wrap">
                              <span className="px-1 py-0.2 rounded bg-indigo-50 text-indigo-700 font-bold" title="Our SAP Code">
                                SAP: {row.itemCode}
                              </span>
                              {row.supplierItemCode && (
                                <span className="px-1 py-0.2 rounded bg-emerald-50 text-emerald-700 font-bold" title="Supplier Part Code">
                                  Supp: {row.supplierItemCode}
                                </span>
                              )}
                              <span>• {formatFC(row.unitPriceFC)} {row.currency}</span>
                            </div>
                          </td>
                          <td className="px-2 py-2 text-right font-mono font-semibold">
                            {row.qty} {row.uom}
                          </td>
                          <td className="px-2 py-2 text-right font-mono font-semibold text-slate-800">
                            {formatINR(row.fobAmountINR)}
                          </td>
                          <td className="px-2 py-2 text-right font-mono text-amber-800">
                            {formatINR(round2(row.bcdAmountINR + row.swsAmountINR))}
                          </td>
                          <td className="px-2 py-2 text-right font-mono text-slate-600">
                            {formatINR(round2(row.allocatedFreightINR + row.allocatedInsuranceINR))}
                          </td>
                          <td className="px-2 py-2 text-right font-mono text-indigo-700 font-semibold">
                            {formatINR(round2(row.allocatedChaINR + row.allocatedPortCfsINR))}
                          </td>
                          <td className="px-2 py-2 text-right font-mono text-slate-700">
                            {formatINR(row.allocatedLocalTransportINR)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-black text-emerald-800 bg-emerald-50/40">
                            {formatINR(row.totalLandedCostINR)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-black text-indigo-900 bg-indigo-50/40 text-xs">
                            ₹{formatINR(row.landedCostPerUnitINR)} <span className="text-[9px] font-normal text-slate-400">/{row.uom}</span>
                          </td>
                          <td className="px-2 py-2 text-center font-mono font-bold text-slate-700">
                            {row.landedMultiplier}x
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-100 font-bold border-t border-slate-300">
                      <tr>
                        <td className="px-3 py-2 text-slate-800">TOTAL CONSIGNMENT</td>
                        <td className="px-2 py-2 text-right font-mono">
                          {landedCostSummary.items.reduce((s, x) => s + x.qty, 0)}
                        </td>
                        <td className="px-2 py-2 text-right font-mono">{formatINR(landedCostSummary.totalFobINR)}</td>
                        <td className="px-2 py-2 text-right font-mono">{formatINR(landedCostSummary.totalNonCreditableDutyINR)}</td>
                        <td className="px-2 py-2 text-right font-mono">
                          {formatINR(round2(landedCostSummary.totalFreightINR + landedCostSummary.totalInsuranceINR))}
                        </td>
                        <td className="px-2 py-2 text-right font-mono">
                          {formatINR(round2(landedCostSummary.totalChaINR + landedCostSummary.totalPortCfsINR))}
                        </td>
                        <td className="px-2 py-2 text-right font-mono">{formatINR(landedCostSummary.totalLocalTransportINR)}</td>
                        <td className="px-3 py-2 text-right font-mono font-black text-emerald-900 bg-emerald-100/60">
                          {formatINR(landedCostSummary.grandTotalLandedINR)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-black text-indigo-900 bg-indigo-100/60 text-xs">
                          —
                        </td>
                        <td className="px-2 py-2 text-center font-mono font-black">{landedCostSummary.averageLandedMultiplier}x</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Statutory Note on IGST */}
              <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl text-slate-700 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5 text-[11px]">
                  <span className="font-bold text-indigo-950">Statutory Inventory Valuation Principle (AS-2 / Ind AS 2):</span>
                  <p>
                    Basic Customs Duty (BCD) aur Social Welfare Surcharge (SWS) non-creditable hote hain, isliye inhe inventory valuation me load kiya gaya hai.
                    Commercial Invoice par bhara gaya <strong>IGST of {formatINR(landedCostCI.igstINR || 0)}</strong> is calculation me exclude kiya gaya hai kyunki iska 100% Input Tax Credit (ITC) GSTR-2B me set-off mil jata hai.
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11px] text-slate-500 font-semibold">
                Use unit landed cost for SAP / Tally stock item standard purchase rates.
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleExportLandedCostSheet}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg border border-slate-300 text-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Excel</span>
                </button>

                <button
                  type="button"
                  onClick={() => setLandedCostCI(null)}
                  className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium rounded-lg text-xs"
                >
                  Cancel
                </button>

                {permissions.canCreateCI && (
                  <button
                    type="button"
                    onClick={handleSaveLandedCost}
                    className="flex items-center space-x-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm text-xs"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Save Landed Cost Voucher</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Excel Batch Grid Modal */}
      <ExcelBatchGridModal
        isOpen={showExcelGrid}
        initialEntity="ci"
        onClose={() => setShowExcelGrid(false)}
      />
    </div>
  );
};
