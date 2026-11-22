// Utility for Indian numbering format, currency formatting, dates and math

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
 * Format date from ISO string (YYYY-MM-DD) to Indian DD-MM-YYYY format
 */
export function formatDate(isoDate?: string): string {
  if (!isoDate) return '-';
  const parts = isoDate.split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `${d}-${m}-${y}`;
  }
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return isoDate;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

/**
 * Parse DD-MM-YYYY to YYYY-MM-DD
 */
export function parseDateToISO(dmy: string): string {
  if (!dmy) return '';
  if (dmy.includes('/')) {
    const parts = dmy.split('/');
    if (parts.length === 3) {
      if (parts[2].length === 4) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  const parts = dmy.split('-');
  if (parts.length === 3) {
    if (parts[0].length === 4) return dmy; // already ISO
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  return dmy;
}

/**
 * Format Indian numbering system (Lakh/Crore):
 * e.g. 12345678 -> 1,23,45,678
 */
export function formatIndianNumber(
  val: number | undefined | null,
  decimals: number = 0,
  showSign: boolean = false
): string {
  if (val === undefined || val === null || isNaN(val)) return '-';
  const isNegative = val < 0;
  const absVal = Math.abs(val);

  // Round to specified decimals
  const fixed = absVal.toFixed(decimals);
  const [intPart, decPart] = fixed.split('.');

  // Indian format regex for integer part: last 3 digits, then groups of 2
  let lastThree = intPart.substring(intPart.length - 3);
  const otherNumbers = intPart.substring(0, intPart.length - 3);
  if (otherNumbers !== '') {
    lastThree = ',' + lastThree;
  }
  const formattedInt = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree;

  const result = decPart !== undefined && decimals > 0 ? `${formattedInt}.${decPart}` : formattedInt;
  const sign = isNegative ? '-' : (showSign && val > 0 ? '+' : '');
  return `${sign}${result}`;
}

/**
 * Format Foreign Currency (FC) - typically 2 decimals
 */
export function formatFC(val: number | undefined | null, decimals: number = 2): string {
  if (val === undefined || val === null || isNaN(val)) return '0.00';
  return formatIndianNumber(val, decimals);
}

/**
 * Format INR with Indian grouping
 */
export function formatINR(val: number | undefined | null, decimals: number = 0, withPrefix: boolean = false): string {
  if (val === undefined || val === null || isNaN(val)) return withPrefix ? '₹ 0' : '0';
  const formatted = formatIndianNumber(val, decimals);
  return withPrefix ? `₹ ${formatted}` : formatted;
}

/**
 * Format Exchange Rate (typically 4 decimals or 2 depending on input)
 */
export function formatRate(val: number | undefined | null, decimals: number = 4): string {
  if (val === undefined || val === null || isNaN(val)) return '0.0000';
  return Number(val).toFixed(decimals);
}

/**
 * Round to 2 decimals accurately
 */
export function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Round to 4 decimals accurately
 */
export function round4(num: number): number {
  return Math.round((num + Number.EPSILON) * 10000) / 10000;
}
