import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { BOEBankSubmission, IDPMSStatus } from '../types';
import { formatFC, formatDate } from '../utils/formatters';
import { exportToExcel } from '../utils/excel';
import { Send, Download, CheckCircle2, Clock, AlertTriangle, Building, FileText, Search } from 'lucide-react';

export const BOESubmissionScreen: React.FC = () => {
  const { db, engineResult, selectedCompanyId, saveBOESubmission } = useApp();
  const { permissions } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [editingSub, setEditingSub] = useState<BOEBankSubmission | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Form state
  const [formData, setFormData] = useState<Partial<BOEBankSubmission>>({
    paymentId: '',
    ciId: '',
    boeNo: '',
    amountSubmittedFC: 0,
    submissionDate: new Date().toISOString().split('T')[0],
    bankAccountId: '',
    bankAcknowledgementNo: '',
    idpmsStatus: 'Submitted',
    remarks: '',
  });

  // Prepare a combined list of all allocations (which link Payment to CI & BOE)
  const allocationItems = engineResult.allocations.filter(alloc => {
    if (selectedCompanyId !== 'ALL' && alloc.companyId !== selectedCompanyId) return false;
    return true;
  });

  const handleOpenMarkSubmission = (alloc: typeof allocationItems[0]) => {
    const payment = db.payments.find(p => p.id === alloc.paymentId);
    const existingSub = db.boeSubmissions.find(s => s.paymentId === alloc.paymentId && s.ciId === alloc.ciId);

    setEditingSub(existingSub || null);
    setFormData({
      id: existingSub?.id || `SUB-${Date.now()}`,
      allocationId: alloc.id,
      paymentId: alloc.paymentId,
      ciId: alloc.ciId,
      boeNo: alloc.boeNo,
      amountSubmittedFC: existingSub?.amountSubmittedFC || alloc.amountFC,
      submissionDate: existingSub?.submissionDate || new Date().toISOString().split('T')[0],
      bankAccountId: existingSub?.bankAccountId || payment?.bankAccountId || db.bankAccounts[0]?.id || '',
      bankAcknowledgementNo: existingSub?.bankAcknowledgementNo || '',
      idpmsStatus: existingSub?.idpmsStatus || 'Submitted',
      remarks: existingSub?.remarks || '',
    });
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.paymentId || !formData.ciId || !formData.boeNo || !formData.bankAccountId) {
      alert('Missing required fields.');
      return;
    }

    const payload: BOEBankSubmission = {
      id: editingSub ? editingSub.id : `SUB-${Date.now()}`,
      allocationId: formData.allocationId,
      paymentId: formData.paymentId!,
      ciId: formData.ciId!,
      boeNo: formData.boeNo!,
      amountSubmittedFC: Number(formData.amountSubmittedFC || 0),
      submissionDate: formData.submissionDate || new Date().toISOString().split('T')[0],
      bankAccountId: formData.bankAccountId!,
      bankAcknowledgementNo: formData.bankAcknowledgementNo || undefined,
      idpmsStatus: (formData.idpmsStatus as IDPMSStatus) || 'Submitted',
      remarks: formData.remarks || undefined,
      createdAt: editingSub?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    saveBOESubmission(payload);
    setShowModal(false);
  };

  const handleExport = () => {
    const data = allocationItems.map(alloc => {
      const payment = db.payments.find(p => p.id === alloc.paymentId);
      const ci = db.commercialInvoices.find(c => c.id === alloc.ciId);
      const pi = db.proformaInvoices.find(p => p.id === alloc.piId);
      const supp = db.suppliers.find(s => s.id === alloc.supplierId);
      const bank = db.bankAccounts.find(b => b.id === payment?.bankAccountId);
      const sub = db.boeSubmissions.find(s => s.paymentId === alloc.paymentId && s.ciId === alloc.ciId);

      return {
        'Remittance Date': formatDate(alloc.paymentDate),
        'Bank Reference No': payment?.bankReferenceNo || alloc.paymentId,
        'UTR / SWIFT': payment?.utrSwiftRef || '',
        'Amount FC Settled': alloc.amountFC,
        Currency: alloc.currency,
        Supplier: supp?.supplierName,
        'PI No': pi?.piNo || '-',
        'CI No': ci?.ciNo || '-',
        'BOE No': alloc.boeNo,
        'BOE Date': formatDate(alloc.boeDate),
        'Submission Status': sub?.idpmsStatus || 'Pending',
        'Submission Date': sub ? formatDate(sub.submissionDate) : '-',
        'Bank Ack No': sub?.bankAcknowledgementNo || '-',
        Bank: bank ? `${bank.bankName} (${bank.accountNumber.slice(-4)})` : '-',
      };
    });
    exportToExcel(data, 'BOE_Bank_Submission_Report');
  };

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-base font-bold text-slate-900">BOE Bank Submission & IDPMS Reconciliation</h2>
          <p className="text-xs text-slate-500">
            Track Bill of Entry (BOE) submissions to Authorized Dealer (AD) Banks for RBI IDPMS knock-off
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {/* Status Filter */}
          <div className="flex items-center space-x-1.5 text-xs">
            <span className="font-semibold text-slate-600">Status:</span>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded px-2 py-1 text-slate-800 font-medium"
            >
              <option value="ALL">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Submitted">Submitted</option>
              <option value="Settled">Settled (IDPMS Knocked Off)</option>
            </select>
          </div>

          <button
            onClick={handleExport}
            className="flex items-center space-x-1 text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg border border-slate-300"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel Submission Sheet</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-100 text-slate-700 font-semibold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-3 py-2.5">Company</th>
                <th className="px-3 py-2.5">Bank & Remittance Date</th>
                <th className="px-3 py-2.5">Bank Ref / UTR</th>
                <th className="px-3 py-2.5">Supplier</th>
                <th className="px-3 py-2.5">Linked PI & CI</th>
                <th className="px-3 py-2.5">BOE No & Date</th>
                <th className="px-3 py-2.5 text-right">Settled FC</th>
                <th className="px-3 py-2.5 text-center">IDPMS Status</th>
                <th className="px-3 py-2.5">Bank Ack No</th>
                <th className="px-3 py-2.5 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {allocationItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                    No payment-to-BOE allocations exist. Book payments and CIs to view settlements.
                  </td>
                </tr>
              ) : (
                allocationItems.map(alloc => {
                  const payment = db.payments.find(p => p.id === alloc.paymentId);
                  const ci = db.commercialInvoices.find(c => c.id === alloc.ciId);
                  const pi = db.proformaInvoices.find(p => p.id === alloc.piId);
                  const supp = db.suppliers.find(s => s.id === alloc.supplierId);
                  const bank = db.bankAccounts.find(b => b.id === payment?.bankAccountId);
                  const comp = db.companies.find(c => c.id === alloc.companyId);
                  const sub = db.boeSubmissions.find(s => s.paymentId === alloc.paymentId && s.ciId === alloc.ciId);

                  const currentStatus = sub ? sub.idpmsStatus : 'Pending';

                  if (statusFilter !== 'ALL' && currentStatus !== statusFilter) return null;

                  let statusBadge = 'bg-amber-100 text-amber-800';
                  if (currentStatus === 'Settled') statusBadge = 'bg-emerald-100 text-emerald-800 font-bold';
                  else if (currentStatus === 'Submitted') statusBadge = 'bg-sky-100 text-sky-800';

                  return (
                    <tr key={alloc.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-3 py-2.5 font-bold text-slate-900">{comp?.code}</td>
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-slate-900">{bank?.bankName} ({bank?.accountNumber.slice(-4)})</div>
                        <div className="text-slate-400">{formatDate(alloc.paymentDate)}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-bold text-slate-800">{payment?.bankReferenceNo || alloc.paymentId}</div>
                        {payment?.utrSwiftRef && <div className="text-[10px] text-slate-400">{payment.utrSwiftRef}</div>}
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-slate-900">{supp?.supplierName}</td>
                      <td className="px-3 py-2.5">
                        <div className="text-slate-800">CI: <span className="font-bold">{ci?.ciNo}</span></div>
                        <div className="text-[10px] text-slate-400">PI: {pi?.piNo || '-'}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className={`font-bold ${!alloc.ciId.startsWith('OB-') && alloc.boeNo.startsWith('PENDING-') ? 'text-amber-700' : 'text-indigo-700'}`}>
                          {alloc.boeNo}
                        </div>
                        {!alloc.ciId.startsWith('OB-') && alloc.boeNo.startsWith('PENDING-') && (
                          <span className="inline-block text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900">
                            BOE No Pending on CI
                          </span>
                        )}
                        <div className="text-slate-400">{formatDate(alloc.boeDate)} ({ci?.portCode || '-'})</div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-extrabold text-slate-900">
                        {formatFC(alloc.amountFC)} <span className="text-[10px] text-slate-500 font-normal">{alloc.currency}</span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] ${statusBadge}`}>
                          {currentStatus}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-700">
                        {sub?.bankAcknowledgementNo || '-'}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {permissions.canSubmitBOE ? (
                          <button
                            onClick={() => handleOpenMarkSubmission(alloc)}
                            className="px-2.5 py-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 rounded border border-indigo-200"
                          >
                            {sub ? 'Update' : 'Mark Submitted'}
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

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">Mark BOE Bank Submission (IDPMS)</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {formData.boeNo?.startsWith('PENDING-') && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-900 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Customs BOE No is still marked <strong>{formData.boeNo}</strong>. Update the actual BOE No in <strong>PI-CI-BOE Linkage</strong> or <strong>Purchase / CI</strong> before final IDPMS settlement.</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">BOE Number</label>
                  <input
                    type="text"
                    disabled
                    value={formData.boeNo}
                    className="w-full text-xs p-2 rounded border border-slate-200 bg-slate-100 font-bold text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Amount Submitted (FC)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.amountSubmittedFC || ''}
                    onChange={e => setFormData({ ...formData, amountSubmittedFC: parseFloat(e.target.value) || 0 })}
                    className="w-full text-xs p-2 rounded border border-slate-300 font-bold text-indigo-900"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Bank Submission Date *</label>
                  <input
                    type="date"
                    value={formData.submissionDate}
                    onChange={e => setFormData({ ...formData, submissionDate: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-slate-300"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">IDPMS Knock-off Status *</label>
                  <select
                    value={formData.idpmsStatus}
                    onChange={e => setFormData({ ...formData, idpmsStatus: e.target.value as IDPMSStatus })}
                    className="w-full text-xs p-2 rounded border border-slate-300 bg-white font-bold"
                  >
                    <option value="Pending">Pending Submission</option>
                    <option value="Submitted">Submitted to Bank (Under Review)</option>
                    <option value="Settled">Settled / Closed in IDPMS</option>
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Bank Acknowledgement / ORM Ref</label>
                  <input
                    type="text"
                    value={formData.bankAcknowledgementNo || ''}
                    onChange={e => setFormData({ ...formData, bankAcknowledgementNo: e.target.value })}
                    placeholder="e.g. HDFC-ACK-5544"
                    className="w-full text-xs p-2 rounded border border-slate-300"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Remarks</label>
                <input
                  type="text"
                  value={formData.remarks || ''}
                  onChange={e => setFormData({ ...formData, remarks: e.target.value })}
                  placeholder="Submission letter date, docket ref..."
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
                  Save Submission
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
