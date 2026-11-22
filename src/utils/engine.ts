import {
  AppDatabase,
  CommercialInvoice,
  Payment,
  ProformaInvoice,
  OpeningBalance,
  AllocationRecord,
  CurrencyCode,
  IDPMSAdvanceAlert,
  ContainerDetentionRisk,
} from '../types';
import { round2, round4 } from './formatters';

export interface UnappliedPaymentChunk {
  paymentId: string;
  sourceType: 'PAYMENT' | 'OPENING_BALANCE' | 'ADJUSTMENT';
  companyId: string;
  supplierId: string;
  currency: CurrencyCode;
  date: string;
  bankAccountId?: string;
  bankRef?: string;
  utrRef?: string;
  totalFC: number;
  remainingFC: number;
  rate: number; // display rate rounded to 4 decimals
  exactRate: number; // unrounded exact rate for zero-drift INR arithmetic
  inrAmount: number;
  piId?: string;
  ciId?: string;
}

export interface ComputedCIState {
  ci: CommercialInvoice;
  allocatedFC: number;
  balanceFC: number; // Cr payable
  purchaseINR: number;
  allocatedINR: number;
  balanceINR: number;
  realizedGainLossINR: number;
  dueDate: string;
  isOverdue: boolean;
  allocations: AllocationRecord[];
  status: 'Fully Paid' | 'Partially Paid' | 'Unpaid' | 'Overdue';
}

export interface ComputedOpeningPayableState {
  ob: OpeningBalance;
  allocatedFC: number;
  balanceFC: number; // open Cr payable FC
  openingINR: number;
  allocatedINR: number;
  balanceINR: number;
  realizedGainLossINR: number;
  isOverdue: boolean;
  allocations: AllocationRecord[];
  status: 'Fully Paid' | 'Partially Paid' | 'Unpaid';
}

export interface ComputedPIState {
  pi: ProformaInvoice;
  advanceRequiredFC: number;
  totalPaidFC: number;
  shippedFC: number;
  remainingToShipFC: number;
  unappliedAdvanceFC: number;
  suggestedDebitNoteFC: number;
  cis: CommercialInvoice[];
  payments: Payment[];
  status:
    | 'Advance not paid'
    | 'Advance part paid'
    | 'Advance paid - shipment pending'
    | 'Part shipped'
    | 'Payment due'
    | 'Overdue'
    | 'Excess paid - DN suggested'
    | 'Settled';
  complianceFlags: string[];
}

export interface EngineResult {
  allocations: AllocationRecord[];
  ciStates: Map<string, ComputedCIState>;
  openingPayableStates: Map<string, ComputedOpeningPayableState>;
  piStates: Map<string, ComputedPIState>;
  unappliedPayments: UnappliedPaymentChunk[];
  suggestedDebitNotes: Array<{
    companyId: string;
    supplierId: string;
    currency: CurrencyCode;
    piId: string;
    ciId?: string;
    excessFC: number;
    recommendedRate: number;
    recommendedINR: number;
    paymentIds: string[];
  }>;
  totalRealizedGainLossINR: number;
  totalRefundFXINR: number;
  idpmsAdvanceAlerts: IDPMSAdvanceAlert[];
  containerDetentionRisks: ContainerDetentionRisk[];
}

/**
 * Helper to calculate days difference between a date and asOfDate
 */
export function getDaysBetween(fromDateStr: string, toDateStr: string): number {
  if (!fromDateStr || !toDateStr) return 0;
  const from = new Date(fromDateStr);
  const to = new Date(toDateStr);
  const diffTime = to.getTime() - from.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Add days to an ISO date string (YYYY-MM-DD)
 */
export function addDaysToDate(dateStr: string, days: number): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

/**
 * The Core Deterministic Allocation Engine
 */
export function computeAllocationsAndState(
  db: AppDatabase,
  asOfDate: string = new Date().toISOString().split('T')[0]
): EngineResult {
  const allocations: AllocationRecord[] = [];
  const ciStates = new Map<string, ComputedCIState>();
  const openingPayableStates = new Map<string, ComputedOpeningPayableState>();
  const piStates = new Map<string, ComputedPIState>();
  const suggestedDebitNotes: EngineResult['suggestedDebitNotes'] = [];

  // Group everything by Company + Supplier + Currency (respecting asOfDate)
  const partyKeys = new Set<string>();

  db.proformaInvoices.forEach(pi => {
    if ((pi.piDate || '') <= asOfDate) {
      partyKeys.add(`${pi.companyId}___${pi.supplierId}___${pi.currency}`);
    }
  });
  db.commercialInvoices.forEach(ci => {
    if ((ci.ciDate || '') <= asOfDate) {
      partyKeys.add(`${ci.companyId}___${ci.supplierId}___${ci.currency}`);
    }
  });
  db.payments.forEach(p => {
    if (!(p.paymentMode === 'LC' && p.lcStatus !== 'Paid') && (p.paymentDate || '') <= asOfDate) {
      partyKeys.add(`${p.companyId}___${p.supplierId}___${p.currency}`);
    }
  });
  db.openingBalances.forEach(ob => {
    if ((ob.referenceDate || '') <= asOfDate) {
      partyKeys.add(`${ob.companyId}___${ob.supplierId}___${ob.currency}`);
    }
  });
  db.debitNotes.forEach(dn => {
    if ((dn.dnDate || '') <= asOfDate) {
      partyKeys.add(`${dn.companyId}___${dn.supplierId}___${dn.currency}`);
    }
  });
  db.adjustments.forEach(adj => {
    if ((adj.date || '') <= asOfDate) {
      partyKeys.add(`${adj.companyId}___${adj.supplierId}___${adj.currency}`);
    }
  });

  const allUnappliedChunks: UnappliedPaymentChunk[] = [];
  let grandTotalRealizedGainLoss = 0;

  for (const partyKey of partyKeys) {
    const [companyId, supplierId, currency] = partyKey.split('___');

    // 1. Gather all transactions for this party up to asOfDate
    const partyPIs = db.proformaInvoices.filter(
      p => p.companyId === companyId && p.supplierId === supplierId && p.currency === currency && (p.piDate || '') <= asOfDate
    );
    const partyCIs = db.commercialInvoices
      .filter(c => c.companyId === companyId && c.supplierId === supplierId && c.currency === currency && (c.ciDate || '') <= asOfDate)
      .sort((a, b) => (a.ciDate || '').localeCompare(b.ciDate || ''));

    const partyPayments = db.payments
      .filter(p => p.companyId === companyId && p.supplierId === supplierId && p.currency === currency && (p.paymentDate || '') <= asOfDate)
      .filter(p => !(p.paymentMode === 'LC' && p.lcStatus !== 'Paid'))
      .sort((a, b) => (a.paymentDate || '').localeCompare(b.paymentDate || ''));

    const partyOBs = db.openingBalances
      .filter(ob => ob.companyId === companyId && ob.supplierId === supplierId && ob.currency === currency && (ob.referenceDate || '') <= asOfDate)
      .sort((a, b) => (a.originalDocumentDate || a.referenceDate || '').localeCompare(b.originalDocumentDate || b.referenceDate || ''));

    const partyDNs = db.debitNotes.filter(
      dn => dn.companyId === companyId && dn.supplierId === supplierId && dn.currency === currency && (dn.dnDate || '') <= asOfDate
    );

    const partyAdjustments = db.adjustments
      .filter(a => a.companyId === companyId && a.supplierId === supplierId && a.currency === currency && (a.date || '') <= asOfDate)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    // Helper for exact bill rate
    const getCiExactRate = (ci: CommercialInvoice) =>
      ci.ciValueFC > 0 && ci.purchaseINR > 0 ? ci.purchaseINR / ci.ciValueFC : (ci.boeExchangeRate || 0);

    const getObExactRate = (ob: OpeningBalance) =>
      ob.amountFC > 0 && ob.amountINR > 0 ? ob.amountINR / ob.amountFC : (ob.rate || 0);

    // 2. Prepare unapplied payment chunks pool
    const paymentChunks: UnappliedPaymentChunk[] = [];

    // Opening balances Dr (advances) take part first as oldest items
    for (const ob of partyOBs) {
      if (ob.balanceType === 'Dr') {
        const exactRate = ob.amountFC > 0 && ob.amountINR > 0 ? ob.amountINR / ob.amountFC : (ob.rate || 0);
        const linkedPi = ob.referenceType === 'PI' ? partyPIs.find(p => p.id === ob.referenceNo || p.piNo === ob.referenceNo) : undefined;
        const linkedCi = ob.referenceType === 'CI' ? partyCIs.find(c => c.id === ob.referenceNo || c.ciNo === ob.referenceNo) : undefined;
        paymentChunks.push({
          paymentId: `OB-${ob.id}`,
          sourceType: 'OPENING_BALANCE',
          companyId,
          supplierId,
          currency: currency as CurrencyCode,
          date: ob.originalDocumentDate || ob.referenceDate,
          bankRef: ob.referenceNo,
          totalFC: ob.amountFC,
          remainingFC: ob.amountFC,
          rate: round4(exactRate),
          exactRate,
          inrAmount: ob.amountINR,
          piId: ob.referenceType === 'PI' ? (linkedPi?.id || ob.referenceNo) : undefined,
          ciId: ob.referenceType === 'CI' ? (linkedCi?.id || ob.referenceNo) : undefined,
        });
      }
    }

    // Normal payments
    for (const p of partyPayments) {
      const inr = p.inrOverride ?? (p.inrAmount || round2(p.amountFC * p.actualExchangeRate));
      const exactRate = p.amountFC > 0 ? inr / p.amountFC : (p.actualExchangeRate || 0);

      paymentChunks.push({
        paymentId: p.id,
        sourceType: 'PAYMENT',
        companyId,
        supplierId,
        currency: currency as CurrencyCode,
        date: p.paymentDate,
        bankAccountId: p.bankAccountId,
        bankRef: p.bankReferenceNo,
        utrRef: p.utrSwiftRef,
        totalFC: p.amountFC,
        remainingFC: p.amountFC,
        rate: round4(exactRate),
        exactRate,
        inrAmount: inr,
        piId: p.paymentAgainst === 'PI' && p.linkedPiId ? p.linkedPiId : undefined,
        ciId: p.paymentAgainst === 'CI' && p.linkedCiId ? p.linkedCiId : undefined,
      });
    }

    // 2b. Apply Adjustment / Transfer entries (moves unapplied chunk between PIs/CIs at original FIFO rate)
    for (const adj of partyAdjustments) {
      let toMove = adj.amountFC;
      const sourceChunks = paymentChunks.filter(c => {
        if (c.remainingFC <= 0) return false;
        if (adj.fromType === 'PI') {
          const fromPi = partyPIs.find(p => p.id === adj.fromId || p.piNo === adj.fromId);
          return c.piId === adj.fromId || (fromPi !== undefined && c.piId === fromPi.id);
        }
        if (adj.fromType === 'CI') {
          const fromCi = partyCIs.find(ci => ci.id === adj.fromId || ci.ciNo === adj.fromId);
          return c.ciId === adj.fromId || (fromCi !== undefined && c.ciId === fromCi.id);
        }
        return c.piId === adj.fromId || c.ciId === adj.fromId;
      });

      const targetPi = adj.toType === 'PI' ? partyPIs.find(p => p.id === adj.toId || p.piNo === adj.toId) : undefined;
      const targetCi = adj.toType === 'CI' ? partyCIs.find(ci => ci.id === adj.toId || ci.ciNo === adj.toId) : undefined;
      const resolvedToPiId = adj.toType === 'PI' ? (targetPi?.id || adj.toId) : undefined;
      const resolvedToCiId = adj.toType === 'CI' ? (targetCi?.id || adj.toId) : undefined;

      for (const src of sourceChunks) {
        if (toMove <= 0) break;
        const moveFC = round2(Math.min(toMove, src.remainingFC));
        if (moveFC > 0) {
          src.remainingFC = round2(src.remainingFC - moveFC);
          toMove = round2(toMove - moveFC);
          paymentChunks.push({
            paymentId: src.paymentId,
            sourceType: 'ADJUSTMENT',
            companyId,
            supplierId,
            currency: currency as CurrencyCode,
            date: src.date, // Preserve original payment date and rate for FIFO & ageing
            bankAccountId: src.bankAccountId,
            bankRef: src.bankRef,
            utrRef: src.utrRef,
            totalFC: moveFC,
            remainingFC: moveFC,
            rate: src.rate,
            exactRate: src.exactRate,
            inrAmount: round2(moveFC * src.exactRate),
            piId: resolvedToPiId,
            ciId: resolvedToCiId,
          });
        }
      }
    }

    // Track allocated amounts per Opening Payable Cr
    const obAllocMap = new Map<string, AllocationRecord[]>();

    // 3. Process direct payments pinned to specific Opening Payables or CIs first
    const partyOpeningPayables = partyOBs.filter(ob => ob.balanceType === 'Cr');
    for (const ob of partyOpeningPayables) {
      const directChunks = paymentChunks.filter(
        chunk => chunk.remainingFC > 0 && (chunk.ciId === ob.id || chunk.ciId === `OB-${ob.id}` || chunk.ciId === ob.referenceNo)
      );
      let obRemaining = ob.amountFC;
      const obAllocs: AllocationRecord[] = [];
      const obExactRate = getObExactRate(ob);

      for (const chunk of directChunks) {
        if (obRemaining <= 0) break;
        const allocFC = round2(Math.min(obRemaining, chunk.remainingFC));
        if (allocFC > 0) {
          const realizedGL = round2(allocFC * (obExactRate - chunk.exactRate));
          const allocRecord: AllocationRecord = {
            id: `ALLOC-OB-DIR-${chunk.paymentId}-${ob.id}-${allocations.length + 1}`,
            companyId,
            supplierId,
            currency: currency as CurrencyCode,
            paymentId: chunk.paymentId,
            ciId: `OB-${ob.id}`,
            piId: '',
            amountFC: allocFC,
            paymentRate: chunk.rate,
            boeRate: round4(obExactRate),
            realizedGainLossINR: realizedGL,
            paymentDate: chunk.date,
            ciDate: ob.originalDocumentDate || ob.referenceDate,
            boeNo: ob.boeNo || ob.referenceNo,
            boeDate: ob.originalDocumentDate || ob.referenceDate,
          };
          allocations.push(allocRecord);
          obAllocs.push(allocRecord);
          chunk.remainingFC = round2(chunk.remainingFC - allocFC);
          obRemaining = round2(obRemaining - allocFC);
          grandTotalRealizedGainLoss = round2(grandTotalRealizedGainLoss + realizedGL);
        }
      }
      obAllocMap.set(ob.id, obAllocs);
    }

    for (const ci of partyCIs) {
      const directChunks = paymentChunks.filter(
        chunk => chunk.remainingFC > 0 && (chunk.ciId === ci.id || chunk.ciId === ci.ciNo)
      );

      let ciRemaining = ci.ciValueFC;
      const ciExactRate = getCiExactRate(ci);

      for (const chunk of directChunks) {
        if (ciRemaining <= 0) break;
        const allocFC = round2(Math.min(ciRemaining, chunk.remainingFC));
        if (allocFC > 0) {
          const realizedGL = round2(allocFC * (ciExactRate - chunk.exactRate));

          const allocRecord: AllocationRecord = {
            id: `ALLOC-DIR-${chunk.paymentId}-${ci.id}-${allocations.length + 1}`,
            companyId,
            supplierId,
            currency: currency as CurrencyCode,
            paymentId: chunk.paymentId,
            ciId: ci.id,
            piId: ci.linkedPiId,
            amountFC: allocFC,
            paymentRate: chunk.rate,
            boeRate: round4(ciExactRate),
            realizedGainLossINR: realizedGL,
            paymentDate: chunk.date,
            ciDate: ci.ciDate,
            boeNo: ci.boeNo,
            boeDate: ci.boeDate,
          };

          allocations.push(allocRecord);
          chunk.remainingFC = round2(chunk.remainingFC - allocFC);
          ciRemaining = round2(ciRemaining - allocFC);
          grandTotalRealizedGainLoss = round2(grandTotalRealizedGainLoss + realizedGL);
        }
      }
    }

    // 4. Process PI-level advances to CIs linked to each PI (FIFO, strictly PI-isolated + supports linkedPiSplits)
    for (const pi of partyPIs) {
      const cisForPi = partyCIs.filter(
        c => c.linkedPiId === pi.id || (c.linkedPiSplits && c.linkedPiSplits.some(s => s.piId === pi.id))
      );

      const piChunks = paymentChunks.filter(
        chunk => chunk.remainingFC > 0 && (chunk.piId === pi.id || chunk.piId === pi.piNo)
      );

      for (const ci of cisForPi) {
        const alreadyAllocated = allocations
          .filter(a => a.ciId === ci.id)
          .reduce((sum, a) => sum + a.amountFC, 0);

        const splitEntry = ci.linkedPiSplits?.find(s => s.piId === pi.id);
        const alreadyFromThisPi = allocations
          .filter(a => a.ciId === ci.id && a.piId === pi.id)
          .reduce((sum, a) => sum + a.amountFC, 0);
        const splitCap = splitEntry ? round2(Math.max(0, splitEntry.amountFC - alreadyFromThisPi)) : Infinity;

        let ciNeed = round2(Math.min(ci.ciValueFC - alreadyAllocated, splitCap));
        const ciExactRate = getCiExactRate(ci);

        for (const chunk of piChunks) {
          if (ciNeed <= 0) break;
          if (chunk.remainingFC <= 0) continue;

          const allocFC = round2(Math.min(ciNeed, chunk.remainingFC));
          if (allocFC > 0) {
            const realizedGL = round2(allocFC * (ciExactRate - chunk.exactRate));

            const allocRecord: AllocationRecord = {
              id: `ALLOC-PI-${chunk.paymentId}-${ci.id}-${allocations.length + 1}`,
              companyId,
              supplierId,
              currency: currency as CurrencyCode,
              paymentId: chunk.paymentId,
              ciId: ci.id,
              piId: pi.id,
              amountFC: allocFC,
              paymentRate: chunk.rate,
              boeRate: round4(ciExactRate),
              realizedGainLossINR: realizedGL,
              paymentDate: chunk.date,
              ciDate: ci.ciDate,
              boeNo: ci.boeNo,
              boeDate: ci.boeDate,
            };

            allocations.push(allocRecord);
            chunk.remainingFC = round2(chunk.remainingFC - allocFC);
            ciNeed = round2(ciNeed - allocFC);
            grandTotalRealizedGainLoss = round2(grandTotalRealizedGainLoss + realizedGL);
          }
        }
      }

      // Check for PI closing / short shipment and DN suggestions
      const shippedFC = cisForPi.reduce((sum, c) => sum + c.ciValueFC, 0);
      const unappliedPIAdvance = paymentChunks
        .filter(c => c.remainingFC > 0 && (c.piId === pi.id || c.piId === pi.piNo))
        .reduce((sum, c) => sum + c.remainingFC, 0);

      const existingDNsFC = partyDNs
        .filter(dn => dn.linkedPiId === pi.id || dn.linkedPiId === pi.piNo)
        .reduce((sum, dn) => sum + dn.amountFC, 0);

      const isShippedOrClosed = pi.isClosed || (shippedFC >= pi.piValueFC && pi.piValueFC > 0);
      const netExcessFC = round2(Math.max(0, unappliedPIAdvance - existingDNsFC));

      if (isShippedOrClosed && netExcessFC > 0) {
        const relevantChunks = paymentChunks.filter(
          c => c.remainingFC > 0 && (c.piId === pi.id || c.piId === pi.piNo)
        );
        const lastChunk = relevantChunks[relevantChunks.length - 1];
        const recRate = lastChunk ? lastChunk.rate : 0;
        const recINR = round2(netExcessFC * recRate);

        suggestedDebitNotes.push({
          companyId,
          supplierId,
          currency: currency as CurrencyCode,
          piId: pi.id,
          ciId: cisForPi[cisForPi.length - 1]?.id,
          excessFC: netExcessFC,
          recommendedRate: recRate,
          recommendedINR: recINR,
          paymentIds: relevantChunks.map(c => c.paymentId),
        });
      }
    }

    // 4a. Allocate general / unlinked chunks FIFO to Opening Payables (Cr) FIRST (oldest obligations!)
    for (const ob of partyOpeningPayables) {
      const existingAllocs = obAllocMap.get(ob.id) || [];
      const alreadyAlloc = existingAllocs.reduce((s, a) => s + a.amountFC, 0);
      let obNeed = round2(ob.amountFC - alreadyAlloc);
      if (obNeed <= 0) continue;

      const obExactRate = getObExactRate(ob);
      const unlinkedChunks = paymentChunks.filter(c => c.remainingFC > 0 && !c.ciId && !c.piId);

      for (const chunk of unlinkedChunks) {
        if (obNeed <= 0) break;
        if (chunk.remainingFC <= 0) continue;

        const allocFC = round2(Math.min(obNeed, chunk.remainingFC));
        if (allocFC > 0) {
          const realizedGL = round2(allocFC * (obExactRate - chunk.exactRate));
          const allocRecord: AllocationRecord = {
            id: `ALLOC-OB-${chunk.paymentId}-${ob.id}-${allocations.length + 1}`,
            companyId,
            supplierId,
            currency: currency as CurrencyCode,
            paymentId: chunk.paymentId,
            ciId: `OB-${ob.id}`,
            piId: '',
            amountFC: allocFC,
            paymentRate: chunk.rate,
            boeRate: round4(obExactRate),
            realizedGainLossINR: realizedGL,
            paymentDate: chunk.date,
            ciDate: ob.originalDocumentDate || ob.referenceDate,
            boeNo: ob.boeNo || ob.referenceNo,
            boeDate: ob.originalDocumentDate || ob.referenceDate,
          };

          allocations.push(allocRecord);
          existingAllocs.push(allocRecord);
          chunk.remainingFC = round2(chunk.remainingFC - allocFC);
          obNeed = round2(obNeed - allocFC);
          grandTotalRealizedGainLoss = round2(grandTotalRealizedGainLoss + realizedGL);
        }
      }
      obAllocMap.set(ob.id, existingAllocs);
    }

    // 4b. Allocate general / unlinked chunks FIFO to unlinked CIs ONLY (!ci.linkedPiId && no linkedPiSplits)
    for (const ci of partyCIs) {
      if (ci.linkedPiId || (ci.linkedPiSplits && ci.linkedPiSplits.length > 0)) continue; // Strictly PI-isolated

      const alreadyAllocated = allocations
        .filter(a => a.ciId === ci.id)
        .reduce((sum, a) => sum + a.amountFC, 0);

      let ciNeed = round2(ci.ciValueFC - alreadyAllocated);
      if (ciNeed <= 0) continue;

      const ciExactRate = getCiExactRate(ci);
      const unlinkedChunks = paymentChunks.filter(
        c => c.remainingFC > 0 && !c.ciId && !c.piId
      );

      for (const chunk of unlinkedChunks) {
        if (ciNeed <= 0) break;
        if (chunk.remainingFC <= 0) continue;

        const allocFC = round2(Math.min(ciNeed, chunk.remainingFC));
        if (allocFC > 0) {
          const realizedGL = round2(allocFC * (ciExactRate - chunk.exactRate));

          const allocRecord: AllocationRecord = {
            id: `ALLOC-GEN-${chunk.paymentId}-${ci.id}-${allocations.length + 1}`,
            companyId,
            supplierId,
            currency: currency as CurrencyCode,
            paymentId: chunk.paymentId,
            ciId: ci.id,
            piId: '',
            amountFC: allocFC,
            paymentRate: chunk.rate,
            boeRate: round4(ciExactRate),
            realizedGainLossINR: realizedGL,
            paymentDate: chunk.date,
            ciDate: ci.ciDate,
            boeNo: ci.boeNo,
            boeDate: ci.boeDate,
          };

          allocations.push(allocRecord);
          chunk.remainingFC = round2(chunk.remainingFC - allocFC);
          ciNeed = round2(ciNeed - allocFC);
          grandTotalRealizedGainLoss = round2(grandTotalRealizedGainLoss + realizedGL);
        }
      }
    }

    // 5. Debit Notes adjustment on remaining chunks
    for (const dn of partyDNs) {
      let dnRemaining = dn.amountFC;
      const chunksToReduce = paymentChunks.filter(
        c => c.remainingFC > 0 && (!dn.linkedPiId || c.piId === dn.linkedPiId)
      );

      for (const chunk of chunksToReduce) {
        if (dnRemaining <= 0) break;
        const deduction = round2(Math.min(chunk.remainingFC, dnRemaining));
        chunk.remainingFC = round2(chunk.remainingFC - deduction);
        dnRemaining = round2(dnRemaining - deduction);
      }
    }

    // Save unapplied chunks to global list
    allUnappliedChunks.push(...paymentChunks);

    // 6a. Compute State for each Opening Payable Cr
    for (const ob of partyOpeningPayables) {
      const obAllocs = obAllocMap.get(ob.id) || [];
      const allocatedFC = round2(obAllocs.reduce((s, a) => s + a.amountFC, 0));
      const balanceFC = round2(Math.max(0, ob.amountFC - allocatedFC));
      const obExactRate = getObExactRate(ob);
      const openingINR = round2(ob.amountINR);
      const allocatedINR = round2(obAllocs.reduce((s, a) => s + (a.amountFC * (allocations.find(x => x.id === a.id)?.paymentRate || a.paymentRate)), 0));
      const balanceINR = balanceFC >= ob.amountFC ? openingINR : round2(balanceFC * obExactRate);
      const realizedGL = round2(obAllocs.reduce((s, a) => s + a.realizedGainLossINR, 0));
      const docDate = ob.originalDocumentDate || ob.referenceDate;
      const isOverdue = balanceFC > 0 && docDate ? getDaysBetween(docDate, asOfDate) > 0 : false;

      let status: ComputedOpeningPayableState['status'] = 'Unpaid';
      if (balanceFC <= 0) status = 'Fully Paid';
      else if (allocatedFC > 0) status = 'Partially Paid';

      openingPayableStates.set(ob.id, {
        ob,
        allocatedFC,
        balanceFC,
        openingINR,
        allocatedINR,
        balanceINR,
        realizedGainLossINR: realizedGL,
        isOverdue,
        allocations: obAllocs,
        status,
      });
    }

    // 6b. Compute State for each CI
    for (const ci of partyCIs) {
      const ciAllocs = allocations.filter(a => a.ciId === ci.id);
      const allocatedFC = round2(ciAllocs.reduce((s, a) => s + a.amountFC, 0));
      const balanceFC = round2(Math.max(0, ci.ciValueFC - allocatedFC));
      const ciExactRate = getCiExactRate(ci);
      const purchaseINR = round2(ci.purchaseINR || (ci.ciValueFC * (ci.boeExchangeRate || 0)));
      const allocatedINR = round2(ciAllocs.reduce((s, a) => s + (a.amountFC * a.paymentRate), 0));
      const balanceINR = balanceFC >= ci.ciValueFC ? purchaseINR : round2(balanceFC * ciExactRate);
      const realizedGL = round2(ciAllocs.reduce((s, a) => s + a.realizedGainLossINR, 0));

      const linkedPi = partyPIs.find(p => p.id === ci.linkedPiId);
      const creditDays = linkedPi ? linkedPi.creditDays || 0 : 0;
      const baseDate = ci.blDate || ci.ciDate || ci.boeDate;
      const dueDate = addDaysToDate(baseDate, creditDays);
      const isOverdue = balanceFC > 0 && dueDate ? getDaysBetween(dueDate, asOfDate) > 0 : false;

      let status: ComputedCIState['status'] = 'Unpaid';
      if (balanceFC <= 0) status = 'Fully Paid';
      else if (allocatedFC > 0 && !isOverdue) status = 'Partially Paid';
      else if (isOverdue) status = 'Overdue';

      ciStates.set(ci.id, {
        ci,
        allocatedFC,
        balanceFC,
        purchaseINR,
        allocatedINR,
        balanceINR,
        realizedGainLossINR: realizedGL,
        dueDate,
        isOverdue,
        allocations: ciAllocs,
        status,
      });
    }

    // 7. Compute State for each PI
    for (const pi of partyPIs) {
      const cisForPi = partyCIs.filter(
        c => c.linkedPiId === pi.id || (c.linkedPiSplits && c.linkedPiSplits.some(s => s.piId === pi.id))
      );
      const paymentsForPi = partyPayments.filter(p => p.linkedPiId === pi.id);
      const totalPaidFC = round2(
        paymentsForPi.reduce((s, p) => s + p.amountFC, 0) +
        partyOBs.filter(ob => ob.referenceNo === pi.id || ob.referenceNo === pi.piNo).reduce((s, ob) => s + ob.amountFC, 0)
      );

      const shippedFC = round2(cisForPi.reduce((s, c) => s + c.ciValueFC, 0));
      const remainingToShipFC = round2(Math.max(0, pi.piValueFC - shippedFC));
      const advReqFC = round2(pi.piValueFC * ((pi.advancePercentage || 0) / 100));

      const unappliedAdvFC = round2(
        paymentChunks
          .filter(c => (c.piId === pi.id || c.piId === pi.piNo) && c.remainingFC > 0)
          .reduce((s, c) => s + c.remainingFC, 0)
      );

      const suggestedDN = suggestedDebitNotes.find(s => s.piId === pi.id);
      const suggestedDNFC = suggestedDN ? suggestedDN.excessFC : 0;

      let piStatus: ComputedPIState['status'] = 'Advance not paid';
      if (suggestedDNFC > 0) {
        piStatus = 'Excess paid - DN suggested';
      } else if (pi.isClosed && (shippedFC >= pi.piValueFC || unappliedAdvFC === 0)) {
        piStatus = 'Settled';
      } else if (totalPaidFC === 0) {
        piStatus = 'Advance not paid';
      } else if (totalPaidFC < advReqFC) {
        piStatus = 'Advance part paid';
      } else if (shippedFC === 0 && totalPaidFC >= advReqFC) {
        piStatus = 'Advance paid - shipment pending';
      } else if (shippedFC > 0 && shippedFC < pi.piValueFC && !pi.isClosed) {
        piStatus = 'Part shipped';
      } else {
        const hasOverdueCI = cisForPi.some(c => ciStates.get(c.id)?.isOverdue);
        if (hasOverdueCI) {
          piStatus = 'Overdue';
        } else if (shippedFC > totalPaidFC) {
          piStatus = 'Payment due';
        } else {
          piStatus = 'Settled';
        }
      }

      const complianceFlags: string[] = [];
      if (unappliedAdvFC > 0) {
        const oldestPayment = paymentsForPi[0];
        if (oldestPayment && getDaysBetween(oldestPayment.paymentDate, asOfDate) > 90) {
          complianceFlags.push('Advance > 90 days without BOE');
        }
      }
      for (const c of cisForPi) {
        const state = ciStates.get(c.id);
        if (state && state.balanceFC > 0) {
          const shipDate = c.blDate || c.ciDate;
          if (shipDate && getDaysBetween(shipDate, asOfDate) > 180) {
            complianceFlags.push(`Payable CI ${c.ciNo} > 180 days from shipment`);
          }
        }
      }

      piStates.set(pi.id, {
        pi,
        advanceRequiredFC: advReqFC,
        totalPaidFC,
        shippedFC,
        remainingToShipFC,
        unappliedAdvanceFC: unappliedAdvFC,
        suggestedDebitNoteFC: suggestedDNFC,
        cis: cisForPi,
        payments: paymentsForPi,
        status: piStatus,
        complianceFlags,
      });
    }
  }

  // Calculate total refund FX up to asOfDate
  let totalRefundFXINR = 0;
  for (const refund of db.refundReceipts) {
    if ((refund.date || '') > asOfDate) continue;
    const dn = db.debitNotes.find(d => d.id === refund.againstDnId);
    if (dn) {
      const dnINRForFC = round2(refund.amountFC * dn.rate);
      const refundINR = round2(refund.inrAmount || (refund.amountFC * refund.actualExchangeRate));
      const fx = round2(refundINR - dnINRForFC);
      totalRefundFXINR = round2(totalRefundFXINR + fx);
    }
  }

  // RBI IDPMS 180-Day Advance Remittance Monitoring
  const idpmsAdvanceAlerts = computeIDPMSAdvanceAlerts(
    db,
    { allocations, unappliedPayments: allUnappliedChunks },
    asOfDate
  );

  // Container Detention & Demurrage Risk Monitoring
  const containerDetentionRisks = computeContainerDetentionRisks(db, asOfDate);

  return {
    allocations,
    ciStates,
    openingPayableStates,
    piStates,
    unappliedPayments: allUnappliedChunks,
    suggestedDebitNotes,
    totalRealizedGainLossINR: grandTotalRealizedGainLoss,
    totalRefundFXINR,
    idpmsAdvanceAlerts,
    containerDetentionRisks,
  };
}

/**
 * Month-End Valuation / Unrealized FX calculation
 */
export function computeMonthEndValuation(
  db: AppDatabase,
  engineResult: EngineResult,
  monthEndDate: string,
  currency: CurrencyCode,
  companyId: string = 'ALL',
  supplierId: string = 'ALL',
  overrideRate?: number
): {
  valuationRate: number;
  openPayablesFC: number;
  unrealizedPayableFXINR: number;
  openAdvancesFC: number;
  unrealizedAdvanceFXINR: number;
  totalUnrealizedFXINR: number;
} {
  const rateObj = db.monthEndRates.find(
    r => r.monthEndDate === monthEndDate && r.currency === currency
  );
  const valuationRate = overrideRate && overrideRate > 0 ? overrideRate : (rateObj ? rateObj.valuationRate : 0);

  let openPayablesFC = 0;
  let unrealizedPayableFXINR = 0;

  // Open CIs
  for (const [, state] of engineResult.ciStates) {
    if (companyId !== 'ALL' && state.ci.companyId !== companyId) continue;
    if (supplierId !== 'ALL' && state.ci.supplierId !== supplierId) continue;
    if (state.ci.currency === currency && state.balanceFC > 0 && state.ci.ciDate <= monthEndDate) {
      openPayablesFC = round2(openPayablesFC + state.balanceFC);
      if (valuationRate > 0) {
        const billRate = state.ci.ciValueFC > 0 && state.purchaseINR > 0 ? state.purchaseINR / state.ci.ciValueFC : (state.ci.boeExchangeRate || 0);
        const fx = round2(state.balanceFC * (billRate - valuationRate));
        unrealizedPayableFXINR = round2(unrealizedPayableFXINR + fx);
      }
    }
  }

  // Open Cr Opening Payables
  for (const [, obState] of engineResult.openingPayableStates) {
    if (companyId !== 'ALL' && obState.ob.companyId !== companyId) continue;
    if (supplierId !== 'ALL' && obState.ob.supplierId !== supplierId) continue;
    const refDt = obState.ob.originalDocumentDate || obState.ob.referenceDate;
    if (obState.ob.currency === currency && obState.balanceFC > 0 && refDt <= monthEndDate) {
      openPayablesFC = round2(openPayablesFC + obState.balanceFC);
      if (valuationRate > 0) {
        const obRate = obState.ob.amountFC > 0 && obState.openingINR > 0 ? obState.openingINR / obState.ob.amountFC : obState.ob.rate;
        const fx = round2(obState.balanceFC * (obRate - valuationRate));
        unrealizedPayableFXINR = round2(unrealizedPayableFXINR + fx);
      }
    }
  }

  // Advances lying with supplier (NOT revalued by default unless revalueAdvancesAtMonthEnd = true)
  let openAdvancesFC = 0;
  let unrealizedAdvanceFXINR = 0;

  if (db.settings.revalueAdvancesAtMonthEnd) {
    for (const chunk of engineResult.unappliedPayments) {
      if (companyId !== 'ALL' && chunk.companyId !== companyId) continue;
      if (supplierId !== 'ALL' && chunk.supplierId !== supplierId) continue;
      if (chunk.currency === currency && chunk.remainingFC > 0 && chunk.date <= monthEndDate) {
        openAdvancesFC = round2(openAdvancesFC + chunk.remainingFC);
        if (valuationRate > 0) {
          const fx = round2(chunk.remainingFC * (valuationRate - chunk.exactRate));
          unrealizedAdvanceFXINR = round2(unrealizedAdvanceFXINR + fx);
        }
      }
    }
  }

  return {
    valuationRate,
    openPayablesFC,
    unrealizedPayableFXINR,
    openAdvancesFC,
    unrealizedAdvanceFXINR,
    totalUnrealizedFXINR: round2(unrealizedPayableFXINR + unrealizedAdvanceFXINR),
  };
}

/**
 * Computes RBI IDPMS 180-Day Regulatory Advance Remittance countdown and compliance urgency
 */
export function computeIDPMSAdvanceAlerts(
  db: AppDatabase,
  engineResult: Pick<EngineResult, 'unappliedPayments' | 'allocations'>,
  asOfDate: string
): IDPMSAdvanceAlert[] {
  const alerts: IDPMSAdvanceAlert[] = [];
  const compMap = new Map(db.companies.map(c => [c.id, c]));
  const suppMap = new Map(db.suppliers.map(s => [s.id, s]));
  const bankMap = new Map(db.bankAccounts.map(b => [b.id, b]));
  const piMap = new Map((db.proformaInvoices || []).map(p => [p.id, p]));

  for (const p of db.payments) {
    if (p.paymentDate > asOfDate) continue;
    const isAdvance = p.paymentAgainst === 'PI' || p.paymentMode === 'Advance' || p.paymentMode === 'Full advance';
    if (!isAdvance) continue;

    // How much of this payment is settled against verified BOE?
    const allocs = engineResult.allocations.filter(a => a.paymentId === p.id);
    const settledFC = allocs
      .filter(a => a.boeNo && !a.boeNo.startsWith('PENDING-'))
      .reduce((s, a) => s + a.amountFC, 0);

    const unsettledFC = round2(Math.max(0, p.amountFC - settledFC));
    if (unsettledFC <= 0) continue; // fully settled with BOE

    const daysElapsed = Math.max(0, getDaysBetween(p.paymentDate, asOfDate));
    const daysRemaining = 180 - daysElapsed;
    const dueDate180 = addDaysToDate(p.paymentDate, 180);

    let status: IDPMSAdvanceAlert['status'] = 'Safe';
    if (daysRemaining < 0) {
      status = 'Overdue';
    } else if (daysRemaining <= 30) {
      status = 'Critical';
    } else if (daysRemaining <= 90) {
      status = 'Warning';
    }

    const comp = compMap.get(p.companyId);
    const supp = suppMap.get(p.supplierId);
    const bank = bankMap.get(p.bankAccountId);
    const linkedPi = p.linkedPiId ? piMap.get(p.linkedPiId) : undefined;

    alerts.push({
      paymentId: p.id,
      companyId: p.companyId,
      companyCode: comp?.code || '',
      supplierId: p.supplierId,
      supplierName: supp?.supplierName || '',
      vendorCode: supp?.vendorCode || '',
      currency: p.currency,
      paymentDate: p.paymentDate,
      amountFC: p.amountFC,
      unsettledAmountFC: unsettledFC,
      inrAmount: p.inrAmount,
      bankName: bank?.bankName || 'HDFC Bank',
      daysElapsed,
      daysRemaining,
      dueDate180,
      status,
      linkedPiNo: linkedPi?.piNo,
    });
  }

  const priorityOrder = { Overdue: 0, Critical: 1, Warning: 2, Safe: 3 };
  return alerts.sort((a, b) => priorityOrder[a.status] - priorityOrder[b.status] || a.daysRemaining - b.daysRemaining);
}

/**
 * Computes Shipping Line Container Detention & Port Demurrage Risk Radar
 */
export function computeContainerDetentionRisks(
  db: AppDatabase,
  asOfDate: string
): ContainerDetentionRisk[] {
  const risks: ContainerDetentionRisk[] = [];
  const shipments = db.shipments || [];
  const suppMap = new Map(db.suppliers.map(s => [s.id, s]));
  const piMap = new Map((db.proformaInvoices || []).map(p => [p.id, p]));

  for (const s of shipments) {
    if (s.mode !== 'Sea') continue;
    if (s.emptyReturnedDate) continue; // Already returned empty container
    if (s.status === 'Received' && s.actualReceiptDate && s.emptyReturnedDate) continue;

    const freeDays = Number(s.freeDetentionDays || 14);
    const dischargeBase = s.dischargeDate || s.etaPortDate || s.dispatchDate;
    if (!dischargeBase) continue;

    const detentionExpiryDate = addDaysToDate(dischargeBase, freeDays);
    const daysRemaining = getDaysBetween(asOfDate, detentionExpiryDate);

    let riskLevel: ContainerDetentionRisk['riskLevel'] = 'Safe';
    if (daysRemaining < 0) {
      riskLevel = 'Expired';
    } else if (daysRemaining <= 3) {
      riskLevel = 'Critical';
    } else if (daysRemaining <= 7) {
      riskLevel = 'Warning';
    }

    const supp = suppMap.get(s.supplierId);
    const pi = piMap.get(s.piId);

    risks.push({
      shipmentId: s.id,
      shipmentRefNo: s.shipmentRefNo,
      piNo: pi?.piNo || s.piId,
      supplierName: supp?.supplierName || '',
      containerNo: s.containerNo,
      containerType: s.containerType || '40ft HQ',
      shippingLine: s.shippingLine || 'COSCO / Maersk',
      dischargeDate: dischargeBase,
      freeDetentionDays: freeDays,
      detentionExpiryDate,
      daysRemaining,
      riskLevel,
      emptyReturnedDate: s.emptyReturnedDate,
      status: s.status,
    });
  }

  const priorityOrder = { Expired: 0, Critical: 1, Warning: 2, Safe: 3 };
  return risks.sort((a, b) => priorityOrder[a.riskLevel] - priorityOrder[b.riskLevel] || a.daysRemaining - b.daysRemaining);
}
