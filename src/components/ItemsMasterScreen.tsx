import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { ItemMaster, SupplierItemMapping } from '../types';
import { formatFC, round2 } from '../utils/formatters';
import { exportToExcel } from '../utils/excel';
import { Package, Plus, Download, Search, AlertCircle, ShieldCheck, Edit3, Link2, Trash2 } from 'lucide-react';

export const ItemsMasterScreen: React.FC = () => {
  const { db, selectedCompanyId, saveItem } = useApp();
  const { permissions } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [igcrOnlyFilter, setIgcrOnlyFilter] = useState<'ALL' | 'IGCR' | 'NORMAL'>('ALL');
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<ItemMaster | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [formData, setFormData] = useState<Partial<ItemMaster>>({
    companyId: selectedCompanyId !== 'ALL' ? selectedCompanyId : db.companies[0]?.id || '',
    itemCode: '',
    itemName: '',
    hsnCode: '',
    uom: 'PCS',
    defaultSupplierId: '',
    defaultCurrency: 'USD',
    standardRateFC: 0,
    bcdRatePct: 7.5,
    igstRatePct: 18,
    igcrEligible: false,
    igcrBcdRatePct: 0,
    igcrNotificationNo: '50/2017-Cus',
    igcrEndUse: 'Manufacturing of Finished Goods',
    active: true,
  });

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return (db.items || []).filter(it => {
      if (selectedCompanyId !== 'ALL' && it.companyId !== selectedCompanyId) return false;
      if (igcrOnlyFilter === 'IGCR' && !it.igcrEligible) return false;
      if (igcrOnlyFilter === 'NORMAL' && it.igcrEligible) return false;
      if (q) {
        const supp = db.suppliers.find(s => s.id === it.defaultSupplierId);
        const mapText = (it.supplierMappings || [])
          .map(m => `${m.supplierItemCode} ${m.supplierItemName}`)
          .join(' ');
        const hay = `${it.itemCode} ${it.itemName} ${it.hsnCode} ${supp?.supplierName || ''} ${mapText}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [db.items, db.suppliers, selectedCompanyId, igcrOnlyFilter, searchQuery]);

  const activeSuppliersForComp = db.suppliers.filter(
    s => s.active && (!formData.companyId || s.companyId === formData.companyId)
  );

  const computeEffectiveLandedDutyPct = (bcdPct: number, igstPct: number) => {
    const bcdWithSws = bcdPct * 1.1;
    const total = bcdWithSws + ((100 + bcdWithSws) * igstPct) / 100;
    return round2(total);
  };

  const openAdd = () => {
    const compId = selectedCompanyId !== 'ALL' ? selectedCompanyId : db.companies[0]?.id || '';
    const firstSupp = db.suppliers.find(s => s.active && s.companyId === compId);
    setEditingItem(null);
    setErrorMsg(null);
    setFormData({
      companyId: compId,
      itemCode: '',
      itemName: '',
      hsnCode: '',
      uom: 'PCS',
      defaultSupplierId: firstSupp?.id || '',
      defaultCurrency: firstSupp?.defaultCurrency || 'USD',
      standardRateFC: 0,
      bcdRatePct: 7.5,
      igstRatePct: 18,
      igcrEligible: false,
      igcrBcdRatePct: 0,
      igcrNotificationNo: '50/2017-Cus',
      igcrEndUse: 'Manufacturing of Finished Goods',
      active: true,
    });
    setShowModal(true);
  };

  const openEdit = (it: ItemMaster) => {
    setEditingItem(it);
    setErrorMsg(null);
    setFormData({ ...it });
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.companyId || !formData.itemCode?.trim() || !formData.itemName?.trim() || !formData.hsnCode?.trim()) {
      setErrorMsg('Company, Item Code, Item Name, and HSN Code are mandatory.');
      return;
    }

    const cleanedMappings: SupplierItemMapping[] = (formData.supplierMappings || [])
      .filter(m => m.supplierId && (m.supplierItemCode.trim() || m.supplierItemName.trim()))
      .map(m => ({
        supplierId: m.supplierId,
        supplierItemCode: m.supplierItemCode.trim(),
        supplierItemName: m.supplierItemName.trim(),
      }));
    const seenSupp = new Set<string>();
    for (const m of cleanedMappings) {
      if (seenSupp.has(m.supplierId)) {
        const s = db.suppliers.find(x => x.id === m.supplierId);
        setErrorMsg(`Supplier '${s?.supplierName || m.supplierId}' is mapped more than once. Keep one code per supplier.`);
        return;
      }
      seenSupp.add(m.supplierId);
    }

    const now = new Date().toISOString();
    const payload: ItemMaster = {
      id: editingItem ? editingItem.id : `ITEM-${Date.now()}`,
      companyId: formData.companyId!,
      itemCode: formData.itemCode!.trim().toUpperCase(),
      itemName: formData.itemName!.trim(),
      hsnCode: formData.hsnCode!.trim(),
      uom: formData.uom || 'PCS',
      defaultSupplierId: formData.defaultSupplierId || undefined,
      defaultCurrency: formData.defaultCurrency || 'USD',
      standardRateFC: Number(formData.standardRateFC || 0),
      bcdRatePct: Number(formData.bcdRatePct || 0),
      igstRatePct: Number(formData.igstRatePct ?? 18),
      igcrEligible: Boolean(formData.igcrEligible),
      igcrBcdRatePct: Number(formData.igcrBcdRatePct || 0),
      igcrNotificationNo: formData.igcrEligible ? formData.igcrNotificationNo?.trim() : undefined,
      igcrEndUse: formData.igcrEligible ? formData.igcrEndUse?.trim() : undefined,
      supplierMappings: cleanedMappings,
      active: formData.active !== false,
      createdAt: editingItem?.createdAt || now,
      updatedAt: now,
    };

    const res = saveItem(payload);
    if (!res.success) {
      setErrorMsg(res.error || 'Failed to save item.');
      return;
    }
    setShowModal(false);
  };

  const handleExport = () => {
    exportToExcel(
      filteredItems.map(it => {
        const comp = db.companies.find(c => c.id === it.companyId);
        const supp = db.suppliers.find(s => s.id === it.defaultSupplierId);
        const effBcd = it.igcrEligible ? it.igcrBcdRatePct : it.bcdRatePct;
        return {
          Company: comp?.code || '',
          'Our Item Code (SAP)': it.itemCode,
          'Our Item Description (SAP)': it.itemName,
          'Supplier Item Code(s)':
            (it.supplierMappings || [])
              .map(m => `${db.suppliers.find(s => s.id === m.supplierId)?.vendorCode || ''}: ${m.supplierItemCode}`)
              .join('; ') || '-',
          'Supplier Item Name(s)':
            (it.supplierMappings || [])
              .map(m => `${db.suppliers.find(s => s.id === m.supplierId)?.vendorCode || ''}: ${m.supplierItemName}`)
              .join('; ') || '-',
          'HSN Code': it.hsnCode,
          UOM: it.uom,
          'Default Supplier': supp?.supplierName || '-',
          Currency: it.defaultCurrency,
          'Std Rate FC': it.standardRateFC,
          'Normal BCD %': it.bcdRatePct,
          'IGST %': it.igstRatePct,
          'IGCR Eligible': it.igcrEligible ? 'Yes' : 'No',
          'IGCR BCD %': it.igcrEligible ? it.igcrBcdRatePct : '-',
          'Effective Tax Load %': computeEffectiveLandedDutyPct(effBcd, it.igstRatePct),
          'Notification No': it.igcrNotificationNo || '-',
          'End Use': it.igcrEndUse || '-',
          Status: it.active ? 'Active' : 'Inactive',
        };
      }),
      'Item_HSN_Master'
    );
  };

  const modalEffBcd = formData.igcrEligible ? Number(formData.igcrBcdRatePct || 0) : Number(formData.bcdRatePct || 0);
  const modalEffDuty = computeEffectiveLandedDutyPct(modalEffBcd, Number(formData.igstRatePct ?? 18));

  return (
    <div className="p-6 space-y-4 max-w-[1440px] mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-2xl shadow-xs border border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-extrabold text-slate-900">Item, HSN &amp; Customs Duty Master</h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Define import materials with HSN, normal BCD/IGST rates, and IGCR concessional duty eligibility for auto-forecasting
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search Item / HSN / Supplier..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="text-xs pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 w-56 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg text-xs font-semibold">
            {(['ALL', 'IGCR', 'NORMAL'] as const).map(f => (
              <button
                key={f}
                onClick={() => setIgcrOnlyFilter(f)}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  igcrOnlyFilter === f ? 'bg-white text-indigo-700 shadow-2xs font-bold' : 'text-slate-600'
                }`}
              >
                {f === 'ALL' ? 'All Items' : f === 'IGCR' ? 'IGCR Eligible' : 'Normal Duty'}
              </button>
            ))}
          </div>

          <button
            onClick={handleExport}
            className="flex items-center space-x-1 text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg border border-slate-300"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel</span>
          </button>

          {permissions.canManagePurchase && (
            <button
              onClick={openAdd}
              className="flex items-center space-x-1 text-xs px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add Item</span>
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-100 text-slate-700 font-semibold uppercase tracking-wider border-b">
              <tr>
                <th className="px-3 py-2.5">Company</th>
                <th className="px-3 py-2.5">Our Code (SAP) / Supplier Code</th>
                <th className="px-3 py-2.5">HSN / UOM</th>
                <th className="px-3 py-2.5">Default Supplier</th>
                <th className="px-3 py-2.5 text-right">Std Rate (FC)</th>
                <th className="px-3 py-2.5 text-right">BCD %</th>
                <th className="px-3 py-2.5 text-right">IGST %</th>
                <th className="px-3 py-2.5">IGCR Profile</th>
                <th className="px-3 py-2.5 text-right">Eff. Tax Load</th>
                <th className="px-3 py-2.5 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-slate-400">
                    No items found. Click "+ Add Item" to create your HSN &amp; Duty catalog.
                  </td>
                </tr>
              ) : (
                filteredItems.map(it => {
                  const comp = db.companies.find(c => c.id === it.companyId);
                  const supp = db.suppliers.find(s => s.id === it.defaultSupplierId);
                  const effBcd = it.igcrEligible ? it.igcrBcdRatePct : it.bcdRatePct;
                  const effLoad = computeEffectiveLandedDutyPct(effBcd, it.igstRatePct);

                  return (
                    <tr key={it.id} className={`hover:bg-slate-50/80 ${!it.active ? 'opacity-50' : ''}`}>
                      <td className="px-3 py-2.5 font-bold text-slate-900">{comp?.code}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="px-1 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[9px] font-bold">
                            SAP
                          </span>
                          <span className="font-mono font-bold text-indigo-700">{it.itemCode}</span>
                        </div>
                        <div className="text-slate-800">{it.itemName}</div>
                        {(it.supplierMappings || []).map(m => {
                          const ms = db.suppliers.find(s => s.id === m.supplierId);
                          return (
                            <div key={m.supplierId} className="mt-0.5 text-[10px] text-sky-800">
                              <span className="px-1 py-0.5 rounded bg-sky-50 border border-sky-200 font-bold mr-1">
                                {ms?.vendorCode || 'SUP'}
                              </span>
                              <span className="font-mono font-semibold">{m.supplierItemCode || '-'}</span>
                              {m.supplierItemName && <span className="text-slate-500"> — {m.supplierItemName}</span>}
                            </div>
                          );
                        })}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-mono font-bold text-slate-800">{it.hsnCode}</div>
                        <div className="text-[10px] text-slate-400">{it.uom}</div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-700">{supp ? supp.supplierName : '-'}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold">
                        {formatFC(it.standardRateFC)} {it.defaultCurrency}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">{it.bcdRatePct}%</td>
                      <td className="px-3 py-2.5 text-right font-mono">{it.igstRatePct}%</td>
                      <td className="px-3 py-2.5">
                        {it.igcrEligible ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                              <ShieldCheck className="w-3 h-3" />
                              <span>IGCR {it.igcrBcdRatePct}%</span>
                            </span>
                            <div className="text-[10px] text-slate-400">{it.igcrNotificationNo || ''}</div>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400">Standard Rate</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900">{effLoad}%</td>
                      <td className="px-3 py-2.5 text-center">
                        {permissions.canManagePurchase ? (
                          <button
                            onClick={() => openEdit(it)}
                            className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-semibold px-2 py-1 rounded hover:bg-indigo-50"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400">View Only</span>
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">
                {editingItem ? `Edit Item: ${editingItem.itemCode}` : 'Add New Import Item & HSN Duty Profile'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 text-xs">
              {errorMsg && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Company *</label>
                  <select
                    value={formData.companyId}
                    onChange={e => {
                      const compId = e.target.value;
                      const firstSupp = db.suppliers.find(s => s.active && s.companyId === compId);
                      setFormData({
                        ...formData,
                        companyId: compId,
                        defaultSupplierId: firstSupp?.id || '',
                        defaultCurrency: firstSupp?.defaultCurrency || formData.defaultCurrency || 'USD',
                      });
                    }}
                    className="w-full p-2 rounded-lg border border-slate-300 bg-white"
                    required
                  >
                    {db.companies.filter(c => c.active).map(c => (
                      <option key={c.id} value={c.id}>{c.code}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Our Item Code (SAP / Book) *</label>
                  <input
                    type="text"
                    value={formData.itemCode}
                    onChange={e => setFormData({ ...formData, itemCode: e.target.value })}
                    placeholder="e.g. LED-DRV-24W"
                    className="w-full p-2 rounded-lg border border-slate-300 uppercase font-mono font-bold"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">HSN Code *</label>
                  <input
                    type="text"
                    value={formData.hsnCode}
                    onChange={e => setFormData({ ...formData, hsnCode: e.target.value })}
                    placeholder="e.g. 85044090"
                    className="w-full p-2 rounded-lg border border-slate-300 font-mono font-semibold"
                    required
                  />
                </div>

                <div className="col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Our Item Description (SAP / Book) *</label>
                  <input
                    type="text"
                    value={formData.itemName}
                    onChange={e => setFormData({ ...formData, itemName: e.target.value })}
                    placeholder="e.g. 24W Constant Current LED Driver PCB"
                    className="w-full p-2 rounded-lg border border-slate-300"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">UOM *</label>
                  <select
                    value={formData.uom}
                    onChange={e => setFormData({ ...formData, uom: e.target.value })}
                    className="w-full p-2 rounded-lg border border-slate-300 bg-white font-semibold"
                  >
                    {['PCS', 'SET', 'KG', 'MTR', 'NOS', 'BOX'].map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Default Supplier</label>
                  <select
                    value={formData.defaultSupplierId || ''}
                    onChange={e => {
                      const sId = e.target.value;
                      const supp = db.suppliers.find(s => s.id === sId);
                      setFormData({
                        ...formData,
                        defaultSupplierId: sId,
                        defaultCurrency: supp?.defaultCurrency || formData.defaultCurrency || 'USD',
                      });
                    }}
                    className="w-full p-2 rounded-lg border border-slate-300 bg-white"
                  >
                    <option value="">-- Any Supplier --</option>
                    {activeSuppliersForComp.map(s => (
                      <option key={s.id} value={s.id}>{s.vendorCode} — {s.supplierName}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Default Currency</label>
                  <select
                    value={formData.defaultCurrency}
                    onChange={e => setFormData({ ...formData, defaultCurrency: e.target.value })}
                    className="w-full p-2 rounded-lg border border-slate-300 bg-white"
                  >
                    {db.currencies.map(c => (
                      <option key={c.code} value={c.code}>{c.code}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Std Unit Rate (FC)</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={formData.standardRateFC || ''}
                    onChange={e => setFormData({ ...formData, standardRateFC: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2 rounded-lg border border-slate-300 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Normal BCD %</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.bcdRatePct ?? 7.5}
                    onChange={e => setFormData({ ...formData, bcdRatePct: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2 rounded-lg border border-slate-300 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">IGST %</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.igstRatePct ?? 18}
                    onChange={e => setFormData({ ...formData, igstRatePct: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2 rounded-lg border border-slate-300 font-mono"
                  />
                </div>
              </div>

              {/* Supplier-wise Item Code & Name Mapping */}
              <div className="p-4 bg-sky-50/60 border border-sky-200 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sky-950 flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5" />
                    <span>Supplier Item Code &amp; Name (As per Supplier PI / Invoice)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const current = formData.supplierMappings || [];
                      const candidate =
                        activeSuppliersForComp.find(
                          s => s.id === formData.defaultSupplierId && !current.some(m => m.supplierId === s.id)
                        ) || activeSuppliersForComp.find(s => !current.some(m => m.supplierId === s.id));
                      if (!candidate) return;
                      setFormData({
                        ...formData,
                        supplierMappings: [
                          ...current,
                          { supplierId: candidate.id, supplierItemCode: '', supplierItemName: '' },
                        ],
                      });
                    }}
                    className="text-[11px] font-bold px-2.5 py-1 bg-white text-sky-700 rounded border border-sky-300 hover:bg-sky-100"
                  >
                    + Add Supplier Code
                  </button>
                </div>

                {(formData.supplierMappings || []).length === 0 ? (
                  <p className="text-[11px] text-slate-500">
                    Same item can have a different code &amp; name at each supplier. Add one row per supplier — PR, PI, Shipment
                    and Material Balance will show both <strong>Our SAP code</strong> and <strong>Supplier code</strong>.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {(formData.supplierMappings || []).map((m, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-1.5 items-center">
                        <select
                          value={m.supplierId}
                          onChange={e => {
                            const next = (formData.supplierMappings || []).map((x, i) =>
                              i === idx ? { ...x, supplierId: e.target.value } : x
                            );
                            setFormData({ ...formData, supplierMappings: next });
                          }}
                          className="col-span-4 p-1.5 rounded border border-sky-300 bg-white"
                        >
                          {activeSuppliersForComp.map(s => (
                            <option key={s.id} value={s.id}>{s.vendorCode} — {s.supplierName}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          placeholder="Supplier Item Code"
                          value={m.supplierItemCode}
                          onChange={e => {
                            const next = (formData.supplierMappings || []).map((x, i) =>
                              i === idx ? { ...x, supplierItemCode: e.target.value } : x
                            );
                            setFormData({ ...formData, supplierMappings: next });
                          }}
                          className="col-span-3 p-1.5 rounded border border-sky-300 bg-white font-mono font-semibold"
                        />
                        <input
                          type="text"
                          placeholder="Supplier Item Name / Description"
                          value={m.supplierItemName}
                          onChange={e => {
                            const next = (formData.supplierMappings || []).map((x, i) =>
                              i === idx ? { ...x, supplierItemName: e.target.value } : x
                            );
                            setFormData({ ...formData, supplierMappings: next });
                          }}
                          className="col-span-4 p-1.5 rounded border border-sky-300 bg-white"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setFormData({
                              ...formData,
                              supplierMappings: (formData.supplierMappings || []).filter((_, i) => i !== idx),
                            })
                          }
                          className="col-span-1 p-1 text-rose-500 hover:bg-rose-50 rounded flex justify-center"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* IGCR Eligibility Panel */}
              <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 font-bold text-emerald-950 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(formData.igcrEligible)}
                      onChange={e => setFormData({ ...formData, igcrEligible: e.target.checked })}
                      className="rounded border-emerald-400 text-emerald-600"
                    />
                    <span>Eligible under Customs IGCR Rules, 2022 (Concessional Rate)</span>
                  </label>
                  <span className="text-[11px] font-bold text-emerald-800">
                    Effective Landed Duty: {modalEffDuty}% (incl. 10% SWS &amp; IGST)
                  </span>
                </div>

                {formData.igcrEligible && (
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Concessional BCD %</label>
                      <input
                        type="number"
                        step="0.1"
                        value={formData.igcrBcdRatePct ?? 0}
                        onChange={e => setFormData({ ...formData, igcrBcdRatePct: parseFloat(e.target.value) || 0 })}
                        className="w-full p-2 rounded-lg border border-emerald-300 bg-white font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Notification No &amp; Sl.</label>
                      <input
                        type="text"
                        value={formData.igcrNotificationNo || ''}
                        onChange={e => setFormData({ ...formData, igcrNotificationNo: e.target.value })}
                        placeholder="e.g. 50/2017-Cus Sl. 412"
                        className="w-full p-2 rounded-lg border border-emerald-300 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Specified End-Use</label>
                      <input
                        type="text"
                        value={formData.igcrEndUse || ''}
                        onChange={e => setFormData({ ...formData, igcrEndUse: e.target.value })}
                        placeholder="e.g. Mfg of LED Lights"
                        className="w-full p-2 rounded-lg border border-emerald-300 bg-white"
                      />
                    </div>
                  </div>
                )}
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
                  {editingItem ? 'Update Item' : 'Save Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
