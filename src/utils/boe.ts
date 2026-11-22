import { CommercialInvoice } from '../types';
import { round2 } from './formatters';

export type BOETaxStatus = 'BOE Pending' | 'Tax Paid' | 'Tax Pending';

export interface BOETaxTotals {
  taxInvoiceValueINR: number;
  assessableValueINR: number;
  customsDutyINR: number;
  swsINR: number;
  igstINR: number;
  totalTaxINR: number;
  isPendingBoe: boolean;
  status: BOETaxStatus;
}

/**
 * Computes consistent INR values, customs duty/SWS/IGST totals, and status for a Bill of Entry.
 */
export function computeBOETaxTotals(
  ci: Pick<
    CommercialInvoice,
    | 'boeNo'
    | 'purchaseINR'
    | 'taxInvoiceValueINR'
    | 'assessableValueINR'
    | 'customsDutyINR'
    | 'swsINR'
    | 'igstINR'
    | 'taxPaidDate'
  >
): BOETaxTotals {
  const taxInvoiceValueINR =
    ci.taxInvoiceValueINR && ci.taxInvoiceValueINR > 0
      ? round2(ci.taxInvoiceValueINR)
      : round2(ci.purchaseINR || 0);

  const assessableValueINR =
    ci.assessableValueINR && ci.assessableValueINR > 0
      ? round2(ci.assessableValueINR)
      : round2(ci.purchaseINR || 0);

  const customsDutyINR = round2(Number(ci.customsDutyINR || 0));
  const swsINR = round2(Number(ci.swsINR || 0));
  const igstINR = round2(Number(ci.igstINR || 0));
  const totalTaxINR = round2(customsDutyINR + swsINR + igstINR);

  const trimmedBoe = (ci.boeNo || '').trim().toUpperCase();
  const isPendingBoe = !trimmedBoe || trimmedBoe.startsWith('PENDING-');
  const status: BOETaxStatus = isPendingBoe ? 'BOE Pending' : ci.taxPaidDate ? 'Tax Paid' : 'Tax Pending';

  return {
    taxInvoiceValueINR,
    assessableValueINR,
    customsDutyINR,
    swsINR,
    igstINR,
    totalTaxINR,
    isPendingBoe,
    status,
  };
}

/**
 * Standard Indian Customs Social Welfare Surcharge helper (10% of Basic Customs Duty).
 */
export function suggestSWS(customsDutyINR: number): number {
  return round2(Math.max(0, customsDutyINR) * 0.1);
}

/**
 * Standard Indian Customs IGST helper: % on (Assessable Value + BCD + SWS).
 */
export function suggestIGST(
  assessableValueINR: number,
  customsDutyINR: number,
  swsINR: number,
  ratePct: number = 18
): number {
  return round2(Math.max(0, assessableValueINR + customsDutyINR + swsINR) * (ratePct / 100));
}
