import { CommercialInvoice, CommercialInvoiceLandedCost, LandedCostItemBreakdown } from '../types';
import { round2, round4 } from './formatters';

export interface LandedCostInputItem {
  lineId?: string;
  itemCode: string;
  itemName: string;
  supplierItemCode?: string;
  qty: number;
  uom: string;
  unitPriceFC: number;
  amountFC: number;
  currency?: string;
  bcdRatePct?: number;
}

export interface LandedCostSummary {
  items: LandedCostItemBreakdown[];
  totalFobINR: number;
  totalBcdINR: number;
  totalSwsINR: number;
  totalNonCreditableDutyINR: number;
  totalFreightINR: number;
  totalInsuranceINR: number;
  totalChaINR: number;
  totalPortCfsINR: number;
  totalLocalTransportINR: number;
  totalOtherINR: number;
  grandTotalLandedINR: number;
  averageLandedMultiplier: number;
}

/**
 * Computes Indian Accounting & AS-2 compliant Landed Cost per item line:
 * - Loads FOB value at Customs BOE rate
 * - Loads Non-creditable BCD + SWS
 * - Excludes IGST (since IGST is 100% ITC creditable under GSTR-2B)
 * - Allocates Freight, Insurance, CHA clearance, Port/CFS handling, and Local Transport by value or quantity
 */
export function computeCommercialInvoiceLandedCost(
  ci: CommercialInvoice,
  items: LandedCostInputItem[],
  landedCostConfig?: CommercialInvoiceLandedCost
): LandedCostSummary {
  const config: CommercialInvoiceLandedCost = landedCostConfig || ci.landedCost || {
    ciId: ci.id,
    internationalFreightINR: 0,
    insuranceINR: 0,
    chaChargesINR: 0,
    portHandlingCfsINR: 0,
    localTransportINR: 0,
    otherChargesINR: 0,
    allocationMethod: 'value',
    updatedAt: new Date().toISOString(),
  };

  const exchangeRate = Number(ci.boeExchangeRate || 86.0);
  const totalQty = items.reduce((s, it) => s + Number(it.qty || 0), 0);
  const totalItemFC = items.reduce((s, it) => s + Number(it.amountFC || it.qty * it.unitPriceFC || 0), 0);
  const totalItemFobINR = round2(totalItemFC > 0 ? totalItemFC * exchangeRate : Number(ci.purchaseINR || ci.ciValueFC * exchangeRate));

  // Determine proportion of total BCD & SWS from CI if recorded
  const ciBcdINR = Number(ci.customsDutyINR || 0);
  const ciSwsINR = Number(ci.swsINR || round2(ciBcdINR * 0.1));

  const rows: LandedCostItemBreakdown[] = items.map((it, idx) => {
    const itemAmtFC = Number(it.amountFC || it.qty * it.unitPriceFC || 0);
    const itemFobINR = round2(itemAmtFC * exchangeRate);
    const weight =
      config.allocationMethod === 'quantity'
        ? totalQty > 0 ? it.qty / totalQty : 1 / Math.max(1, items.length)
        : totalItemFobINR > 0 ? itemFobINR / totalItemFobINR : 1 / Math.max(1, items.length);

    // If CI already has explicit customs duty, allocate it proportionally; else compute from bcdRatePct
    let bcdAmountINR = 0;
    let swsAmountINR = 0;
    if (ciBcdINR > 0) {
      bcdAmountINR = round2(ciBcdINR * weight);
      swsAmountINR = round2(ciSwsINR * weight);
    } else {
      const bcdPct = Number(it.bcdRatePct ?? 7.5);
      bcdAmountINR = round2((itemFobINR * bcdPct) / 100);
      swsAmountINR = round2(bcdAmountINR * 0.1);
    }

    const allocatedFreightINR = round2(Number(config.internationalFreightINR || 0) * weight);
    const allocatedInsuranceINR = round2(Number(config.insuranceINR || 0) * weight);
    const allocatedChaINR = round2(Number(config.chaChargesINR || 0) * weight);
    const allocatedPortCfsINR = round2(Number(config.portHandlingCfsINR || 0) * weight);
    const allocatedLocalTransportINR = round2(Number(config.localTransportINR || 0) * weight);
    const allocatedOtherINR = round2(Number(config.otherChargesINR || 0) * weight);

    const totalLandedCostINR = round2(
      itemFobINR +
      bcdAmountINR +
      swsAmountINR +
      allocatedFreightINR +
      allocatedInsuranceINR +
      allocatedChaINR +
      allocatedPortCfsINR +
      allocatedLocalTransportINR +
      allocatedOtherINR
    );

    const landedCostPerUnitINR = it.qty > 0 ? round2(totalLandedCostINR / it.qty) : totalLandedCostINR;
    const landedMultiplier = itemFobINR > 0 ? round4(totalLandedCostINR / itemFobINR) : 1;

    return {
      lineId: it.lineId || `LC-${idx + 1}`,
      itemCode: it.itemCode,
      itemName: it.itemName,
      supplierItemCode: it.supplierItemCode,
      qty: Number(it.qty || 0),
      uom: it.uom || 'PCS',
      unitPriceFC: Number(it.unitPriceFC || 0),
      currency: it.currency || ci.currency,
      fobAmountINR: itemFobINR,
      bcdAmountINR,
      swsAmountINR,
      allocatedFreightINR,
      allocatedInsuranceINR,
      allocatedChaINR,
      allocatedPortCfsINR,
      allocatedLocalTransportINR,
      allocatedOtherINR,
      totalLandedCostINR,
      landedCostPerUnitINR,
      landedMultiplier,
    };
  });

  const totalFobINR = round2(rows.reduce((s, r) => s + r.fobAmountINR, 0));
  const totalBcdINR = round2(rows.reduce((s, r) => s + r.bcdAmountINR, 0));
  const totalSwsINR = round2(rows.reduce((s, r) => s + r.swsAmountINR, 0));
  const totalNonCreditableDutyINR = round2(totalBcdINR + totalSwsINR);
  const totalFreightINR = Number(config.internationalFreightINR || 0);
  const totalInsuranceINR = Number(config.insuranceINR || 0);
  const totalChaINR = Number(config.chaChargesINR || 0);
  const totalPortCfsINR = Number(config.portHandlingCfsINR || 0);
  const totalLocalTransportINR = Number(config.localTransportINR || 0);
  const totalOtherINR = Number(config.otherChargesINR || 0);
  const grandTotalLandedINR = round2(
    totalFobINR +
    totalNonCreditableDutyINR +
    totalFreightINR +
    totalInsuranceINR +
    totalChaINR +
    totalPortCfsINR +
    totalLocalTransportINR +
    totalOtherINR
  );
  const averageLandedMultiplier = totalFobINR > 0 ? round4(grandTotalLandedINR / totalFobINR) : 1;

  return {
    items: rows,
    totalFobINR,
    totalBcdINR,
    totalSwsINR,
    totalNonCreditableDutyINR,
    totalFreightINR,
    totalInsuranceINR,
    totalChaINR,
    totalPortCfsINR,
    totalLocalTransportINR,
    totalOtherINR,
    grandTotalLandedINR,
    averageLandedMultiplier,
  };
}
