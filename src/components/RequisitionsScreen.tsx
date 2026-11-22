import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { PurchaseRequisition, PRItemLine, PaymentTerms } from '../types';
import { formatFC, formatDate, round2 } from '../utils/formatters';
import { exportToExcel } from '../utils/excel';
import {
  FilePlus2,
  Plus,
  Download,
  Search,
  Sparkles,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Edit3,
} from 'lucide-react';

export const RequisitionsScreen: React.FC = () => {
  const { db, selectedCompanyId, saveRequisition, generatePIsFromRequisition } = useApp();
  const { permissions, currentUser } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | 'Normal' | 'Urgent'>('ALL');
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);

  // Add/Edit PR Modal
  const [showModal, setShowModal] = useState(false);
  const [editingPR, setEditingPR] = useState<PurchaseRequisition | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [prForm, setPrForm] = useState<Partial<PurchaseRequisition>>({
    companyId: selectedCompanyId !== 'ALL' ? selectedCompanyId : db.companies[0]?.id || '',
    prNo: '',
    prDate: new Date().toISOString().split('T')[0],
    requestedBy: currentUser?.displayName || 'Purchase',
    department: 'Production / Assembly',
    requiredByDate: '',
    priority: 'Normal',
    status: 'Approved',
    items: [],
    remarks: '',
  });

  // 1-Click Generate Party-wise PI Modal
  const [genPr, setGenPr] = useState<PurchaseRequisition | null>(null);
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const [piPrefix, setPiPrefix] = useState('');
  const [advPct, setAdvPct] = useState(30);
  const [payTerms, setPayTerms] = useState<PaymentTerms>('Part advance + balance');
  const [creditDays, setCreditDays] = useState(30);
  const [genError, setGenError] = useState<string | null>(null);

  const requisitions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return (db.purchaseRequisitions || []).filter(pr => {
      if (selectedCompanyId !== 'ALL' && pr.companyId !== selectedCompanyId) return false;
      if (statusFilter !== 'ALL' && pr.status !== statusFilter) return false;
      if (priorityFilter !== 'ALL' && pr.priority !== priorityFilter) return false;
      if (q) {
        const lineText = pr.items.map(i => `${i.itemCode} ${i.itemName}`).join(' ');
        if (!`${pr.prNo} ${pr.requestedBy} ${pr.department || ''} ${lineText}`.toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [db.purchaseRequisitions, selectedCompanyId, statusFilter, priorityFilter, searchQuery]);

  const kpis = useMemo(() => {
    const scoped = (db.purchaseRequisitions || []).filter(
      pr => selectedCompanyId === 'ALL' || pr.companyId === selectedCompanyId
    );
    return {
      total: scoped.length,
      draft: scoped.filter(p => p.status === 'Draft').length,
      approvedPending: scoped.filter(p => p.status === 'Approved' || p.status === 'Partially Ordered').length,
      converted: scoped.filter(p => p.status === 'Converted to PI').length,
    };
  }, [db.purchaseRequisitions, selectedCompanyId]);

  const compSuppliers = db.suppliers.filter(
    s => s.active && (!prForm.companyId || s.companyId === prForm.companyId)
  );
  const compItems = (db.items || []).filter(
    i => i.active && (!prForm.companyId || i.companyId === prForm.companyId)
  );

  const createEmptyLine = (compId: string): PRItemLine => {
    const firstItem = (db.items || []).find(i => i.active && i.companyId === compId);
    const firstSupp = db.suppliers.find(s => s.active && s.companyId === compId);
    const prefSuppId = firstItem?.defaultSupplierId || firstSupp?.id || '';
    const supMap = firstItem?.supplierMappings?.find(m => m.supplierId === prefSuppId);
    return {
      lineId: `PRL-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      itemId: firstItem?.id,
      itemCode: firstItem?.itemCode || '',
      itemName: firstItem?.itemName || '',
      supplierItemCode: supMap?.supplierItemCode || '',
      supplierItemName: supMap?.supplierItemName || '',
      hsnCode: firstItem?.hsnCode || '',
      uom: firstItem?.uom || 'PCS',
      qtyRequired: 100,
      preferredSupplierId: prefSuppId,
      currency: firstItem?.defaultCurrency || firstSupp?.defaultCurrency || 'USD',
      targetUnitPriceFC: firstItem?.standardRateFC || 0,
      amountFC: round2(100 * (firstItem?.standardRateFC || 0)),
      orderedQty: 0,
    };
  };

  const openAddPR = () => {
    const compId = selectedCompanyId !== 'ALL' ? selectedCompanyId : db.companies[0]?.id || '';
    const nextNum = String((db.purchaseRequisitions || []).length + 1).padStart(3, '0');
    setEditingPR(null);
    setModalError(null);
    setPrForm({
      companyId: compId,
      prNo: `PR-2627-${nextNum}`,
      prDate: new Date().toISOString().split('T')[0],
      requestedBy: currentUser?.displayName || 'Purchase',
      department: 'Production',
      requiredByDate: '',
      priority: 'Normal',
      status: 'Approved',
      items: [createEmptyLine(compId)],
      remarks: '',
    });
    setShowModal(true);
  };

  const openEditPR = (pr: PurchaseRequisition) => {
    setEditingPR(pr);
    setModalError(null);
    setPrForm({ ...pr, items: pr.items.map(i => ({ ...i })) });
    setShowModal(true);
  };

  const handleSavePR = (e: React.FormEvent) => {
    e.preventDefault();
    const lines = (prForm.items || []).filter(i => i.itemName.trim() && Number(i.qtyRequired) > 0);
    if (!prForm.companyId || !prForm.prNo?.trim() || lines.length === 0) {
      setModalError('Company, PR No, and at least one item line with Name & Qty > 0 are required.');
      return;
    }
    const now = new Date().toISOString();
    const payload: PurchaseRequisition = {
      id: editingPR ? editingPR.id : `PR-${Date.now()}`,
      companyId: prForm.companyId!,
      prNo: prForm.prNo!.trim().toUpperCase(),
      prDate: prForm.prDate || now.split('T')[0],
      requestedBy: prForm.requestedBy?.trim() || 'Purchase',
      department: prForm.department?.trim(),
      requiredByDate: prForm.requiredByDate || undefined,
      priority: (prForm.priority as 'Normal' | 'Urgent') || 'Normal',
      status: (prForm.status as PurchaseRequisition['status']) || 'Approved',
      items: lines.map(l => ({
        ...l,
        amountFC: round2(Number(l.qtyRequired) * Number(l.targetUnitPriceFC || 0)),
      })),
      remarks: prForm.remarks?.trim() || undefined,
      createdAt: editingPR?.createdAt || now,
      updatedAt: now,
    };
    const res = saveRequisition(payload);
    if (!res.success) {
      setModalError(res.error || 'Failed to save requisition.');
      return;
    }
    setShowModal(false);
  };

  const openGeneratePIModal = (pr: PurchaseRequisition) => {
    const pendingLines = pr.items.filter(l => !l.linkedPiId && Number(l.qtyRequired) > 0);
    setGenPr(pr);
    setSelectedLineIds(pendingLines.map(l => l.lineId));
    setPiPrefix(pr.prNo.replace(/^PR/i, 'PI'));
    setAdvPct(30);
    setPayTerms('Part advance + balance');
    setCreditDays(30);
    setGenError(null);
  };

  const partyGroupingPreview = useMemo(() => {
    if (!genPr) return [];
    const chosen = genPr.items.filter(l => selectedLineIds.includes(l.lineId) && !l.linkedPiId);
    const map = new Map<string, { supplierName: string; currency: string; itemCount: number; totalFC: number }>();
    for (const l of chosen) {
      const supp = db.suppliers.find(s => s.id === l.preferredSupplierId);
      const key = `${l.preferredSupplierId}__${l.currency}`;
      const prev = map.get(key);
      if (!prev) {
        map.set(key, {
          supplierName: supp?.supplierName || 'Unknown Supplier',
          currency: l.currency,
          itemCount: 1,
          totalFC: round2(l.amountFC),
        });
      } else {
        prev.itemCount += 1;
        prev.totalFC = round2(prev.totalFC + l.amountFC);
      }
    }
    return Array.from(map.values());
  }, [genPr, selectedLineIds, db.suppliers]);

  const handleConfirmGeneratePI = (e: React.FormEvent) => {
    e.preventDefault();
    if (!genPr) return;
    const res = generatePIsFromRequisition(genPr.id, selectedLineIds, {
      advancePercentage: advPct,
      paymentTerms: payTerms,
      creditDays,
      piPrefix,
    });
    if (!res.success) {
      setGenError(res.error || 'Failed to generate PIs.');
      return;
    }
    setBannerMsg(
      `Generated ${res.createdPIs.length} Party-wise PI(s) from ${genPr.prNo}: ${res.createdPIs.map(p => p.piNo).join(', ')}`
    );
    setGenPr(null);
  };

  const handleExport = () => {
    const flatRows: Record<string, unknown>[] = [];
    for (const pr of requisitions) {
      const comp = db.companies.find(c => c.id === pr.companyId);
      for (const l of pr.items) {
        const supp = db.suppliers.find(s => s.id === l.preferredSupplierId);
        const linkedPi = l.linkedPiId ? db.proformaInvoices.find(p => p.id === l.linkedPiId) : undefined;
        flatRows.push({
          Company: comp?.code || '',
          'PR No': pr.prNo,
          'PR Date': formatDate(pr.prDate),
          'Requested By': pr.requestedBy,
          Department: pr.department || '-',
          Priority: pr.priority,
          'PR Status': pr.status,
          'Our Item Code (SAP)': l.itemCode,
          'Our Item Description (SAP)': l.itemName,
          'Supplier Item Code': l.supplierItemCode || '-',
          'Supplier Item Name': l.supplierItemName || '-',
          HSN: l.hsnCode,
          UOM: l.uom,
          'Qty Required': l.qtyRequired,
          'Preferred Supplier': supp?.supplierName || '-',
          Currency: l.currency,
          'Target Rate FC': l.targetUnitPriceFC,
          'Est Amount FC': l.amountFC,
          'Generated PI No': linkedPi?.piNo || 'Pending PI',
        });
      }
    }
    exportToExcel(flatRows, 'Purchase_Requisitions');
  };

  return (
    <div className="p-6 space-y-4 max-w-[1440px] mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-2xl shadow-xs border border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <FilePlus2 className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-extrabold text-slate-900">Purchase Requisitions (PR) → 1-Click Party-wise PI</h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Prepare item-wise material requisitions and auto-split into supplier-wise Proforma Invoices in one click
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search PR / Item / Dept..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="text-xs pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 w-52 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
          >
            <option value="ALL">All Statuses</option>
            {['Draft', 'Approved', 'Partially Ordered', 'Converted to PI', 'Closed'].map(st => (
              <option key={st} value={st}>{st}</option>
            ))}
          </select>

          <select
            value={priorityFilter}
            onChange={e => setPriorityFilter(e.target.value as 'ALL' | 'Normal' | 'Urgent')}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
          >
            <option value="ALL">All Priorities</option>
            <option value="Urgent">Urgent Only</option>
            <option value="Normal">Normal Only</option>
          </select>

          <button
            onClick={handleExport}
            className="flex items-center space-x-1 text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg border border-slate-300"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel</span>
          </button>

          {permissions.canManagePurchase && (
            <button
              onClick={openAddPR}
              className="flex items-center space-x-1 text-xs px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ New Requisition</span>
            </button>
          )}
        </div>
      </div>

      {bannerMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between">
          <span className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            {bannerMsg}
          </span>
          <button onClick={() => setBannerMsg(null)} className="text-emerald-700 font-bold">✕</button>
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200">
          <p className="text-[10px] font-bold uppercase text-slate-400">Total Requisitions</p>
          <p className="text-xl font-extrabold text-slate-900">{kpis.total}</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200">
          <p className="text-[10px] font-bold uppercase text-slate-400">Draft PRs</p>
          <p className="text-xl font-extrabold text-slate-600">{kpis.draft}</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-amber-200 bg-amber-50/30">
          <p className="text-[10px] font-bold uppercase text-amber-700">Approved Pending PI</p>
          <p className="text-xl font-extrabold text-amber-700">{kpis.approvedPending}</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/30">
          <p className="text-[10px] font-bold uppercase text-emerald-700">Converted to PI</p>
          <p className="text-xl font-extrabold text-emerald-700">{kpis.converted}</p>
        </div>
      </div>

      {/* Requisitions Table */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-100 text-slate-700 font-semibold uppercase tracking-wider border-b">
              <tr>
                <th className="px-3 py-2.5">Company</th>
                <th className="px-3 py-2.5">PR No &amp; Date</th>
                <th className="px-3 py-2.5">Requested By / Dept</th>
                <th className="px-3 py-2.5">Items &amp; Preferred Party</th>
                <th className="px-3 py-2.5 text-right">Est. Value (FC)</th>
                <th className="px-3 py-2.5">Generated PI(s)</th>
                <th className="px-3 py-2.5 text-center">Priority / Status</th>
                <th className="px-3 py-2.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {requisitions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                    No Purchase Requisitions yet. Click "+ New Requisition" to start material planning.
                  </td>
                </tr>
              ) : (
                requisitions.map(pr => {
                  const comp = db.companies.find(c => c.id === pr.companyId);
                  const unconverted = pr.items.filter(i => !i.linkedPiId);
                  const linkedPiIds = Array.from(new Set(pr.items.map(i => i.linkedPiId).filter(Boolean)));
                  const totalFC = round2(pr.items.reduce((s, i) => s + Number(i.amountFC || 0), 0));

                  return (
                    <tr key={pr.id} className="hover:bg-slate-50/80">
                      <td className="px-3 py-2.5 font-bold text-slate-900">{comp?.code}</td>
                      <td className="px-3 py-2.5">
                        <div className="font-mono font-bold text-indigo-700">{pr.prNo}</div>
                        <div className="text-[10px] text-slate-400">{formatDate(pr.prDate)}</div>
                        {pr.requiredByDate && (
                          <div className="text-[10px] text-amber-700">Req by: {formatDate(pr.requiredByDate)}</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-slate-800">{pr.requestedBy}</div>
                        <div className="text-[10px] text-slate-400">{pr.department || '-'}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="space-y-0.5">
                          {pr.items.slice(0, 3).map(l => {
                            const supp = db.suppliers.find(s => s.id === l.preferredSupplierId);
                            return (
                              <div key={l.lineId} className="text-[11px] leading-relaxed">
                                <span className="font-semibold text-slate-900">{l.itemName}</span>{' '}
                                <span className="text-[10px] font-mono text-indigo-700 font-bold bg-indigo-50 px-1 rounded" title="SAP Code">
                                  {l.itemCode}
                                </span>
                                {l.supplierItemCode && (
                                  <span className="text-[10px] font-mono text-emerald-700 font-bold bg-emerald-50 px-1 rounded ml-1" title="Supplier Part Code">
                                    [Supp: {l.supplierItemCode}]
                                  </span>
                                )}{' '}
                                <span className="text-slate-500">({l.qtyRequired} {l.uom})</span>{' '}
                                <span className="text-indigo-600">→ {supp?.supplierName || 'No Party'}</span>
                              </div>
                            );
                          })}
                          {pr.items.length > 3 && (
                            <div className="text-[10px] text-slate-400">+{pr.items.length - 3} more item(s)</div>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900">
                        {formatFC(totalFC)}
                        <div className="text-[10px] text-slate-400 font-normal">
                          {unconverted.length} pending PI
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {linkedPiIds.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {linkedPiIds.map(pid => {
                              const pi = db.proformaInvoices.find(p => p.id === pid);
                              return (
                                <span
                                  key={pid}
                                  className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold"
                                >
                                  {pi?.piNo || pid}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400">Not generated</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center space-y-1">
                        <div>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              pr.priority === 'Urgent' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {pr.priority}
                          </span>
                        </div>
                        <div>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              pr.status === 'Converted to PI'
                                ? 'bg-emerald-100 text-emerald-800'
                                : pr.status === 'Approved'
                                  ? 'bg-indigo-100 text-indigo-800'
                                  : pr.status === 'Partially Ordered'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {pr.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center space-y-1">
                        {permissions.canManagePurchase && (
                          <button
                            onClick={() => openEditPR(pr)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-indigo-600 hover:bg-indigo-50 rounded font-semibold"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                        )}
                        {permissions.canCreatePI &&
                          unconverted.length > 0 &&
                          pr.status !== 'Draft' &&
                          pr.status !== 'Closed' && (
                            <div>
                              <button
                                onClick={() => openGeneratePIModal(pr)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold shadow-2xs"
                              >
                                <Sparkles className="w-3 h-3" />
                                <span>Generate Party PI</span>
                              </button>
                            </div>
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

      {/* Add / Edit Requisition Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">
                {editingPR ? `Edit Requisition: ${editingPR.prNo}` : 'Create Material Purchase Requisition (PR)'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePR} className="p-6 overflow-y-auto space-y-4 text-xs">
              {modalError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Company *</label>
                  <select
                    value={prForm.companyId}
                    onChange={e => setPrForm({ ...prForm, companyId: e.target.value })}
                    className="w-full p-2 rounded-lg border border-slate-300 bg-white"
                    required
                  >
                    {db.companies.filter(c => c.active).map(c => (
                      <option key={c.id} value={c.id}>{c.code}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">PR Number *</label>
                  <input
                    type="text"
                    value={prForm.prNo}
                    onChange={e => setPrForm({ ...prForm, prNo: e.target.value })}
                    className="w-full p-2 rounded-lg border border-slate-300 font-mono font-bold uppercase"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">PR Date *</label>
                  <input
                    type="date"
                    value={prForm.prDate}
                    onChange={e => setPrForm({ ...prForm, prDate: e.target.value })}
                    className="w-full p-2 rounded-lg border border-slate-300"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Required By Date</label>
                  <input
                    type="date"
                    value={prForm.requiredByDate || ''}
                    onChange={e => setPrForm({ ...prForm, requiredByDate: e.target.value })}
                    className="w-full p-2 rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Requested By *</label>
                  <input
                    type="text"
                    value={prForm.requestedBy}
                    onChange={e => setPrForm({ ...prForm, requestedBy: e.target.value })}
                    className="w-full p-2 rounded-lg border border-slate-300"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Department</label>
                  <input
                    type="text"
                    value={prForm.department || ''}
                    onChange={e => setPrForm({ ...prForm, department: e.target.value })}
                    className="w-full p-2 rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Priority</label>
                  <select
                    value={prForm.priority}
                    onChange={e => setPrForm({ ...prForm, priority: e.target.value as 'Normal' | 'Urgent' })}
                    className="w-full p-2 rounded-lg border border-slate-300 bg-white font-semibold"
                  >
                    <option value="Normal">Normal</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Status</label>
                  <select
                    value={prForm.status}
                    onChange={e => setPrForm({ ...prForm, status: e.target.value as PurchaseRequisition['status'] })}
                    className="w-full p-2 rounded-lg border border-slate-300 bg-white font-semibold"
                  >
                    <option value="Draft">Draft</option>
                    <option value="Approved">Approved (Ready for PI)</option>
                    <option value="Closed">Closed</option>
                  </select>
                </div>
              </div>

              {/* Item Lines */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-4 py-2.5 border-b flex items-center justify-between">
                  <span className="font-bold text-slate-800">Requisition Item Lines (Multi-Supplier Allowed)</span>
                  <button
                    type="button"
                    onClick={() =>
                      setPrForm({
                        ...prForm,
                        items: [...(prForm.items || []), createEmptyLine(prForm.companyId || db.companies[0]?.id || '')],
                      })
                    }
                    className="px-2.5 py-1 bg-indigo-50 text-indigo-700 font-bold rounded border border-indigo-200 hover:bg-indigo-100"
                  >
                    + Add Item Line
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] text-left">
                    <thead className="bg-slate-100 text-slate-600 uppercase font-bold border-b">
                      <tr>
                        <th className="px-2 py-2">Catalog / Item *</th>
                        <th className="px-2 py-2">HSN / UOM</th>
                        <th className="px-2 py-2">Preferred Supplier *</th>
                        <th className="px-2 py-2 text-right">Qty *</th>
                        <th className="px-2 py-2">Curr</th>
                        <th className="px-2 py-2 text-right">Rate FC</th>
                        <th className="px-2 py-2 text-right">Amount FC</th>
                        <th className="px-2 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(prForm.items || []).map((line, idx) => (
                        <tr key={line.lineId}>
                          <td className="px-2 py-2 min-w-[200px] space-y-1">
                            {compItems.length > 0 && (
                              <select
                                value={line.itemId || ''}
                                onChange={e => {
                                  const m = compItems.find(x => x.id === e.target.value);
                                  if (!m) return;
                                  const prefSuppId = m.defaultSupplierId || line.preferredSupplierId;
                                  const supMap = m.supplierMappings?.find(x => x.supplierId === prefSuppId);
                                  const updated = (prForm.items || []).map((r, i) =>
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
                                          preferredSupplierId: prefSuppId,
                                          currency: m.defaultCurrency || r.currency,
                                          targetUnitPriceFC: m.standardRateFC,
                                          amountFC: round2(Number(r.qtyRequired) * m.standardRateFC),
                                        }
                                      : r
                                  );
                                  setPrForm({ ...prForm, items: updated });
                                }}
                                className="w-full p-1 rounded border border-slate-300 bg-white"
                              >
                                <option value="">-- Custom / Pick Item --</option>
                                {compItems.map(m => (
                                  <option key={m.id} value={m.id}>
                                    {m.itemCode} — {m.itemName}
                                  </option>
                                ))}
                              </select>
                            )}
                            <input
                              type="text"
                              placeholder="Item Description (Our Book / SAP) *"
                              value={line.itemName}
                              onChange={e => {
                                const updated = (prForm.items || []).map((r, i) =>
                                  i === idx ? { ...r, itemName: e.target.value, itemCode: r.itemCode || `ITM-${idx + 1}` } : r
                                );
                                setPrForm({ ...prForm, items: updated });
                              }}
                              className="w-full p-1 rounded border border-slate-300"
                              required
                            />
                            <div className="flex items-center gap-1.5 pt-0.5 text-[10px]">
                              <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-mono font-bold shrink-0" title="Our SAP / Book Item Code">
                                SAP: {line.itemCode || 'Auto'}
                              </span>
                              <input
                                type="text"
                                placeholder="Supplier Part Code"
                                value={line.supplierItemCode || ''}
                                onChange={e => {
                                  const updated = (prForm.items || []).map((r, i) =>
                                    i === idx ? { ...r, supplierItemCode: e.target.value } : r
                                  );
                                  setPrForm({ ...prForm, items: updated });
                                }}
                                className="w-full px-1.5 py-0.5 rounded border border-emerald-300 bg-emerald-50/40 text-emerald-800 font-mono text-[10px]"
                                title="Supplier Item Code as per Supplier PI / Invoice"
                              />
                            </div>
                          </td>
                          <td className="px-2 py-2 w-28 space-y-1">
                            <input
                              type="text"
                              placeholder="HSN"
                              value={line.hsnCode}
                              onChange={e => {
                                const updated = (prForm.items || []).map((r, i) =>
                                  i === idx ? { ...r, hsnCode: e.target.value } : r
                                );
                                setPrForm({ ...prForm, items: updated });
                              }}
                              className="w-full p-1 rounded border border-slate-300 font-mono"
                            />
                            <input
                              type="text"
                              placeholder="UOM"
                              value={line.uom}
                              onChange={e => {
                                const updated = (prForm.items || []).map((r, i) =>
                                  i === idx ? { ...r, uom: e.target.value.toUpperCase() } : r
                                );
                                setPrForm({ ...prForm, items: updated });
                              }}
                              className="w-full p-1 rounded border border-slate-300 uppercase"
                            />
                          </td>
                          <td className="px-2 py-2 min-w-[170px]">
                            <select
                              value={line.preferredSupplierId}
                              onChange={e => {
                                const newSuppId = e.target.value;
                                const supp = compSuppliers.find(s => s.id === newSuppId);
                                const m = compItems.find(x => x.id === line.itemId || x.itemCode === line.itemCode);
                                const supMap = m?.supplierMappings?.find(x => x.supplierId === newSuppId);
                                const updated = (prForm.items || []).map((r, i) =>
                                  i === idx
                                    ? {
                                        ...r,
                                        preferredSupplierId: newSuppId,
                                        currency: supp?.defaultCurrency || r.currency,
                                        supplierItemCode: supMap?.supplierItemCode ?? r.supplierItemCode,
                                        supplierItemName: supMap?.supplierItemName ?? r.supplierItemName,
                                      }
                                    : r
                                );
                                setPrForm({ ...prForm, items: updated });
                              }}
                              className="w-full p-1.5 rounded border border-slate-300 bg-white"
                              required
                            >
                              <option value="">-- Select Supplier --</option>
                              {compSuppliers.map(s => (
                                <option key={s.id} value={s.id}>{s.vendorCode} — {s.supplierName}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-2 w-24">
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              value={line.qtyRequired || ''}
                              onChange={e => {
                                const q = parseFloat(e.target.value) || 0;
                                const updated = (prForm.items || []).map((r, i) =>
                                  i === idx
                                    ? { ...r, qtyRequired: q, amountFC: round2(q * Number(r.targetUnitPriceFC || 0)) }
                                    : r
                                );
                                setPrForm({ ...prForm, items: updated });
                              }}
                              className="w-full p-1.5 rounded border border-slate-300 text-right font-mono font-bold"
                              required
                            />
                          </td>
                          <td className="px-2 py-2 w-20">
                            <select
                              value={line.currency}
                              onChange={e => {
                                const updated = (prForm.items || []).map((r, i) =>
                                  i === idx ? { ...r, currency: e.target.value } : r
                                );
                                setPrForm({ ...prForm, items: updated });
                              }}
                              className="w-full p-1.5 rounded border border-slate-300 bg-white"
                            >
                              {db.currencies.map(c => (
                                <option key={c.code} value={c.code}>{c.code}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-2 w-24">
                            <input
                              type="number"
                              step="0.0001"
                              value={line.targetUnitPriceFC || ''}
                              onChange={e => {
                                const rate = parseFloat(e.target.value) || 0;
                                const updated = (prForm.items || []).map((r, i) =>
                                  i === idx
                                    ? { ...r, targetUnitPriceFC: rate, amountFC: round2(Number(r.qtyRequired) * rate) }
                                    : r
                                );
                                setPrForm({ ...prForm, items: updated });
                              }}
                              className="w-full p-1.5 rounded border border-slate-300 text-right font-mono"
                            />
                          </td>
                          <td className="px-2 py-2 text-right font-mono font-bold text-slate-900 w-28">
                            {formatFC(line.amountFC)}
                          </td>
                          <td className="px-2 py-2 text-center">
                            {!line.linkedPiId && (
                              <button
                                type="button"
                                onClick={() =>
                                  setPrForm({
                                    ...prForm,
                                    items: (prForm.items || []).filter((_, i) => i !== idx),
                                  })
                                }
                                className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="pt-3 border-t flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-xs"
                >
                  {editingPR ? 'Update Requisition' : 'Save Requisition'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 1-Click Generate Party-wise PI Modal */}
      {genPr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <span>Generate Party-wise PI(s) from {genPr.prNo}</span>
              </h3>
              <button onClick={() => setGenPr(null)} className="text-slate-400 hover:text-slate-600 font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmGeneratePI} className="p-6 overflow-y-auto space-y-4 text-xs">
              {genError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{genError}</span>
                </div>
              )}

              <div>
                <p className="font-bold text-slate-700 mb-2">Select Requisition Items to Convert:</p>
                <div className="border rounded-xl divide-y max-h-48 overflow-y-auto">
                  {genPr.items
                    .filter(l => !l.linkedPiId)
                    .map(l => {
                      const checked = selectedLineIds.includes(l.lineId);
                      const supp = db.suppliers.find(s => s.id === l.preferredSupplierId);
                      return (
                        <label
                          key={l.lineId}
                          className="flex items-center justify-between px-3 py-2 hover:bg-slate-50 cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={e =>
                                setSelectedLineIds(prev =>
                                  e.target.checked ? [...prev, l.lineId] : prev.filter(x => x !== l.lineId)
                                )
                              }
                            />
                            <div>
                              <span className="font-bold text-slate-900">{l.itemName}</span>
                              <span className="text-slate-500 ml-2">
                                ({l.qtyRequired} {l.uom}) → <strong className="text-indigo-700">{supp?.supplierName}</strong>
                              </span>
                            </div>
                          </div>
                          <span className="font-mono font-bold">
                            {formatFC(l.amountFC)} {l.currency}
                          </span>
                        </label>
                      );
                    })}
                </div>
              </div>

              {/* Grouping Preview */}
              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-1.5">
                <p className="font-bold text-emerald-900">
                  Will Auto-Create {partyGroupingPreview.length} Party-wise PI(s):
                </p>
                {partyGroupingPreview.map((g, i) => (
                  <div key={i} className="flex justify-between text-emerald-800">
                    <span>
                      • <strong>{g.supplierName}</strong> ({g.itemCount} item lines)
                    </span>
                    <span className="font-mono font-bold">
                      {formatFC(g.totalFC)} {g.currency}
                    </span>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">PI No Prefix *</label>
                  <input
                    type="text"
                    value={piPrefix}
                    onChange={e => setPiPrefix(e.target.value)}
                    className="w-full p-2 rounded-lg border border-slate-300 font-mono font-bold uppercase"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Advance %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={advPct}
                    onChange={e => setAdvPct(parseFloat(e.target.value) || 0)}
                    className="w-full p-2 rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Payment Terms</label>
                  <select
                    value={payTerms}
                    onChange={e => setPayTerms(e.target.value as PaymentTerms)}
                    className="w-full p-2 rounded-lg border border-slate-300 bg-white"
                  >
                    <option value="Part advance + balance">Part advance + balance</option>
                    <option value="Advance">Full Advance</option>
                    <option value="LC">LC</option>
                    <option value="Credit">Credit</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Credit Days</label>
                  <input
                    type="number"
                    value={creditDays}
                    onChange={e => setCreditDays(parseInt(e.target.value, 10) || 0)}
                    className="w-full p-2 rounded-lg border border-slate-300"
                  />
                </div>
              </div>

              <div className="pt-3 border-t flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setGenPr(null)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={partyGroupingPreview.length === 0}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-bold shadow-xs"
                >
                  Create {partyGroupingPreview.length} Party-wise PI(s)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
