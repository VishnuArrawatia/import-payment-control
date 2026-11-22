import { Supplier } from '../types';

export interface VendorMatchResult {
  matched: boolean;
  supplier?: Supplier;
  officialVendorCode?: string;
  officialSupplierName?: string;
  confidence: number; // 0 to 1
  isAutoCorrected: boolean;
  correctionReason?: string;
  suggestion?: Supplier;
}

/**
 * Standard Levenshtein Distance for typo tolerance
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // deletion
        dp[i][j - 1] + 1, // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return dp[m][n];
}

/**
 * Similarity ratio between 0 and 1
 */
export function stringSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0;

  const maxLen = Math.max(s1.length, s2.length);
  const distance = levenshteinDistance(s1, s2);
  return Math.max(0, 1 - distance / maxLen);
}

/**
 * Strip common corporate suffixes for accurate core name matching
 */
export function cleanCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(co\.?\s*ltd\.?|pvt\.?\s*ltd\.?|hk\s*co\.?\s*ltd\.?|limited|ltd|co|corp|inc|hk)\b/gi, '')
    .replace(/[^a-z0-9\s]/gi, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Extract numeric digits from a vendor code (e.g. 'V00044' -> 44)
 */
function extractNumber(code: string): number | null {
  const digits = code.replace(/\D/g, '');
  if (!digits) return null;
  const num = parseInt(digits, 10);
  return isNaN(num) ? null : num;
}

/**
 * Smart Vendor Matcher & Auto-Corrector
 * Takes raw input (which may be a vendor code, name, or contain typos/case errors)
 * and resolves it to the official Supplier in Masters.
 */
export function findBestVendorMatch(
  rawInput: string | undefined | null,
  suppliers: Supplier[]
): VendorMatchResult {
  if (!rawInput || !rawInput.trim()) {
    return { matched: false, confidence: 0, isAutoCorrected: false };
  }

  const clean = rawInput.trim();
  const upper = clean.toUpperCase();
  const lower = clean.toLowerCase();

  // 1. Exact match on Vendor Code
  const exactCode = suppliers.find(s => s.vendorCode.toUpperCase() === upper);
  if (exactCode) {
    const isDifferent = exactCode.vendorCode !== clean;
    return {
      matched: true,
      supplier: exactCode,
      officialVendorCode: exactCode.vendorCode,
      officialSupplierName: exactCode.supplierName,
      confidence: 1.0,
      isAutoCorrected: isDifferent,
      correctionReason: isDifferent ? 'Normalized vendor code casing' : undefined,
    };
  }

  // 2. Exact match on Supplier Name (case-insensitive)
  const exactName = suppliers.find(s => s.supplierName.toUpperCase() === upper);
  if (exactName) {
    return {
      matched: true,
      supplier: exactName,
      officialVendorCode: exactName.vendorCode,
      officialSupplierName: exactName.supplierName,
      confidence: 1.0,
      isAutoCorrected: true,
      correctionReason: `Resolved from supplier name "${exactName.supplierName}"`,
    };
  }

  // 3. Numeric Code Match (e.g. user typed '44', 'v44', 'V044', 'v-00044', 'v 00044')
  const inputNum = extractNumber(clean);
  if (inputNum !== null) {
    const numMatches = suppliers.filter(s => {
      const sNum = extractNumber(s.vendorCode);
      return sNum !== null && sNum === inputNum;
    });

    if (numMatches.length === 1) {
      const matched = numMatches[0];
      return {
        matched: true,
        supplier: matched,
        officialVendorCode: matched.vendorCode,
        officialSupplierName: matched.supplierName,
        confidence: 0.95,
        isAutoCorrected: true,
        correctionReason: `Auto-formatted code "${clean}" → ${matched.vendorCode}`,
      };
    }
  }

  // 4. Substring / Word Match on Supplier Name (e.g. 'Bright Universe' inside 'BRIGHT UNIVERSE HK CO LTD')
  const substringMatch = suppliers.find(s => {
    const sName = s.supplierName.toLowerCase();
    return sName.includes(lower) || (lower.length > 5 && lower.includes(sName));
  });

  if (substringMatch) {
    return {
      matched: true,
      supplier: substringMatch,
      officialVendorCode: substringMatch.vendorCode,
      officialSupplierName: substringMatch.supplierName,
      confidence: 0.9,
      isAutoCorrected: true,
      correctionReason: `Matched name keyword "${clean}" → ${substringMatch.vendorCode}`,
    };
  }

  // 5. Fuzzy Match on Supplier Name or Code (Typo tolerance like 'Bright Unverse', 'Zhongshan Guohang')
  let bestSupplier: Supplier | undefined;
  let highestScore = 0;
  const cleanInputCore = cleanCompanyName(clean);

  for (const s of suppliers) {
    const sCore = cleanCompanyName(s.supplierName);

    // Full core similarity
    const coreSim = stringSimilarity(cleanInputCore, sCore);
    // Direct string similarity
    const rawSim = stringSimilarity(clean, s.supplierName);
    // Code similarity
    const codeSim = stringSimilarity(clean, s.vendorCode);

    // Window / Prefix matching for multi-word company names
    let windowSim = 0;
    const sWords = sCore.split(' ');
    const inputWords = cleanInputCore.split(' ');
    if (sWords.length >= inputWords.length && inputWords.length >= 1) {
      for (let i = 0; i <= sWords.length - inputWords.length; i++) {
        const slice = sWords.slice(i, i + inputWords.length).join(' ');
        const sim = stringSimilarity(cleanInputCore, slice);
        if (sim > windowSim) windowSim = sim;
      }
    }

    const maxScore = Math.max(coreSim, rawSim, codeSim, windowSim);
    if (maxScore > highestScore) {
      highestScore = maxScore;
      bestSupplier = s;
    }
  }

  // Threshold for automatic correction (>= 0.65 similarity)
  if (bestSupplier && highestScore >= 0.65) {
    return {
      matched: true,
      supplier: bestSupplier,
      officialVendorCode: bestSupplier.vendorCode,
      officialSupplierName: bestSupplier.supplierName,
      confidence: highestScore,
      isAutoCorrected: true,
      correctionReason: `Fuzzy auto-corrected spelling typo in "${clean}" → ${bestSupplier.vendorCode} (${bestSupplier.supplierName})`,
    };
  }

  // If score is between 0.4 and 0.65, return as suggestion
  if (bestSupplier && highestScore >= 0.4) {
    return {
      matched: false,
      suggestion: bestSupplier,
      confidence: highestScore,
      isAutoCorrected: false,
      correctionReason: `Did you mean ${bestSupplier.vendorCode} - ${bestSupplier.supplierName}?`,
    };
  }

  return { matched: false, confidence: 0, isAutoCorrected: false };
}
