import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { formatFC, formatINR, formatDate, round2 } from '../utils/formatters';
import { exportToExcel } from '../utils/excel';
import { Boxes, Download, Search, Users, FileSpreadsheet } from 'lucide-react';

type SubTab = 'pi_balance' | 'party_summary';

export const MaterialBalanceScreen: React.FC = () => {
  const { db, materialBalances, selectedCompanyId } = useApp();

  const [subTab, setSubTab] = useState<SubTab>('pi_balance');
  const [searchQuery, setSearchQuery] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const filteredItemRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return materialBalances.itemRows.filter(r => {
      if (supplierFilter !== 'ALL' && r.supplierId !== supplierFilter) return false;
      if (statusFilter === 'Pending Balance' && r.balancePendingQty <= 0) return false;
      if (statusFilter === 'In-Transit' && r.inTransitQty <= 0) return false;
      if (statusFilter === 'Fully Received' && r.status !== 'Fully Received') return false;
      if (q) {
        const hay = `${r.piNo} ${r.supplierName} ${r.itemCode} ${r.itemName} ${r.hsnCode}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [materialBalances.itemRows, supplierFilter, statusFilter, searchQuery]);

  const filteredPartyRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return materialBalances.partyBalances.filter(p => {
      if (supplierFilter !== 'ALL' && p.supplierId !== supplierFilter) return false;
      if (statusFilter === 'Pending Balance' && p.balancePendingFC <= 0) return false;
      if (statusFilter === 'In-Transit' && p.inTransitShipments <= 0) return false;
      if (statusFilter === 'Fully Received' && p.balancePendingFC > 0) return false;
      if (q) {
        if (!`${p.supplierName} ${p.vendorCode} ${p.currency}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [materialBalances.partyBalances, supplierFilter, statusFilter, searchQuery]);

  const handleExport = () => {
    if (subTab === 'pi_balance') {
      exportToExcel(
        filteredItemRows.map(r => ({
          Company: r.companyCode,
          Supplier: r.supplierName,
          'PI No': r.piNo,
          'PI Date': formatDate(r.piDate),
          'Our Item Code (SAP)': r.itemCode,
          'Our Item Description (SAP)': r.itemName,
          'Supplier Item Code': r.supplierItemCode || '-',
          'Supplier Item Name': r.supplierItemName || '-',
          HSN: r.hsnCode,
          UOM: r.uom,
          'Ordered Qty': r.orderedQty,
          'Dispatched Qty': r.dispatchedQty,
          'In-Transit Qty': r.inTransitQty,
          'Received Qty': r.receivedQty,
          'Short Qty': r.shortQty,
          'Balance Pending Qty': r.balancePendingQty,
          Currency: r.currency,
          'Pending Value FC': r.balanceAmountFC,
          'Next ETA Port': r.nextEtaDate ? formatDate(r.nextEtaDate) : '-',
          'Est Pending Duty INR': r.estPendingDutyINR,
          Status: r.status,
        })),
        'PI_Wise_Material_Balance'
      );
    } else {
      exportToExcel(
        filteredPartyRows.map(p => ({
          Company: p.companyCode,
          'Vendor Code': p.vendorCode,
          Supplier: p.supplierName,
          Currency: p.currency,
          'Open PIs': p.openPiCount,
          'Total Ordered FC': p.totalOrderedFC,
          'Received Value FC': p.receivedValueFC,
          'Pending Material Value FC': p.balancePendingFC,
          'Ordered Qty': p.orderedQty,
          'Received Qty': p.receivedQty,
          'Pending Qty': p.pendingQty,
          'In-Transit Shipments': p.inTransitShipments,
          'Delayed Dispatches': p.overdueDispatches,
          'Upcoming Est Duty INR': p.upcomingDutyINR,
          'Next ETA': p.nextEtaDate ? formatDate(p.nextEtaDate) : '-',
        })),
        'Party_Wise_Material_Balance'
      );
    }
  };

  return (
    <div className="p-6 space-y-4 max-w-[1440px] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-2xl shadow-xs border border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <Boxes className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-extrabold text-slate-900">
              PI-wise &amp; Party-wise Material Receipt Balance
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Live tracking of ordered vs dispatched vs received material per Proforma Invoice and Supplier
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setSubTab('pi_balance')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              subTab === 'pi_balance' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>PI-wise Material ({filteredItemRows.length})</span>
          </button>
          <button
            onClick={() => setSubTab('party_summary')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              subTab === 'party_summary' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Party-wise Summary ({filteredPartyRows.length})</span>
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex flex-wrap items-center gap-3 text-xs">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search PI / Party / Item Code / HSN..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full text-xs pl-8 pr-3 py-1.5 rounded-lg border border-slate-300"
          />
        </div>
        <select
          value={supplierFilter}
          onChange={e => setSupplierFilter(e.target.value)}
          className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white max-w-[220px]"
        >
          <option value="ALL">All Suppliers</option>
          {db.suppliers
            .filter(s => selectedCompanyId === 'ALL' || s.companyId === selectedCompanyId)
            .map(s => (
              <option key={s.id} value={s.id}>{s.supplierName}</option>
            ))}
        </select>
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
          {['ALL', 'Pending Balance', 'In-Transit', 'Fully Received'].map(st => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-2.5 py-1 rounded text-[11px] font-bold ${
                statusFilter === st ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600'
              }`}
            >
              {st === 'ALL' ? 'All' : st}
            </button>
          ))}
        </div>
      </div>

      {subTab === 'pi_balance' ? (
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-semibold uppercase tracking-wider border-b">
                <tr>
                  <th className="px-3 py-2.5">Company / Supplier</th>
                  <th className="px-3 py-2.5">PI No &amp; Date</th>
                  <th className="px-3 py-2.5">Item &amp; HSN</th>
                  <th className="px-3 py-2.5 text-right">Ordered Qty</th>
                  <th className="px-3 py-2.5 text-right">In-Transit Qty</th>
                  <th className="px-3 py-2.5 text-right text-emerald-800 bg-emerald-50/40">Received Qty</th>
                  <th className="px-3 py-2.5 text-right text-amber-800 bg-amber-50/40">Balance Qty</th>
                  <th className="px-3 py-2.5 text-right">Pending Value</th>
                  <th className="px-3 py-2.5">Next ETA / Duty</th>
                  <th className="px-3 py-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredItemRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-slate-400">
                      No item-wise PI material lines yet. Create PIs from Purchase Requisitions or add item lines on a PI.
                    </td>
                  </tr>
                ) : (
                  filteredItemRows.map(r => (
                    <tr key={`${r.piId}-${r.lineId}`} className="hover:bg-slate-50/80">
                      <td className="px-3 py-2.5">
                        <span className="font-bold text-slate-900">{r.companyCode}</span>
                        <div className="text-[11px] font-semibold">{r.supplierName}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-bold text-indigo-700">{r.piNo}</div>
                        <div className="text-[10px] text-slate-400">{formatDate(r.piDate)}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-slate-900">{r.itemName}</div>
                        <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1.5 flex-wrap mt-0.5">
                          <span className="px-1.5 py-0.2 bg-indigo-50 text-indigo-700 rounded font-bold" title="Our SAP Code">
                            SAP: {r.itemCode}
                          </span>
                          {r.supplierItemCode && (
                            <span className="px-1.5 py-0.2 bg-emerald-50 text-emerald-700 rounded font-bold" title="Supplier Part Code">
                              Supp: {r.supplierItemCode}
                            </span>
                          )}
                          <span>• HSN {r.hsnCode}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">{r.orderedQty} {r.uom}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-sky-700 font-bold">{r.inTransitQty}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-700 bg-emerald-50/20">
                        {r.receivedQty}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-extrabold text-amber-800 bg-amber-50/20">
                        {r.balancePendingQty}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold">
                        {formatFC(r.balanceAmountFC)} {r.currency}
                      </td>
                      <td className="px-3 py-2.5 text-[11px]">
                        <div>{r.nextEtaDate ? formatDate(r.nextEtaDate) : '-'}</div>
                        {r.estPendingDutyINR > 0 && (
                          <div className="text-amber-700 font-mono font-semibold">
                            Duty: {formatINR(r.estPendingDutyINR)}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            r.status === 'Fully Received'
                              ? 'bg-emerald-100 text-emerald-800'
                              : r.status === 'In-Transit'
                                ? 'bg-sky-100 text-sky-800'
                                : r.status === 'Part Received'
                                  ? 'bg-indigo-100 text-indigo-800'
                                  : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-semibold uppercase tracking-wider border-b">
                <tr>
                  <th className="px-3 py-2.5">Company</th>
                  <th className="px-3 py-2.5">Party / Supplier</th>
                  <th className="px-3 py-2.5 text-center">Open PIs</th>
                  <th className="px-3 py-2.5 text-right">Total Ordered (FC)</th>
                  <th className="px-3 py-2.5 text-right text-emerald-800 bg-emerald-50/40">Received (FC)</th>
                  <th className="px-3 py-2.5 text-right text-amber-800 bg-amber-50/40">Pending Balance (FC)</th>
                  <th className="px-3 py-2.5 text-right">Ordered / Pending Qty</th>
                  <th className="px-3 py-2.5 text-center">In-Transit / Delayed</th>
                  <th className="px-3 py-2.5 text-right">Upcoming Duty (INR)</th>
                  <th className="px-3 py-2.5">Next ETA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredPartyRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-slate-400">
                      No supplier PI material balances found.
                    </td>
                  </tr>
                ) : (
                  filteredPartyRows.map(p => (
                    <tr key={`${p.supplierId}-${p.currency}`} className="hover:bg-slate-50/80">
                      <td className="px-3 py-2.5 font-bold text-slate-900">{p.companyCode}</td>
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-slate-900">{p.supplierName}</div>
                        <div className="text-[10px] text-slate-400">{p.vendorCode} • {p.currency}</div>
                      </td>
                      <td className="px-3 py-2.5 text-center font-bold">{p.openPiCount}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{formatFC(p.totalOrderedFC)}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-700 bg-emerald-50/20">
                        {formatFC(p.receivedValueFC)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-extrabold text-amber-800 bg-amber-50/20">
                        {formatFC(p.balancePendingFC)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">
                        {round2(p.orderedQty)} / <strong className="text-amber-700">{round2(p.pendingQty)}</strong>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="font-bold text-sky-700">{p.inTransitShipments}</span>
                        {p.overdueDispatches > 0 && (
                          <span className="ml-1.5 px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold">
                            {p.overdueDispatches} Late
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900">
                        {formatINR(p.upcomingDutyINR)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {p.nextEtaDate ? formatDate(p.nextEtaDate) : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
