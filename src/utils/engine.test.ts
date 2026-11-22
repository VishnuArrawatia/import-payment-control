import { describe, it, expect } from 'vitest';
import { AppDatabase } from '../types';
import { computeAllocationsAndState, computeIDPMSAdvanceAlerts, computeContainerDetentionRisks } from './engine';
import { INITIAL_DATABASE } from '../data/seedData';
import { DEFAULT_USERS } from '../data/defaultUsers';
import { sha256, sha256Sync, verifyPassword, encryptAndSignData, decryptAndVerifyData } from './crypto';
import { computeBOETaxTotals, suggestSWS, suggestIGST } from './boe';
import {
  computeShipmentDutyEstimate,
  computeMaterialBalances,
  computeCustomsMonthlyReturn,
  computeIGCRForm3,
} from './purchaseEngine';
import { resolveSupplierItem } from './itemMapping';
import { computeCommercialInvoiceLandedCost } from './landedCost';
import { ROLE_PERMISSIONS } from '../types/auth';

describe('Acceptance Test - Section 12 Import Payment Control', () => {
  const baseDb: AppDatabase = {
    version: '1.0.0',
    lastUpdated: '2026-11-21T00:00:00.000Z',
    companies: [
      {
        id: 'comp-svn',
        code: 'SVN',
        fullName: 'SVN Opto Electronics Pvt Ltd',
        gstin: '27AABCS1234F1Z5',
        iec: '0307012345',
        active: true,
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
    ],
    bankAccounts: [
      {
        id: 'bank-hdfc',
        companyId: 'comp-svn',
        bankName: 'HDFC Bank',
        branch: 'Andheri East',
        accountNumber: '50200012345678',
        currency: 'INR',
        active: true,
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'bank-dbs',
        companyId: 'comp-svn',
        bankName: 'DBS Bank',
        branch: 'Nariman Point',
        accountNumber: '88100098765432',
        currency: 'INR',
        active: true,
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
    ],
    suppliers: [
      {
        id: 'supp-v00088',
        companyId: 'comp-svn',
        vendorCode: 'V00088',
        supplierName: 'Shenzhen Apex Optoelectronics Co., Ltd',
        country: 'China',
        defaultCurrency: 'USD',
        active: true,
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
    ],
    currencies: [
      { code: 'USD', name: 'US Dollar', active: true },
      { code: 'CNY', name: 'Chinese Yuan', active: true },
    ],
    monthEndRates: [],
    settings: {
      ageingBuckets: [30, 60, 90],
      ageingBaseDateForPayables: 'boeDate',
      revalueAdvancesAtMonthEnd: false,
      dnDefaultRecoveryMethod: 'Refund',
      financialYearStartMonth: 4,
      numberFormat: 'indian',
    },
    proformaInvoices: [
      {
        id: 'pi-101',
        companyId: 'comp-svn',
        supplierId: 'supp-v00088',
        currency: 'USD',
        piNo: 'PI-101',
        piDate: '2026-04-10',
        piValueFC: 10000,
        advancePercentage: 30,
        paymentTerms: 'Part advance + balance',
        creditDays: 30,
        isClosed: true,
        createdAt: '2026-04-10T10:00:00.000Z',
        updatedAt: '2026-07-05T10:00:00.000Z',
      },
    ],
    commercialInvoices: [
      {
        id: 'ci-1',
        companyId: 'comp-svn',
        supplierId: 'supp-v00088',
        currency: 'USD',
        ciNo: 'CI-1',
        ciDate: '2026-05-15',
        ciValueFC: 6000,
        linkedPiId: 'pi-101',
        blDate: '2026-05-15',
        boeNo: 'B-111',
        boeDate: '2026-05-20',
        portCode: 'INNSA1',
        boeExchangeRate: 86.0,
        assessableValueINR: 516000,
        customsDutyINR: 50000,
        purchaseINR: 516000,
        createdAt: '2026-05-15T10:00:00.000Z',
        updatedAt: '2026-05-15T10:00:00.000Z',
      },
      {
        id: 'ci-2',
        companyId: 'comp-svn',
        supplierId: 'supp-v00088',
        currency: 'USD',
        ciNo: 'CI-2',
        ciDate: '2026-07-05',
        ciValueFC: 3800,
        linkedPiId: 'pi-101',
        blDate: '2026-07-05',
        boeNo: 'B-112',
        boeDate: '2026-07-06',
        portCode: 'INNSA1',
        boeExchangeRate: 87.0,
        assessableValueINR: 330600,
        customsDutyINR: 35000,
        purchaseINR: 330600,
        createdAt: '2026-07-05T10:00:00.000Z',
        updatedAt: '2026-07-05T10:00:00.000Z',
      },
    ],
    payments: [
      {
        id: 'p1',
        companyId: 'comp-svn',
        bankAccountId: 'bank-hdfc',
        paymentDate: '2026-04-15',
        supplierId: 'supp-v00088',
        currency: 'USD',
        amountFC: 3000,
        actualExchangeRate: 85.0,
        inrAmount: 255000,
        paymentAgainst: 'PI',
        linkedPiId: 'pi-101',
        paymentMode: 'Advance',
        bankReferenceNo: 'HDFC-ADV-101',
        createdAt: '2026-04-15T10:00:00.000Z',
        updatedAt: '2026-04-15T10:00:00.000Z',
      },
      {
        id: 'p2',
        companyId: 'comp-svn',
        bankAccountId: 'bank-dbs',
        paymentDate: '2026-06-10',
        supplierId: 'supp-v00088',
        currency: 'USD',
        amountFC: 7000,
        actualExchangeRate: 86.5,
        inrAmount: 605500,
        paymentAgainst: 'PI',
        linkedPiId: 'pi-101',
        paymentMode: 'Balance',
        bankReferenceNo: 'DBS-BAL-101',
        createdAt: '2026-06-10T10:00:00.000Z',
        updatedAt: '2026-06-10T10:00:00.000Z',
      },
    ],
    debitNotes: [
      {
        id: 'dn-01',
        companyId: 'comp-svn',
        supplierId: 'supp-v00088',
        currency: 'USD',
        dnNo: 'DN-01',
        dnDate: '2026-07-10',
        linkedPiId: 'pi-101',
        linkedCiId: 'ci-2',
        amountFC: 200,
        rate: 86.5,
        inrAmount: 17300,
        reason: 'Short shipment',
        recoveryMethod: 'Refund',
        status: 'Fully Recovered',
        createdAt: '2026-07-10T10:00:00.000Z',
        updatedAt: '2026-07-10T10:00:00.000Z',
      },
    ],
    refundReceipts: [
      {
        id: 'r1',
        companyId: 'comp-svn',
        bankAccountId: 'bank-hdfc',
        date: '2026-07-20',
        supplierId: 'supp-v00088',
        currency: 'USD',
        amountFC: 200,
        actualExchangeRate: 88.0,
        inrAmount: 17600,
        againstDnId: 'dn-01',
        bankReferenceNo: 'REF-HDFC-999',
        createdAt: '2026-07-20T10:00:00.000Z',
        updatedAt: '2026-07-20T10:00:00.000Z',
      },
    ],
    adjustments: [],
    openingBalances: [],
    boeSubmissions: [],
    auditLogs: [],
  };

  it('calculates allocations, realized FX, and refund FX matching Section 12 exactly', () => {
    const res = computeAllocationsAndState(baseDb, '2026-07-31');

    expect(res.allocations.length).toBe(3);

    const allocP1_CI1 = res.allocations.find(a => a.paymentId === 'p1' && a.ciId === 'ci-1');
    expect(allocP1_CI1?.amountFC).toBe(3000);
    expect(allocP1_CI1?.realizedGainLossINR).toBe(3000);

    const allocP2_CI1 = res.allocations.find(a => a.paymentId === 'p2' && a.ciId === 'ci-1');
    expect(allocP2_CI1?.amountFC).toBe(3000);
    expect(allocP2_CI1?.realizedGainLossINR).toBe(-1500);

    const allocP2_CI2 = res.allocations.find(a => a.paymentId === 'p2' && a.ciId === 'ci-2');
    expect(allocP2_CI2?.amountFC).toBe(3800);
    expect(allocP2_CI2?.realizedGainLossINR).toBe(1900);

    expect(res.totalRealizedGainLossINR).toBe(3400);
    expect(res.totalRefundFXINR).toBe(300);
    expect(res.totalRealizedGainLossINR + res.totalRefundFXINR).toBe(3700);

    const totalPurchasesINR = 516000 + 330600;
    const netPaidINR = 255000 + 605500 - 17600;
    expect(totalPurchasesINR - netPaidINR).toBe(3700);

    expect(res.ciStates.get('ci-1')?.balanceFC).toBe(0);
    expect(res.ciStates.get('ci-2')?.balanceFC).toBe(0);

    const unappliedP2 = res.unappliedPayments.find(c => c.paymentId === 'p2');
    expect(unappliedP2?.remainingFC).toBe(0);
  });
});

describe('Sakar Real Ledger Full Audit up to 31-10-2026', () => {
  it('contains zero dummy transactions and passes double-entry FX reconciliation across all 6 suppliers', () => {
    expect(INITIAL_DATABASE.proformaInvoices.length).toBe(0);
    expect(INITIAL_DATABASE.monthEndRates.length).toBe(0);
    expect(INITIAL_DATABASE.debitNotes.length).toBe(0);
    expect(INITIAL_DATABASE.refundReceipts.length).toBe(0);

    // Sakar uses HDFC Bank strictly (no DBS Bank on Sakar)
    const sakarBanks = INITIAL_DATABASE.bankAccounts.filter(b => b.companyId === 'comp-sakar');
    expect(sakarBanks.length).toBe(1);
    expect(sakarBanks[0].bankName).toContain('HDFC Bank');

    const res = computeAllocationsAndState(INITIAL_DATABASE, '2026-10-31');

    // 1. Verify exact Dr/Cr classification on 01-04-2026 Sakar Opening Balances
    // Positive = Debit (Dr) Advance | Negative / (Brackets) = Credit (Cr) Payable
    expect(INITIAL_DATABASE.openingBalances.find(o => o.id === 'ob-skr-v00044')?.balanceType).toBe('Cr');
    expect(INITIAL_DATABASE.openingBalances.find(o => o.id === 'ob-skr-v00098')?.balanceType).toBe('Cr');
    expect(INITIAL_DATABASE.openingBalances.find(o => o.id === 'ob-skr-v00328')?.balanceType).toBe('Dr');
    expect(INITIAL_DATABASE.openingBalances.find(o => o.id === 'ob-skr-v00963')?.balanceType).toBe('Cr');
    expect(INITIAL_DATABASE.openingBalances.find(o => o.id === 'ob-skr-v01002')?.balanceType).toBe('Dr');
    expect(INITIAL_DATABASE.openingBalances.find(o => o.id === 'ob-skr-v01020')?.balanceType).toBe('Dr');

    // 2. All 3 Opening Payables (Cr): V00044 + V00098 + V00963 = 5,890.10 USD / 5,02,117 INR stay open
    for (const id of ['ob-skr-v00044', 'ob-skr-v00098', 'ob-skr-v00963']) {
      const ob = res.openingPayableStates.get(id);
      expect(ob?.status).toBe('Unpaid');
    }
    const openCrObFC = ['ob-skr-v00044', 'ob-skr-v00098', 'ob-skr-v00963'].reduce(
      (s, id) => s + (res.openingPayableStates.get(id)?.balanceFC || 0),
      0
    );
    const openCrObINR = ['ob-skr-v00044', 'ob-skr-v00098', 'ob-skr-v00963'].reduce(
      (s, id) => s + (res.openingPayableStates.get(id)?.balanceINR || 0),
      0
    );
    expect(openCrObFC).toBeCloseTo(5890.10, 2);
    expect(openCrObINR).toBeCloseTo(502117, 1);

    // 3. Opening Advance V00328 (MING YEUNG) stays open: 98.00 USD Dr / 6,933 INR
    const mingAdv = res.unappliedPayments.find(c => c.paymentId === 'OB-ob-skr-v00328');
    expect(mingAdv?.remainingFC).toBe(98.00);
    expect(mingAdv?.inrAmount).toBe(6933);

    // 4. Zhongshan Guohang (V01002): Opening Dr 1,323.90 + 2 payments settle CIs FIFO -> Open Cr = 429.69 USD, Realized FX = +26,152.28
    const ghOpenCis = Array.from(res.ciStates.values()).filter(s => s.ci.supplierId === 'supp-skr-v01002' && s.balanceFC > 0);
    const ghOpenFC = ghOpenCis.reduce((s, x) => s + x.balanceFC, 0);
    const ghOpenBookINR = ghOpenCis.reduce((s, x) => s + x.balanceINR, 0);
    const ghRealizedFX = res.allocations.filter(a => a.supplierId === 'supp-skr-v01002').reduce((s, a) => s + a.realizedGainLossINR, 0);
    expect(ghOpenFC).toBeCloseTo(429.69, 2);
    expect(ghOpenBookINR).toBeCloseTo(41271.72, 1);
    expect(Math.abs(ghRealizedFX - 26152.28)).toBeLessThan(0.20);

    // 5. FSP INNOVATIONS (V01020): Opening Dr 62,091.88 + 16 payments pay all 10 CIs -> Open Dr = 20,647.09 USD, Realized FX = +8,38,967.45
    const fspOpenCis = Array.from(res.ciStates.values()).filter(s => s.ci.supplierId === 'supp-skr-v01020' && s.balanceFC > 0);
    expect(fspOpenCis.length).toBe(0);
    const fspOpenAdv = res.unappliedPayments.filter(c => c.supplierId === 'supp-skr-v01020' && c.remainingFC > 0);
    const fspOpenAdvFC = fspOpenAdv.reduce((s, c) => s + c.remainingFC, 0);
    const fspOpenAdvINR = fspOpenAdv.reduce((s, c) => s + c.remainingFC * c.exactRate, 0);
    const fspRealizedFX = res.allocations.filter(a => a.supplierId === 'supp-skr-v01020').reduce((s, a) => s + a.realizedGainLossINR, 0);
    expect(fspOpenAdvFC).toBeCloseTo(20647.09, 2);
    expect(fspOpenAdvINR).toBeCloseTo(1975769.44, 1);
    expect(Math.abs(fspRealizedFX - 838967.45)).toBeLessThan(0.25);

    // 6. Total Open Payables (Cr) = 6,319.79 USD / 5,43,388.72 INR & Total Open Advances (Dr) = 20,745.09 USD / 19,82,702.44 INR
    const openAdvances = res.unappliedPayments.filter(c => c.remainingFC > 0);
    const totalAdvFC = openAdvances.reduce((s, c) => s + c.remainingFC, 0);
    const totalAdvINR = openAdvances.reduce((s, c) => s + c.remainingFC * c.exactRate, 0);
    expect(totalAdvFC).toBeCloseTo(20745.09, 2);
    expect(totalAdvINR).toBeCloseTo(1982702.44, 1);

    // 7. Double-Entry Accounting Identity Proof across ENTIRE company Sakar:
    // (GrossCrINR - GrossDrINR) - (OpenCrBookINR - OpenDrBookINR) === TotalRealizedFX
    const grossCrINR =
      INITIAL_DATABASE.openingBalances.filter(o => o.balanceType === 'Cr').reduce((s, o) => s + o.amountINR, 0) +
      INITIAL_DATABASE.commercialInvoices.reduce((s, c) => s + c.purchaseINR, 0);
    const grossDrINR =
      INITIAL_DATABASE.openingBalances.filter(o => o.balanceType === 'Dr').reduce((s, o) => s + o.amountINR, 0) +
      INITIAL_DATABASE.payments.reduce((s, p) => s + p.inrAmount, 0);

    const openCrBookINR =
      Array.from(res.ciStates.values()).reduce((s, c) => s + c.balanceINR, 0) +
      Array.from(res.openingPayableStates.values()).reduce((s, o) => s + o.balanceINR, 0);
    const openDrBookINR = totalAdvINR;

    const impliedFXFromLedger = (grossCrINR - grossDrINR) - (openCrBookINR - openDrBookINR);
    expect(Math.abs(impliedFXFromLedger - res.totalRealizedGainLossINR)).toBeLessThan(0.30);
    expect(Math.abs(res.totalRealizedGainLossINR - 865119.73)).toBeLessThan(0.30);
  });
});

describe('PI Advance Isolation Guard', () => {
  it('never steals an unapplied PI-1 advance to settle an unlinked or PI-2 CI', () => {
    const db: AppDatabase = {
      ...INITIAL_DATABASE,
      openingBalances: [],
      commercialInvoices: [
        {
          id: 'ci-pi2',
          companyId: 'comp-sakar',
          supplierId: 'supp-skr-v01020',
          currency: 'USD',
          ciNo: 'CI-PI2',
          ciDate: '2026-06-01',
          ciValueFC: 5000,
          linkedPiId: 'pi-2',
          boeNo: 'BOE-2',
          boeDate: '2026-06-01',
          portCode: 'INNSA1',
          boeExchangeRate: 95,
          assessableValueINR: 475000,
          customsDutyINR: 0,
          purchaseINR: 475000,
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
        {
          id: 'ci-unlinked',
          companyId: 'comp-sakar',
          supplierId: 'supp-skr-v01020',
          currency: 'USD',
          ciNo: 'CI-FREE',
          ciDate: '2026-06-02',
          ciValueFC: 5000,
          linkedPiId: '',
          boeNo: 'BOE-FREE',
          boeDate: '2026-06-02',
          portCode: 'INNSA1',
          boeExchangeRate: 95,
          assessableValueINR: 475000,
          customsDutyINR: 0,
          purchaseINR: 475000,
          createdAt: '2026-06-02T00:00:00.000Z',
          updatedAt: '2026-06-02T00:00:00.000Z',
        },
      ],
      proformaInvoices: [
        {
          id: 'pi-1',
          companyId: 'comp-sakar',
          supplierId: 'supp-skr-v01020',
          currency: 'USD',
          piNo: 'PI-1',
          piDate: '2026-05-01',
          piValueFC: 5000,
          advancePercentage: 100,
          paymentTerms: 'Advance',
          creditDays: 0,
          isClosed: false,
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
        {
          id: 'pi-2',
          companyId: 'comp-sakar',
          supplierId: 'supp-skr-v01020',
          currency: 'USD',
          piNo: 'PI-2',
          piDate: '2026-05-02',
          piValueFC: 5000,
          advancePercentage: 100,
          paymentTerms: 'Advance',
          creditDays: 0,
          isClosed: false,
          createdAt: '2026-05-02T00:00:00.000Z',
          updatedAt: '2026-05-02T00:00:00.000Z',
        },
      ],
      payments: [
        {
          id: 'pay-pi1',
          companyId: 'comp-sakar',
          bankAccountId: 'bank-hdfc-sakar',
          paymentDate: '2026-05-05',
          supplierId: 'supp-skr-v01020',
          currency: 'USD',
          amountFC: 5000,
          actualExchangeRate: 94,
          inrAmount: 470000,
          paymentAgainst: 'PI',
          linkedPiId: 'pi-1',
          paymentMode: 'Advance',
          bankReferenceNo: 'REF-PI1',
          createdAt: '2026-05-05T00:00:00.000Z',
          updatedAt: '2026-05-05T00:00:00.000Z',
        },
      ],
    };

    const res = computeAllocationsAndState(db, '2026-07-01');
    expect(res.allocations.length).toBe(0);
    expect(res.ciStates.get('ci-pi2')?.balanceFC).toBe(5000);
    expect(res.ciStates.get('ci-unlinked')?.balanceFC).toBe(5000);
    expect(res.piStates.get('pi-1')?.unappliedAdvanceFC).toBe(5000);
  });
});

describe('Crypto & Security Audit', () => {
  it('matches NIST FIPS 180-4 & WebCrypto SHA-256 exactly and verifies all 5 hashed accounts + tamper detection', async () => {
    // Official NIST FIPS 180-4 SHA-256 test vector for "abc"
    expect(sha256Sync('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const sample = 'a1b2c3d4e5f60718:HelloWorld:IPC_SECURE_SALT_2026';
    expect(sha256Sync(sample)).toBe(await sha256(sample));

    const creds: Array<[string, string]> = [
      ['admin', 'Admin@123456#'],
      ['management', 'Mgmt@123456#'],
      ['executor1', 'Exec1@123456#'],
      ['executor2', 'Exec2@123456#'],
      ['executor3', 'Exec3@123456#'],
    ];
    for (const [uname, pass] of creds) {
      const user = DEFAULT_USERS.find(u => u.username === uname)!;
      expect(user).toBeDefined();
      expect(await verifyPassword(pass, user.salt, user.passwordHash)).toBe(true);
      expect(await verifyPassword(pass + 'wrong', user.salt, user.passwordHash)).toBe(false);
    }

    const signed = await encryptAndSignData({ hello: 'Sakar ₹1,00,000', num: 123 });
    const ok = await decryptAndVerifyData(signed);
    expect(ok.success).toBe(true);
    expect(ok.data.num).toBe(123);

    // Tamper the signed JSON checksum
    const tampered = signed.replace(/"_integrityChecksum": "([a-f0-9])/, '"_integrityChecksum": "f');
    const bad = await decryptAndVerifyData(tampered);
    expect(bad.success).toBe(false);
    expect(bad.error).toContain('TAMPER_DETECTED');
  });
});

describe('Multi-PI CI Split & Traceability', () => {
  it('allocates multiple PI advances against a single split CI via linkedPiSplits and preserves PI-CI-BOE-Payment linkage', () => {
    const db: AppDatabase = {
      ...INITIAL_DATABASE,
      openingBalances: [],
      commercialInvoices: [
        {
          id: 'ci-split-1',
          companyId: 'comp-sakar',
          supplierId: 'supp-skr-v01020',
          currency: 'USD',
          ciNo: 'CI-SPLIT-1',
          ciDate: '2026-06-15',
          ciValueFC: 5000,
          linkedPiId: 'pi-a',
          linkedPiSplits: [
            { piId: 'pi-a', amountFC: 3000 },
            { piId: 'pi-b', amountFC: 2000 },
          ],
          boeNo: 'BOE-SPLIT-1',
          boeDate: '2026-06-16',
          portCode: 'INNSA1',
          boeExchangeRate: 96,
          assessableValueINR: 480000,
          customsDutyINR: 0,
          purchaseINR: 480000,
          createdAt: '2026-06-15T00:00:00.000Z',
          updatedAt: '2026-06-15T00:00:00.000Z',
        },
      ],
      proformaInvoices: [
        {
          id: 'pi-a',
          companyId: 'comp-sakar',
          supplierId: 'supp-skr-v01020',
          currency: 'USD',
          piNo: 'PI-A',
          piDate: '2026-05-01',
          piValueFC: 3000,
          advancePercentage: 100,
          paymentTerms: 'Advance',
          creditDays: 0,
          isClosed: false,
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
        {
          id: 'pi-b',
          companyId: 'comp-sakar',
          supplierId: 'supp-skr-v01020',
          currency: 'USD',
          piNo: 'PI-B',
          piDate: '2026-05-10',
          piValueFC: 2000,
          advancePercentage: 100,
          paymentTerms: 'Advance',
          creditDays: 0,
          isClosed: false,
          createdAt: '2026-05-10T00:00:00.000Z',
          updatedAt: '2026-05-10T00:00:00.000Z',
        },
      ],
      payments: [
        {
          id: 'pay-a',
          companyId: 'comp-sakar',
          bankAccountId: 'bank-hdfc-sakar',
          paymentDate: '2026-05-02',
          supplierId: 'supp-skr-v01020',
          currency: 'USD',
          amountFC: 3000,
          actualExchangeRate: 94,
          inrAmount: 282000,
          paymentAgainst: 'PI',
          linkedPiId: 'pi-a',
          paymentMode: 'Full advance',
          bankReferenceNo: 'HDFC-SPLIT-A',
          createdAt: '2026-05-02T00:00:00.000Z',
          updatedAt: '2026-05-02T00:00:00.000Z',
        },
        {
          id: 'pay-b',
          companyId: 'comp-sakar',
          bankAccountId: 'bank-hdfc-sakar',
          paymentDate: '2026-05-11',
          supplierId: 'supp-skr-v01020',
          currency: 'USD',
          amountFC: 2000,
          actualExchangeRate: 95,
          inrAmount: 190000,
          paymentAgainst: 'PI',
          linkedPiId: 'pi-b',
          paymentMode: 'Full advance',
          bankReferenceNo: 'HDFC-SPLIT-B',
          createdAt: '2026-05-11T00:00:00.000Z',
          updatedAt: '2026-05-11T00:00:00.000Z',
        },
      ],
      debitNotes: [],
      refundReceipts: [],
      adjustments: [],
      monthEndRates: [],
      boeSubmissions: [],
      auditLogs: [],
    };

    const res = computeAllocationsAndState(db, '2026-07-01');
    const ciState = res.ciStates.get('ci-split-1');
    expect(ciState?.balanceFC).toBe(0);
    expect(ciState?.status).toBe('Fully Paid');
    expect(res.allocations.length).toBe(2);

    const allocA = res.allocations.find(a => a.paymentId === 'pay-a');
    const allocB = res.allocations.find(a => a.paymentId === 'pay-b');
    expect(allocA).toMatchObject({ piId: 'pi-a', ciId: 'ci-split-1', boeNo: 'BOE-SPLIT-1', amountFC: 3000 });
    expect(allocB).toMatchObject({ piId: 'pi-b', ciId: 'ci-split-1', boeNo: 'BOE-SPLIT-1', amountFC: 2000 });
    expect(res.totalRealizedGainLossINR).toBeCloseTo(3000 * (96 - 94) + 2000 * (96 - 95), 2);
    expect(res.piStates.get('pi-a')?.unappliedAdvanceFC).toBe(0);
    expect(res.piStates.get('pi-b')?.unappliedAdvanceFC).toBe(0);
  });
});

describe('Bill of Entry (BOE) Register Tax Calculations', () => {
  it('computes Tax Invoice Value, Assessable Value, BCD, SWS (10%), IGST (18%), Total Tax, and Status accurately', () => {
    // 1. Auto-fallback of Tax Invoice Value & Assessable Value to purchaseINR when omitted/zero, with PENDING BOE status
    const pendingRes = computeBOETaxTotals({
      boeNo: 'PENDING-01',
      purchaseINR: 1000000,
      assessableValueINR: 0,
      customsDutyINR: 0,
    });
    expect(pendingRes.taxInvoiceValueINR).toBe(1000000);
    expect(pendingRes.assessableValueINR).toBe(1000000);
    expect(pendingRes.isPendingBoe).toBe(true);
    expect(pendingRes.status).toBe('BOE Pending');

    // 2. Duty / SWS / IGST helpers
    const sws = suggestSWS(100000);
    expect(sws).toBe(10000);
    const igst = suggestIGST(1000000, 100000, sws, 18);
    expect(igst).toBe(199800);

    // 3. Tax Pending (real BOE No without taxPaidDate) vs Tax Paid (with taxPaidDate & explicit Tax Invoice override)
    const taxPendingRes = computeBOETaxTotals({
      boeNo: '8845120',
      purchaseINR: 995000,
      taxInvoiceValueINR: 1005000,
      assessableValueINR: 1000000,
      customsDutyINR: 100000,
      swsINR: sws,
      igstINR: igst,
    });
    expect(taxPendingRes.taxInvoiceValueINR).toBe(1005000);
    expect(taxPendingRes.totalTaxINR).toBe(309800);
    expect(taxPendingRes.isPendingBoe).toBe(false);
    expect(taxPendingRes.status).toBe('Tax Pending');

    const taxPaidRes = computeBOETaxTotals({
      boeNo: '8845120',
      purchaseINR: 995000,
      taxInvoiceValueINR: 1005000,
      assessableValueINR: 1000000,
      customsDutyINR: 100000,
      swsINR: sws,
      igstINR: igst,
      taxPaidDate: '2026-07-15',
    });
    expect(taxPaidRes.status).toBe('Tax Paid');
    expect(taxPaidRes.totalTaxINR).toBe(309800);
  });
});

describe('Purchase Desk RBAC, Shipment Duty, Customs Monthly Return & In-House IGCR Form IGCR-3', () => {
  it('verifies purchase1 & purchase2 hashed credentials and strict RBAC finance isolation', async () => {
    const p1 = DEFAULT_USERS.find(u => u.username === 'purchase1')!;
    const p2 = DEFAULT_USERS.find(u => u.username === 'purchase2')!;
    expect(p1).toBeDefined();
    expect(p2).toBeDefined();
    expect(p1.role).toBe('purchase');
    expect(p2.role).toBe('purchase');
    expect(await verifyPassword('Purch1@123456#', p1.salt, p1.passwordHash)).toBe(true);
    expect(await verifyPassword('Purch2@123456#', p2.salt, p2.passwordHash)).toBe(true);
    expect(await verifyPassword('WrongPass', p1.salt, p1.passwordHash)).toBe(false);

    expect(ROLE_PERMISSIONS.purchase.canViewFinance).toBe(false);
    expect(ROLE_PERMISSIONS.purchase.canRecordPayment).toBe(false);
    expect(ROLE_PERMISSIONS.purchase.canViewPurchase).toBe(true);
    expect(ROLE_PERMISSIONS.purchase.canManagePurchase).toBe(true);
    expect(ROLE_PERMISSIONS.purchase.canCreatePI).toBe(true);
  });

  it('computes shipment duty estimates, PI/Party balances, 7d/15d/30d duty cash-flow, Customs Return & Form IGCR-3', () => {
    // 1. Duty Estimate: Normal BCD vs Concessional IGCR BCD
    const est = computeShipmentDutyEstimate(
      [
        {
          lineId: 'l1',
          itemCode: 'DRV-1',
          itemName: 'LED Driver IC',
          hsnCode: '85423900',
          uom: 'PCS',
          dispatchedQty: 1000,
          unitPriceFC: 10,
          amountFC: 10000,
          bcdRatePct: 10,
          igstRatePct: 18,
          igcrEligible: true,
          igcrBcdRatePct: 0,
          receivedQty: 0,
          shortQty: 0,
        },
        {
          lineId: 'l2',
          itemCode: 'HSG-1',
          itemName: 'Aluminum Housing',
          hsnCode: '76169990',
          uom: 'PCS',
          dispatchedQty: 500,
          unitPriceFC: 10,
          amountFC: 5000,
          bcdRatePct: 10,
          igstRatePct: 18,
          igcrEligible: false,
          igcrBcdRatePct: 0,
          receivedQty: 0,
          shortQty: 0,
        },
      ],
      100
    );
    expect(est.assessableINR).toBe(1500000);
    // l1 BCD = 0 (IGCR 0%); l2 BCD = 500,000 * 10% = 50,000; SWS = 5,000
    expect(est.bcdINR).toBe(50000);
    expect(est.swsINR).toBe(5000);
    // l1 IGST = 1,000,000 * 18% = 180,000; l2 IGST = 555,000 * 18% = 99,900
    expect(est.igstINR).toBe(279900);
    expect(est.totalDutyINR).toBe(334900);
    // Duty foregone on l1: 1,000,000 * 10% * 1.1 = 110,000
    expect(est.dutyForegoneINR).toBe(110000);

    // 2. PI-wise & Party-wise material balance + 7d/15d/30d duty radar + Customs Return + IGCR-3
    const testDb: AppDatabase = {
      ...INITIAL_DATABASE,
      companies: [
        {
          ...INITIAL_DATABASE.companies[0],
          igcrIIN: 'IIN-SAKAR-01',
          igcrBondNo: 'BOND-2026-01',
          igcrBondValueINR: 5000000,
        },
      ],
      proformaInvoices: [
        {
          id: 'pi-p1',
          companyId: 'comp-sakar',
          supplierId: 'supp-skr-v01020',
          currency: 'USD',
          piNo: 'PI-PURCH-01',
          piDate: '2026-07-01',
          piValueFC: 15000,
          advancePercentage: 30,
          paymentTerms: 'Part advance + balance',
          creditDays: 30,
          isClosed: false,
          items: [
            {
              lineId: 'pil-1',
              itemCode: 'DRV-1',
              itemName: 'LED Driver IC',
              hsnCode: '85423900',
              uom: 'PCS',
              orderedQty: 1000,
              unitPriceFC: 10,
              amountFC: 10000,
              bcdRatePct: 10,
              igstRatePct: 18,
              igcrEligible: true,
              igcrBcdRatePct: 0,
            },
            {
              lineId: 'pil-2',
              itemCode: 'HSG-1',
              itemName: 'Aluminum Housing',
              hsnCode: '76169990',
              uom: 'PCS',
              orderedQty: 500,
              unitPriceFC: 10,
              amountFC: 5000,
              bcdRatePct: 10,
              igstRatePct: 18,
              igcrEligible: false,
              igcrBcdRatePct: 0,
            },
          ],
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      ],
      shipments: [
        {
          id: 'shp-1',
          companyId: 'comp-sakar',
          supplierId: 'supp-skr-v01020',
          piId: 'pi-p1',
          currency: 'USD',
          shipmentRefNo: 'SHP-01',
          mode: 'Sea',
          dispatchDate: '2026-07-02',
          etaPortDate: '2026-07-10',
          expectedDutyDate: '2026-07-12',
          portCode: 'INNSA1',
          estimatedExchangeRate: 100,
          estimatedAssessableINR: 600000,
          estimatedBcdINR: 0,
          estimatedSwsINR: 0,
          estimatedIgstINR: 108000,
          estimatedTotalDutyINR: 108000,
          status: 'Received',
          actualReceiptDate: '2026-07-14',
          items: [
            {
              lineId: 'shpi-1',
              piLineId: 'pil-1',
              itemCode: 'DRV-1',
              itemName: 'LED Driver IC',
              hsnCode: '85423900',
              uom: 'PCS',
              dispatchedQty: 600,
              unitPriceFC: 10,
              amountFC: 6000,
              bcdRatePct: 10,
              igstRatePct: 18,
              igcrEligible: true,
              igcrBcdRatePct: 0,
              receivedQty: 600,
              shortQty: 0,
            },
          ],
          createdAt: '2026-07-02T00:00:00.000Z',
          updatedAt: '2026-07-14T00:00:00.000Z',
        },
        {
          id: 'shp-2',
          companyId: 'comp-sakar',
          supplierId: 'supp-skr-v01020',
          piId: 'pi-p1',
          currency: 'USD',
          shipmentRefNo: 'SHP-02',
          mode: 'Air',
          dispatchDate: '2026-07-14',
          etaPortDate: '2026-07-18',
          expectedDutyDate: '2026-07-20',
          portCode: 'INNSA1',
          estimatedExchangeRate: 100,
          estimatedAssessableINR: 500000,
          estimatedBcdINR: 50000,
          estimatedSwsINR: 5000,
          estimatedIgstINR: 99900,
          estimatedTotalDutyINR: 154900,
          status: 'Dispatched',
          items: [
            {
              lineId: 'shpi-2',
              piLineId: 'pil-2',
              itemCode: 'HSG-1',
              itemName: 'Aluminum Housing',
              hsnCode: '76169990',
              uom: 'PCS',
              dispatchedQty: 500,
              unitPriceFC: 10,
              amountFC: 5000,
              bcdRatePct: 10,
              igstRatePct: 18,
              igcrEligible: false,
              igcrBcdRatePct: 0,
              receivedQty: 0,
              shortQty: 0,
            },
          ],
          createdAt: '2026-07-14T00:00:00.000Z',
          updatedAt: '2026-07-14T00:00:00.000Z',
        },
      ],
      igcrLots: [
        {
          id: 'lot-1',
          companyId: 'comp-sakar',
          boeNo: '8845120',
          boeDate: '2026-07-10',
          portCode: 'INNSA1',
          invoiceNo: 'CI-101',
          invoiceSerialNo: '1',
          itemSerialNo: '1',
          itemCode: 'DRV-1',
          itemDescription: 'LED Driver IC',
          hsnCode: '85423900',
          uom: 'PCS',
          specifiedPurpose: 'Mfg of LED Lights',
          qtyImported: 600,
          clearanceDate: '2026-07-10',
          assessableValueINR: 600000,
          normalBcdRatePct: 10,
          concessionalBcdRatePct: 0,
          bcdForegoneINR: 60000,
          otherDutyForegoneINR: 6000,
          igstForegoneINR: 0,
          cessForegoneINR: 0,
          totalDutyForegoneINR: 66000,
          qtyReceived: 600,
          receiptDate: '2026-07-14',
          qtyNotReceived: 0,
          utilizationMonths: 6,
          createdAt: '2026-07-14T00:00:00.000Z',
          updatedAt: '2026-07-14T00:00:00.000Z',
        },
      ],
      igcrConsumptions: [
        {
          id: 'cons-1',
          companyId: 'comp-sakar',
          lotId: 'lot-1',
          date: '2026-07-20',
          type: 'MANUFACTURE_DOMESTIC',
          qty: 200,
          documentNo: 'BATCH-1',
          createdAt: '2026-07-20T00:00:00.000Z',
          updatedAt: '2026-07-20T00:00:00.000Z',
        },
        {
          id: 'cons-2',
          companyId: 'comp-sakar',
          lotId: 'lot-1',
          date: '2026-08-05',
          type: 'MANUFACTURE_EXPORT',
          qty: 100,
          documentNo: 'EXP-1',
          createdAt: '2026-08-05T00:00:00.000Z',
          updatedAt: '2026-08-05T00:00:00.000Z',
        },
      ],
    };

    const balances = computeMaterialBalances(testDb, 'comp-sakar', '2026-07-15');
    expect(balances.piBalances[0].orderedQty).toBe(1500);
    expect(balances.piBalances[0].receivedQty).toBe(600);
    expect(balances.piBalances[0].inTransitQty).toBe(500);
    expect(balances.piBalances[0].balancePendingQty).toBe(900); // 400 DRV-1 + 500 HSG-1 in transit
    expect(balances.dutyCashflow.next7DaysINR).toBe(154900);
    expect(balances.partyBalances[0].balancePendingFC).toBe(9000);

    // 3. Customs Monthly Return (July 2026 on Sakar seed DB + shipments)
    const engineRes = computeAllocationsAndState(testDb, '2026-10-31');
    const monthlyRet = computeCustomsMonthlyReturn(
      testDb,
      engineRes,
      'monthly',
      2026,
      7,
      'comp-sakar',
      'ALL',
      '2026-10-31'
    );
    expect(monthlyRet.partA.boeCount).toBeGreaterThan(0);
    expect(monthlyRet.partC.upcomingDutyINR).toBe(154900);
    // 180-day alert check on old opening advance or July payments
    expect(monthlyRet.startDate).toBe('2026-07-01');
    expect(monthlyRet.endDate).toBe('2026-07-31');

    // 4. Form IGCR-3 Quarterly (Q2 Jul-Sep 2026) & Monthly (July 2026)
    const igcrQ2 = computeIGCRForm3(testDb, 'quarterly', 2026, 2, 'comp-sakar', '2026-12-01');
    expect(igcrQ2.rows.length).toBe(1);
    expect(igcrQ2.rows[0].usedDomestic18A).toBe(200);
    expect(igcrQ2.rows[0].usedExport18C).toBe(100);
    expect(igcrQ2.rows[0].totalUsed18).toBe(300);
    expect(igcrQ2.rows[0].closingStockFactory21).toBe(300);
    expect(igcrQ2.rows[0].expiryStatus).toBe('Expiring Soon'); // 2026-07-10 + 6m = 2027-01-10 -> 40 days from 2026-12-01
    expect(igcrQ2.bondSummary.activeDutyForegoneINR).toBe(33000); // 300/600 * 66000
    expect(igcrQ2.bondSummary.availableBondINR).toBe(4967000);
  });

  it('supports dual Item Code & Name: As per Our Book/SAP and As per Supplier', () => {
    // 1. Test helper resolution
    const sampleItem = {
      supplierMappings: [
        { supplierId: 'supp-skr-v01020', supplierItemCode: 'FS-24W-CC-V2', supplierItemName: '24W LED Power Supply Unit' },
        { supplierId: 'supp-skr-v00963', supplierItemCode: 'ZS-DRV24-67', supplierItemName: 'Waterproof LED Driver 24W' },
      ],
    };

    const resolvedFSP = resolveSupplierItem(sampleItem, 'supp-skr-v01020');
    expect(resolvedFSP.supplierItemCode).toBe('FS-24W-CC-V2');
    expect(resolvedFSP.supplierItemName).toBe('24W LED Power Supply Unit');

    const resolvedFoso = resolveSupplierItem(sampleItem, 'supp-skr-v00963');
    expect(resolvedFoso.supplierItemCode).toBe('ZS-DRV24-67');

    const resolvedUnknown = resolveSupplierItem(sampleItem, 'supp-unknown');
    expect(resolvedUnknown.supplierItemCode).toBe('');
    expect(resolvedUnknown.supplierItemName).toBe('');

    // 2. Material Balances propagate both SAP Item Code and Supplier Item Code
    const testDb: AppDatabase = {
      ...INITIAL_DATABASE,
      items: [
        {
          id: 'item-drv-1',
          companyId: 'comp-sakar',
          itemCode: 'LED-DRV-24W-IP67', // Our SAP Code
          itemName: '24W Constant Current LED Driver IP67 Waterproof', // Our SAP Name
          hsnCode: '85044090',
          uom: 'PCS',
          defaultCurrency: 'USD',
          standardRateFC: 4.25,
          supplierMappings: [
            { supplierId: 'supp-skr-v01020', supplierItemCode: 'FS-24W-CC-V2', supplierItemName: '24W LED Power Supply Unit' },
          ],
          bcdRatePct: 7.5,
          igstRatePct: 18,
          igcrEligible: false,
          igcrBcdRatePct: 0,
          active: true,
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-01T00:00:00.000Z',
        },
      ],
      proformaInvoices: [
        {
          id: 'pi-dual-test',
          companyId: 'comp-sakar',
          supplierId: 'supp-skr-v01020',
          currency: 'USD',
          piNo: 'PI-DUAL-001',
          piDate: '2026-07-01',
          piValueFC: 4250,
          advancePercentage: 30,
          paymentTerms: 'Part advance + balance',
          creditDays: 30,
          items: [
            {
              lineId: 'line-dual-1',
              itemId: 'item-drv-1',
              itemCode: 'LED-DRV-24W-IP67', // Our SAP Code
              itemName: '24W Constant Current LED Driver IP67 Waterproof',
              supplierItemCode: 'FS-24W-CC-V2', // Supplier's code
              supplierItemName: '24W LED Power Supply Unit',
              hsnCode: '85044090',
              uom: 'PCS',
              orderedQty: 1000,
              unitPriceFC: 4.25,
              amountFC: 4250,
              bcdRatePct: 7.5,
              igstRatePct: 18,
              igcrEligible: false,
              igcrBcdRatePct: 0,
            },
          ],
          isClosed: false,
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      ],
      shipments: [],
    };

    const balances = computeMaterialBalances(testDb, 'comp-sakar', '2026-07-05');
    expect(balances.itemRows.length).toBe(1);
    expect(balances.itemRows[0].itemCode).toBe('LED-DRV-24W-IP67'); // SAP Code
    expect(balances.itemRows[0].itemName).toBe('24W Constant Current LED Driver IP67 Waterproof');
    expect(balances.itemRows[0].supplierItemCode).toBe('FS-24W-CC-V2'); // Supplier Part Code
    expect(balances.itemRows[0].supplierItemName).toBe('24W LED Power Supply Unit');
  });

  it('Phase 1 - True Landed Costing: loads BCD/SWS, Freight, CHA, CFS & Transport, excludes IGST (AS-2 compliant)', () => {
    const ci = {
      id: 'ci-lc-test',
      companyId: 'comp-sakar',
      supplierId: 'supp-skr-v01020',
      currency: 'USD' as const,
      ciNo: 'CI-2026-LC01',
      ciDate: '2026-07-15',
      ciValueFC: 10000,
      linkedPiId: 'pi-1',
      boeNo: 'BOE-999888',
      boeDate: '2026-07-20',
      portCode: 'INNSA1',
      boeExchangeRate: 86.0,
      assessableValueINR: 860000,
      customsDutyINR: 64500, // 7.5% BCD
      swsINR: 6450, // 10% SWS
      igstINR: 167571, // 18% IGST on (Ass + BCD + SWS)
      totalTaxINR: 238521,
      purchaseINR: 860000,
      createdAt: '2026-07-15T00:00:00.000Z',
      updatedAt: '2026-07-15T00:00:00.000Z',
    };

    const items = [
      {
        lineId: 'l-1',
        itemCode: 'LED-DRV-24W-IP67',
        itemName: '24W Constant Current LED Driver IP67 Waterproof',
        supplierItemCode: 'FS-24W-CC-V2',
        qty: 2000,
        uom: 'PCS',
        unitPriceFC: 5.0,
        amountFC: 10000,
        bcdRatePct: 7.5,
      },
    ];

    const lcConfig = {
      ciId: 'ci-lc-test',
      internationalFreightINR: 40000,
      insuranceINR: 5000,
      chaChargesINR: 15000,
      portHandlingCfsINR: 8000,
      localTransportINR: 12000,
      otherChargesINR: 0,
      allocationMethod: 'value' as const,
      updatedAt: '2026-07-20T00:00:00.000Z',
    };

    const summary = computeCommercialInvoiceLandedCost(ci, items, lcConfig);
    expect(summary.totalFobINR).toBe(860000);
    expect(summary.totalBcdINR).toBe(64500);
    expect(summary.totalSwsINR).toBe(6450);
    expect(summary.totalNonCreditableDutyINR).toBe(70950);
    expect(summary.totalFreightINR).toBe(40000);
    expect(summary.totalChaINR).toBe(15000);
    expect(summary.totalLocalTransportINR).toBe(12000);

    // Grand Total Landed = 860000 + 70950 + 40000 + 5000 + 15000 + 8000 + 12000 = 1,010,950
    expect(summary.grandTotalLandedINR).toBe(1010950);
    // Per-unit landed cost for 2000 pcs = 1010950 / 2000 = 505.48 INR/unit
    expect(summary.items[0].landedCostPerUnitINR).toBe(505.48);
    // Multiplier = 1010950 / 860000 = 1.1755x
    expect(summary.averageLandedMultiplier).toBe(1.1755);
  });

  it('Phase 1 - Container Detention & Demurrage Risk: monitors 14-day free days and flags penalty risks', () => {
    const testDb: AppDatabase = {
      ...INITIAL_DATABASE,
      shipments: [
        {
          id: 'shp-det-1',
          companyId: 'comp-sakar',
          supplierId: 'supp-skr-v01020',
          piId: 'pi-1',
          currency: 'USD',
          shipmentRefNo: 'SHP-DET-01',
          mode: 'Sea',
          containerNo: 'COSU6123456',
          containerType: '40ft HQ',
          shippingLine: 'COSCO Shipping',
          dischargeDate: '2026-08-01',
          freeDetentionDays: 14,
          portFreeDemurrageDays: 5,
          portCode: 'INNSA1',
          estimatedExchangeRate: 86.0,
          estimatedAssessableINR: 860000,
          estimatedBcdINR: 64500,
          estimatedSwsINR: 6450,
          estimatedIgstINR: 167571,
          estimatedTotalDutyINR: 238521,
          status: 'Arrived Port',
          items: [],
          createdAt: '2026-08-01T00:00:00.000Z',
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
      ],
    };

    // As of 2026-08-10 (10 days in, 4 days remaining before 2026-08-15) -> Warning
    const risksWarning = computeContainerDetentionRisks(testDb, '2026-08-10');
    expect(risksWarning.length).toBe(1);
    expect(risksWarning[0].detentionExpiryDate).toBe('2026-08-15');
    expect(risksWarning[0].daysRemaining).toBe(5);
    expect(risksWarning[0].riskLevel).toBe('Warning');

    // As of 2026-08-18 (18 days in, 3 days PAST 2026-08-15) -> Expired / Demurrage penalty
    const risksExpired = computeContainerDetentionRisks(testDb, '2026-08-18');
    expect(risksExpired.length).toBe(1);
    expect(risksExpired[0].daysRemaining).toBe(-3);
    expect(risksExpired[0].riskLevel).toBe('Expired');
  });

  it('Phase 1 - RBI IDPMS 180-Day Advance Remittance Countdown: tracks days elapsed and warns before 180d default', () => {
    const testDb: AppDatabase = {
      ...INITIAL_DATABASE,
      payments: [
        {
          id: 'pay-adv-test',
          companyId: 'comp-sakar',
          bankAccountId: 'bank-skr-hdfc',
          paymentDate: '2026-04-10', // Advance remittance
          supplierId: 'supp-skr-v01020',
          currency: 'USD',
          amountFC: 10000,
          actualExchangeRate: 86.0,
          inrAmount: 860000,
          paymentAgainst: 'PI',
          linkedPiId: 'pi-adv-test',
          paymentMode: 'Advance',
          bankReferenceNo: 'HDFC-ADV-001',
          createdAt: '2026-04-10T00:00:00.000Z',
          updatedAt: '2026-04-10T00:00:00.000Z',
        },
      ],
      commercialInvoices: [], // No BOE filed yet!
    };

    // As of 2026-08-10: 122 days elapsed, 58 days remaining -> Warning (between 31-90 days)
    const alerts1 = computeIDPMSAdvanceAlerts(testDb, { allocations: [], unappliedPayments: [] }, '2026-08-10');
    expect(alerts1.length).toBe(1);
    expect(alerts1[0].dueDate180).toBe('2026-10-07');
    expect(alerts1[0].daysElapsed).toBe(122);
    expect(alerts1[0].daysRemaining).toBe(58);
    expect(alerts1[0].status).toBe('Warning');

    // As of 2026-10-25: 198 days elapsed -> Overdue (>180 days RBI IDPMS default flag)
    const alerts2 = computeIDPMSAdvanceAlerts(testDb, { allocations: [], unappliedPayments: [] }, '2026-10-25');
    expect(alerts2.length).toBe(1);
    expect(alerts2[0].daysRemaining).toBe(-18);
    expect(alerts2[0].status).toBe('Overdue');
  });
});
