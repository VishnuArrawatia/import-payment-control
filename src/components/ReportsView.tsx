import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  formatFC,
  formatINR,
  formatDate,
  formatRate,
} from '../utils/formatters';
import { exportToExcel } from '../utils/excel';
import { computeMonthEndValuation } from '../utils/engine';
import { computeBOETaxTotals } from '../utils/boe';
import {
  Download,
  Printer,
  Search,
} from 'lucide-react';

type ReportType =
  | 'pi_status'
  | 'purchase_register'
  | 'payment_register'
  | 'bank_submission'
  | 'party_ledger'
  | 'fx_register'
  | 'debit_note_register'
  | 'boe_register'
  | 'month_end_summary';

export const ReportsView: React.FC = () => {
  const { db, engineResult, selectedCompanyId, asOfDate } = useApp();

  const [activeReport, setActiveReport] = useState<ReportType>('party_ledger');
  const [searchQuery, setSearchQuery] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('ALL');
  const [supplierFilter, setSupplierFilter] = useState('ALL');

  const filteredSuppliers = useMemo(() => {
    return db.suppliers.filter(
      s => selectedCompanyId === 'ALL' || s.companyId === selectedCompanyId
    );
  }, [db.suppliers, selectedCompanyId]);

  // Ledger specific filters (auto-sync when company changes)
  const [ledgerSupplierId, setLedgerSupplierId] = useState<string>(() => {
    const fsp = db.suppliers.find(s => s.vendorCode === 'V01020');
    return fsp?.id || db.suppliers[0]?.id || '';
  });
  const [ledgerCurrency, setLedgerCurrency] = useState<string>('USD');

  useEffect(() => {
    if (filteredSuppliers.length > 0 && !filteredSuppliers.some(s => s.id === ledgerSupplierId)) {
      setLedgerSupplierId(filteredSuppliers[0].id);
    }
  }, [filteredSuppliers, ledgerSupplierId]);

  // Month-end specific filter
  const [selectedMonthEnd, setSelectedMonthEnd] = useState<string>('2026-10-31');
  const [monthEndCurrency, setMonthEndCurrency] = useState<string>('USD');
  const [customValuationRate, setCustomValuationRate] = useState<string>('');

  const q = searchQuery.trim().toLowerCase();

  const bankLabel = (bankId?: string) => {
    if (!bankId) return '-';
    const b = db.bankAccounts.find(x => x.id === bankId);
    return b ? `${b.bankName} - ${b.accountNumber.slice(-4)}` : bankId;
  };

  // --- REPORT 1: PI Status Register ---
  const piStatusData = useMemo(() => {
    return db.proformaInvoices
      .filter(pi => {
        if ((pi.piDate || '') > asOfDate) return false;
        if (selectedCompanyId !== 'ALL' && pi.companyId !== selectedCompanyId) return false;
        if (currencyFilter !== 'ALL' && pi.currency !== currencyFilter) return false;
        if (supplierFilter !== 'ALL' && pi.supplierId !== supplierFilter) return false;
        return true;
      })
      .map(pi => {
        const comp = db.companies.find(c => c.id === pi.companyId);
        const supp = db.suppliers.find(s => s.id === pi.supplierId);
        const state = engineResult.piStates.get(pi.id);
        const payments = state?.payments || [];
        const cis = state?.cis || [];

        const firstPayDate = payments[0]?.paymentDate;
        const lastPayDate = payments[payments.length - 1]?.paymentDate;

        const shortShipment = pi.isClosed && (state?.shippedFC || 0) < pi.piValueFC
          ? pi.piValueFC - (state?.shippedFC || 0)
          : 0;

        const balanceFC = (state?.totalPaidFC || 0) - (state?.shippedFC || 0);

        return {
          id: pi.id,
          company: comp?.code || '',
          supplier: supp?.supplierName || '',
          vendorCode: supp?.vendorCode || '',
          piNo: pi.piNo,
          piDate: pi.piDate,
          currency: pi.currency,
          piValueFC: pi.piValueFC,
          advancePct: pi.advancePercentage,
          advanceReqFC: state?.advanceRequiredFC || 0,
          paidCount: payments.length,
          paidFC: state?.totalPaidFC || 0,
          firstPayDate: firstPayDate ? formatDate(firstPayDate) : '-',
          lastPayDate: lastPayDate ? formatDate(lastPayDate) : '-',
          ciNos: cis.map(c => c.ciNo).join(', ') || '-',
          shippedFC: state?.shippedFC || 0,
          shortShipmentFC: shortShipment,
          balanceFC,
          balanceType: balanceFC > 0 ? 'Dr (Advance)' : balanceFC < 0 ? 'Cr (Payable)' : 'Nil',
          status: state?.status || 'Active',
          complianceFlags: state?.complianceFlags || [],
        };
      })
      .filter(r => !q || r.piNo.toLowerCase().includes(q) || r.supplier.toLowerCase().includes(q) || r.ciNos.toLowerCase().includes(q));
  }, [db, engineResult, selectedCompanyId, currencyFilter, supplierFilter, asOfDate, q]);

  // --- REPORT 2: Purchase (CI) Register ---
  const purchaseRegisterData = useMemo(() => {
    return db.commercialInvoices
      .filter(ci => {
        if ((ci.ciDate || '') > asOfDate) return false;
        if (selectedCompanyId !== 'ALL' && ci.companyId !== selectedCompanyId) return false;
        if (currencyFilter !== 'ALL' && ci.currency !== currencyFilter) return false;
        if (supplierFilter !== 'ALL' && ci.supplierId !== supplierFilter) return false;
        return true;
      })
      .map(ci => {
        const comp = db.companies.find(c => c.id === ci.companyId);
        const supp = db.suppliers.find(s => s.id === ci.supplierId);
        const pi = db.proformaInvoices.find(p => p.id === ci.linkedPiId);
        const st = engineResult.ciStates.get(ci.id);

        return {
          id: ci.id,
          company: comp?.code || '',
          supplier: supp?.supplierName || '',
          ciNo: ci.ciNo,
          ciDate: ci.ciDate,
          linkedPi: pi?.piNo || '-',
          currency: ci.currency,
          ciValueFC: ci.ciValueFC,
          boeNo: ci.boeNo,
          boeDate: ci.boeDate,
          portCode: ci.portCode || '-',
          boeRate: ci.boeExchangeRate,
          purchaseINR: ci.purchaseINR,
          allocatedFC: st?.allocatedFC || 0,
          balanceFC: st?.balanceFC || 0,
          realizedGL: st?.realizedGainLossINR || 0,
          dueDate: st?.dueDate || '',
          isOverdue: st?.isOverdue || false,
          status: st?.status || 'Unpaid',
          tallyVoucher: ci.tallyVoucherNo || '-',
        };
      })
      .filter(r => !q || r.ciNo.toLowerCase().includes(q) || r.boeNo.toLowerCase().includes(q) || r.supplier.toLowerCase().includes(q));
  }, [db, engineResult, selectedCompanyId, currencyFilter, supplierFilter, asOfDate, q]);

  // --- REPORT 3: Payment Register ---
  const paymentRegisterData = useMemo(() => {
    return db.payments
      .filter(p => {
        if ((p.paymentDate || '') > asOfDate) return false;
        if (selectedCompanyId !== 'ALL' && p.companyId !== selectedCompanyId) return false;
        if (currencyFilter !== 'ALL' && p.currency !== currencyFilter) return false;
        if (supplierFilter !== 'ALL' && p.supplierId !== supplierFilter) return false;
        return true;
      })
      .map(p => {
        const comp = db.companies.find(c => c.id === p.companyId);
        const supp = db.suppliers.find(s => s.id === p.supplierId);
        const pi = db.proformaInvoices.find(i => i.id === p.linkedPiId);
        const ci = db.commercialInvoices.find(i => i.id === p.linkedCiId);

        const allocs = engineResult.allocations.filter(a => a.paymentId === p.id);
        const allocatedFC = allocs.reduce((s, a) => s + a.amountFC, 0);
        const unappliedFC = Math.max(0, p.amountFC - allocatedFC);
        const boeNos = Array.from(new Set(allocs.map(a => a.boeNo))).join(', ') || '-';

        return {
          id: p.id,
          company: comp?.code || '',
          bank: bankLabel(p.bankAccountId),
          paymentDate: p.paymentDate,
          supplier: supp?.supplierName || '',
          currency: p.currency,
          amountFC: p.amountFC,
          actualRate: p.actualExchangeRate,
          inrAmount: p.inrAmount,
          allocatedFC,
          unappliedFC,
          boeNos,
          against: p.paymentAgainst,
          refNo: p.paymentAgainst === 'PI' ? (pi?.piNo || 'On-Account') : (ci?.ciNo || 'FIFO / On-Account'),
          bankRefNo: p.bankReferenceNo,
          utrRef: p.utrSwiftRef || '-',
          mode: p.paymentMode,
          purposeCode: p.purposeCode || '-',
        };
      })
      .filter(r => !q || r.bankRefNo.toLowerCase().includes(q) || r.supplier.toLowerCase().includes(q) || r.boeNos.toLowerCase().includes(q));
  }, [db, engineResult, selectedCompanyId, currencyFilter, supplierFilter, asOfDate, q]);

  // --- REPORT 4: Bank Submission Report ---
  const bankSubmissionData = useMemo(() => {
    return engineResult.allocations
      .filter(alloc => {
        if (selectedCompanyId !== 'ALL' && alloc.companyId !== selectedCompanyId) return false;
        if (currencyFilter !== 'ALL' && alloc.currency !== currencyFilter) return false;
        if (supplierFilter !== 'ALL' && alloc.supplierId !== supplierFilter) return false;
        return true;
      })
      .map(alloc => {
        const comp = db.companies.find(c => c.id === alloc.companyId);
        const payment = db.payments.find(p => p.id === alloc.paymentId);
        const isOb = alloc.ciId.startsWith('OB-');
        const ob = isOb ? db.openingBalances.find(o => `OB-${o.id}` === alloc.ciId) : undefined;
        const ci = !isOb ? db.commercialInvoices.find(c => c.id === alloc.ciId) : undefined;
        const pi = db.proformaInvoices.find(p => p.id === alloc.piId);
        const supp = db.suppliers.find(s => s.id === alloc.supplierId);
        const sub = db.boeSubmissions.find(s => s.paymentId === alloc.paymentId && s.ciId === alloc.ciId);

        return {
          id: alloc.id,
          company: comp?.code || '',
          bank: bankLabel(payment?.bankAccountId),
          paymentDate: alloc.paymentDate,
          bankRefNo: payment?.bankReferenceNo || alloc.paymentId,
          utrRef: payment?.utrSwiftRef || '-',
          remittanceFC: payment?.amountFC || alloc.amountFC,
          currency: alloc.currency,
          supplier: supp?.supplierName || '',
          piNo: pi?.piNo || '-',
          piDate: pi?.piDate || '-',
          ciNo: ci?.ciNo || ob?.referenceNo || '-',
          ciDate: ci?.ciDate || ob?.referenceDate || '-',
          boeNo: alloc.boeNo,
          boeDate: alloc.boeDate,
          settledFC: alloc.amountFC,
          status: sub?.idpmsStatus || 'Pending',
          submissionDate: sub?.submissionDate ? formatDate(sub.submissionDate) : '-',
          bankAckNo: sub?.bankAcknowledgementNo || '-',
        };
      })
      .filter(r => !q || r.boeNo.toLowerCase().includes(q) || r.ciNo.toLowerCase().includes(q) || r.bankRefNo.toLowerCase().includes(q) || r.supplier.toLowerCase().includes(q));
  }, [db, engineResult, selectedCompanyId, currencyFilter, supplierFilter, q]);

  // --- REPORT 5: Party Ledger ---
  const partyLedgerData = useMemo(() => {
    const selectedSupp = db.suppliers.find(s => s.id === ledgerSupplierId);
    if (!selectedSupp) return { rows: [], totalDrFC: 0, totalCrFC: 0, totalDrINR: 0, totalCrINR: 0, finalFC: 0, finalINR: 0 };

    interface LedgerEntry {
      date: string;
      sortOrder: number;
      docType: string;
      docNo: string;
      details: string;
      drFC: number; // Payment / Advance (Dr)
      crFC: number; // Purchase / Payable (Cr)
      drINR: number;
      crINR: number;
      runningFC: number;
      runningINR: number;
    }

    const entries: LedgerEntry[] = [];

    // 1. Opening Balances
    db.openingBalances
      .filter(ob => ob.supplierId === ledgerSupplierId && ob.currency === ledgerCurrency && (ob.referenceDate || '') <= asOfDate)
      .forEach(ob => {
        entries.push({
          date: ob.referenceDate,
          sortOrder: 0,
          docType: `Opening (${ob.referenceType})`,
          docNo: ob.referenceNo,
          details: `B/F Balance @ ${formatRate(ob.rate)}`,
          drFC: ob.balanceType === 'Dr' ? ob.amountFC : 0,
          crFC: ob.balanceType === 'Cr' ? ob.amountFC : 0,
          drINR: ob.balanceType === 'Dr' ? ob.amountINR : 0,
          crINR: ob.balanceType === 'Cr' ? ob.amountINR : 0,
          runningFC: 0,
          runningINR: 0,
        });
      });

    // 2. Payments (Dr)
    db.payments
      .filter(p => p.supplierId === ledgerSupplierId && p.currency === ledgerCurrency && (p.paymentDate || '') <= asOfDate && !(p.paymentMode === 'LC' && p.lcStatus !== 'Paid'))
      .forEach(p => {
        entries.push({
          date: p.paymentDate,
          sortOrder: 2,
          docType: `Payment (${p.paymentAgainst})`,
          docNo: p.bankReferenceNo,
          details: `${bankLabel(p.bankAccountId)} | Rate: ${formatRate(p.actualExchangeRate)}`,
          drFC: p.amountFC,
          crFC: 0,
          drINR: p.inrAmount,
          crINR: 0,
          runningFC: 0,
          runningINR: 0,
        });
      });

    // 3. Commercial Invoices / Purchases (Cr)
    db.commercialInvoices
      .filter(c => c.supplierId === ledgerSupplierId && c.currency === ledgerCurrency && (c.ciDate || '') <= asOfDate)
      .forEach(c => {
        entries.push({
          date: c.ciDate,
          sortOrder: 1,
          docType: 'Purchase (CI)',
          docNo: c.ciNo,
          details: `BOE: ${c.boeNo} | Rate: ${formatRate(c.boeExchangeRate)}`,
          drFC: 0,
          crFC: c.ciValueFC,
          drINR: 0,
          crINR: c.purchaseINR,
          runningFC: 0,
          runningINR: 0,
        });
      });

    // 4. Debit Notes (Memo / Write-off if applicable)
    db.debitNotes
      .filter(d => d.supplierId === ledgerSupplierId && d.currency === ledgerCurrency && (d.dnDate || '') <= asOfDate)
      .forEach(d => {
        const isWriteOff = d.recoveryMethod === 'Write-off';
        entries.push({
          date: d.dnDate,
          sortOrder: 3,
          docType: `Debit Note (${d.recoveryMethod})`,
          docNo: d.dnNo,
          details: `${d.reason} @ ${formatRate(d.rate)} (Recoverable)`,
          drFC: isWriteOff ? 0 : 0,
          crFC: isWriteOff ? d.amountFC : 0,
          drINR: 0,
          crINR: isWriteOff ? d.inrAmount : 0,
          runningFC: 0,
          runningINR: 0,
        });
      });

    // 5. Refunds Received (Cr - reduces supplier Dr balance when supplier returns money)
    db.refundReceipts
      .filter(r => r.supplierId === ledgerSupplierId && r.currency === ledgerCurrency && (r.date || '') <= asOfDate)
      .forEach(r => {
        entries.push({
          date: r.date,
          sortOrder: 4,
          docType: 'Refund Inward',
          docNo: r.bankReferenceNo || r.id,
          details: `${bankLabel(r.bankAccountId)} | Rate: ${formatRate(r.actualExchangeRate)}`,
          drFC: 0,
          crFC: r.amountFC,
          drINR: 0,
          crINR: r.inrAmount,
          runningFC: 0,
          runningINR: 0,
        });
      });

    entries.sort((a, b) => a.date.localeCompare(b.date) || a.sortOrder - b.sortOrder);

    let curFC = 0;
    let curINR = 0;
    let totalDrFC = 0;
    let totalCrFC = 0;
    let totalDrINR = 0;
    let totalCrINR = 0;
    for (const e of entries) {
      totalDrFC += e.drFC;
      totalCrFC += e.crFC;
      totalDrINR += e.drINR;
      totalCrINR += e.crINR;
      curFC = curFC + (e.crFC - e.drFC);
      curINR = curINR + (e.crINR - e.drINR);
      e.runningFC = curFC;
      e.runningINR = curINR;
    }

    const visibleRows = q
      ? entries.filter(e => e.docNo.toLowerCase().includes(q) || e.details.toLowerCase().includes(q) || e.docType.toLowerCase().includes(q))
      : entries;

    return { rows: visibleRows, totalDrFC, totalCrFC, totalDrINR, totalCrINR, finalFC: curFC, finalINR: curINR };
  }, [db, ledgerSupplierId, ledgerCurrency, asOfDate, q]);

  // --- REPORT 6: FX Gain/Loss Register ---
  const fxRegisterData = useMemo(() => {
    const list = engineResult.allocations
      .filter(alloc => {
        if (selectedCompanyId !== 'ALL' && alloc.companyId !== selectedCompanyId) return false;
        if (currencyFilter !== 'ALL' && alloc.currency !== currencyFilter) return false;
        if (supplierFilter !== 'ALL' && alloc.supplierId !== supplierFilter) return false;
        return true;
      })
      .map(alloc => {
        const comp = db.companies.find(c => c.id === alloc.companyId);
        const supp = db.suppliers.find(s => s.id === alloc.supplierId);
        const payment = db.payments.find(p => p.id === alloc.paymentId);
        const isOb = alloc.ciId.startsWith('OB-');
        const ob = isOb ? db.openingBalances.find(o => `OB-${o.id}` === alloc.ciId) : undefined;
        const ci = !isOb ? db.commercialInvoices.find(c => c.id === alloc.ciId) : undefined;

        return {
          id: alloc.id,
          company: comp?.code || '',
          supplier: supp?.supplierName || '',
          currency: alloc.currency,
          ciNo: isOb ? (ob?.referenceNo || alloc.boeNo) : (ci?.ciNo || '-'),
          boeNo: alloc.boeNo,
          ciDate: alloc.ciDate,
          boeRate: alloc.boeRate,
          paymentRef: payment?.bankReferenceNo || alloc.paymentId,
          paymentDate: alloc.paymentDate,
          paymentRate: alloc.paymentRate,
          allocatedFC: alloc.amountFC,
          realizedGL: alloc.realizedGainLossINR,
          type: isOb ? 'Opening Payable Settlement' : 'Payment Allocation',
        };
      });

    db.refundReceipts
      .filter(r => {
        if ((r.date || '') > asOfDate) return false;
        if (selectedCompanyId !== 'ALL' && r.companyId !== selectedCompanyId) return false;
        if (currencyFilter !== 'ALL' && r.currency !== currencyFilter) return false;
        if (supplierFilter !== 'ALL' && r.supplierId !== supplierFilter) return false;
        return true;
      })
      .forEach(r => {
        const dn = db.debitNotes.find(d => d.id === r.againstDnId);
        if (dn) {
          const dnINR = r.amountFC * dn.rate;
          const refundINR = r.inrAmount || r.amountFC * r.actualExchangeRate;
          const fx = Math.round(refundINR - dnINR);
          const comp = db.companies.find(c => c.id === r.companyId);
          const supp = db.suppliers.find(s => s.id === r.supplierId);

          list.push({
            id: r.id,
            company: comp?.code || '',
            supplier: supp?.supplierName || '',
            currency: r.currency,
            ciNo: dn.dnNo,
            boeNo: '-',
            ciDate: dn.dnDate,
            boeRate: r.actualExchangeRate,
            paymentRef: r.bankReferenceNo || r.id,
            paymentDate: r.date,
            paymentRate: dn.rate,
            allocatedFC: r.amountFC,
            realizedGL: fx,
            type: 'Refund Exchange Difference',
          });
        }
      });

    return list.filter(
      r => !q || r.ciNo.toLowerCase().includes(q) || r.paymentRef.toLowerCase().includes(q) || r.supplier.toLowerCase().includes(q)
    );
  }, [engineResult, db, selectedCompanyId, currencyFilter, supplierFilter, asOfDate, q]);

  // --- REPORT 7: Debit Note Register ---
  const debitNoteRegisterData = useMemo(() => {
    return db.debitNotes
      .filter(dn => {
        if ((dn.dnDate || '') > asOfDate) return false;
        if (selectedCompanyId !== 'ALL' && dn.companyId !== selectedCompanyId) return false;
        if (currencyFilter !== 'ALL' && dn.currency !== currencyFilter) return false;
        if (supplierFilter !== 'ALL' && dn.supplierId !== supplierFilter) return false;
        return true;
      })
      .map(dn => {
        const comp = db.companies.find(c => c.id === dn.companyId);
        const supp = db.suppliers.find(s => s.id === dn.supplierId);
        const pi = db.proformaInvoices.find(p => p.id === dn.linkedPiId);
        const ci = db.commercialInvoices.find(c => c.id === dn.linkedCiId);
        return {
          id: dn.id,
          company: comp?.code || '',
          supplier: supp?.supplierName || '',
          dnNo: dn.dnNo,
          dnDate: dn.dnDate,
          linkedRef: [pi?.piNo, ci?.ciNo].filter(Boolean).join(' / ') || '-',
          currency: dn.currency,
          amountFC: dn.amountFC,
          rate: dn.rate,
          inrAmount: dn.inrAmount,
          recoveredFC: dn.recoveredFC || 0,
          pendingFC: Math.max(0, dn.amountFC - (dn.recoveredFC || 0)),
          reason: dn.reason,
          recoveryMethod: dn.recoveryMethod,
          status: dn.status,
        };
      })
      .filter(r => !q || r.dnNo.toLowerCase().includes(q) || r.supplier.toLowerCase().includes(q) || r.reason.toLowerCase().includes(q));
  }, [db, selectedCompanyId, currencyFilter, supplierFilter, asOfDate, q]);

  // --- REPORT 8: BOE Customs Register ---
  const boeRegisterData = useMemo(() => {
    return db.commercialInvoices
      .filter(ci => {
        if ((ci.ciDate || '') > asOfDate) return false;
        if (selectedCompanyId !== 'ALL' && ci.companyId !== selectedCompanyId) return false;
        if (currencyFilter !== 'ALL' && ci.currency !== currencyFilter) return false;
        if (supplierFilter !== 'ALL' && ci.supplierId !== supplierFilter) return false;
        return true;
      })
      .map(ci => {
        const comp = db.companies.find(c => c.id === ci.companyId);
        const supp = db.suppliers.find(s => s.id === ci.supplierId);
        const sub = db.boeSubmissions.find(s => s.ciId === ci.id || s.boeNo === ci.boeNo);
        const tax = computeBOETaxTotals(ci);
        return {
          id: ci.id,
          company: comp?.code || '',
          supplier: supp?.supplierName || '',
          ciNo: ci.ciNo,
          ciDate: ci.ciDate,
          boeNo: ci.boeNo,
          boeDate: ci.boeDate,
          portCode: ci.portCode || '-',
          currency: ci.currency,
          ciValueFC: ci.ciValueFC,
          boeRate: ci.boeExchangeRate,
          taxInvoiceValueINR: tax.taxInvoiceValueINR,
          assessableINR: tax.assessableValueINR,
          dutyINR: tax.customsDutyINR,
          swsINR: tax.swsINR,
          igstINR: tax.igstINR,
          totalTaxINR: tax.totalTaxINR,
          taxPaidDate: ci.taxPaidDate || '',
          taxStatus: tax.status,
          challanNo: ci.challanNo || '-',
          purchaseINR: ci.purchaseINR,
          idpmsStatus: sub?.idpmsStatus || 'Pending',
          bankAckNo: sub?.bankAcknowledgementNo || '-',
        };
      })
      .filter(
        r =>
          !q ||
          r.boeNo.toLowerCase().includes(q) ||
          r.ciNo.toLowerCase().includes(q) ||
          r.supplier.toLowerCase().includes(q) ||
          r.challanNo.toLowerCase().includes(q)
      );
  }, [db, selectedCompanyId, currencyFilter, supplierFilter, asOfDate, q]);

  // --- REPORT 9: Month-End Summary / Unrealized FX ---
  const monthEndSummary = useMemo(() => {
    const parsedOverride = parseFloat(customValuationRate);
    const val = computeMonthEndValuation(
      db,
      engineResult,
      selectedMonthEnd,
      monthEndCurrency,
      selectedCompanyId,
      supplierFilter,
      !isNaN(parsedOverride) && parsedOverride > 0 ? parsedOverride : undefined
    );

    const openBillRows: Array<{
      id: string;
      company: string;
      supplier: string;
      docType: string;
      docNo: string;
      docDate: string;
      openFC: number;
      bookRate: number;
      valuationRate: number;
      bookINR: number;
      valINR: number;
      unrealizedGL: number;
    }> = [];

    for (const [, st] of engineResult.ciStates) {
      if (selectedCompanyId !== 'ALL' && st.ci.companyId !== selectedCompanyId) continue;
      if (supplierFilter !== 'ALL' && st.ci.supplierId !== supplierFilter) continue;
      if (st.ci.currency !== monthEndCurrency || st.balanceFC <= 0 || st.ci.ciDate > selectedMonthEnd) continue;

      const comp = db.companies.find(c => c.id === st.ci.companyId);
      const supp = db.suppliers.find(s => s.id === st.ci.supplierId);
      const billRate = st.ci.ciValueFC > 0 && st.purchaseINR > 0 ? st.purchaseINR / st.ci.ciValueFC : (st.ci.boeExchangeRate || 0);
      const valINR = val.valuationRate > 0 ? st.balanceFC * val.valuationRate : st.balanceINR;
      const gl = val.valuationRate > 0 ? Math.round((st.balanceINR - valINR) * 100) / 100 : 0;

      openBillRows.push({
        id: st.ci.id,
        company: comp?.code || '',
        supplier: supp?.supplierName || '',
        docType: 'CI',
        docNo: st.ci.ciNo,
        docDate: st.ci.ciDate,
        openFC: st.balanceFC,
        bookRate: billRate,
        valuationRate: val.valuationRate,
        bookINR: st.balanceINR,
        valINR,
        unrealizedGL: gl,
      });
    }

    for (const [, obSt] of engineResult.openingPayableStates) {
      if (selectedCompanyId !== 'ALL' && obSt.ob.companyId !== selectedCompanyId) continue;
      if (supplierFilter !== 'ALL' && obSt.ob.supplierId !== supplierFilter) continue;
      const refDt = obSt.ob.originalDocumentDate || obSt.ob.referenceDate;
      if (obSt.ob.currency !== monthEndCurrency || obSt.balanceFC <= 0 || refDt > selectedMonthEnd) continue;

      const comp = db.companies.find(c => c.id === obSt.ob.companyId);
      const supp = db.suppliers.find(s => s.id === obSt.ob.supplierId);
      const obRate = obSt.ob.amountFC > 0 && obSt.openingINR > 0 ? obSt.openingINR / obSt.ob.amountFC : obSt.ob.rate;
      const valINR = val.valuationRate > 0 ? obSt.balanceFC * val.valuationRate : obSt.balanceINR;
      const gl = val.valuationRate > 0 ? Math.round((obSt.balanceINR - valINR) * 100) / 100 : 0;

      openBillRows.push({
        id: obSt.ob.id,
        company: comp?.code || '',
        supplier: supp?.supplierName || '',
        docType: 'Opening Cr',
        docNo: obSt.ob.referenceNo,
        docDate: refDt,
        openFC: obSt.balanceFC,
        bookRate: obRate,
        valuationRate: val.valuationRate,
        bookINR: obSt.balanceINR,
        valINR,
        unrealizedGL: gl,
      });
    }

    return { summary: val, rows: openBillRows };
  }, [db, engineResult, selectedMonthEnd, monthEndCurrency, customValuationRate, selectedCompanyId, supplierFilter]);

  // Export current active report to Excel
  const handleExportCurrent = () => {
    switch (activeReport) {
      case 'pi_status':
        exportToExcel(piStatusData, 'PI_Status_Register');
        break;
      case 'purchase_register':
        exportToExcel(purchaseRegisterData, 'Purchase_CI_Register');
        break;
      case 'payment_register':
        exportToExcel(paymentRegisterData, 'Payment_Register');
        break;
      case 'bank_submission':
        exportToExcel(bankSubmissionData, 'Bank_Submission_Report');
        break;
      case 'party_ledger':
        exportToExcel(partyLedgerData.rows, `Party_Ledger_${ledgerSupplierId}`);
        break;
      case 'fx_register':
        exportToExcel(fxRegisterData, 'FX_Gain_Loss_Register');
        break;
      case 'debit_note_register':
        exportToExcel(debitNoteRegisterData, 'Debit_Note_Register');
        break;
      case 'boe_register':
        exportToExcel(
          boeRegisterData.map(r => ({
            Company: r.company,
            Supplier: r.supplier,
            'BOE No': r.boeNo,
            'BOE Date': formatDate(r.boeDate),
            'Invoice No': r.ciNo,
            'Invoice Date': formatDate(r.ciDate),
            Port: r.portCode,
            Currency: r.currency,
            'Invoice FC': r.ciValueFC,
            'BOE Rate': r.boeRate,
            'Tax Invoice Value': r.taxInvoiceValueINR,
            'Total BOE Ass Value': r.assessableINR,
            'Custom Duty': r.dutyINR,
            SWS: r.swsINR,
            'IGST / GST Amount': r.igstINR,
            'Total Tax Amount': r.totalTaxINR,
            'Tax Paid Date': r.taxPaidDate ? formatDate(r.taxPaidDate) : 'Pending',
            Status: r.taxStatus,
          })),
          'BOE_Customs_Register'
        );
        break;
      case 'month_end_summary':
        exportToExcel(monthEndSummary.rows, `Month_End_Valuation_${selectedMonthEnd}`);
        break;
    }
  };

  const reportTabs: Array<{ id: ReportType; label: string }> = [
    { id: 'party_ledger', label: 'Party Ledger' },
    { id: 'fx_register', label: 'FX Gain / Loss' },
    { id: 'purchase_register', label: 'Purchase (CI)' },
    { id: 'payment_register', label: 'Payments' },
    { id: 'month_end_summary', label: 'Month-End FX' },
    { id: 'boe_register', label: 'BOE Register' },
    { id: 'bank_submission', label: 'IDPMS Submission' },
    { id: 'pi_status', label: 'PI Status' },
    { id: 'debit_note_register', label: 'Debit Notes' },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Report Switcher Bar */}
      <div className="no-print bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 text-xs font-semibold">
          {reportTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveReport(tab.id)}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                activeReport === tab.id ? 'bg-indigo-600 text-white font-bold' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => window.print()}
            className="flex items-center space-x-1 text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-300 font-medium"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print / PDF</span>
          </button>

          <button
            onClick={handleExportCurrent}
            className="flex items-center space-x-1 text-xs px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-sm font-semibold"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel Export</span>
          </button>
        </div>
      </div>

      {/* Filter Row for Reports */}
      <div className="no-print flex flex-wrap items-center justify-between gap-4 bg-white p-3.5 rounded-xl border border-slate-200 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          {activeReport === 'party_ledger' ? (
            <>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-slate-700">Select Supplier:</span>
                <select
                  value={ledgerSupplierId}
                  onChange={e => setLedgerSupplierId(e.target.value)}
                  className="bg-slate-50 border border-slate-300 rounded px-2.5 py-1 text-slate-900 font-medium"
                >
                  {filteredSuppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.vendorCode} - {s.supplierName}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center space-x-2">
                <span className="font-bold text-slate-700">Currency:</span>
                <select
                  value={ledgerCurrency}
                  onChange={e => setLedgerCurrency(e.target.value)}
                  className="bg-slate-50 border border-slate-300 rounded px-2.5 py-1 text-slate-900 font-medium"
                >
                  {db.currencies.map(c => (
                    <option key={c.code} value={c.code}>{c.code}</option>
                  ))}
                </select>
              </div>
            </>
          ) : activeReport === 'month_end_summary' ? (
            <>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-slate-700">Valuation Date:</span>
                <input
                  type="date"
                  value={selectedMonthEnd}
                  onChange={e => setSelectedMonthEnd(e.target.value)}
                  className="bg-slate-50 border border-slate-300 rounded px-2.5 py-1 text-slate-900 font-medium"
                />
              </div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-slate-700">Currency:</span>
                <select
                  value={monthEndCurrency}
                  onChange={e => setMonthEndCurrency(e.target.value)}
                  className="bg-slate-50 border border-slate-300 rounded px-2.5 py-1 text-slate-900 font-medium"
                >
                  {db.currencies.map(c => (
                    <option key={c.code} value={c.code}>{c.code}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-slate-700">What-If / Valuation Rate (INR):</span>
                <input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 95.50"
                  value={customValuationRate}
                  onChange={e => setCustomValuationRate(e.target.value)}
                  className="bg-slate-50 border border-slate-300 rounded px-2.5 py-1 text-indigo-800 font-bold w-28"
                />
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-slate-600">Currency:</span>
                <select
                  value={currencyFilter}
                  onChange={e => setCurrencyFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-300 rounded px-2 py-1 font-medium text-slate-800"
                >
                  <option value="ALL">All Currencies</option>
                  {db.currencies.map(c => (
                    <option key={c.code} value={c.code}>{c.code}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center space-x-2">
                <span className="font-semibold text-slate-600">Supplier:</span>
                <select
                  value={supplierFilter}
                  onChange={e => setSupplierFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-300 rounded px-2 py-1 font-medium text-slate-800 max-w-[220px] truncate"
                >
                  <option value="ALL">All Suppliers</option>
                  {filteredSuppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.vendorCode} - {s.supplierName}</option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>

        {/* Search box */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
          <input
            type="text"
            placeholder="Search invoice, ref, supplier..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="text-xs pl-8 pr-3 py-1 rounded-lg border border-slate-300 w-56 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Render Selected Report */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden printable-area">
        {/* REPORT 1: PI Status */}
        {activeReport === 'pi_status' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-semibold uppercase tracking-wider border-b">
                <tr>
                  <th className="px-3 py-2.5">Company</th>
                  <th className="px-3 py-2.5">Supplier</th>
                  <th className="px-3 py-2.5">PI No & Date</th>
                  <th className="px-3 py-2.5 text-right">PI Value FC</th>
                  <th className="px-3 py-2.5 text-right">Adv Req FC</th>
                  <th className="px-3 py-2.5 text-right text-emerald-800">Paid FC</th>
                  <th className="px-3 py-2.5">Remittance Dates</th>
                  <th className="px-3 py-2.5">Booked CIs</th>
                  <th className="px-3 py-2.5 text-right text-indigo-800">Shipped FC</th>
                  <th className="px-3 py-2.5 text-right">Short Ship FC</th>
                  <th className="px-3 py-2.5 text-right font-bold">Balance</th>
                  <th className="px-3 py-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {piStatusData.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-8 text-center text-slate-400">
                      No Proforma Invoices recorded yet.
                    </td>
                  </tr>
                ) : (
                  piStatusData.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50/80">
                      <td className="px-3 py-2.5 font-bold text-slate-900">{r.company}</td>
                      <td className="px-3 py-2.5 font-semibold text-slate-900">{r.supplier}</td>
                      <td className="px-3 py-2.5">
                        <div className="font-bold text-indigo-700">{r.piNo}</div>
                        <div className="text-[10px] text-slate-400">{formatDate(r.piDate)}</div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-extrabold text-slate-900">
                        {formatFC(r.piValueFC)} {r.currency}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-600">{formatFC(r.advanceReqFC)}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-emerald-700">{formatFC(r.paidFC)}</td>
                      <td className="px-3 py-2.5 text-[10px] text-slate-500">{r.firstPayDate} to {r.lastPayDate}</td>
                      <td className="px-3 py-2.5 text-slate-600 font-semibold">{r.ciNos}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-indigo-700">{formatFC(r.shippedFC)}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-amber-700">{formatFC(r.shortShipmentFC)}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-slate-900">
                        {formatFC(Math.abs(r.balanceFC))} {r.balanceType}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-800">
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* REPORT 2: Purchase CI Register */}
        {activeReport === 'purchase_register' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-semibold uppercase tracking-wider border-b">
                <tr>
                  <th className="px-3 py-2.5">Company</th>
                  <th className="px-3 py-2.5">Supplier</th>
                  <th className="px-3 py-2.5">CI No & Date</th>
                  <th className="px-3 py-2.5">Linked PI</th>
                  <th className="px-3 py-2.5">BOE No & Date</th>
                  <th className="px-3 py-2.5 text-right">BOE Rate</th>
                  <th className="px-3 py-2.5 text-right">CI Value FC</th>
                  <th className="px-3 py-2.5 text-right">Purchase INR</th>
                  <th className="px-3 py-2.5 text-right text-emerald-800">Allocated FC</th>
                  <th className="px-3 py-2.5 text-right text-amber-800">Balance FC</th>
                  <th className="px-3 py-2.5 text-right">Realized G/L</th>
                  <th className="px-3 py-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {purchaseRegisterData.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50/80">
                    <td className="px-3 py-2.5 font-bold text-slate-900">{r.company}</td>
                    <td className="px-3 py-2.5 font-semibold">{r.supplier}</td>
                    <td className="px-3 py-2.5 font-bold text-indigo-700">{r.ciNo} ({formatDate(r.ciDate)})</td>
                    <td className="px-3 py-2.5">{r.linkedPi}</td>
                    <td className="px-3 py-2.5">{r.boeNo} ({formatDate(r.boeDate)})</td>
                    <td className="px-3 py-2.5 text-right font-mono">{formatRate(r.boeRate)}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-extrabold">{formatFC(r.ciValueFC)} {r.currency}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold">{formatINR(r.purchaseINR)}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-700">{formatFC(r.allocatedFC)}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-amber-700">{formatFC(r.balanceFC)}</td>
                    <td className={`px-3 py-2.5 text-right font-mono font-extrabold ${r.realizedGL >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {formatINR(r.realizedGL, 0, true)}
                    </td>
                    <td className="px-3 py-2.5 text-center">{r.status}</td>
                  </tr>
                ))}
              </tbody>
              {purchaseRegisterData.length > 0 && (
                <tfoot className="bg-slate-100 font-extrabold text-slate-900 border-t-2">
                  <tr>
                    <td colSpan={6} className="px-3 py-2 text-right uppercase">Total ({purchaseRegisterData.length} Bills):</td>
                    <td className="px-3 py-2 text-right font-mono">{formatFC(purchaseRegisterData.reduce((s, r) => s + r.ciValueFC, 0))}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatINR(purchaseRegisterData.reduce((s, r) => s + r.purchaseINR, 0))}</td>
                    <td className="px-3 py-2 text-right font-mono text-emerald-700">{formatFC(purchaseRegisterData.reduce((s, r) => s + r.allocatedFC, 0))}</td>
                    <td className="px-3 py-2 text-right font-mono text-amber-700">{formatFC(purchaseRegisterData.reduce((s, r) => s + r.balanceFC, 0))}</td>
                    <td className="px-3 py-2 text-right font-mono text-emerald-700">{formatINR(purchaseRegisterData.reduce((s, r) => s + r.realizedGL, 0), 0, true)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* REPORT 3: Payment Register */}
        {activeReport === 'payment_register' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-semibold uppercase tracking-wider border-b">
                <tr>
                  <th className="px-3 py-2.5">Company</th>
                  <th className="px-3 py-2.5">Bank</th>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Supplier</th>
                  <th className="px-3 py-2.5 text-right">Amount FC</th>
                  <th className="px-3 py-2.5 text-right">Actual Rate</th>
                  <th className="px-3 py-2.5 text-right">Amount INR</th>
                  <th className="px-3 py-2.5 text-right text-emerald-800">Allocated FC</th>
                  <th className="px-3 py-2.5 text-right text-indigo-800">Unapplied FC</th>
                  <th className="px-3 py-2.5">BOE / Ref Settled</th>
                  <th className="px-3 py-2.5">Bank Ref / UTR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {paymentRegisterData.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50/80">
                    <td className="px-3 py-2.5 font-bold text-slate-900">{r.company}</td>
                    <td className="px-3 py-2.5 font-medium">{r.bank}</td>
                    <td className="px-3 py-2.5">{formatDate(r.paymentDate)}</td>
                    <td className="px-3 py-2.5 font-semibold">{r.supplier}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-extrabold text-slate-900">{formatFC(r.amountFC)} {r.currency}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold">{formatRate(r.actualRate)}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold">{formatINR(r.inrAmount)}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-700">{formatFC(r.allocatedFC)}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-indigo-700">{formatFC(r.unappliedFC)}</td>
                    <td className="px-3 py-2.5 font-semibold text-slate-800 max-w-[180px] truncate">{r.boeNos}</td>
                    <td className="px-3 py-2.5 font-medium">{r.bankRefNo}</td>
                  </tr>
                ))}
              </tbody>
              {paymentRegisterData.length > 0 && (
                <tfoot className="bg-slate-100 font-extrabold text-slate-900 border-t-2">
                  <tr>
                    <td colSpan={4} className="px-3 py-2 text-right uppercase">Total ({paymentRegisterData.length} Remittances):</td>
                    <td className="px-3 py-2 text-right font-mono">{formatFC(paymentRegisterData.reduce((s, r) => s + r.amountFC, 0))}</td>
                    <td></td>
                    <td className="px-3 py-2 text-right font-mono">{formatINR(paymentRegisterData.reduce((s, r) => s + r.inrAmount, 0))}</td>
                    <td className="px-3 py-2 text-right font-mono text-emerald-700">{formatFC(paymentRegisterData.reduce((s, r) => s + r.allocatedFC, 0))}</td>
                    <td className="px-3 py-2 text-right font-mono text-indigo-700">{formatFC(paymentRegisterData.reduce((s, r) => s + r.unappliedFC, 0))}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* REPORT 4: Bank Submission Report */}
        {activeReport === 'bank_submission' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-semibold uppercase tracking-wider border-b">
                <tr>
                  <th className="px-3 py-2.5">Bank</th>
                  <th className="px-3 py-2.5">Payment Date</th>
                  <th className="px-3 py-2.5">Bank Ref No</th>
                  <th className="px-3 py-2.5">Supplier</th>
                  <th className="px-3 py-2.5">CI / Ref No</th>
                  <th className="px-3 py-2.5">BOE No & Date</th>
                  <th className="px-3 py-2.5 text-right font-bold text-emerald-800">FC Settled</th>
                  <th className="px-3 py-2.5 text-center">IDPMS Status</th>
                  <th className="px-3 py-2.5">Bank Ack</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {bankSubmissionData.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50/80">
                    <td className="px-3 py-2.5 font-bold text-slate-900">{r.bank}</td>
                    <td className="px-3 py-2.5">{formatDate(r.paymentDate)}</td>
                    <td className="px-3 py-2.5 font-semibold">{r.bankRefNo}</td>
                    <td className="px-3 py-2.5 font-semibold">{r.supplier}</td>
                    <td className="px-3 py-2.5">{r.ciNo} ({formatDate(r.ciDate)})</td>
                    <td className="px-3 py-2.5 font-bold text-indigo-700">{r.boeNo} ({formatDate(r.boeDate)})</td>
                    <td className="px-3 py-2.5 text-right font-mono font-extrabold text-emerald-700">{formatFC(r.settledFC)} {r.currency}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        r.status === 'Settled' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">{r.bankAckNo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* REPORT 5: Party Ledger */}
        {activeReport === 'party_ledger' && (
          <div className="overflow-x-auto">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h4 className="font-bold text-sm text-slate-900">
                  Ledger Statement: {db.suppliers.find(s => s.id === ledgerSupplierId)?.supplierName}
                </h4>
                <p className="text-xs text-slate-500">Currency: {ledgerCurrency} • As of {formatDate(asOfDate)} • Running Book Balance (FC &amp; INR)</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-500 block">Closing Balance:</span>
                <span className={`text-base font-extrabold font-mono ${partyLedgerData.finalFC >= 0 ? 'text-amber-800' : 'text-emerald-800'}`}>
                  {formatFC(Math.abs(partyLedgerData.finalFC))} {ledgerCurrency} ({partyLedgerData.finalFC > 0 ? 'Cr Payable' : partyLedgerData.finalFC < 0 ? 'Dr Advance' : 'Settled'})
                </span>
                <span className="text-xs font-bold text-slate-700 font-mono block">
                  {formatINR(Math.abs(partyLedgerData.finalINR), 0, true)} ({partyLedgerData.finalINR >= 0 ? 'Cr' : 'Dr'})
                </span>
              </div>
            </div>

            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-semibold uppercase tracking-wider border-b">
                <tr>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Doc Type</th>
                  <th className="px-3 py-2.5">Ref No</th>
                  <th className="px-3 py-2.5">Particulars / Details</th>
                  <th className="px-3 py-2.5 text-right text-emerald-800 bg-emerald-50/40">Debit FC (Paid)</th>
                  <th className="px-3 py-2.5 text-right text-emerald-800 bg-emerald-50/40">Debit INR</th>
                  <th className="px-3 py-2.5 text-right text-amber-800 bg-amber-50/40">Credit FC (Purchase)</th>
                  <th className="px-3 py-2.5 text-right text-amber-800 bg-amber-50/40">Credit INR</th>
                  <th className="px-3 py-2.5 text-right font-bold">Running FC</th>
                  <th className="px-3 py-2.5 text-right font-bold text-slate-800">Running INR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {partyLedgerData.rows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                      No ledger entries found for this supplier &amp; currency.
                    </td>
                  </tr>
                ) : (
                  partyLedgerData.rows.map((r, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/80">
                      <td className="px-3 py-2.5">{formatDate(r.date)}</td>
                      <td className="px-3 py-2.5 font-bold text-slate-900">{r.docType}</td>
                      <td className="px-3 py-2.5 font-semibold text-indigo-700">{r.docNo}</td>
                      <td className="px-3 py-2.5 text-slate-500">{r.details}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-700 bg-emerald-50/20">
                        {r.drFC > 0 ? formatFC(r.drFC) : '-'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-emerald-800 bg-emerald-50/20">
                        {r.drINR > 0 ? formatINR(r.drINR) : '-'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-amber-700 bg-amber-50/20">
                        {r.crFC > 0 ? formatFC(r.crFC) : '-'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-amber-800 bg-amber-50/20">
                        {r.crINR > 0 ? formatINR(r.crINR) : '-'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-extrabold text-slate-900">
                        {formatFC(Math.abs(r.runningFC))} {r.runningFC >= 0 ? 'Cr' : 'Dr'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-800">
                        {formatINR(Math.abs(r.runningINR))} {r.runningINR >= 0 ? 'Cr' : 'Dr'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {partyLedgerData.rows.length > 0 && (
                <tfoot className="bg-slate-100 font-extrabold text-slate-900 border-t-2">
                  <tr>
                    <td colSpan={4} className="px-3 py-2 text-right uppercase">Ledger Totals &amp; Closing:</td>
                    <td className="px-3 py-2 text-right font-mono text-emerald-800">{formatFC(partyLedgerData.totalDrFC)}</td>
                    <td className="px-3 py-2 text-right font-mono text-emerald-800">{formatINR(partyLedgerData.totalDrINR)}</td>
                    <td className="px-3 py-2 text-right font-mono text-amber-800">{formatFC(partyLedgerData.totalCrFC)}</td>
                    <td className="px-3 py-2 text-right font-mono text-amber-800">{formatINR(partyLedgerData.totalCrINR)}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {formatFC(Math.abs(partyLedgerData.finalFC))} {partyLedgerData.finalFC >= 0 ? 'Cr' : 'Dr'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {formatINR(Math.abs(partyLedgerData.finalINR))} {partyLedgerData.finalINR >= 0 ? 'Cr' : 'Dr'}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* REPORT 6: FX Gain / Loss */}
        {activeReport === 'fx_register' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-semibold uppercase tracking-wider border-b">
                <tr>
                  <th className="px-3 py-2.5">Company</th>
                  <th className="px-3 py-2.5">Supplier</th>
                  <th className="px-3 py-2.5">Type</th>
                  <th className="px-3 py-2.5">Bill / Opening Ref</th>
                  <th className="px-3 py-2.5 text-right">Bill Rate</th>
                  <th className="px-3 py-2.5">Payment Ref &amp; Date</th>
                  <th className="px-3 py-2.5 text-right">Pay Bank Rate</th>
                  <th className="px-3 py-2.5 text-right">Allocated FC</th>
                  <th className="px-3 py-2.5 text-right font-extrabold text-indigo-900">Realized FX Gain / (Loss) INR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {fxRegisterData.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50/80">
                    <td className="px-3 py-2.5 font-bold text-slate-900">{r.company}</td>
                    <td className="px-3 py-2.5 font-semibold">{r.supplier}</td>
                    <td className="px-3 py-2.5 text-slate-500 text-[11px]">{r.type}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-bold text-slate-800">{r.ciNo}</div>
                      <div className="text-[10px] text-slate-400">{formatDate(r.ciDate)} • {r.boeNo}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold">{formatRate(r.boeRate)}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-indigo-700">{r.paymentRef}</div>
                      <div className="text-[10px] text-slate-400">{formatDate(r.paymentDate)}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold">{formatRate(r.paymentRate)}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-extrabold">{formatFC(r.allocatedFC)} {r.currency}</td>
                    <td className={`px-3 py-2.5 text-right font-mono font-extrabold ${r.realizedGL >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {formatINR(r.realizedGL, 0, true)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-100 font-extrabold text-slate-900 border-t-2">
                <tr>
                  <td colSpan={7} className="px-3 py-2 text-right uppercase">
                    Total Allocated &amp; Realized FX Gain / (Loss):
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {formatFC(fxRegisterData.reduce((s, r) => s + r.allocatedFC, 0))}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono text-sm ${
                    fxRegisterData.reduce((s, r) => s + r.realizedGL, 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'
                  }`}>
                    {formatINR(fxRegisterData.reduce((s, r) => s + r.realizedGL, 0), 0, true)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* REPORT 7: Debit Note Register */}
        {activeReport === 'debit_note_register' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-semibold uppercase tracking-wider border-b">
                <tr>
                  <th className="px-3 py-2.5">Company</th>
                  <th className="px-3 py-2.5">Supplier</th>
                  <th className="px-3 py-2.5">DN No &amp; Date</th>
                  <th className="px-3 py-2.5">Against PI / CI</th>
                  <th className="px-3 py-2.5 text-right">Amount FC</th>
                  <th className="px-3 py-2.5 text-right">Rate</th>
                  <th className="px-3 py-2.5 text-right">Amount INR</th>
                  <th className="px-3 py-2.5 text-right">Recovered FC</th>
                  <th className="px-3 py-2.5 text-right">Pending FC</th>
                  <th className="px-3 py-2.5">Reason / Method</th>
                  <th className="px-3 py-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {debitNoteRegisterData.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-slate-400">
                      No Debit Notes recorded yet.
                    </td>
                  </tr>
                ) : (
                  debitNoteRegisterData.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50/80">
                      <td className="px-3 py-2.5 font-bold text-slate-900">{r.company}</td>
                      <td className="px-3 py-2.5 font-semibold">{r.supplier}</td>
                      <td className="px-3 py-2.5 font-bold text-indigo-700">{r.dnNo} ({formatDate(r.dnDate)})</td>
                      <td className="px-3 py-2.5">{r.linkedRef}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold">{formatFC(r.amountFC)} {r.currency}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{formatRate(r.rate)}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{formatINR(r.inrAmount)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-emerald-700">{formatFC(r.recoveredFC)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-amber-700">{formatFC(r.pendingFC)}</td>
                      <td className="px-3 py-2.5">{r.reason} • {r.recoveryMethod}</td>
                      <td className="px-3 py-2.5 text-center">{r.status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* REPORT 8: BOE Customs Register */}
        {activeReport === 'boe_register' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-semibold uppercase tracking-wider border-b">
                <tr>
                  <th className="px-3 py-2.5">Company / Party</th>
                  <th className="px-3 py-2.5">BOE No</th>
                  <th className="px-3 py-2.5">BOE Date</th>
                  <th className="px-3 py-2.5">Invoice No</th>
                  <th className="px-3 py-2.5">Invoice Date</th>
                  <th className="px-3 py-2.5 text-right">Tax Invoice Value</th>
                  <th className="px-3 py-2.5 text-right">Total BOE Ass Value</th>
                  <th className="px-3 py-2.5 text-right">Custom Duty</th>
                  <th className="px-3 py-2.5 text-right">SWS</th>
                  <th className="px-3 py-2.5 text-right">IGST / GST</th>
                  <th className="px-3 py-2.5 text-right">Total Tax Amount</th>
                  <th className="px-3 py-2.5">Tax Paid Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {boeRegisterData.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50/80">
                    <td className="px-3 py-2.5">
                      <span className="font-bold text-slate-900">{r.company}</span>
                      <span className="text-slate-400 mx-1">•</span>
                      <span className="font-semibold">{r.supplier}</span>
                      <div className="text-[10px] text-slate-400">Port: {r.portCode}</div>
                    </td>
                    <td className="px-3 py-2.5 font-mono font-bold text-indigo-700">{r.boeNo}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{formatDate(r.boeDate)}</td>
                    <td className="px-3 py-2.5 font-semibold text-slate-900">{r.ciNo}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{formatDate(r.ciDate)}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold">{formatINR(r.taxInvoiceValueINR)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{formatINR(r.assessableINR)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{formatINR(r.dutyINR)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{formatINR(r.swsINR)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-emerald-700">{formatINR(r.igstINR)}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-extrabold text-slate-900">
                      {formatINR(r.totalTaxINR)}
                    </td>
                    <td className="px-3 py-2.5">
                      {r.taxPaidDate ? (
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-semibold">
                          {formatDate(r.taxPaidDate)}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-semibold">
                          {r.taxStatus}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {boeRegisterData.length > 0 && (
                <tfoot className="bg-slate-100 font-extrabold text-slate-900 border-t-2">
                  <tr>
                    <td colSpan={5} className="px-3 py-2 text-right uppercase">
                      TOTAL ({boeRegisterData.length} BOEs):
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {formatINR(boeRegisterData.reduce((s, r) => s + r.taxInvoiceValueINR, 0))}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {formatINR(boeRegisterData.reduce((s, r) => s + r.assessableINR, 0))}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {formatINR(boeRegisterData.reduce((s, r) => s + r.dutyINR, 0))}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {formatINR(boeRegisterData.reduce((s, r) => s + r.swsINR, 0))}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-emerald-700">
                      {formatINR(boeRegisterData.reduce((s, r) => s + r.igstINR, 0))}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {formatINR(boeRegisterData.reduce((s, r) => s + r.totalTaxINR, 0))}
                    </td>
                    <td className="px-3 py-2"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* REPORT 9: Month-End Valuation / Unrealized FX Summary */}
        {activeReport === 'month_end_summary' && (
          <div>
            <div className="p-4 bg-slate-50 border-b border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-slate-500 block">Open Payables ({monthEndCurrency})</span>
                <span className="text-base font-extrabold font-mono text-slate-900">
                  {formatFC(monthEndSummary.summary.openPayablesFC)} {monthEndCurrency}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Applied Valuation Rate</span>
                <span className="text-base font-extrabold font-mono text-indigo-700">
                  {monthEndSummary.summary.valuationRate > 0 ? formatRate(monthEndSummary.summary.valuationRate) : 'Not Set (Enter Override or Add in Masters)'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Advances Revaluation Policy</span>
                <span className="font-bold text-slate-800">
                  {db.settings.revalueAdvancesAtMonthEnd ? 'Enabled' : 'Disabled (AS 11 Default)'}
                </span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 block">Total Unrealized FX Gain / (Loss)</span>
                <span className={`text-base font-extrabold font-mono ${
                  monthEndSummary.summary.totalUnrealizedFXINR >= 0 ? 'text-emerald-700' : 'text-rose-700'
                }`}>
                  {monthEndSummary.summary.valuationRate > 0 ? formatINR(monthEndSummary.summary.totalUnrealizedFXINR, 0, true) : '-'}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-semibold uppercase tracking-wider border-b">
                  <tr>
                    <th className="px-3 py-2.5">Company</th>
                    <th className="px-3 py-2.5">Supplier</th>
                    <th className="px-3 py-2.5">Type &amp; Ref No</th>
                    <th className="px-3 py-2.5">Date</th>
                    <th className="px-3 py-2.5 text-right">Open FC</th>
                    <th className="px-3 py-2.5 text-right">Book Rate</th>
                    <th className="px-3 py-2.5 text-right">Book INR</th>
                    <th className="px-3 py-2.5 text-right">Val Rate</th>
                    <th className="px-3 py-2.5 text-right">Val INR</th>
                    <th className="px-3 py-2.5 text-right font-extrabold">Unrealized FX G/(L)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {monthEndSummary.rows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                        No open payables for this date &amp; currency.
                      </td>
                    </tr>
                  ) : (
                    monthEndSummary.rows.map(r => (
                      <tr key={r.id} className="hover:bg-slate-50/80">
                        <td className="px-3 py-2.5 font-bold text-slate-900">{r.company}</td>
                        <td className="px-3 py-2.5 font-semibold">{r.supplier}</td>
                        <td className="px-3 py-2.5 font-bold text-indigo-700">{r.docType}: {r.docNo}</td>
                        <td className="px-3 py-2.5">{formatDate(r.docDate)}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold">{formatFC(r.openFC)}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{formatRate(r.bookRate)}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{formatINR(r.bookINR)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-indigo-700">
                          {r.valuationRate > 0 ? formatRate(r.valuationRate) : '-'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono">{formatINR(r.valINR)}</td>
                        <td className={`px-3 py-2.5 text-right font-mono font-extrabold ${
                          r.unrealizedGL >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}>
                          {r.valuationRate > 0 ? formatINR(r.unrealizedGL, 0, true) : '-'}
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
    </div>
  );
};
