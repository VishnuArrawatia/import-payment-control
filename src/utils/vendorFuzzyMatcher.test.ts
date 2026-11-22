import { describe, it, expect } from 'vitest';
import { findBestVendorMatch, stringSimilarity, levenshteinDistance } from './vendorFuzzyMatcher';
import { Supplier } from '../types';

const mockSuppliers: Supplier[] = [
  {
    id: 'supp-skr-v00044',
    companyId: 'comp-sakar',
    vendorCode: 'V00044',
    supplierName: 'BRIGHT UNIVERSE HK CO LTD',
    country: 'China',
    defaultCurrency: 'USD',
    active: true,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
  },
  {
    id: 'supp-skr-v00098',
    companyId: 'comp-sakar',
    vendorCode: 'V00098',
    supplierName: 'GLORIOUS LIGHTING TECHNOLOGY CO.LTD',
    country: 'China',
    defaultCurrency: 'USD',
    active: true,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
  },
  {
    id: 'supp-skr-v01002',
    companyId: 'comp-sakar',
    vendorCode: 'V01002',
    supplierName: 'Zhongshan Guohang Hardware Co.,Ltd',
    country: 'China',
    defaultCurrency: 'USD',
    active: true,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
  },
  {
    id: 'supp-svn-v00088',
    companyId: 'comp-svn',
    vendorCode: 'V00088',
    supplierName: 'SHENZHEN SUNSHINE OPTOELECTRONICS CO LTD',
    country: 'China',
    defaultCurrency: 'USD',
    active: true,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
  },
];

describe('vendorFuzzyMatcher', () => {
  it('handles exact vendor code match', () => {
    const res = findBestVendorMatch('V00044', mockSuppliers);
    expect(res.matched).toBe(true);
    expect(res.officialVendorCode).toBe('V00044');
    expect(res.officialSupplierName).toBe('BRIGHT UNIVERSE HK CO LTD');
  });

  it('normalizes lowercase or whitespace vendor codes (v00044 -> V00044)', () => {
    const res = findBestVendorMatch('  v00044  ', mockSuppliers);
    expect(res.matched).toBe(true);
    expect(res.officialVendorCode).toBe('V00044');
    expect(res.isAutoCorrected).toBe(true);
  });

  it('corrects shorthand numeric codes (e.g. "44", "v44", "v-00044" -> V00044)', () => {
    const res1 = findBestVendorMatch('v44', mockSuppliers);
    expect(res1.matched).toBe(true);
    expect(res1.officialVendorCode).toBe('V00044');

    const res2 = findBestVendorMatch('44', mockSuppliers);
    expect(res2.matched).toBe(true);
    expect(res2.officialVendorCode).toBe('V00044');

    const res3 = findBestVendorMatch('v-00044', mockSuppliers);
    expect(res3.matched).toBe(true);
    expect(res3.officialVendorCode).toBe('V00044');

    const res4 = findBestVendorMatch('V88', mockSuppliers);
    expect(res4.matched).toBe(true);
    expect(res4.officialVendorCode).toBe('V00088');
  });

  it('resolves when full supplier name is entered instead of code', () => {
    const res = findBestVendorMatch('BRIGHT UNIVERSE HK CO LTD', mockSuppliers);
    expect(res.matched).toBe(true);
    expect(res.officialVendorCode).toBe('V00044');
    expect(res.isAutoCorrected).toBe(true);
  });

  it('resolves partial name keyword ("Bright Universe" -> V00044)', () => {
    const res = findBestVendorMatch('Bright Universe', mockSuppliers);
    expect(res.matched).toBe(true);
    expect(res.officialVendorCode).toBe('V00044');
  });

  it('auto-corrects spelling typos in vendor names ("Bright Unverse" -> V00044)', () => {
    const res1 = findBestVendorMatch('Bright Unverse', mockSuppliers);
    expect(res1.matched).toBe(true);
    expect(res1.officialVendorCode).toBe('V00044');
    expect(res1.officialSupplierName).toBe('BRIGHT UNIVERSE HK CO LTD');

    const res2 = findBestVendorMatch('Glorious Lightng', mockSuppliers);
    expect(res2.matched).toBe(true);
    expect(res2.officialVendorCode).toBe('V00098');

    const res3 = findBestVendorMatch('Shenzhen Sunshin', mockSuppliers);
    expect(res3.matched).toBe(true);
    expect(res3.officialVendorCode).toBe('V00088');
  });

  it('provides suggestion for unrecognized vendor', () => {
    const res = findBestVendorMatch('NonExistentVendor123', mockSuppliers);
    expect(res.matched).toBe(false);
  });
});
