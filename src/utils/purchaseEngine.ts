import {
  AppDatabase,
  ProformaInvoice,
  ShipmentItemLine,
  ShipmentPlan,
  IGCRLot,
  IGCRConsumption,
} from '../types';
import { EngineResult } from './engine';
import { computeBOETaxTotals, suggestSWS, suggestIGST } from './boe';
import { getDaysBetween, round2 } from './formatters';

export interface ShipmentDutyEstimate {
  assessableINR: number;
  bcdINR: number;
  swsINR: number;
  igstINR: number;
  totalDutyINR: number;
  dutyForegoneINR: number;
}

/**
 * Computes item-wise and total customs duty forecast (BCD / Concessional IGCR BCD + 10% SWS + IGST)
 */
export function computeShipmentDutyEstimate(
  items: ShipmentItemLine[],
  exchangeRate: number
): ShipmentDutyEstimate {
  const fx = Number(exchangeRate || 0);
  let assessableINR = 0;
  let bcdINR = 0;
  let swsINR = 0;
  let igstINR = 0;
  let dutyForegoneINR = 0;

  for (const it of items) {
    const qty = Number(it.dispatchedQty || 0);
    const rateFC = Number(it.unitPriceFC || 0);
    const assVal = round2(qty * rateFC * fx);
    const effBcdPct = it.igcrEligible ? Number(it.igcrBcdRatePct || 0) : Number(it.bcdRatePct || 0);
    const bcd = round2((assVal * effBcdPct) / 100);
    const sws = suggestSWS(bcd);
    const igst = suggestIGST(assVal, bcd, sws, Number(it.igstRatePct ?? 18));

    assessableINR += assVal;
    bcdINR += bcd;
    swsINR += sws;
    igstINR += igst;

    if (it.igcrEligible) {
      const diffPct = Math.max(0, Number(it.bcdRatePct || 0) - Number(it.igcrBcdRatePct || 0));
      dutyForegoneINR += round2(((assVal * diffPct) / 100) * 1.1);
    }
  }

  return {
    assessableINR: round2(assessableINR),
    bcdINR: round2(bcdINR),
    swsINR: round2(swsINR),
    igstINR: round2(igstINR),
    totalDutyINR: round2(bcdINR + swsINR + igstINR),
    dutyForegoneINR: round2(dutyForegoneINR),
  };
}

export interface PIItemBalanceRow {
  piId: string;
  piNo: string;
  piDate: string;
  companyId: string;
  companyCode: string;
  supplierId: string;
  supplierName: string;
  vendorCode: string;
  currency: string;
  lineId: string;
  itemCode: string;
  itemName: string;
  supplierItemCode?: string;
  supplierItemName?: string;
  hsnCode: string;
  uom: string;
  orderedQty: number;
  dispatchedQty: number;
  inTransitQty: number;
  receivedQty: number;
  shortQty: number;
  balancePendingQty: number;
  receivedPct: number;
  unitPriceFC: number;
  orderedAmountFC: number;
  receivedAmountFC: number;
  balanceAmountFC: number;
  nextEtaDate?: string;
  estPendingDutyINR: number;
  status: 'Pending Dispatch' | 'In-Transit' | 'Part Received' | 'Fully Received' | 'Closed';
}

export interface PISummaryBalance {
  pi: ProformaInvoice;
  companyCode: string;
  supplierName: string;
  vendorCode: string;
  orderedQty: number;
  dispatchedQty: number;
  inTransitQty: number;
  receivedQty: number;
  shortQty: number;
  balancePendingQty: number;
  receivedPct: number;
  receivedAmountFC: number;
  balanceAmountFC: number;
  nextEtaDate?: string;
  estPendingDutyINR: number;
  shipmentCount: number;
  status: 'Pending Dispatch' | 'In-Transit' | 'Part Received' | 'Fully Received' | 'Closed';
  itemLines: PIItemBalanceRow[];
}

export interface PartyMaterialBalance {
  supplierId: string;
  companyId: string;
  companyCode: string;
  vendorCode: string;
  supplierName: string;
  currency: string;
  openPiCount: number;
  totalOrderedFC: number;
  receivedValueFC: number;
  balancePendingFC: number;
  orderedQty: number;
  receivedQty: number;
  pendingQty: number;
  inTransitShipments: number;
  overdueDispatches: number;
  upcomingDutyINR: number;
  nextEtaDate?: string;
}

export interface DutyCashflowSummary {
  next7DaysINR: number;
  next15DaysINR: number;
  next30DaysINR: number;
  totalUpcomingINR: number;
  inTransitCount: number;
  overdueDispatchesCount: number;
  upcomingShipments: ShipmentPlan[];
}

export interface MaterialBalanceResult {
  piBalances: PISummaryBalance[];
  itemRows: PIItemBalanceRow[];
  partyBalances: PartyMaterialBalance[];
  dutyCashflow: DutyCashflowSummary;
}

/**
 * Computes item-wise PI material balances, party-wise rollups, and upcoming customs duty cash-flow radar
 */
export function computeMaterialBalances(
  db: AppDatabase,
  companyId: string,
  asOfDate: string
): MaterialBalanceResult {
  const pis = db.proformaInvoices.filter(p => companyId === 'ALL' || p.companyId === companyId);
  const shipments = (db.shipments || []).filter(s => companyId === 'ALL' || s.companyId === companyId);

  const compMap = new Map(db.companies.map(c => [c.id, c]));
  const suppMap = new Map(db.suppliers.map(s => [s.id, s]));

  const piBalances: PISummaryBalance[] = [];
  const itemRows: PIItemBalanceRow[] = [];

  for (const pi of pis) {
    const comp = compMap.get(pi.companyId);
    const supp = suppMap.get(pi.supplierId);
    const piShipments = shipments.filter(s => s.piId === pi.id);

    const activeNonRecShipments = piShipments.filter(s => s.status !== 'Received');
    const etaCandidates = activeNonRecShipments
      .map(s => s.etaPortDate || '')
      .filter(Boolean)
      .sort();
    const nextEtaDate = etaCandidates[0];
    const piEstPendingDuty = round2(
      activeNonRecShipments.reduce((sum, s) => sum + Number(s.estimatedTotalDutyINR || 0), 0)
    );

    const lines = pi.items || [];
    const lineRows: PIItemBalanceRow[] = [];

    if (lines.length > 0) {
      for (const line of lines) {
        let dispatchedQty = 0;
        let inTransitQty = 0;
        let receivedQty = 0;
        let shortQty = 0;
        let estPendingDutyINR = 0;
        const lineEtas: string[] = [];

        for (const shp of piShipments) {
          const matchedItems = shp.items.filter(
            si => (si.piLineId && si.piLineId === line.lineId) || si.itemCode === line.itemCode
          );
          if (matchedItems.length === 0) continue;

          for (const si of matchedItems) {
            if (shp.status !== 'Planned') {
              dispatchedQty += Number(si.dispatchedQty || 0);
            }
            receivedQty += Number(si.receivedQty || 0);
            shortQty += Number(si.shortQty || 0);

            if (shp.status !== 'Received') {
              const transitRemaining = Math.max(
                0,
                Number(si.dispatchedQty || 0) - Number(si.receivedQty || 0) - Number(si.shortQty || 0)
              );
              if (shp.status !== 'Planned') {
                inTransitQty += transitRemaining;
              }
              if (shp.etaPortDate) lineEtas.push(shp.etaPortDate);
              if (transitRemaining > 0) {
                const est = computeShipmentDutyEstimate(
                  [{ ...si, dispatchedQty: transitRemaining }],
                  shp.estimatedExchangeRate
                );
                estPendingDutyINR += est.totalDutyINR;
              }
            }
          }
        }

        dispatchedQty = round2(dispatchedQty);
        inTransitQty = round2(inTransitQty);
        receivedQty = round2(receivedQty);
        shortQty = round2(shortQty);
        const balancePendingQty = pi.isClosed
          ? 0
          : round2(Math.max(0, Number(line.orderedQty || 0) - receivedQty - shortQty));
        const receivedPct =
          line.orderedQty > 0
            ? Math.min(100, round2(((receivedQty + shortQty) / line.orderedQty) * 100))
            : 0;
        const orderedAmountFC = round2(Number(line.amountFC || line.orderedQty * line.unitPriceFC));
        const receivedAmountFC = round2(Math.min(orderedAmountFC, receivedQty * Number(line.unitPriceFC || 0)));
        const balanceAmountFC = pi.isClosed
          ? 0
          : round2(Math.max(0, balancePendingQty * Number(line.unitPriceFC || 0)));

        let rowStatus: PIItemBalanceRow['status'] = 'Pending Dispatch';
        if (pi.isClosed && receivedQty + shortQty < line.orderedQty) {
          rowStatus = 'Closed';
        } else if (balancePendingQty <= 0 && (receivedQty > 0 || shortQty > 0)) {
          rowStatus = 'Fully Received';
        } else if (receivedQty > 0) {
          rowStatus = 'Part Received';
        } else if (inTransitQty > 0) {
          rowStatus = 'In-Transit';
        }

        const master = (line.itemId ? db.items?.find(m => m.id === line.itemId) : undefined) ||
          db.items?.find(m => m.companyId === pi.companyId && m.itemCode === line.itemCode);
        const supMapping = master?.supplierMappings?.find(m => m.supplierId === pi.supplierId);
        const resolvedSupplierItemCode = line.supplierItemCode || supMapping?.supplierItemCode || undefined;
        const resolvedSupplierItemName = line.supplierItemName || supMapping?.supplierItemName || undefined;

        lineEtas.sort();
        const row: PIItemBalanceRow = {
          piId: pi.id,
          piNo: pi.piNo,
          piDate: pi.piDate,
          companyId: pi.companyId,
          companyCode: comp?.code || '',
          supplierId: pi.supplierId,
          supplierName: supp?.supplierName || '',
          vendorCode: supp?.vendorCode || '',
          currency: pi.currency,
          lineId: line.lineId,
          itemCode: line.itemCode,
          itemName: line.itemName,
          supplierItemCode: resolvedSupplierItemCode,
          supplierItemName: resolvedSupplierItemName,
          hsnCode: line.hsnCode,
          uom: line.uom,
          orderedQty: Number(line.orderedQty || 0),
          dispatchedQty,
          inTransitQty,
          receivedQty,
          shortQty,
          balancePendingQty,
          receivedPct,
          unitPriceFC: Number(line.unitPriceFC || 0),
          orderedAmountFC,
          receivedAmountFC,
          balanceAmountFC,
          nextEtaDate: lineEtas[0],
          estPendingDutyINR: round2(estPendingDutyINR),
          status: rowStatus,
        };
        lineRows.push(row);
        itemRows.push(row);
      }
    }

    // Aggregate PI summary
    const orderedQty = round2(lineRows.reduce((s, r) => s + r.orderedQty, 0));
    const dispatchedQty = round2(lineRows.reduce((s, r) => s + r.dispatchedQty, 0));
    const inTransitQty = round2(lineRows.reduce((s, r) => s + r.inTransitQty, 0));
    const receivedQty = round2(lineRows.reduce((s, r) => s + r.receivedQty, 0));
    const shortQty = round2(lineRows.reduce((s, r) => s + r.shortQty, 0));
    const balancePendingQty = round2(lineRows.reduce((s, r) => s + r.balancePendingQty, 0));

    const shippedReceivedValueFC = round2(
      piShipments.reduce(
        (sum, shp) =>
          sum +
          shp.items.reduce((is, si) => is + Number(si.receivedQty || 0) * Number(si.unitPriceFC || 0), 0),
        0
      )
    );
    const hasAllReceivedFlag = piShipments.length > 0 && piShipments.every(s => s.status === 'Received');
    const receivedAmountFC =
      lines.length > 0
        ? round2(lineRows.reduce((s, r) => s + r.receivedAmountFC, 0))
        : hasAllReceivedFlag
          ? pi.piValueFC
          : Math.min(pi.piValueFC, shippedReceivedValueFC);
    const balanceAmountFC = pi.isClosed
      ? 0
      : lines.length > 0
        ? round2(lineRows.reduce((s, r) => s + r.balanceAmountFC, 0))
        : round2(Math.max(0, pi.piValueFC - receivedAmountFC));
    const receivedPct =
      orderedQty > 0
        ? Math.min(100, round2(((receivedQty + shortQty) / orderedQty) * 100))
        : pi.piValueFC > 0
          ? Math.min(100, round2((receivedAmountFC / pi.piValueFC) * 100))
          : 0;

    let piStatus: PISummaryBalance['status'] = 'Pending Dispatch';
    if (pi.isClosed) {
      piStatus = 'Closed';
    } else if (
      (lines.length > 0 && balancePendingQty <= 0 && (receivedQty > 0 || shortQty > 0)) ||
      (lines.length === 0 && balanceAmountFC <= 0 && hasAllReceivedFlag)
    ) {
      piStatus = 'Fully Received';
    } else if (receivedQty > 0 || receivedAmountFC > 0) {
      piStatus = 'Part Received';
    } else if (piShipments.some(s => s.status === 'Dispatched' || s.status === 'Arrived Port' || s.status === 'Part Received')) {
      piStatus = 'In-Transit';
    }

    piBalances.push({
      pi,
      companyCode: comp?.code || '',
      supplierName: supp?.supplierName || '',
      vendorCode: supp?.vendorCode || '',
      orderedQty,
      dispatchedQty,
      inTransitQty,
      receivedQty,
      shortQty,
      balancePendingQty,
      receivedPct,
      receivedAmountFC,
      balanceAmountFC,
      nextEtaDate,
      estPendingDutyINR: piEstPendingDuty,
      shipmentCount: piShipments.length,
      status: piStatus,
      itemLines: lineRows,
    });
  }

  // Party-wise aggregation (Supplier + Currency)
  const partyMap = new Map<string, PartyMaterialBalance>();
  for (const pb of piBalances) {
    const key = `${pb.pi.supplierId}__${pb.pi.currency}`;
    const existing = partyMap.get(key);
    const isOpenPi = pb.status !== 'Fully Received' && pb.status !== 'Closed' ? 1 : 0;

    if (!existing) {
      partyMap.set(key, {
        supplierId: pb.pi.supplierId,
        companyId: pb.pi.companyId,
        companyCode: pb.companyCode,
        vendorCode: pb.vendorCode,
        supplierName: pb.supplierName,
        currency: pb.pi.currency,
        openPiCount: isOpenPi,
        totalOrderedFC: round2(pb.pi.piValueFC),
        receivedValueFC: round2(pb.receivedAmountFC),
        balancePendingFC: round2(pb.balanceAmountFC),
        orderedQty: pb.orderedQty,
        receivedQty: pb.receivedQty,
        pendingQty: pb.balancePendingQty,
        inTransitShipments: 0,
        overdueDispatches: 0,
        upcomingDutyINR: 0,
        nextEtaDate: pb.nextEtaDate,
      });
    } else {
      existing.openPiCount += isOpenPi;
      existing.totalOrderedFC = round2(existing.totalOrderedFC + pb.pi.piValueFC);
      existing.receivedValueFC = round2(existing.receivedValueFC + pb.receivedAmountFC);
      existing.balancePendingFC = round2(existing.balancePendingFC + pb.balanceAmountFC);
      existing.orderedQty = round2(existing.orderedQty + pb.orderedQty);
      existing.receivedQty = round2(existing.receivedQty + pb.receivedQty);
      existing.pendingQty = round2(existing.pendingQty + pb.balancePendingQty);
      if (pb.nextEtaDate && (!existing.nextEtaDate || pb.nextEtaDate < existing.nextEtaDate)) {
        existing.nextEtaDate = pb.nextEtaDate;
      }
    }
  }

  // Upcoming duty cash-flow radar
  let next7DaysINR = 0;
  let next15DaysINR = 0;
  let next30DaysINR = 0;
  let totalUpcomingINR = 0;
  let inTransitCount = 0;
  let overdueDispatchesCount = 0;
  const upcomingShipments: ShipmentPlan[] = [];

  for (const shp of shipments) {
    if (shp.status === 'Received') continue;
    upcomingShipments.push(shp);
    const duty = Number(shp.estimatedTotalDutyINR || 0);
    totalUpcomingINR += duty;

    if (shp.status === 'Dispatched' || shp.status === 'Arrived Port' || shp.status === 'Part Received') {
      inTransitCount += 1;
    }

    const isOverdueDispatch =
      (shp.status === 'Planned' && Boolean(shp.dispatchDate) && shp.dispatchDate! < asOfDate) ||
      (shp.status === 'Dispatched' && Boolean(shp.etaPortDate) && shp.etaPortDate! < asOfDate);

    if (isOverdueDispatch) {
      overdueDispatchesCount += 1;
    }

    const dueDt = shp.expectedDutyDate || shp.etaPortDate || '';
    if (dueDt) {
      const days = getDaysBetween(asOfDate, dueDt);
      if (days <= 7) next7DaysINR += duty;
      if (days <= 15) next15DaysINR += duty;
      if (days <= 30) next30DaysINR += duty;
    }

    const pKey = `${shp.supplierId}__${shp.currency}`;
    const pRow = partyMap.get(pKey);
    if (pRow) {
      if (shp.status === 'Dispatched' || shp.status === 'Arrived Port' || shp.status === 'Part Received') {
        pRow.inTransitShipments += 1;
      }
      if (isOverdueDispatch) {
        pRow.overdueDispatches += 1;
      }
      pRow.upcomingDutyINR = round2(pRow.upcomingDutyINR + duty);
    }
  }

  upcomingShipments.sort((a, b) =>
    (a.expectedDutyDate || a.etaPortDate || '9999').localeCompare(b.expectedDutyDate || b.etaPortDate || '9999')
  );

  return {
    piBalances,
    itemRows,
    partyBalances: Array.from(partyMap.values()),
    dutyCashflow: {
      next7DaysINR: round2(next7DaysINR),
      next15DaysINR: round2(next15DaysINR),
      next30DaysINR: round2(next30DaysINR),
      totalUpcomingINR: round2(totalUpcomingINR),
      inTransitCount,
      overdueDispatchesCount,
      upcomingShipments,
    },
  };
}

/**
 * Computes YYYY-MM-DD bounds for Monthly (1..12) or Indian FY Quarterly (1=Apr-Jun..4=Jan-Mar)
 */
export function getPeriodDateRange(
  periodType: 'monthly' | 'quarterly',
  year: number,
  periodIndex: number
): { startDate: string; endDate: string; label: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const lastDayOfMonth = (y: number, m1Based: number) => {
    const dt = new Date(Date.UTC(y, m1Based, 0));
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
  };

  if (periodType === 'monthly') {
    const m = Math.min(12, Math.max(1, periodIndex));
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return {
      startDate: `${year}-${pad(m)}-01`,
      endDate: lastDayOfMonth(year, m),
      label: `${names[m - 1]} ${year}`,
    };
  }

  // Indian Financial Year Quarters starting April of `year`
  const q = Math.min(4, Math.max(1, periodIndex));
  if (q === 1) return { startDate: `${year}-04-01`, endDate: `${year}-06-30`, label: `Q1 (Apr–Jun ${year})` };
  if (q === 2) return { startDate: `${year}-07-01`, endDate: `${year}-09-30`, label: `Q2 (Jul–Sep ${year})` };
  if (q === 3) return { startDate: `${year}-10-01`, endDate: `${year}-12-31`, label: `Q3 (Oct–Dec ${year})` };
  return {
    startDate: `${year + 1}-01-01`,
    endDate: lastDayOfMonth(year + 1, 3),
    label: `Q4 (Jan–Mar ${year + 1})`,
  };
}

function addMonthsISO(dateStr: string, months: number): string {
  const [yStr, mStr, dStr] = (dateStr || '2026-04-01').split('-');
  const y = parseInt(yStr, 10) || 2026;
  const m = (parseInt(mStr, 10) || 1) - 1;
  const d = parseInt(dStr, 10) || 1;
  const dt = new Date(Date.UTC(y, m + months, 1));
  const maxDay = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(d, maxDay));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export interface CustomsReturnBOEItem {
  ciId: string;
  companyCode: string;
  supplierName: string;
  boeNo: string;
  boeDate: string;
  ciNo: string;
  ciDate: string;
  portCode: string;
  currency: string;
  ciValueFC: number;
  taxInvoiceValueINR: number;
  assessableValueINR: number;
  bcdINR: number;
  swsINR: number;
  igstINR: number;
  totalTaxINR: number;
  taxPaidDate: string;
  status: string;
  idpmsStatus: string;
}

export interface CustomsHSNSummaryRow {
  hsnCode: string;
  description: string;
  uom: string;
  totalQty: number;
  assessableValueINR: number;
  bcdINR: number;
  swsINR: number;
  igstINR: number;
  totalTaxINR: number;
}

export interface CustomsReturnAdvanceAlert {
  paymentId: string;
  companyCode: string;
  supplierName: string;
  bankRef: string;
  paymentDate: string;
  currency: string;
  remainingFC: number;
  ageDays: number;
  isBreach180: boolean;
}

export interface CustomsMonthlyReturnResult {
  startDate: string;
  endDate: string;
  periodLabel: string;
  partA: {
    boeRows: CustomsReturnBOEItem[];
    hsnSummary: CustomsHSNSummaryRow[];
    boeCount: number;
    taxInvoiceValueINR: number;
    assessableValueINR: number;
    bcdINR: number;
    swsINR: number;
    igstItcINR: number;
    totalTaxINR: number;
    taxPaidCount: number;
    taxPendingCount: number;
  };
  partB: {
    remittanceCount: number;
    remittanceINR: number;
    idpmsSettledCount: number;
    idpmsPendingCount: number;
    advancesOver150Days: CustomsReturnAdvanceAlert[];
    breach180Count: number;
  };
  partC: {
    upcomingShipments: ShipmentPlan[];
    upcomingDutyINR: number;
  };
}

/**
 * Generates Customs Monthly / Quarterly Return data combining BOE Register, GSTR-2B IGST ITC, HSN Summary, RBI IDPMS & Planned Duty
 */
export function computeCustomsMonthlyReturn(
  db: AppDatabase,
  engineResult: EngineResult,
  periodType: 'monthly' | 'quarterly',
  year: number,
  periodIndex: number,
  companyId: string,
  portFilter: string,
  asOfDate: string
): CustomsMonthlyReturnResult {
  const { startDate, endDate, label } = getPeriodDateRange(periodType, year, periodIndex);
  const compMap = new Map(db.companies.map(c => [c.id, c]));
  const suppMap = new Map(db.suppliers.map(s => [s.id, s]));

  // Part A: BOEs in period
  const periodCIs = db.commercialInvoices.filter(ci => {
    if (companyId !== 'ALL' && ci.companyId !== companyId) return false;
    const effDate = ci.boeDate || ci.ciDate;
    if (!effDate || effDate < startDate || effDate > endDate) return false;
    if (portFilter !== 'ALL' && (ci.portCode || '').trim().toUpperCase() !== portFilter) return false;
    return true;
  });

  const boeRows: CustomsReturnBOEItem[] = [];
  const hsnMap = new Map<string, CustomsHSNSummaryRow>();

  let taxInvoiceValueINR = 0;
  let assessableValueINR = 0;
  let bcdINR = 0;
  let swsINR = 0;
  let igstItcINR = 0;
  let totalTaxINR = 0;
  let taxPaidCount = 0;
  let taxPendingCount = 0;

  for (const ci of periodCIs) {
    const comp = compMap.get(ci.companyId);
    const supp = suppMap.get(ci.supplierId);
    const tax = computeBOETaxTotals(ci);
    const sub = db.boeSubmissions.find(s => s.ciId === ci.id || s.boeNo === ci.boeNo);

    boeRows.push({
      ciId: ci.id,
      companyCode: comp?.code || '',
      supplierName: supp?.supplierName || '',
      boeNo: ci.boeNo,
      boeDate: ci.boeDate,
      ciNo: ci.ciNo,
      ciDate: ci.ciDate,
      portCode: ci.portCode || '-',
      currency: ci.currency,
      ciValueFC: ci.ciValueFC,
      taxInvoiceValueINR: tax.taxInvoiceValueINR,
      assessableValueINR: tax.assessableValueINR,
      bcdINR: tax.customsDutyINR,
      swsINR: tax.swsINR,
      igstINR: tax.igstINR,
      totalTaxINR: tax.totalTaxINR,
      taxPaidDate: ci.taxPaidDate || '',
      status: tax.status,
      idpmsStatus: sub?.idpmsStatus || 'Pending',
    });

    taxInvoiceValueINR += tax.taxInvoiceValueINR;
    assessableValueINR += tax.assessableValueINR;
    bcdINR += tax.customsDutyINR;
    swsINR += tax.swsINR;
    igstItcINR += tax.igstINR;
    totalTaxINR += tax.totalTaxINR;
    if (tax.status === 'Tax Paid') taxPaidCount += 1;
    else taxPendingCount += 1;

    // HSN attribution via linked shipment or PI lines
    const linkedShp = ci.shipmentId ? (db.shipments || []).find(s => s.id === ci.shipmentId) : undefined;
    const linkedPi = ci.linkedPiId ? db.proformaInvoices.find(p => p.id === ci.linkedPiId) : undefined;
    const itemSources: Array<{ hsnCode: string; description: string; uom: string; qty: number; amtFC: number }> = [];

    if (linkedShp && linkedShp.items.length > 0) {
      for (const si of linkedShp.items) {
        itemSources.push({
          hsnCode: si.hsnCode || 'UNCLASSIFIED',
          description: si.itemName,
          uom: si.uom,
          qty: Number(si.dispatchedQty || 0),
          amtFC: Number(si.amountFC || si.dispatchedQty * si.unitPriceFC),
        });
      }
    } else if (linkedPi && linkedPi.items && linkedPi.items.length > 0) {
      for (const piLine of linkedPi.items) {
        itemSources.push({
          hsnCode: piLine.hsnCode || 'UNCLASSIFIED',
          description: piLine.itemName,
          uom: piLine.uom,
          qty: Number(piLine.orderedQty || 0),
          amtFC: Number(piLine.amountFC || piLine.orderedQty * piLine.unitPriceFC),
        });
      }
    }

    const totalSrcFC = itemSources.reduce((s, x) => s + x.amtFC, 0);
    if (itemSources.length > 0 && totalSrcFC > 0) {
      for (const src of itemSources) {
        const share = src.amtFC / totalSrcFC;
        const prev = hsnMap.get(src.hsnCode);
        if (!prev) {
          hsnMap.set(src.hsnCode, {
            hsnCode: src.hsnCode,
            description: src.description,
            uom: src.uom,
            totalQty: round2(src.qty),
            assessableValueINR: round2(tax.assessableValueINR * share),
            bcdINR: round2(tax.customsDutyINR * share),
            swsINR: round2(tax.swsINR * share),
            igstINR: round2(tax.igstINR * share),
            totalTaxINR: round2(tax.totalTaxINR * share),
          });
        } else {
          prev.totalQty = round2(prev.totalQty + src.qty);
          prev.assessableValueINR = round2(prev.assessableValueINR + tax.assessableValueINR * share);
          prev.bcdINR = round2(prev.bcdINR + tax.customsDutyINR * share);
          prev.swsINR = round2(prev.swsINR + tax.swsINR * share);
          prev.igstINR = round2(prev.igstINR + tax.igstINR * share);
          prev.totalTaxINR = round2(prev.totalTaxINR + tax.totalTaxINR * share);
        }
      }
    } else {
      const fallbackHsn = 'UNCLASSIFIED';
      const prev = hsnMap.get(fallbackHsn);
      if (!prev) {
        hsnMap.set(fallbackHsn, {
          hsnCode: fallbackHsn,
          description: 'Direct CI Bills (No Item Line HSN)',
          uom: '-',
          totalQty: 0,
          assessableValueINR: round2(tax.assessableValueINR),
          bcdINR: round2(tax.customsDutyINR),
          swsINR: round2(tax.swsINR),
          igstINR: round2(tax.igstINR),
          totalTaxINR: round2(tax.totalTaxINR),
        });
      } else {
        prev.assessableValueINR = round2(prev.assessableValueINR + tax.assessableValueINR);
        prev.bcdINR = round2(prev.bcdINR + tax.customsDutyINR);
        prev.swsINR = round2(prev.swsINR + tax.swsINR);
        prev.igstINR = round2(prev.igstINR + tax.igstINR);
        prev.totalTaxINR = round2(prev.totalTaxINR + tax.totalTaxINR);
      }
    }
  }

  // Part B: Remittances & RBI IDPMS compliance
  const periodPayments = db.payments.filter(p => {
    if (companyId !== 'ALL' && p.companyId !== companyId) return false;
    if (p.paymentMode === 'LC' && p.lcStatus !== 'Paid') return false;
    return p.paymentDate >= startDate && p.paymentDate <= endDate;
  });

  const idpmsSettledCount = boeRows.filter(r => r.idpmsStatus === 'Settled' || r.idpmsStatus === 'Submitted').length;
  const idpmsPendingCount = boeRows.length - idpmsSettledCount;

  const advancesOver150Days: CustomsReturnAdvanceAlert[] = [];
  for (const chunk of engineResult.unappliedPayments) {
    if (chunk.remainingFC <= 0) continue;
    if (companyId !== 'ALL' && chunk.companyId !== companyId) continue;
    if (chunk.sourceType !== 'PAYMENT') continue;
    const ageDays = getDaysBetween(chunk.date, asOfDate);
    if (ageDays >= 150) {
      advancesOver150Days.push({
        paymentId: chunk.paymentId,
        companyCode: compMap.get(chunk.companyId)?.code || '',
        supplierName: suppMap.get(chunk.supplierId)?.supplierName || '',
        bankRef: chunk.bankRef || chunk.paymentId,
        paymentDate: chunk.date,
        currency: chunk.currency,
        remainingFC: chunk.remainingFC,
        ageDays,
        isBreach180: ageDays >= 180,
      });
    }
  }
  advancesOver150Days.sort((a, b) => b.ageDays - a.ageDays);

  // Part C: Upcoming planned customs duty
  const upcomingShipments = (db.shipments || [])
    .filter(s => {
      if (s.status === 'Received') return false;
      if (companyId !== 'ALL' && s.companyId !== companyId) return false;
      if (portFilter !== 'ALL' && (s.portCode || '').trim().toUpperCase() !== portFilter) return false;
      const dt = s.expectedDutyDate || s.etaPortDate || '';
      return !dt || dt >= startDate;
    })
    .sort((a, b) =>
      (a.expectedDutyDate || a.etaPortDate || '9999').localeCompare(b.expectedDutyDate || b.etaPortDate || '9999')
    );

  const upcomingDutyINR = round2(
    upcomingShipments.reduce((s, shp) => s + Number(shp.estimatedTotalDutyINR || 0), 0)
  );

  return {
    startDate,
    endDate,
    periodLabel: label,
    partA: {
      boeRows,
      hsnSummary: Array.from(hsnMap.values()),
      boeCount: boeRows.length,
      taxInvoiceValueINR: round2(taxInvoiceValueINR),
      assessableValueINR: round2(assessableValueINR),
      bcdINR: round2(bcdINR),
      swsINR: round2(swsINR),
      igstItcINR: round2(igstItcINR),
      totalTaxINR: round2(totalTaxINR),
      taxPaidCount,
      taxPendingCount,
    },
    partB: {
      remittanceCount: periodPayments.length,
      remittanceINR: round2(periodPayments.reduce((s, p) => s + Number(p.inrAmount || 0), 0)),
      idpmsSettledCount,
      idpmsPendingCount,
      advancesOver150Days,
      breach180Count: advancesOver150Days.filter(a => a.isBreach180).length,
    },
    partC: {
      upcomingShipments,
      upcomingDutyINR,
    },
  };
}

export interface IGCRForm3Row {
  lot: IGCRLot;
  companyCode: string;
  openingStock: number;
  usedDomestic18A: number;
  usedEndUse18B: number;
  usedExport18C: number;
  totalUsed18: number;
  reExported19: number;
  clearedOnDuty20: number;
  closingStockFactory21: number;
  periodDiffDutyINR: number;
  periodInterestINR: number;
  dueDate: string;
  daysRemaining: number;
  expiryStatus: 'Fully Utilized' | 'Expired' | 'Expiring Soon' | 'Active';
  igcr2Alert: boolean;
  activeDutyForegoneINR: number;
  consumptions: IGCRConsumption[];
}

export interface IGCRBondSummary {
  totalBondValueINR: number;
  activeDutyForegoneINR: number;
  availableBondINR: number;
  utilizationPct: number;
  igcr2ShortCount: number;
  expiringSoonCount: number;
  expiredCount: number;
}

export interface IGCRForm3Result {
  startDate: string;
  endDate: string;
  periodLabel: string;
  rows: IGCRForm3Row[];
  bondSummary: IGCRBondSummary;
}

/**
 * Generates ICEGATE Form IGCR-3 (In-House Factory Consumption Only — Columns 1..21)
 */
export function computeIGCRForm3(
  db: AppDatabase,
  periodType: 'monthly' | 'quarterly',
  year: number,
  periodIndex: number,
  companyId: string,
  asOfDate: string
): IGCRForm3Result {
  const { startDate, endDate, label } = getPeriodDateRange(periodType, year, periodIndex);
  const compMap = new Map(db.companies.map(c => [c.id, c]));

  const lots = (db.igcrLots || []).filter(lot => {
    if (companyId !== 'ALL' && lot.companyId !== companyId) return false;
    return !lot.clearanceDate || lot.clearanceDate <= endDate;
  });

  const allConsumptions = db.igcrConsumptions || [];
  const rows: IGCRForm3Row[] = [];

  let activeDutyForegoneTotal = 0;
  let igcr2ShortCount = 0;
  let expiringSoonCount = 0;
  let expiredCount = 0;

  for (const lot of lots) {
    const lotCons = allConsumptions.filter(c => c.lotId === lot.id);

    let usedDomestic18A = 0;
    let usedEndUse18B = 0;
    let usedExport18C = 0;
    let reExported19 = 0;
    let clearedOnDuty20 = 0;
    let periodDiffDutyINR = 0;
    let periodInterestINR = 0;

    let cumUsed = 0;
    let cumReExp = 0;
    let cumCleared = 0;
    let priorCons = 0;

    for (const c of lotCons) {
      const q = Number(c.qty || 0);
      if (c.date <= endDate) {
        if (c.type === 'RE_EXPORT') cumReExp += q;
        else if (c.type === 'CLEARED_ON_DUTY') cumCleared += q;
        else cumUsed += q;
      }

      if (c.date < startDate) {
        priorCons += q;
      } else if (c.date >= startDate && c.date <= endDate) {
        if (c.type === 'MANUFACTURE_DOMESTIC') usedDomestic18A += q;
        else if (c.type === 'END_USE_SUPPLY') usedEndUse18B += q;
        else if (c.type === 'MANUFACTURE_EXPORT') usedExport18C += q;
        else if (c.type === 'RE_EXPORT') reExported19 += q;
        else if (c.type === 'CLEARED_ON_DUTY') clearedOnDuty20 += q;

        periodDiffDutyINR += Number(c.differentialDutyPaidINR || 0);
        periodInterestINR += Number(c.interestPaidINR || 0);
      }
    }

    const totalUsed18 = round2(usedDomestic18A + usedEndUse18B + usedExport18C);
    const openingStock = round2(Math.max(0, Number(lot.qtyReceived || 0) - priorCons));
    const closingStockFactory21 = round2(
      Math.max(0, Number(lot.qtyReceived || 0) - cumUsed - cumReExp - cumCleared)
    );

    const dueDate = addMonthsISO(lot.clearanceDate || lot.boeDate, lot.utilizationMonths || 6);
    const daysRemaining = getDaysBetween(asOfDate, dueDate);

    let expiryStatus: IGCRForm3Row['expiryStatus'] = 'Active';
    if (closingStockFactory21 <= 0) {
      expiryStatus = 'Fully Utilized';
    } else if (daysRemaining < 0) {
      expiryStatus = 'Expired';
      expiredCount += 1;
    } else if (daysRemaining <= 60) {
      expiryStatus = 'Expiring Soon';
      expiringSoonCount += 1;
    }

    const igcr2Alert = Number(lot.qtyNotReceived || 0) > 0;
    if (igcr2Alert) igcr2ShortCount += 1;

    const baseQty = Number(lot.qtyReceived || 0) > 0 ? Number(lot.qtyReceived) : Number(lot.qtyImported || 0);
    const activeDutyForegoneINR =
      baseQty > 0 ? round2((closingStockFactory21 / baseQty) * Number(lot.totalDutyForegoneINR || 0)) : 0;

    activeDutyForegoneTotal = round2(activeDutyForegoneTotal + activeDutyForegoneINR);

    rows.push({
      lot,
      companyCode: compMap.get(lot.companyId)?.code || '',
      openingStock,
      usedDomestic18A: round2(usedDomestic18A),
      usedEndUse18B: round2(usedEndUse18B),
      usedExport18C: round2(usedExport18C),
      totalUsed18,
      reExported19: round2(reExported19),
      clearedOnDuty20: round2(clearedOnDuty20),
      closingStockFactory21,
      periodDiffDutyINR: round2(periodDiffDutyINR),
      periodInterestINR: round2(periodInterestINR),
      dueDate,
      daysRemaining,
      expiryStatus,
      igcr2Alert,
      activeDutyForegoneINR,
      consumptions: lotCons,
    });
  }

  const totalBondValueINR = round2(
    db.companies
      .filter(c => (companyId === 'ALL' ? c.active : c.id === companyId))
      .reduce((s, c) => s + Number(c.igcrBondValueINR || 0), 0)
  );
  const availableBondINR = round2(Math.max(0, totalBondValueINR - activeDutyForegoneTotal));
  const utilizationPct = totalBondValueINR > 0 ? round2((activeDutyForegoneTotal / totalBondValueINR) * 100) : 0;

  return {
    startDate,
    endDate,
    periodLabel: label,
    rows,
    bondSummary: {
      totalBondValueINR,
      activeDutyForegoneINR: activeDutyForegoneTotal,
      availableBondINR,
      utilizationPct,
      igcr2ShortCount,
      expiringSoonCount,
      expiredCount,
    },
  };
}
