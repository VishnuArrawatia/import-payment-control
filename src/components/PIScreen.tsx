import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { ProformaInvoice, PaymentTerms, PIItemLine } from '../types';
import { formatFC, formatDate, round2 } from '../utils/formatters';
import { exportToExcel } from '../utils/excel';
import { Plus, Download, Copy, Search, CheckCircle2, AlertCircle, FileText, Trash2, FileSpreadsheet } from 'lucide-react';
import { ExcelBatchGridModal } from './ExcelBatchGridModal';

export const PIScreen: React.FC = () => {
  const { db, engineResult, selectedCompanyId, savePI } = useApp();
  const { permissions } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editingPI, setEditingPI] = useState<ProformaInvoice | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<ProformaInvoice>>({
    companyId: selectedCompanyId !== 'ALL' ? selectedCompanyId : db.companies[0]?.id || '',
    supplierId: db.suppliers[0]?.id || '',
    currency: 'USD',
    piNo: '',
    piDate: new Date().toISOString().split('T')[0],
    piValueFC: 0,
    advancePercentage: 30,
    paymentTerms: 'Part advance + balance',
    creditDays: 30,
    expectedShipmentDate: '',
    requisitionId: '',
    items: [],
    remarks: '',
    attachments: '',
    isClosed: false,
  });

  // Filtered suppliers for current company
  const activeSuppliers = db.suppliers.filter(
    s => s.active && (!formData.companyId || s.companyId === formData.companyId)
  );

  const handleOpenAdd = () => {
    setEditingPI(null);
    setErrorMsg(null);
    const compId = selectedCompanyId !== 'ALL' ? selectedCompanyId : db.companies[0]?.id || '';
    const compSupps = db.suppliers.filter(s => s.active && s.companyId === compId);
    setFormData({
      companyId: compId,
      supplierId: compSupps[0]?.id || '',
      currency: compSupps[0]?.defaultCurrency || 'USD',
      piNo: '',
      piDate: new Date().toISOString().split('T')[0],
      piValueFC: 0,
      advancePercentage: 30,
      paymentTerms: 'Part advance + balance',
      creditDays: 30,
      expectedShipmentDate: '',
      requisitionId: '',
      items: [],
      remarks: '',
      attachments: '',
      isClosed: false,
    });
    setShowModal(true);
  };

  const handleDuplicateLast = () => {
    const list = db.proformaInvoices;
    if (list.length === 0) return;
    const last = list[list.length - 1];
    setEditingPI(null);
    setErrorMsg(null);
    setFormData({
      ...last,
      id: undefined,
      piNo: `${last.piNo}-COPY`,
      piDate: new Date().toISOString().split('T')[0],
      isClosed: false,
    });
    setShowModal(true);
  };

  const handleEdit = (pi: ProformaInvoice) => {
    setEditingPI(pi);
    setErrorMsg(null);
    setFormData({ ...pi });
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.companyId || !formData.supplierId || !formData.piNo || !formData.piValueFC || formData.piValueFC <= 0) {
      setErrorMsg('Please fill all mandatory fields (Company, Supplier, PI No, PI Value > 0).');
      return;
    }

    const cleanedItems = (formData.items || [])
      .filter(i => i.itemName.trim() && Number(i.orderedQty) > 0)
      .map(i => ({ ...i, amountFC: round2(Number(i.orderedQty) * Number(i.unitPriceFC || 0)) }));

    const payload: ProformaInvoice = {
      id: editingPI ? editingPI.id : `PI-${Date.now()}`,
      companyId: formData.companyId!,
      supplierId: formData.supplierId!,
      currency: formData.currency || 'USD',
      piNo: formData.piNo.trim(),
      piDate: formData.piDate || new Date().toISOString().split('T')[0],
      piValueFC: Number(formData.piValueFC),
      advancePercentage: Number(formData.advancePercentage || 0),
      paymentTerms: (formData.paymentTerms as PaymentTerms) || 'Part advance + balance',
      creditDays: Number(formData.creditDays || 0),
      expectedShipmentDate: formData.expectedShipmentDate || undefined,
      requisitionId: formData.requisitionId || editingPI?.requisitionId,
      items: cleanedItems.length > 0 ? cleanedItems : editingPI?.items,
      remarks: formData.remarks || undefined,
      attachments: formData.attachments || undefined,
      isClosed: Boolean(formData.isClosed),
      createdAt: editingPI?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const res = savePI(payload);
    if (!res.success) {
      setErrorMsg(res.error || 'Failed to save PI.');
      return;
    }

    setShowModal(false);
  };

  // Filtered PI list
  const filteredPIs = db.proformaInvoices.filter(pi => {
    if (selectedCompanyId !== 'ALL' && pi.companyId !== selectedCompanyId) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const supp = db.suppliers.find(s => s.id === pi.supplierId);
      return (
        pi.piNo.toLowerCase().includes(q) ||
        supp?.supplierName.toLowerCase().includes(q) ||
        supp?.vendorCode.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleExport = () => {
    const data = filteredPIs.map(pi => {
      const st = engineResult.piStates.get(pi.id);
      const comp = db.companies.find(c => c.id === pi.companyId);
      const supp = db.suppliers.find(s => s.id === pi.supplierId);
      const linkedPr = pi.requisitionId
        ? (db.purchaseRequisitions || []).find(r => r.id === pi.requisitionId)
        : undefined;
      const baseRow: Record<string, unknown> = {
        Company: comp?.code,
        Supplier: supp?.supplierName,
        'Vendor Code': supp?.vendorCode,
        'PI No': pi.piNo,
        'PI Date': formatDate(pi.piDate),
        'PR Ref': linkedPr?.prNo || '-',
        'Item Lines': (pi.items || []).length,
        Currency: pi.currency,
        'PI Value FC': pi.piValueFC,
        'Advance %': pi.advancePercentage,
      };
      if (permissions.canViewFinance) {
        baseRow['Advance Req FC'] = st?.advanceRequiredFC;
        baseRow['Paid FC'] = st?.totalPaidFC;
        baseRow['Shipped FC'] = st?.shippedFC;
        baseRow['Unapplied Adv FC'] = st?.unappliedAdvanceFC;
        baseRow['Linked Payments (Bank Refs)'] = (st?.payments || []).map(p => p.bankReferenceNo).join(', ') || '-';
        baseRow['Linked CIs & BOEs'] = (st?.cis || []).map(c => `${c.ciNo} (${c.boeNo})`).join(', ') || '-';
        baseRow['Status'] = st?.status;
      } else {
        baseRow['Shipped FC'] = st?.shippedFC;
      }
      baseRow['Closed'] = pi.isClosed ? 'Yes' : 'No';
      baseRow['Terms'] = pi.paymentTerms;
      baseRow['Credit Days'] = pi.creditDays;
      baseRow['Remarks'] = pi.remarks || '';
      return baseRow;
    });
    exportToExcel(data, 'PI_Register');
  };

  return (
    <div className="p-6 space-y-4">
      {/* Action Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-base font-bold text-slate-900">Proforma Invoices (PI)</h2>
          <p className="text-xs text-slate-500">
            Manage purchase orders & proforma invoices, advance requirements, shipment schedules and closure flags
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search PI / Supplier..."
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

          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center space-x-1 text-xs px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold rounded-lg border border-emerald-300 transition-colors cursor-pointer"
            title="Batch upload Proforma Invoices from Excel"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Upload PI Register</span>
          </button>

          {permissions.canCreatePI ? (
            <>
              <button
                onClick={handleDuplicateLast}
                className="flex items-center space-x-1 text-xs px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium rounded-lg border border-indigo-200 transition-colors"
                title="Duplicate last entered PI"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Duplicate Last</span>
              </button>

              <button
                onClick={handleOpenAdd}
                className="flex items-center space-x-1 text-xs px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-sm transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ New PI</span>
              </button>
            </>
          ) : (
            <span className="text-[11px] font-semibold px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg">
              Read-Only Access
            </span>
          )}
        </div>
      </div>

      {/* PI Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-100 text-slate-700 font-semibold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-3 py-2.5">Company</th>
                <th className="px-3 py-2.5">Supplier</th>
                <th className="px-3 py-2.5">PI No & Date</th>
                <th className="px-3 py-2.5 text-right">PI Value FC</th>
                <th className="px-3 py-2.5 text-right">Adv % / Req FC</th>
                {permissions.canViewFinance && (
                  <th className="px-3 py-2.5 text-right text-emerald-800 bg-emerald-50/40">Paid FC</th>
                )}
                <th className="px-3 py-2.5 text-right text-indigo-800 bg-indigo-50/40">Shipped FC</th>
                <th className="px-3 py-2.5">{permissions.canViewFinance ? 'Linked Payments & BOEs' : 'Linked CIs & BOEs'}</th>
                <th className="px-3 py-2.5 text-center">Status</th>
                <th className="px-3 py-2.5 text-center">Closure</th>
                <th className="px-3 py-2.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPIs.length === 0 ? (
                <tr>
                  <td colSpan={permissions.canViewFinance ? 11 : 10} className="px-4 py-8 text-center text-slate-400">
                    No Proforma Invoices found. Click "+ New PI" to create one.
                  </td>
                </tr>
              ) : (
                filteredPIs.map(pi => {
                  const comp = db.companies.find(c => c.id === pi.companyId);
                  const supp = db.suppliers.find(s => s.id === pi.supplierId);
                  const state = engineResult.piStates.get(pi.id);
                  const linkedPr = pi.requisitionId
                    ? (db.purchaseRequisitions || []).find(r => r.id === pi.requisitionId)
                    : undefined;

                  // Status badge styling
                  let statusColor = 'bg-slate-100 text-slate-700';
                  if (state?.status === 'Settled') statusColor = 'bg-emerald-100 text-emerald-800';
                  else if (state?.status === 'Overdue') statusColor = 'bg-rose-100 text-rose-800 font-bold';
                  else if (state?.status === 'Excess paid - DN suggested') statusColor = 'bg-amber-100 text-amber-900 font-bold animate-pulse';
                  else if (state?.status === 'Payment due') statusColor = 'bg-sky-100 text-sky-800';
                  else if (state?.status?.includes('Advance')) statusColor = 'bg-indigo-50 text-indigo-700';

                  return (
                    <tr key={pi.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-3 py-2.5 font-bold text-slate-900">{comp?.code}</td>
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-slate-900">{supp?.supplierName}</div>
                        <div className="text-[10px] text-slate-400">{supp?.vendorCode} • {supp?.country}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-bold text-indigo-600 flex items-center gap-1 flex-wrap">
                          <span>{pi.piNo}</span>
                          {linkedPr && (
                            <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[9px] font-bold">
                              PR: {linkedPr.prNo}
                            </span>
                          )}
                        </div>
                        <div className="text-slate-400">
                          {formatDate(pi.piDate)}
                          {(pi.items || []).length > 0 && ` • ${pi.items!.length} items`}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-extrabold text-slate-900">
                        {formatFC(pi.piValueFC)} <span className="text-[10px] text-slate-500 font-normal">{pi.currency}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="font-semibold">{pi.advancePercentage}%</div>
                        {permissions.canViewFinance && (
                          <div className="text-slate-500">{formatFC(state?.advanceRequiredFC)}</div>
                        )}
                      </td>
                      {permissions.canViewFinance && (
                        <td className="px-3 py-2.5 text-right font-bold text-emerald-700 bg-emerald-50/20">
                          {formatFC(state?.totalPaidFC)}
                        </td>
                      )}
                      <td className="px-3 py-2.5 text-right font-bold text-indigo-700 bg-indigo-50/20">
                        {formatFC(state?.shippedFC)}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="space-y-1">
                          {permissions.canViewFinance && (
                            (state?.payments || []).length > 0 ? (
                              <div className="text-[10px] text-slate-600">
                                <span className="font-semibold text-slate-700">Pay:</span>{' '}
                                {state!.payments.slice(0, 2).map(p => p.bankReferenceNo).join(', ')}
                                {state!.payments.length > 2 ? ` +${state!.payments.length - 2}` : ''}
                              </div>
                            ) : (
                              <div className="text-[10px] text-slate-400">No payments yet</div>
                            )
                          )}
                          {(state?.cis || []).length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {state!.cis.slice(0, 2).map(c => {
                                const isPend = !c.boeNo || c.boeNo.startsWith('PENDING-');
                                return (
                                  <span
                                    key={c.id}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                      isPend ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                                    }`}
                                  >
                                    {c.ciNo} → {c.boeNo}
                                  </span>
                                );
                              })}
                              {state!.cis.length > 2 && (
                                <span className="text-[10px] text-slate-500">+{state!.cis.length - 2} more</span>
                              )}
                            </div>
                          ) : permissions.canViewFinance && (state?.totalPaidFC || 0) > 0 ? (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800">
                              CI & BOE Pending
                            </span>
                          ) : !permissions.canViewFinance ? (
                            <span className="text-[10px] text-slate-400">Awaiting shipment CI</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusColor}`}>
                          {state?.status || 'Active'}
                        </span>
                        {state?.complianceFlags && state.complianceFlags.length > 0 && (
                          <div className="text-[10px] text-rose-600 font-bold mt-0.5 flex items-center justify-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            <span>{state.complianceFlags[0]}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {pi.isClosed ? (
                          <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px] font-semibold">
                            Closed
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-semibold">
                            Open
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {permissions.canCreatePI ? (
                          <button
                            onClick={() => handleEdit(pi)}
                            className="px-2 py-1 text-indigo-600 hover:text-indigo-800 font-semibold"
                          >
                            Edit
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400">View only</span>
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

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">
                {editingPI ? `Edit Proforma Invoice: ${editingPI.piNo}` : 'Create Proforma Invoice (PI)'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 text-base font-bold">
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

              <div className="grid grid-cols-2 gap-4">
                {/* Company */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Company *</label>
                  <select
                    value={formData.companyId}
                    onChange={e => setFormData({ ...formData, companyId: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-slate-300 bg-white focus:ring-1 focus:ring-indigo-500"
                    required
                  >
                    {db.companies.filter(c => c.active).map(c => (
                      <option key={c.id} value={c.id}>
                        {c.code} — {c.fullName}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Supplier */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Supplier *</label>
                  <select
                    value={formData.supplierId}
                    onChange={e => setFormData({ ...formData, supplierId: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-slate-300 bg-white focus:ring-1 focus:ring-indigo-500"
                    required
                  >
                    {activeSuppliers.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.vendorCode} — {s.supplierName}
                      </option>
                    ))}
                  </select>
                </div>

                {/* PI No */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">PI Number *</label>
                  <input
                    type="text"
                    value={formData.piNo}
                    onChange={e => setFormData({ ...formData, piNo: e.target.value })}
                    placeholder="e.g. PI-101"
                    className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-indigo-500 uppercase"
                    required
                  />
                </div>

                {/* PI Date */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">PI Date *</label>
                  <input
                    type="date"
                    value={formData.piDate}
                    onChange={e => setFormData({ ...formData, piDate: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-indigo-500"
                    required
                  />
                </div>

                {/* Currency */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Currency *</label>
                  <select
                    value={formData.currency}
                    onChange={e => setFormData({ ...formData, currency: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-slate-300 bg-white focus:ring-1 focus:ring-indigo-500"
                    required
                  >
                    {db.currencies.map(c => (
                      <option key={c.code} value={c.code}>
                        {c.code} ({c.name})
                      </option>
                    ))}
                  </select>
                </div>

                {/* PI Value FC */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700">PI Value (Foreign Currency) *</label>
                    {editingPI && (engineResult.piStates.get(editingPI.id)?.totalPaidFC || 0) > 0 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                        Paid: {formatFC(engineResult.piStates.get(editingPI.id)?.totalPaidFC)} {formData.currency}
                      </span>
                    )}
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.piValueFC || ''}
                    onChange={e => setFormData({ ...formData, piValueFC: parseFloat(e.target.value) || 0 })}
                    placeholder="e.g. 10000"
                    className="w-full text-xs p-2 rounded border border-slate-300 font-bold focus:ring-1 focus:ring-indigo-500"
                    required
                  />
                  {editingPI && (engineResult.piStates.get(editingPI.id)?.totalPaidFC || 0) > 0 && (
                    <div className="mt-1.5 p-2 rounded-lg bg-indigo-50/80 border border-indigo-200 text-[11px] space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600 font-medium">Paid by Treasury:</span>
                        <span className="font-bold text-emerald-700 font-mono">
                          {formatFC(engineResult.piStates.get(editingPI.id)?.totalPaidFC)} {formData.currency}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600 font-medium">Balance Payable:</span>
                        <span className={(formData.piValueFC || 0) >= (engineResult.piStates.get(editingPI.id)?.totalPaidFC || 0) ? 'font-bold text-indigo-700 font-mono' : 'font-bold text-amber-800 font-mono'}>
                          {formatFC(Math.max(0, (formData.piValueFC || 0) - (engineResult.piStates.get(editingPI.id)?.totalPaidFC || 0)))} {formData.currency}
                          {(formData.piValueFC || 0) < (engineResult.piStates.get(editingPI.id)?.totalPaidFC || 0) && (
                            <span className="text-[10px] ml-1 text-amber-700 font-normal">
                              (Excess Advance Paid: {formatFC((engineResult.piStates.get(editingPI.id)?.totalPaidFC || 0) - (formData.piValueFC || 0))})
                            </span>
                          )}
                        </span>
                      </div>
                      <p className="text-[10px] text-indigo-600 font-medium pt-0.5">
                        ✓ PI Value is fully editable after payments. Open order and advance knock-offs update dynamically.
                      </p>
                    </div>
                  )}
                </div>

                {/* Advance % */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Advance Required %</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={formData.advancePercentage}
                    onChange={e => setFormData({ ...formData, advancePercentage: parseFloat(e.target.value) || 0 })}
                    placeholder="e.g. 30"
                    className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                {/* Payment Terms */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Terms</label>
                  <select
                    value={formData.paymentTerms}
                    onChange={e => setFormData({ ...formData, paymentTerms: e.target.value as PaymentTerms })}
                    className="w-full text-xs p-2 rounded border border-slate-300 bg-white focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="Part advance + balance">Part advance + balance</option>
                    <option value="Advance">Full Advance</option>
                    <option value="LC">Letter of Credit (LC)</option>
                    <option value="Credit">Credit</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                {/* Credit Days for Balance */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Credit Days for Balance</label>
                  <input
                    type="number"
                    value={formData.creditDays}
                    onChange={e => setFormData({ ...formData, creditDays: parseInt(e.target.value) || 0 })}
                    placeholder="e.g. 30"
                    className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                {/* Expected Shipment Date */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Expected Shipment Date</label>
                  <input
                    type="date"
                    value={formData.expectedShipmentDate || ''}
                    onChange={e => setFormData({ ...formData, expectedShipmentDate: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Remarks / Goods Description</label>
                <input
                  type="text"
                  value={formData.remarks || ''}
                  onChange={e => setFormData({ ...formData, remarks: e.target.value })}
                  placeholder="Notes, specification, terms..."
                  className="w-full text-xs p-2 rounded border border-slate-300 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Optional Item-wise PI Lines */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-3 py-2 border-b flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">
                    Item-wise Breakdown <span className="font-normal text-slate-500">(optional — required for partial dispatch &amp; receipt tracking)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const compItems = (db.items || []).filter(i => i.active && i.companyId === formData.companyId);
                      const m = compItems[0];
                      const supMap = m?.supplierMappings?.find(x => x.supplierId === formData.supplierId);
                      const newLine: PIItemLine = {
                        lineId: `PIL-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                        itemId: m?.id,
                        itemCode: m?.itemCode || `ITM-${(formData.items || []).length + 1}`,
                        itemName: m?.itemName || '',
                        supplierItemCode: supMap?.supplierItemCode || '',
                        supplierItemName: supMap?.supplierItemName || '',
                        hsnCode: m?.hsnCode || '8504',
                        uom: m?.uom || 'PCS',
                        orderedQty: 100,
                        unitPriceFC: m?.standardRateFC || 0,
                        amountFC: round2(100 * (m?.standardRateFC || 0)),
                        bcdRatePct: m?.bcdRatePct ?? 7.5,
                        igstRatePct: m?.igstRatePct ?? 18,
                        igcrEligible: m?.igcrEligible ?? false,
                        igcrBcdRatePct: m?.igcrBcdRatePct ?? 0,
                        igcrNotificationNo: m?.igcrNotificationNo,
                        igcrEndUse: m?.igcrEndUse,
                      };
                      const nextItems = [...(formData.items || []), newLine];
                      const sumFC = round2(nextItems.reduce((s, x) => s + x.amountFC, 0));
                      setFormData({
                        ...formData,
                        items: nextItems,
                        piValueFC: sumFC > 0 ? sumFC : formData.piValueFC,
                      });
                    }}
                    className="text-[11px] font-bold px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded border border-indigo-200 hover:bg-indigo-100"
                  >
                    + Add PI Item
                  </button>
                </div>
                {(formData.items || []).length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px] text-left">
                      <thead className="bg-slate-100 font-bold text-slate-600 border-b">
                        <tr>
                          <th className="px-2 py-1.5">Item</th>
                          <th className="px-2 py-1.5">HSN</th>
                          <th className="px-2 py-1.5 text-right">Qty</th>
                          <th className="px-2 py-1.5 text-right">Rate FC</th>
                          <th className="px-2 py-1.5 text-right">Amt FC</th>
                          <th className="px-2 py-1.5"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(formData.items || []).map((it, idx) => (
                          <tr key={it.lineId}>
                            <td className="px-2 py-1.5 min-w-[160px] space-y-1">
                              {(db.items || []).filter(m => m.active && m.companyId === formData.companyId).length > 0 && (
                                <select
                                  value={it.itemId || ''}
                                  onChange={e => {
                                    const m = (db.items || []).find(x => x.id === e.target.value);
                                    if (!m) return;
                                    const supMap = m.supplierMappings?.find(x => x.supplierId === formData.supplierId);
                                    const next = (formData.items || []).map((r, i) =>
                                      i === idx
                                        ? {
                                            ...r,
                                            itemId: m.id,
                                            itemCode: m.itemCode,
                                            itemName: m.itemName,
                                            supplierItemCode: supMap?.supplierItemCode || r.supplierItemCode || '',
                                            supplierItemName: supMap?.supplierItemName || r.supplierItemName || '',
                                            hsnCode: m.hsnCode,
                                            uom: m.uom,
                                            unitPriceFC: m.standardRateFC,
                                            amountFC: round2(Number(r.orderedQty) * m.standardRateFC),
                                            bcdRatePct: m.bcdRatePct,
                                            igstRatePct: m.igstRatePct,
                                            igcrEligible: m.igcrEligible,
                                            igcrBcdRatePct: m.igcrBcdRatePct,
                                            igcrNotificationNo: m.igcrNotificationNo,
                                            igcrEndUse: m.igcrEndUse,
                                          }
                                        : r
                                    );
                                    const sumFC = round2(next.reduce((s, x) => s + x.amountFC, 0));
                                    setFormData({ ...formData, items: next, piValueFC: sumFC > 0 ? sumFC : formData.piValueFC });
                                  }}
                                  className="w-full p-1 rounded border bg-white"
                                >
                                  <option value="">-- Pick Catalog Item --</option>
                                  {(db.items || [])
                                    .filter(m => m.active && m.companyId === formData.companyId)
                                    .map(m => (
                                      <option key={m.id} value={m.id}>{m.itemCode} — {m.itemName}</option>
                                    ))}
                                </select>
                              )}
                              <input
                                type="text"
                                placeholder="Item Description (Our Book / SAP) *"
                                value={it.itemName}
                                onChange={e => {
                                  const next = (formData.items || []).map((r, i) =>
                                    i === idx ? { ...r, itemName: e.target.value } : r
                                  );
                                  setFormData({ ...formData, items: next });
                                }}
                                className="w-full p-1 rounded border"
                              />
                              <div className="flex items-center gap-1.5 pt-0.5 text-[10px]">
                                <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-mono font-bold shrink-0" title="Our SAP / Book Item Code">
                                  SAP: {it.itemCode || 'Auto'}
                                </span>
                                <input
                                  type="text"
                                  placeholder="Supplier Part Code"
                                  value={it.supplierItemCode || ''}
                                  onChange={e => {
                                    const next = (formData.items || []).map((r, i) =>
                                      i === idx ? { ...r, supplierItemCode: e.target.value } : r
                                    );
                                    setFormData({ ...formData, items: next });
                                  }}
                                  className="w-full px-1.5 py-0.5 rounded border border-emerald-300 bg-emerald-50/40 text-emerald-800 font-mono text-[10px]"
                                  title="Item Code as per Supplier PI"
                                />
                              </div>
                            </td>
                            <td className="px-2 py-1.5 w-24">
                              <input
                                type="text"
                                value={it.hsnCode}
                                onChange={e => {
                                  const next = (formData.items || []).map((r, i) =>
                                    i === idx ? { ...r, hsnCode: e.target.value } : r
                                  );
                                  setFormData({ ...formData, items: next });
                                }}
                                className="w-full p-1 rounded border font-mono"
                              />
                            </td>
                            <td className="px-2 py-1.5 w-20">
                              <input
                                type="number"
                                step="0.01"
                                value={it.orderedQty}
                                onChange={e => {
                                  const q = parseFloat(e.target.value) || 0;
                                  const next = (formData.items || []).map((r, i) =>
                                    i === idx ? { ...r, orderedQty: q, amountFC: round2(q * Number(r.unitPriceFC || 0)) } : r
                                  );
                                  const sumFC = round2(next.reduce((s, x) => s + x.amountFC, 0));
                                  setFormData({ ...formData, items: next, piValueFC: sumFC > 0 ? sumFC : formData.piValueFC });
                                }}
                                className="w-full p-1 rounded border text-right font-mono"
                              />
                            </td>
                            <td className="px-2 py-1.5 w-20">
                              <input
                                type="number"
                                step="0.0001"
                                value={it.unitPriceFC}
                                onChange={e => {
                                  const prc = parseFloat(e.target.value) || 0;
                                  const next = (formData.items || []).map((r, i) =>
                                    i === idx ? { ...r, unitPriceFC: prc, amountFC: round2(Number(r.orderedQty) * prc) } : r
                                  );
                                  const sumFC = round2(next.reduce((s, x) => s + x.amountFC, 0));
                                  setFormData({ ...formData, items: next, piValueFC: sumFC > 0 ? sumFC : formData.piValueFC });
                                }}
                                className="w-full p-1 rounded border text-right font-mono"
                              />
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono font-bold w-24">{formatFC(it.amountFC)}</td>
                            <td className="px-2 py-1.5 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  const next = (formData.items || []).filter((_, i) => i !== idx);
                                  const sumFC = round2(next.reduce((s, x) => s + x.amountFC, 0));
                                  setFormData({
                                    ...formData,
                                    items: next,
                                    piValueFC: next.length > 0 && sumFC > 0 ? sumFC : formData.piValueFC,
                                  });
                                }}
                                className="text-rose-500 p-1 hover:bg-rose-50 rounded"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* PI Closed Flag */}
              <div className="flex items-center space-x-2 pt-2 border-t border-slate-100">
                <input
                  type="checkbox"
                  id="pi-closed"
                  checked={formData.isClosed || false}
                  onChange={e => setFormData({ ...formData, isClosed: e.target.checked })}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="pi-closed" className="text-xs font-bold text-slate-800">
                  PI Closed (No more shipments expected — short-shipment settlement enabled)
                </label>
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
                  {editingPI ? 'Update PI' : 'Save PI'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Excel Batch Upload Modal */}
      <ExcelBatchGridModal
        isOpen={showUploadModal}
        initialEntity="pi"
        onClose={() => setShowUploadModal(false)}
      />
    </div>
  );
};
