import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { OpeningBalance } from '../types';
import { formatFC, formatINR, formatDate, formatRate, parseDateToISO, round2 } from '../utils/formatters';
import { downloadTemplate, parseExcelFile, exportToExcel } from '../utils/excel';
import { Plus, Download, Upload, Edit3 } from 'lucide-react';

function parseSignedNumber(val: unknown): { abs: number; isNegative: boolean } {
  const s = String(val ?? '').trim();
  if (!s) return { abs: 0, isNegative: false };
  const isParen = s.startsWith('(') && s.endsWith(')');
  const isMinus = s.startsWith('-');
  const cleaned = s.replace(/[(),₹$\s]/g, '').replace(/,/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return { abs: 0, isNegative: false };
  return { abs: Math.abs(num), isNegative: isParen || isMinus || num < 0 };
}

export const OpeningBalancesScreen: React.FC = () => {
  const { db, saveOpeningBalance, batchImportOpeningBalances, selectedCompanyId } = useApp();

  const [showModal, setShowModal] = useState(false);
  const [editingOB, setEditingOB] = useState<OpeningBalance | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [formData, setFormData] = useState<Partial<OpeningBalance>>({
    companyId: selectedCompanyId !== 'ALL' ? selectedCompanyId : db.companies[0]?.id || '',
    supplierId: db.suppliers[0]?.id || '',
    currency: 'USD',
    referenceType: 'On account',
    referenceNo: '',
    referenceDate: '2026-04-01',
    originalDocumentDate: '2026-04-01',
    boeNo: '',
    balanceType: 'Dr',
    amountFC: 0,
    amountINR: 0,
    remarks: '',
  });

  const activeSuppliers = db.suppliers.filter(
    s => s.active && (!formData.companyId || s.companyId === formData.companyId)
  );

  const handleOpenAdd = () => {
    setEditingOB(null);
    setErrorMsg(null);
    const compId = selectedCompanyId !== 'ALL' ? selectedCompanyId : db.companies[0]?.id || '';
    const compSupps = db.suppliers.filter(s => s.active && s.companyId === compId);
    setFormData({
      companyId: compId,
      supplierId: compSupps[0]?.id || '',
      currency: compSupps[0]?.defaultCurrency || 'USD',
      referenceType: 'On account',
      referenceNo: '',
      referenceDate: '2026-04-01',
      originalDocumentDate: '2026-04-01',
      boeNo: '',
      balanceType: 'Dr',
      amountFC: 0,
      amountINR: 0,
      remarks: 'Opening Balance as on 01-04-2026',
    });
    setShowModal(true);
  };

  const handleEdit = (ob: OpeningBalance) => {
    setEditingOB(ob);
    setErrorMsg(null);
    setFormData({ ...ob });
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.companyId || !formData.supplierId || !formData.referenceNo || !formData.amountFC || formData.amountFC <= 0) {
      setErrorMsg('Please enter Company, Supplier, Reference No and Amount FC > 0.');
      return;
    }

    const now = new Date().toISOString();
    const fc = Math.abs(Number(formData.amountFC));
    const inr = Math.abs(Number(formData.amountINR || 0));
    const payload: OpeningBalance = {
      id: editingOB ? editingOB.id : `OB-${Date.now()}`,
      companyId: formData.companyId!,
      supplierId: formData.supplierId!,
      currency: formData.currency || 'USD',
      referenceType: formData.referenceType || (formData.balanceType === 'Cr' ? 'CI' : 'On account'),
      referenceNo: formData.referenceNo.trim(),
      referenceDate: formData.referenceDate || '2026-04-01',
      originalDocumentDate: formData.originalDocumentDate || formData.referenceDate || '2026-04-01',
      boeNo: formData.boeNo ? formData.boeNo.trim() : undefined,
      balanceType: formData.balanceType || 'Dr',
      amountFC: fc,
      amountINR: inr,
      rate: fc > 0 ? Number((inr / fc).toFixed(4)) : 0,
      remarks: formData.remarks || undefined,
      createdAt: editingOB?.createdAt || now,
      updatedAt: now,
    };

    saveOpeningBalance(payload);
    setShowModal(false);
  };

  // Excel import (Positive = Dr Advance, Negative / (Brackets) = Cr Payable)
  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const res = await parseExcelFile(file);
    if (res.error) {
      alert(`Failed to parse Excel: ${res.error}`);
      return;
    }

    const parsed: OpeningBalance[] = res.rows
      .map((r, i) => {
        const comp =
          db.companies.find(
            c => c.code.toLowerCase() === String(r['Company Code*'] || '').trim().toLowerCase()
          ) || db.companies[0];
        const targetCompId = comp ? comp.id : db.companies[0]?.id || '';
        const supp =
          db.suppliers.find(
            s =>
              s.companyId === targetCompId &&
              s.vendorCode.toLowerCase() === String(r['Vendor Code*'] || '').trim().toLowerCase()
          ) ||
          db.suppliers.find(
            s => s.vendorCode.toLowerCase() === String(r['Vendor Code*'] || '').trim().toLowerCase()
          );

        const parsedFC = parseSignedNumber(r['Amount FC*']);
        const parsedINR = parseSignedNumber(r['Amount INR*']);
        const rawType = String(r['Balance Type (Dr/Cr)*'] || '').trim().toLowerCase();
        let balanceType: 'Dr' | 'Cr' = 'Dr';
        if (rawType === 'cr' || rawType === 'credit') {
          balanceType = 'Cr';
        } else if (rawType === 'dr' || rawType === 'debit') {
          balanceType = 'Dr';
        } else if (parsedFC.isNegative || parsedINR.isNegative) {
          balanceType = 'Cr';
        }

        const rawRefDate = String(r['Reference Date (DD-MM-YYYY)*'] || '').trim();
        const rawOrigDate = String(r['Original Document Date (DD-MM-YYYY)*'] || '').trim();
        const refDate = rawRefDate ? parseDateToISO(rawRefDate) : '2026-04-01';
        const origDate = rawOrigDate ? parseDateToISO(rawOrigDate) : refDate;

        return {
          id: `OB-IMP-${Date.now()}-${i}`,
          companyId: targetCompId,
          supplierId: supp ? supp.id : '',
          currency: String(r['Currency*'] || 'USD').trim(),
          referenceType:
            (r['Reference Type (PI/CI/On account)*'] as 'PI' | 'CI' | 'On account') ||
            (balanceType === 'Cr' ? 'CI' : 'On account'),
          referenceNo: String(r['Reference No*'] || `OB-${i}`).trim(),
          referenceDate: refDate,
          originalDocumentDate: origDate,
          boeNo: r['BOE No (if CI)'] || undefined,
          balanceType,
          amountFC: parsedFC.abs,
          amountINR: parsedINR.abs,
          rate: parsedFC.abs > 0 ? Number((parsedINR.abs / parsedFC.abs).toFixed(4)) : 0,
          remarks: r['Remarks'] || 'Imported Opening Balance',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      })
      .filter(o => o.amountFC > 0 && o.supplierId);

    batchImportOpeningBalances(parsed);
    alert(`Successfully imported ${parsed.length} opening balances.`);
  };

  const filteredOBs = db.openingBalances.filter(
    ob => selectedCompanyId === 'ALL' || ob.companyId === selectedCompanyId
  );

  const summary = useMemo(() => {
    let drFC = 0;
    let drINR = 0;
    let crFC = 0;
    let crINR = 0;
    for (const ob of filteredOBs) {
      if (ob.balanceType === 'Dr') {
        drFC += ob.amountFC;
        drINR += ob.amountINR;
      } else {
        crFC += ob.amountFC;
        crINR += ob.amountINR;
      }
    }
    return {
      drFC: round2(drFC),
      drINR: round2(drINR),
      crFC: round2(crFC),
      crINR: round2(crINR),
      netFC: round2(drFC - crFC),
      netINR: round2(drINR - crINR),
    };
  }, [filteredOBs]);

  const handleExport = () => {
    exportToExcel(
      filteredOBs.map(ob => {
        const comp = db.companies.find(c => c.id === ob.companyId);
        const supp = db.suppliers.find(s => s.id === ob.supplierId);
        return {
          Company: comp?.code || '',
          'Vendor Code': supp?.vendorCode || '',
          Supplier: supp?.supplierName || '',
          Type: ob.referenceType,
          'Ref No': ob.referenceNo,
          Currency: ob.currency,
          'Dr/Cr': ob.balanceType,
          'Debit (Dr) FC': ob.balanceType === 'Dr' ? ob.amountFC : 0,
          'Debit (Dr) INR': ob.balanceType === 'Dr' ? ob.amountINR : 0,
          'Credit (Cr) FC': ob.balanceType === 'Cr' ? ob.amountFC : 0,
          'Credit (Cr) INR': ob.balanceType === 'Cr' ? ob.amountINR : 0,
          Rate: ob.rate,
          Remarks: ob.remarks || '',
        };
      }),
      'Opening_Balances_Register'
    );
  };

  return (
    <div className="p-6 space-y-5 max-w-[1440px] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-2xl shadow-xs border border-slate-200">
        <div>
          <h2 className="text-base font-extrabold text-slate-900">Opening Balances (as on 01-04-2026)</h2>
          <p className="text-xs text-slate-500">
            Positive = <strong>Debit (Dr) Advance</strong> (Supplier holds our money) • (Bracket / Negative) ={' '}
            <strong>Credit (Cr) Payable</strong> (We owe supplier)
          </p>
        </div>

        <div className="flex flex-wrap items-center space-x-2">
          <button
            onClick={handleExport}
            className="flex items-center space-x-1 text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg border border-slate-300"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Excel</span>
          </button>

          <button
            onClick={() => downloadTemplate('openingBalances')}
            className="flex items-center space-x-1 text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg border border-slate-300"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Template</span>
          </button>

          <label className="flex items-center space-x-1 text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg border border-slate-300 cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            <span>Import Excel</span>
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelImport} />
          </label>

          <button
            onClick={handleOpenAdd}
            className="flex items-center space-x-1 text-xs px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Manual Entry</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/30 shadow-xs">
          <p className="text-[11px] font-bold uppercase text-emerald-700">Total Debit (Dr) — Opening Advances</p>
          <p className="text-lg font-extrabold font-mono text-emerald-800 mt-1">{formatINR(summary.drINR)}</p>
          <p className="text-xs font-mono text-emerald-700">{formatFC(summary.drFC)} FC</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-rose-200 bg-rose-50/30 shadow-xs">
          <p className="text-[11px] font-bold uppercase text-rose-700">Total Credit (Cr) — Opening Payables</p>
          <p className="text-lg font-extrabold font-mono text-rose-800 mt-1">({formatINR(summary.crINR)})</p>
          <p className="text-xs font-mono text-rose-700">({formatFC(summary.crFC)}) FC</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[11px] font-bold uppercase text-slate-500">Net Opening Balance</p>
          <p className="text-lg font-extrabold font-mono text-slate-900 mt-1">
            {summary.netINR >= 0
              ? `${formatINR(summary.netINR)} Dr`
              : `(${formatINR(Math.abs(summary.netINR))}) Cr`}
          </p>
          <p className="text-xs font-mono text-slate-600">
            {summary.netFC >= 0
              ? `${formatFC(summary.netFC)} FC (Net Advance)`
              : `(${formatFC(Math.abs(summary.netFC))}) FC (Net Payable)`}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-100 text-slate-700 font-semibold uppercase tracking-wider border-b">
              <tr>
                <th className="px-3 py-2.5">Company</th>
                <th className="px-3 py-2.5">Supplier</th>
                <th className="px-3 py-2.5">Type</th>
                <th className="px-3 py-2.5">Ref No &amp; Date</th>
                <th className="px-3 py-2.5">Orig. Date</th>
                <th className="px-3 py-2.5">BOE No</th>
                <th className="px-3 py-2.5 text-center">Dr / Cr</th>
                <th className="px-3 py-2.5 text-right text-emerald-800 bg-emerald-50/40">Debit (Dr) FC</th>
                <th className="px-3 py-2.5 text-right text-emerald-800 bg-emerald-50/40">Debit (Dr) INR</th>
                <th className="px-3 py-2.5 text-right text-rose-800 bg-rose-50/40">Credit (Cr) FC</th>
                <th className="px-3 py-2.5 text-right text-rose-800 bg-rose-50/40">Credit (Cr) INR</th>
                <th className="px-3 py-2.5 text-right">Eff. Rate</th>
                <th className="px-3 py-2.5">Remarks</th>
                <th className="px-3 py-2.5 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredOBs.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-4 py-8 text-center text-slate-400">
                    No opening balances configured. You can import using the Excel template above.
                  </td>
                </tr>
              ) : (
                filteredOBs.map(ob => {
                  const comp = db.companies.find(c => c.id === ob.companyId);
                  const supp = db.suppliers.find(s => s.id === ob.supplierId);
                  const isDr = ob.balanceType === 'Dr';
                  return (
                    <tr key={ob.id} className="hover:bg-slate-50/80">
                      <td className="px-3 py-2.5 font-bold text-slate-900">{comp?.code}</td>
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-slate-900">{supp?.supplierName}</div>
                        <div className="text-[10px] text-slate-400">{supp?.vendorCode}</div>
                      </td>
                      <td className="px-3 py-2.5 font-bold text-indigo-700">{ob.referenceType}</td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium">{ob.referenceNo}</div>
                        <div className="text-[10px] text-slate-400">{formatDate(ob.referenceDate)}</div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{formatDate(ob.originalDocumentDate)}</td>
                      <td className="px-3 py-2.5">{ob.boeNo || '-'}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isDr ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {isDr ? 'Dr (Advance)' : 'Cr (Payable)'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-700 bg-emerald-50/20">
                        {isDr ? `${formatFC(ob.amountFC)} ${ob.currency}` : '-'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-700 bg-emerald-50/20">
                        {isDr ? formatINR(ob.amountINR) : '-'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-rose-700 bg-rose-50/20">
                        {!isDr ? `(${formatFC(ob.amountFC)}) ${ob.currency}` : '-'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-rose-700 bg-rose-50/20">
                        {!isDr ? `(${formatINR(ob.amountINR)})` : '-'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-medium">{formatRate(ob.rate)}</td>
                      <td className="px-3 py-2.5 text-slate-500 max-w-[180px] truncate">{ob.remarks || '-'}</td>
                      <td className="px-3 py-2.5 text-center">
                        <button
                          onClick={() => handleEdit(ob)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-indigo-600 hover:bg-indigo-50 rounded font-semibold"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Edit</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filteredOBs.length > 0 && (
              <tfoot className="bg-slate-100 font-extrabold text-slate-900 border-t-2 border-slate-300">
                <tr>
                  <td colSpan={7} className="px-3 py-2.5 text-right uppercase">
                    TOTAL ({filteredOBs.length} Parties):
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-emerald-800">{formatFC(summary.drFC)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-emerald-800">{formatINR(summary.drINR)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-rose-800">({formatFC(summary.crFC)})</td>
                  <td className="px-3 py-2.5 text-right font-mono text-rose-800">({formatINR(summary.crINR)})</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-bold text-slate-900">
                {editingOB ? `Edit Opening Balance: ${editingOB.referenceNo}` : 'Enter Opening Balance (as on 01-04-2026)'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">
                ✕
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Company *</label>
                  <select
                    value={formData.companyId}
                    onChange={e => setFormData({ ...formData, companyId: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-slate-300 bg-white"
                    required
                  >
                    {db.companies.map(c => (
                      <option key={c.id} value={c.id}>{c.code}</option>
                    ))}
                  </select>
                </div>

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

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Reference Type *</label>
                  <select
                    value={formData.referenceType}
                    onChange={e => setFormData({ ...formData, referenceType: e.target.value as 'PI' | 'CI' | 'On account' })}
                    className="w-full text-xs p-2 rounded border border-slate-300 bg-white"
                  >
                    <option value="On account">On account (Advance)</option>
                    <option value="PI">Proforma Invoice (PI)</option>
                    <option value="CI">Commercial Invoice (CI)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Reference No *</label>
                  <input
                    type="text"
                    value={formData.referenceNo}
                    onChange={e => setFormData({ ...formData, referenceNo: e.target.value })}
                    placeholder="e.g. PI-OLD-901"
                    className="w-full text-xs p-2 rounded border border-slate-300 font-semibold"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Balance Type (Dr/Cr) *</label>
                  <select
                    value={formData.balanceType}
                    onChange={e => setFormData({ ...formData, balanceType: e.target.value as 'Dr' | 'Cr' })}
                    className="w-full text-xs p-2 rounded border border-slate-300 bg-white font-bold"
                  >
                    <option value="Dr">Debit (Dr) - Positive / Advance with supplier</option>
                    <option value="Cr">Credit (Cr) - Negative (Bracket) / Payable</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Original Document Date</label>
                  <input
                    type="date"
                    value={formData.originalDocumentDate}
                    onChange={e => setFormData({ ...formData, originalDocumentDate: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Amount FC (Positive Abs) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.amountFC || ''}
                    onChange={e => setFormData({ ...formData, amountFC: parseFloat(e.target.value) || 0 })}
                    className="w-full text-xs p-2 rounded border border-slate-300 font-bold"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Amount INR (Positive Abs) *</label>
                  <input
                    type="number"
                    value={formData.amountINR || ''}
                    onChange={e => setFormData({ ...formData, amountINR: parseFloat(e.target.value) || 0 })}
                    className="w-full text-xs p-2 rounded border border-slate-300 font-bold"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Remarks</label>
                <input
                  type="text"
                  value={formData.remarks || ''}
                  onChange={e => setFormData({ ...formData, remarks: e.target.value })}
                  placeholder="Notes..."
                  className="w-full text-xs p-2 rounded border border-slate-300"
                />
              </div>

              <div className="pt-4 border-t flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 bg-slate-100 rounded hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 rounded hover:bg-indigo-700"
                >
                  {editingOB ? 'Update Opening Balance' : 'Save Opening Balance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
