import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import {
  AppDatabase,
  Company,
  BankAccount,
  Supplier,
  CurrencyMaster,
  MonthEndRate,
  AppSettings,
  ProformaInvoice,
  CommercialInvoice,
  Payment,
  DebitNote,
  RefundReceipt,
  AdjustmentTransfer,
  OpeningBalance,
  BOEBankSubmission,
  ItemMaster,
  PurchaseRequisition,
  PIItemLine,
  ShipmentPlan,
  IGCRLot,
  IGCRConsumption,
  PaymentTerms,
} from '../types';
import {
  loadDatabase,
  loadDatabaseFromServer,
  normalizeDatabase,
  saveDatabase,
  subscribeStorage,
  getIsFileConnected,
  getActiveFileName,
  getIsServerConnected,
  getServerStoragePath,
  getLastIntegrityError,
  getLastSaveError,
  connectDataFile,
  createAndConnectDataFile,
  downloadManualJSONBackup,
  restoreFromJSONFile,
  exportAllDataToExcel,
  listAutoBackups,
  listServerBackups,
  restoreAutoBackup,
} from '../services/storage';
import { computeAllocationsAndState, EngineResult } from '../utils/engine';
import {
  computeMaterialBalances,
  computeShipmentDutyEstimate,
  MaterialBalanceResult,
} from '../utils/purchaseEngine';
import { computeBOETaxTotals } from '../utils/boe';
import { INITIAL_DATABASE } from '../data/seedData';
import { round2 } from '../utils/formatters';
import { useAuth } from './AuthContext';

interface AppContextType {
  db: AppDatabase;
  engineResult: EngineResult;
  materialBalances: MaterialBalanceResult;
  selectedCompanyId: string;
  setSelectedCompanyId: (id: string) => void;
  asOfDate: string;
  setAsOfDate: (date: string) => void;
  isFileConnected: boolean;
  activeFileName: string | null;
  isServerConnected: boolean;
  serverStoragePath: string | null;
  dbLoading: boolean;
  integrityError: string | null;
  saveError: string | null;
  connectDiskFile: () => Promise<{ success: boolean; filename?: string; error?: string }>;
  createNewDiskFile: () => Promise<{ success: boolean; filename?: string; error?: string }>;
  downloadBackup: () => void;
  restoreBackup: (file: File) => Promise<{ success: boolean; error?: string }>;
  exportAllExcel: () => void;
  resetToDemoSeed: () => void;
  autoBackups: Array<{ key: string; timestamp: string; reason: string }>;
  restoreFromAutoBackup: (key: string) => Promise<boolean>;

  saveCompany: (company: Company) => void;
  saveBankAccount: (account: BankAccount) => void;
  saveSupplier: (supplier: Supplier) => void;
  saveCurrency: (currency: CurrencyMaster) => void;
  saveMonthEndRate: (rate: MonthEndRate) => void;
  saveSettings: (settings: AppSettings) => void;
  savePI: (pi: ProformaInvoice) => { success: boolean; error?: string };
  saveCI: (ci: CommercialInvoice) => { success: boolean; error?: string };
  savePayment: (payment: Payment) => { success: boolean; error?: string };
  saveDebitNote: (dn: DebitNote) => { success: boolean; error?: string };
  saveRefundReceipt: (refund: RefundReceipt) => { success: boolean; error?: string };
  saveAdjustment: (adj: AdjustmentTransfer) => void;
  saveOpeningBalance: (ob: OpeningBalance) => { success: boolean; error?: string };
  saveBOESubmission: (sub: BOEBankSubmission) => void;
  batchImportOpeningBalances: (obs: OpeningBalance[]) => void;
  batchImportSuppliers: (suppliers: Supplier[]) => void;
  batchImportCompanies: (companies: Company[]) => void;
  batchImportBankAccounts: (accounts: BankAccount[]) => void;

  // Purchase Desk & IGCR Operations
  saveItem: (item: ItemMaster) => { success: boolean; error?: string };
  saveRequisition: (pr: PurchaseRequisition) => { success: boolean; error?: string };
  generatePIsFromRequisition: (
    prId: string,
    selectedLineIds: string[],
    options?: {
      advancePercentage?: number;
      paymentTerms?: PaymentTerms;
      creditDays?: number;
      piPrefix?: string;
    }
  ) => { success: boolean; createdPIs: ProformaInvoice[]; error?: string };
  saveShipment: (shipment: ShipmentPlan) => { success: boolean; error?: string };
  markShipmentReceived: (
    shipmentId: string,
    receipt: {
      actualReceiptDate: string;
      grnNo?: string;
      itemReceipts?: Array<{ lineId: string; receivedQty: number; shortQty: number }>;
      remarks?: string;
    }
  ) => { success: boolean; error?: string };
  saveIGCRLot: (lot: IGCRLot) => { success: boolean; error?: string };
  syncIGCRLotsFromBOEs: () => { createdCount: number };
  saveIGCRConsumption: (entry: IGCRConsumption) => { success: boolean; error?: string };
  deleteIGCRConsumption: (id: string) => void;
  manualSaveDatabase: () => Promise<{ success: boolean; error?: string; timestamp: string }>;
  lastSavedAt: string | null;
}

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, permissions } = useAuth();
  const actor = currentUser?.username || 'System';

  const [db, setDb] = useState<AppDatabase>(() => loadDatabase());
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('ALL');
  const [asOfDate, setAsOfDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [fileConnected, setFileConnected] = useState<boolean>(() => getIsFileConnected());
  const [activeFileName, setActiveFileName] = useState<string | null>(() => getActiveFileName());
  const [serverConnected, setServerConnected] = useState<boolean>(() => getIsServerConnected());
  const [storagePath, setStoragePath] = useState<string | null>(() => getServerStoragePath());
  const [dbLoading, setDbLoading] = useState<boolean>(true);
  const [integrityError, setIntegrityError] = useState<string | null>(() => getLastIntegrityError());
  const [saveError, setSaveError] = useState<string | null>(() => getLastSaveError());
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(() => new Date().toLocaleTimeString());
  const [autoBackupsList, setAutoBackupsList] = useState<Array<{ key: string; timestamp: string; reason: string }>>([]);

  useEffect(() => {
    let cancelled = false;

    const refreshBackups = async () => {
      if (permissions.canManageBackups && getIsServerConnected()) {
        const list = await listServerBackups();
        if (!cancelled) setAutoBackupsList(list);
      } else {
        if (!cancelled) setAutoBackupsList(listAutoBackups());
      }
    };

    const unsubscribe = subscribeStorage((newDb, connected) => {
      if (cancelled) return;
      setDb(normalizeDatabase({ ...newDb }));
      setFileConnected(connected);
      setActiveFileName(getActiveFileName());
      setServerConnected(getIsServerConnected());
      setStoragePath(getServerStoragePath());
      setIntegrityError(getLastIntegrityError());
      setSaveError(getLastSaveError());
      void refreshBackups();
    });

    async function loadFromServer() {
      setDbLoading(true);
      const res = await loadDatabaseFromServer();
      if (!cancelled) {
        if (res.success && res.data) {
          setDb(normalizeDatabase(res.data));
        }
        setServerConnected(getIsServerConnected());
        setStoragePath(getServerStoragePath());
        setIntegrityError(getLastIntegrityError());
        await refreshBackups();
        setDbLoading(false);
      }
    }

    void loadFromServer();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [currentUser?.id, permissions.canManageBackups]);

  const engineResult = useMemo(() => {
    return computeAllocationsAndState(db, asOfDate);
  }, [db, asOfDate]);

  const materialBalances = useMemo(() => {
    return computeMaterialBalances(db, selectedCompanyId, asOfDate);
  }, [db, selectedCompanyId, asOfDate]);

  const handleConnectDiskFile = async () => {
    const res = await connectDataFile();
    setFileConnected(getIsFileConnected());
    setActiveFileName(getActiveFileName());
    return res;
  };

  const handleCreateNewDiskFile = async () => {
    const res = await createAndConnectDataFile();
    setFileConnected(getIsFileConnected());
    setActiveFileName(getActiveFileName());
    return res;
  };

  const handleDownloadBackup = () => {
    void downloadManualJSONBackup(db);
  };

  const handleRestoreBackup = async (file: File) => {
    return await restoreFromJSONFile(file, actor);
  };

  const handleExportAllExcel = () => {
    exportAllDataToExcel(db);
  };

  const manualSaveDatabase = async (): Promise<{ success: boolean; error?: string; timestamp: string }> => {
    const ts = new Date().toLocaleTimeString();
    try {
      await saveDatabase(db, true, 'User manual save trigger from header', actor);
      setLastSavedAt(ts);
      return { success: true, timestamp: ts };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to save to disk', timestamp: ts };
    }
  };

  const handleResetToDemoSeed = async () => {
    if (window.confirm('Reset database to initial Sakar FY 26-27 audited ledger? All current changes will be backed up first.')) {
      const fresh = JSON.parse(JSON.stringify(INITIAL_DATABASE)) as AppDatabase;
      await saveDatabase(fresh, true, 'Reset to Audited Sakar FY 26-27 Seed', actor);
    }
  };

  const handleRestoreAutoBackup = async (key: string) => {
    return await restoreAutoBackup(key, actor);
  };

  const saveCompany = (company: Company) => {
    const existing = db.companies.find(c => c.id === company.id);
    const updated = existing
      ? db.companies.map(c => (c.id === company.id ? { ...company, updatedAt: new Date().toISOString() } : c))
      : [...db.companies, { ...company, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    void saveDatabase({ ...db, companies: updated }, false, `Saved Company: ${company.code}`, actor);
  };

  const saveBankAccount = (account: BankAccount) => {
    const existing = db.bankAccounts.find(b => b.id === account.id);
    const updated = existing
      ? db.bankAccounts.map(b => (b.id === account.id ? { ...account, updatedAt: new Date().toISOString() } : b))
      : [...db.bankAccounts, { ...account, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    void saveDatabase({ ...db, bankAccounts: updated }, false, `Saved Bank Account: ${account.bankName} - ${account.accountNumber.slice(-4)}`, actor);
  };

  const saveSupplier = (supplier: Supplier) => {
    const existing = db.suppliers.find(s => s.id === supplier.id);
    const updated = existing
      ? db.suppliers.map(s => (s.id === supplier.id ? { ...supplier, updatedAt: new Date().toISOString() } : s))
      : [...db.suppliers, { ...supplier, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    void saveDatabase({ ...db, suppliers: updated }, false, `Saved Supplier: ${supplier.vendorCode} - ${supplier.supplierName}`, actor);
  };

  const saveCurrency = (currency: CurrencyMaster) => {
    const existing = db.currencies.find(c => c.code === currency.code);
    const updated = existing
      ? db.currencies.map(c => (c.code === currency.code ? currency : c))
      : [...db.currencies, currency];
    void saveDatabase({ ...db, currencies: updated }, false, `Saved Currency: ${currency.code}`, actor);
  };

  const saveMonthEndRate = (rate: MonthEndRate) => {
    const existing = db.monthEndRates.find(r => r.id === rate.id || (r.monthEndDate === rate.monthEndDate && r.currency === rate.currency));
    const updated = existing
      ? db.monthEndRates.map(r => (r.id === existing.id ? { ...rate, id: existing.id, updatedAt: new Date().toISOString() } : r))
      : [...db.monthEndRates, { ...rate, id: rate.id || `RATE-${Date.now()}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    void saveDatabase({ ...db, monthEndRates: updated }, false, `Saved Month-End Rate: ${rate.currency} ${rate.monthEndDate} = ${rate.valuationRate}`, actor);
  };

  const saveSettings = (settings: AppSettings) => {
    void saveDatabase({ ...db, settings }, false, 'Updated App Settings', actor);
  };

  const savePI = (pi: ProformaInvoice): { success: boolean; error?: string } => {
    const dup = db.proformaInvoices.find(
      p => p.id !== pi.id && p.companyId === pi.companyId && p.supplierId === pi.supplierId && p.piNo.trim().toLowerCase() === pi.piNo.trim().toLowerCase()
    );
    if (dup) {
      return { success: false, error: `Duplicate PI No '${pi.piNo}' already exists for this company & supplier.` };
    }

    const existing = db.proformaInvoices.find(p => p.id === pi.id);
    const updated = existing
      ? db.proformaInvoices.map(p => (p.id === pi.id ? { ...pi, updatedAt: new Date().toISOString() } : p))
      : [...db.proformaInvoices, { ...pi, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    void saveDatabase({ ...db, proformaInvoices: updated }, false, `Saved PI: ${pi.piNo}`, actor);
    return { success: true };
  };

  const saveCI = (ci: CommercialInvoice): { success: boolean; error?: string } => {
    if (!ci.boeNo || !ci.boeDate || !ci.boeExchangeRate || ci.boeExchangeRate <= 0) {
      return { success: false, error: 'BOE No, BOE Date, and a valid BOE Exchange Rate (> 0) are mandatory before saving CI.' };
    }

    const dupCI = db.commercialInvoices.find(
      c => c.id !== ci.id && c.companyId === ci.companyId && c.ciNo.trim().toLowerCase() === ci.ciNo.trim().toLowerCase()
    );
    if (dupCI) {
      return { success: false, error: `Duplicate CI No '${ci.ciNo}' already exists for this company.` };
    }

    const dupBOE = db.commercialInvoices.find(
      c => c.id !== ci.id && c.companyId === ci.companyId && c.boeNo.trim().toLowerCase() === ci.boeNo.trim().toLowerCase()
    );
    if (dupBOE) {
      return { success: false, error: `Duplicate BOE No '${ci.boeNo}' already exists for this company.` };
    }

    const purchaseINR = Math.round(ci.ciValueFC * ci.boeExchangeRate);
    const customsDutyINR = round2(Number(ci.customsDutyINR || 0));
    const swsINR = round2(Number(ci.swsINR || 0));
    const igstINR = round2(Number(ci.igstINR || 0));
    const totalTaxINR = round2(customsDutyINR + swsINR + igstINR);
    const finalCI: CommercialInvoice = {
      ...ci,
      purchaseINR,
      taxInvoiceValueINR:
        ci.taxInvoiceValueINR && ci.taxInvoiceValueINR > 0 ? round2(ci.taxInvoiceValueINR) : undefined,
      customsDutyINR,
      swsINR,
      igstINR,
      totalTaxINR,
      taxPaidDate: ci.taxPaidDate || undefined,
      challanNo: ci.challanNo?.trim() || undefined,
      updatedAt: new Date().toISOString(),
      createdAt: ci.createdAt || new Date().toISOString(),
    };

    const existing = db.commercialInvoices.find(c => c.id === ci.id);
    const updated = existing
      ? db.commercialInvoices.map(c => (c.id === ci.id ? finalCI : c))
      : [...db.commercialInvoices, finalCI];

    void saveDatabase({ ...db, commercialInvoices: updated }, false, `Saved CI: ${ci.ciNo} with BOE ${ci.boeNo}`, actor);
    return { success: true };
  };

  const savePayment = (payment: Payment): { success: boolean; error?: string } => {
    if (payment.actualExchangeRate <= 0) {
      return { success: false, error: 'Actual Exchange Rate must be greater than 0.' };
    }

    if (payment.bankReferenceNo) {
      const dup = db.payments.find(
        p => p.id !== payment.id && p.companyId === payment.companyId && p.bankReferenceNo.trim().toLowerCase() === payment.bankReferenceNo.trim().toLowerCase()
      );
      if (dup) {
        return { success: false, error: `Duplicate Bank Reference No '${payment.bankReferenceNo}' already exists for this company.` };
      }
    }

    const inr = payment.inrOverride ?? Math.round(payment.amountFC * payment.actualExchangeRate);
    const finalPayment: Payment = {
      ...payment,
      inrAmount: inr,
      updatedAt: new Date().toISOString(),
      createdAt: payment.createdAt || new Date().toISOString(),
    };

    const existing = db.payments.find(p => p.id === payment.id);
    const updated = existing
      ? db.payments.map(p => (p.id === payment.id ? finalPayment : p))
      : [...db.payments, finalPayment];

    void saveDatabase({ ...db, payments: updated }, false, `Saved Payment: ${payment.amountFC} ${payment.currency} (${payment.bankReferenceNo})`, actor);
    return { success: true };
  };

  const saveDebitNote = (dn: DebitNote): { success: boolean; error?: string } => {
    const dup = db.debitNotes.find(
      d => d.id !== dn.id && d.companyId === dn.companyId && d.dnNo.trim().toLowerCase() === dn.dnNo.trim().toLowerCase()
    );
    if (dup) {
      return { success: false, error: `Duplicate Debit Note No '${dn.dnNo}' already exists for this company.` };
    }

    const inr = Math.round(dn.amountFC * dn.rate);
    const finalDN: DebitNote = {
      ...dn,
      inrAmount: inr,
      updatedAt: new Date().toISOString(),
      createdAt: dn.createdAt || new Date().toISOString(),
    };

    const existing = db.debitNotes.find(d => d.id === dn.id);
    const updated = existing
      ? db.debitNotes.map(d => (d.id === dn.id ? finalDN : d))
      : [...db.debitNotes, finalDN];

    void saveDatabase({ ...db, debitNotes: updated }, false, `Saved Debit Note: ${dn.dnNo} for ${dn.amountFC} ${dn.currency}`, actor);
    return { success: true };
  };

  const saveRefundReceipt = (refund: RefundReceipt): { success: boolean; error?: string } => {
    const inr = Math.round(refund.amountFC * refund.actualExchangeRate);
    const finalRefund: RefundReceipt = {
      ...refund,
      inrAmount: inr,
      updatedAt: new Date().toISOString(),
      createdAt: refund.createdAt || new Date().toISOString(),
    };

    const existing = db.refundReceipts.find(r => r.id === refund.id);
    const updatedRefunds = existing
      ? db.refundReceipts.map(r => (r.id === refund.id ? finalRefund : r))
      : [...db.refundReceipts, finalRefund];

    const dn = db.debitNotes.find(d => d.id === refund.againstDnId);
    let updatedDebitNotes = db.debitNotes;
    if (dn) {
      const totalRecovered = updatedRefunds
        .filter(r => r.againstDnId === dn.id)
        .reduce((sum, r) => sum + r.amountFC, 0);
      const newStatus = totalRecovered >= dn.amountFC ? 'Fully Recovered' : totalRecovered > 0 ? 'Partially Recovered' : 'Open';
      updatedDebitNotes = db.debitNotes.map(d =>
        d.id === dn.id ? { ...d, recoveredFC: totalRecovered, status: newStatus, updatedAt: new Date().toISOString() } : d
      );
    }

    void saveDatabase(
      { ...db, refundReceipts: updatedRefunds, debitNotes: updatedDebitNotes },
      false,
      `Saved Refund Receipt: ${refund.amountFC} ${refund.currency} against DN`,
      actor
    );
    return { success: true };
  };

  const saveAdjustment = (adj: AdjustmentTransfer) => {
    const finalAdj = {
      ...adj,
      updatedAt: new Date().toISOString(),
      createdAt: adj.createdAt || new Date().toISOString(),
    };
    const existing = db.adjustments.find(a => a.id === adj.id);
    const updated = existing
      ? db.adjustments.map(a => (a.id === adj.id ? finalAdj : a))
      : [...db.adjustments, finalAdj];
    void saveDatabase({ ...db, adjustments: updated }, false, `Saved Adjustment: ${adj.amountFC} ${adj.currency}`, actor);
  };

  const saveOpeningBalance = (ob: OpeningBalance): { success: boolean; error?: string } => {
    const rate = ob.amountFC > 0 ? Number((ob.amountINR / ob.amountFC).toFixed(4)) : 0;
    const finalOB: OpeningBalance = {
      ...ob,
      rate,
      updatedAt: new Date().toISOString(),
      createdAt: ob.createdAt || new Date().toISOString(),
    };

    const existing = db.openingBalances.find(o => o.id === ob.id);
    const updated = existing
      ? db.openingBalances.map(o => (o.id === ob.id ? finalOB : o))
      : [...db.openingBalances, finalOB];

    void saveDatabase({ ...db, openingBalances: updated }, false, `Saved Opening Balance: ${ob.referenceNo} (${ob.balanceType})`, actor);
    return { success: true };
  };

  const saveBOESubmission = (sub: BOEBankSubmission) => {
    const finalSub = {
      ...sub,
      updatedAt: new Date().toISOString(),
      createdAt: sub.createdAt || new Date().toISOString(),
    };
    const existing = db.boeSubmissions.find(s => s.id === sub.id);
    const updated = existing
      ? db.boeSubmissions.map(s => (s.id === sub.id ? finalSub : s))
      : [...db.boeSubmissions, finalSub];
    void saveDatabase({ ...db, boeSubmissions: updated }, false, `Saved BOE Submission for BOE ${sub.boeNo}`, actor);
  };

  const batchImportOpeningBalances = (obs: OpeningBalance[]) => {
    void saveDatabase({ ...db, openingBalances: [...db.openingBalances, ...obs] }, true, `Imported ${obs.length} opening balances`, actor);
  };

  const batchImportSuppliers = (suppliers: Supplier[]) => {
    void saveDatabase({ ...db, suppliers: [...db.suppliers, ...suppliers] }, true, `Imported ${suppliers.length} suppliers`, actor);
  };

  const batchImportCompanies = (companies: Company[]) => {
    void saveDatabase({ ...db, companies: [...db.companies, ...companies] }, true, `Imported ${companies.length} companies`, actor);
  };

  const batchImportBankAccounts = (accounts: BankAccount[]) => {
    void saveDatabase({ ...db, bankAccounts: [...db.bankAccounts, ...accounts] }, true, `Imported ${accounts.length} bank accounts`, actor);
  };

  // --- Purchase Desk & IGCR Operations ---
  const saveItem = (item: ItemMaster): { success: boolean; error?: string } => {
    const code = item.itemCode.trim();
    if (!code || !item.itemName.trim() || !item.hsnCode.trim()) {
      return { success: false, error: 'Item Code, Item Name, and HSN Code are required.' };
    }
    const existingItems = db.items || [];
    const dup = existingItems.find(
      i => i.id !== item.id && i.companyId === item.companyId && i.itemCode.trim().toLowerCase() === code.toLowerCase()
    );
    if (dup) {
      return { success: false, error: `Duplicate Item Code '${code}' already exists for this company.` };
    }

    const now = new Date().toISOString();
    const finalItem: ItemMaster = {
      ...item,
      itemCode: code.toUpperCase(),
      itemName: item.itemName.trim(),
      hsnCode: item.hsnCode.trim(),
      createdAt: item.createdAt || now,
      updatedAt: now,
    };
    const exists = existingItems.some(i => i.id === finalItem.id);
    const updated = exists ? existingItems.map(i => (i.id === finalItem.id ? finalItem : i)) : [...existingItems, finalItem];
    void saveDatabase({ ...db, items: updated }, false, `Saved Item Master: ${finalItem.itemCode}`, actor);
    return { success: true };
  };

  const saveRequisition = (pr: PurchaseRequisition): { success: boolean; error?: string } => {
    const prNo = pr.prNo.trim();
    if (!prNo || !pr.companyId || pr.items.length === 0) {
      return { success: false, error: 'Company, PR No, and at least one item line are required.' };
    }
    const existingPRs = db.purchaseRequisitions || [];
    const dup = existingPRs.find(
      p => p.id !== pr.id && p.companyId === pr.companyId && p.prNo.trim().toLowerCase() === prNo.toLowerCase()
    );
    if (dup) {
      return { success: false, error: `Duplicate Requisition No '${prNo}' already exists for this company.` };
    }

    const now = new Date().toISOString();
    const finalPR: PurchaseRequisition = {
      ...pr,
      prNo: prNo.toUpperCase(),
      createdAt: pr.createdAt || now,
      updatedAt: now,
    };
    const exists = existingPRs.some(p => p.id === finalPR.id);
    const updated = exists ? existingPRs.map(p => (p.id === finalPR.id ? finalPR : p)) : [...existingPRs, finalPR];
    void saveDatabase({ ...db, purchaseRequisitions: updated }, false, `Saved Purchase Requisition: ${finalPR.prNo}`, actor);
    return { success: true };
  };

  const generatePIsFromRequisition = (
    prId: string,
    selectedLineIds: string[],
    options?: {
      advancePercentage?: number;
      paymentTerms?: PaymentTerms;
      creditDays?: number;
      piPrefix?: string;
    }
  ): { success: boolean; createdPIs: ProformaInvoice[]; error?: string } => {
    const existingPRs = db.purchaseRequisitions || [];
    const pr = existingPRs.find(p => p.id === prId);
    if (!pr) {
      return { success: false, createdPIs: [], error: 'Requisition not found.' };
    }
    const selectedLines = pr.items.filter(
      l => selectedLineIds.includes(l.lineId) && !l.linkedPiId && Number(l.qtyRequired) > 0
    );
    if (selectedLines.length === 0) {
      return { success: false, createdPIs: [], error: 'Select at least one unconverted requisition line with Qty > 0.' };
    }

    // Group selected lines by preferredSupplierId + currency
    const groups = new Map<string, typeof selectedLines>();
    for (const line of selectedLines) {
      if (!line.preferredSupplierId) {
        return { success: false, createdPIs: [], error: `Item '${line.itemName}' is missing Preferred Supplier.` };
      }
      const key = `${line.preferredSupplierId}__${line.currency}`;
      const list = groups.get(key) || [];
      list.push(line);
      groups.set(key, list);
    }

    const now = new Date().toISOString();
    const today = now.split('T')[0];
    const itemsMaster = db.items || [];
    const basePrefix = (options?.piPrefix || pr.prNo.replace(/^PR/i, 'PI')).trim().toUpperCase();
    const allExistingPIs = [...db.proformaInvoices];
    const createdPIs: ProformaInvoice[] = [];
    const lineToPiMap = new Map<string, string>();
    let seq = 1;

    for (const [key, lines] of groups) {
      const [supplierId, currency] = key.split('__');
      const piItems: PIItemLine[] = lines.map(l => {
        const master = itemsMaster.find(m => m.id === l.itemId || (m.companyId === pr.companyId && m.itemCode === l.itemCode));
        const supMapping = master?.supplierMappings?.find(m => m.supplierId === supplierId);
        const supplierItemCode = l.supplierItemCode || supMapping?.supplierItemCode || undefined;
        const supplierItemName = l.supplierItemName || supMapping?.supplierItemName || undefined;
        const amt = round2(Number(l.qtyRequired) * Number(l.targetUnitPriceFC));
        return {
          lineId: `PIL-${Date.now()}-${Math.floor(Math.random() * 10000)}-${seq}`,
          itemId: l.itemId || master?.id,
          prLineId: l.lineId,
          itemCode: l.itemCode,
          itemName: l.itemName,
          supplierItemCode,
          supplierItemName,
          hsnCode: l.hsnCode || master?.hsnCode || '8504',
          uom: l.uom || master?.uom || 'PCS',
          orderedQty: Number(l.qtyRequired),
          unitPriceFC: Number(l.targetUnitPriceFC),
          amountFC: amt,
          bcdRatePct: master?.bcdRatePct ?? 7.5,
          igstRatePct: master?.igstRatePct ?? 18,
          igcrEligible: master?.igcrEligible ?? false,
          igcrBcdRatePct: master?.igcrBcdRatePct ?? 0,
          igcrNotificationNo: master?.igcrNotificationNo,
          igcrEndUse: master?.igcrEndUse,
        };
      });

      const piValueFC = round2(piItems.reduce((s, x) => s + x.amountFC, 0));
      let candidatePiNo = groups.size > 1 ? `${basePrefix}-${seq}` : basePrefix;
      while (
        allExistingPIs.some(
          p => p.companyId === pr.companyId && p.supplierId === supplierId && p.piNo.toLowerCase() === candidatePiNo.toLowerCase()
        )
      ) {
        candidatePiNo = `${basePrefix}-${seq}-${Math.floor(Math.random() * 90 + 10)}`;
      }
      seq += 1;

      const newPi: ProformaInvoice = {
        id: `PI-${Date.now()}-${seq}`,
        companyId: pr.companyId,
        supplierId,
        currency,
        piNo: candidatePiNo,
        piDate: today,
        piValueFC,
        advancePercentage: options?.advancePercentage ?? 30,
        paymentTerms: options?.paymentTerms ?? 'Part advance + balance',
        creditDays: options?.creditDays ?? 30,
        expectedShipmentDate: pr.requiredByDate || undefined,
        requisitionId: pr.id,
        items: piItems,
        remarks: `Generated from PR ${pr.prNo}${pr.department ? ` (${pr.department})` : ''}`,
        isClosed: false,
        createdAt: now,
        updatedAt: now,
      };

      createdPIs.push(newPi);
      allExistingPIs.push(newPi);
      for (const l of lines) {
        lineToPiMap.set(l.lineId, newPi.id);
      }
    }

    const updatedItems = pr.items.map(l => {
      const piId = lineToPiMap.get(l.lineId);
      return piId ? { ...l, linkedPiId: piId, orderedQty: l.qtyRequired } : l;
    });
    const allConverted = updatedItems.every(l => Boolean(l.linkedPiId));
    const updatedPR: PurchaseRequisition = {
      ...pr,
      items: updatedItems,
      status: allConverted ? 'Converted to PI' : 'Partially Ordered',
      updatedAt: now,
    };

    const updatedPRs = existingPRs.map(p => (p.id === pr.id ? updatedPR : p));
    void saveDatabase(
      { ...db, proformaInvoices: allExistingPIs, purchaseRequisitions: updatedPRs },
      false,
      `Generated ${createdPIs.length} PI(s) from Requisition ${pr.prNo}`,
      actor
    );

    return { success: true, createdPIs };
  };

  const saveShipment = (shipment: ShipmentPlan): { success: boolean; error?: string } => {
    if (!shipment.companyId || !shipment.piId || !shipment.shipmentRefNo.trim() || shipment.items.length === 0) {
      return { success: false, error: 'PI, Shipment Ref No, and at least one item line are required.' };
    }
    const existing = db.shipments || [];
    const est = computeShipmentDutyEstimate(shipment.items, shipment.estimatedExchangeRate);
    const now = new Date().toISOString();
    const finalShipment: ShipmentPlan = {
      ...shipment,
      shipmentRefNo: shipment.shipmentRefNo.trim().toUpperCase(),
      estimatedAssessableINR: est.assessableINR,
      estimatedBcdINR: est.bcdINR,
      estimatedSwsINR: est.swsINR,
      estimatedIgstINR: est.igstINR,
      estimatedTotalDutyINR: est.totalDutyINR,
      createdAt: shipment.createdAt || now,
      updatedAt: now,
    };
    const exists = existing.some(s => s.id === finalShipment.id);
    const updated = exists ? existing.map(s => (s.id === finalShipment.id ? finalShipment : s)) : [...existing, finalShipment];
    void saveDatabase({ ...db, shipments: updated }, false, `Saved Shipment Plan: ${finalShipment.shipmentRefNo}`, actor);
    return { success: true };
  };

  const markShipmentReceived = (
    shipmentId: string,
    receipt: {
      actualReceiptDate: string;
      grnNo?: string;
      itemReceipts?: Array<{ lineId: string; receivedQty: number; shortQty: number }>;
      remarks?: string;
    }
  ): { success: boolean; error?: string } => {
    const existing = db.shipments || [];
    const shp = existing.find(s => s.id === shipmentId);
    if (!shp) {
      return { success: false, error: 'Shipment record not found.' };
    }

    const now = new Date().toISOString();
    const updatedItems = shp.items.map(it => {
      const rec = receipt.itemReceipts?.find(r => r.lineId === it.lineId);
      const receivedQty = rec ? Math.max(0, round2(rec.receivedQty)) : round2(it.dispatchedQty);
      const shortQty = rec ? Math.max(0, round2(rec.shortQty)) : 0;
      return {
        ...it,
        receivedQty,
        shortQty,
        receivedDate: receipt.actualReceiptDate,
        grnNo: receipt.grnNo?.trim() || it.grnNo,
      };
    });

    const allDone = updatedItems.every(it => round2(it.receivedQty + it.shortQty) >= round2(it.dispatchedQty));
    const finalShipment: ShipmentPlan = {
      ...shp,
      items: updatedItems,
      status: allDone ? 'Received' : 'Part Received',
      actualReceiptDate: receipt.actualReceiptDate,
      grnNo: receipt.grnNo?.trim() || shp.grnNo,
      remarks: receipt.remarks ? `${shp.remarks ? shp.remarks + ' | ' : ''}${receipt.remarks}` : shp.remarks,
      updatedAt: now,
    };

    const updatedShipments = existing.map(s => (s.id === shp.id ? finalShipment : s));
    const totalRecQty = round2(updatedItems.reduce((s, it) => s + it.receivedQty, 0));

    // Sync any linked IGCR inward lot automatically
    const existingLots = db.igcrLots || [];
    const updatedLots = existingLots.map(lot => {
      if (lot.shipmentId === shp.id || (shp.linkedCiId && lot.ciId === shp.linkedCiId)) {
        const matchedItem = updatedItems.find(it => (lot.itemCode && it.itemCode === lot.itemCode) || it.hsnCode === lot.hsnCode);
        const recQ = matchedItem ? matchedItem.receivedQty : totalRecQty;
        const notRec = round2(Math.max(0, lot.qtyImported - recQ));
        return {
          ...lot,
          qtyReceived: recQ,
          receiptDate: receipt.actualReceiptDate,
          qtyNotReceived: notRec,
          updatedAt: now,
        };
      }
      return lot;
    });

    void saveDatabase(
      { ...db, shipments: updatedShipments, igcrLots: updatedLots },
      false,
      `Marked Shipment ${shp.shipmentRefNo} ${finalShipment.status} (${receipt.actualReceiptDate})`,
      actor
    );
    return { success: true };
  };

  const saveIGCRLot = (lot: IGCRLot): { success: boolean; error?: string } => {
    if (!lot.companyId || !lot.boeNo.trim() || !lot.hsnCode.trim() || lot.qtyImported <= 0) {
      return { success: false, error: 'Company, BOE No, HSN Code, and Imported Qty (> 0) are required.' };
    }
    const existing = db.igcrLots || [];
    const now = new Date().toISOString();
    const totalForegone = round2(
      Number(lot.bcdForegoneINR || 0) +
      Number(lot.otherDutyForegoneINR || 0) +
      Number(lot.igstForegoneINR || 0) +
      Number(lot.cessForegoneINR || 0)
    );
    const finalLot: IGCRLot = {
      ...lot,
      boeNo: lot.boeNo.trim().toUpperCase(),
      totalDutyForegoneINR: totalForegone,
      qtyNotReceived: round2(Math.max(0, Number(lot.qtyImported) - Number(lot.qtyReceived || 0))),
      createdAt: lot.createdAt || now,
      updatedAt: now,
    };
    const exists = existing.some(l => l.id === finalLot.id);
    const updated = exists ? existing.map(l => (l.id === finalLot.id ? finalLot : l)) : [...existing, finalLot];
    void saveDatabase({ ...db, igcrLots: updated }, false, `Saved IGCR Lot for BOE ${finalLot.boeNo}`, actor);
    return { success: true };
  };

  const syncIGCRLotsFromBOEs = (): { createdCount: number } => {
    const existing = db.igcrLots || [];
    const newLots: IGCRLot[] = [];
    const now = new Date().toISOString();
    const shipments = db.shipments || [];

    for (const ci of db.commercialInvoices) {
      if (existing.some(l => l.ciId === ci.id) || newLots.some(l => l.ciId === ci.id)) continue;

      const linkedShp = ci.shipmentId
        ? shipments.find(s => s.id === ci.shipmentId)
        : shipments.find(s => s.linkedCiId === ci.id);
      const linkedPi = ci.linkedPiId ? db.proformaInvoices.find(p => p.id === ci.linkedPiId) : undefined;
      const igcrShpItems = (linkedShp?.items || []).filter(i => i.igcrEligible);
      const igcrPiItems = (linkedPi?.items || []).filter(i => i.igcrEligible);

      if (!ci.igcrEligible && igcrShpItems.length === 0 && igcrPiItems.length === 0) continue;

      const firstShp = igcrShpItems[0] || linkedShp?.items[0];
      const firstPi = igcrPiItems[0] || linkedPi?.items?.[0];
      const assVal = computeBOETaxTotals(ci).assessableValueINR;
      const qtyImp = igcrShpItems.length > 0
        ? round2(igcrShpItems.reduce((s, i) => s + Number(i.dispatchedQty || 0), 0))
        : igcrPiItems.length > 0
          ? round2(igcrPiItems.reduce((s, i) => s + Number(i.orderedQty || 0), 0))
          : 1;
      const qtyRec = igcrShpItems.length > 0
        ? round2(igcrShpItems.reduce((s, i) => s + Number(i.receivedQty || 0), 0))
        : 0;
      const normalBcdPct = firstShp?.bcdRatePct ?? firstPi?.bcdRatePct ?? 7.5;
      const concBcdPct = firstShp?.igcrBcdRatePct ?? firstPi?.igcrBcdRatePct ?? 0;
      const diffPct = Math.max(0, normalBcdPct - concBcdPct);
      const bcdForegone = round2((assVal * diffPct) / 100);
      const otherDutyForegone = round2(bcdForegone * 0.1); // 10% SWS foregone

      newLots.push({
        id: `IGCR-${ci.id}-${Date.now()}`,
        companyId: ci.companyId,
        supplierId: ci.supplierId,
        ciId: ci.id,
        shipmentId: linkedShp?.id,
        boeNo: ci.boeNo,
        boeDate: ci.boeDate,
        portCode: ci.portCode || 'INNSA1',
        invoiceNo: ci.ciNo,
        invoiceSerialNo: '1',
        itemSerialNo: '1',
        itemCode: firstShp?.itemCode || firstPi?.itemCode,
        itemDescription: firstShp?.itemName || firstPi?.itemName || `Imports under ${ci.ciNo}`,
        hsnCode: firstShp?.hsnCode || firstPi?.hsnCode || '8504',
        uom: firstShp?.uom || firstPi?.uom || 'PCS',
        specifiedPurpose: firstPi?.igcrEndUse || 'Manufacturing of Finished Goods',
        notificationNo: ci.igcrNotificationNo || firstPi?.igcrNotificationNo || '50/2017-Cus',
        qtyImported: qtyImp,
        clearanceDate: ci.boeDate || ci.ciDate,
        assessableValueINR: assVal,
        normalBcdRatePct: normalBcdPct,
        concessionalBcdRatePct: concBcdPct,
        bcdForegoneINR: bcdForegone,
        otherDutyForegoneINR: otherDutyForegone,
        igstForegoneINR: 0,
        cessForegoneINR: 0,
        totalDutyForegoneINR: round2(bcdForegone + otherDutyForegone),
        qtyReceived: qtyRec,
        receiptDate: linkedShp?.actualReceiptDate,
        qtyNotReceived: round2(Math.max(0, qtyImp - qtyRec)),
        utilizationMonths: 6,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (newLots.length > 0) {
      void saveDatabase(
        { ...db, igcrLots: [...existing, ...newLots] },
        false,
        `Auto-synced ${newLots.length} IGCR lot(s) from BOEs`,
        actor
      );
    }
    return { createdCount: newLots.length };
  };

  const saveIGCRConsumption = (entry: IGCRConsumption): { success: boolean; error?: string } => {
    if (entry.qty <= 0) {
      return { success: false, error: 'Consumption / Disposal quantity must be greater than 0.' };
    }
    const lot = (db.igcrLots || []).find(l => l.id === entry.lotId);
    if (!lot) {
      return { success: false, error: 'Selected IGCR Lot not found.' };
    }
    const existing = db.igcrConsumptions || [];
    const consumedOther = existing
      .filter(c => c.lotId === lot.id && c.id !== entry.id)
      .reduce((s, c) => s + Number(c.qty || 0), 0);
    const available = round2(Math.max(0, Number(lot.qtyReceived || 0) - consumedOther));
    if (entry.qty > available + 0.001) {
      return {
        success: false,
        error: `Quantity (${entry.qty}) exceeds available factory stock (${available} ${lot.uom}) for BOE ${lot.boeNo}.`,
      };
    }

    const now = new Date().toISOString();
    const finalEntry: IGCRConsumption = {
      ...entry,
      createdAt: entry.createdAt || now,
      updatedAt: now,
    };
    const exists = existing.some(c => c.id === finalEntry.id);
    const updated = exists ? existing.map(c => (c.id === finalEntry.id ? finalEntry : c)) : [...existing, finalEntry];
    void saveDatabase(
      { ...db, igcrConsumptions: updated },
      false,
      `Logged IGCR Consumption (${finalEntry.type}: ${finalEntry.qty}) for BOE ${lot.boeNo}`,
      actor
    );
    return { success: true };
  };

  const deleteIGCRConsumption = (id: string) => {
    const existing = db.igcrConsumptions || [];
    const updated = existing.filter(c => c.id !== id);
    void saveDatabase({ ...db, igcrConsumptions: updated }, false, `Deleted IGCR consumption entry ${id}`, actor);
  };

  return (
    <AppContext.Provider
      value={{
        db,
        engineResult,
        materialBalances,
        selectedCompanyId,
        setSelectedCompanyId,
        asOfDate,
        setAsOfDate,
        isFileConnected: fileConnected,
        activeFileName,
        isServerConnected: serverConnected,
        serverStoragePath: storagePath,
        dbLoading,
        integrityError,
        saveError,
        connectDiskFile: handleConnectDiskFile,
        createNewDiskFile: handleCreateNewDiskFile,
        downloadBackup: handleDownloadBackup,
        restoreBackup: handleRestoreBackup,
        exportAllExcel: handleExportAllExcel,
        resetToDemoSeed: handleResetToDemoSeed,
        autoBackups: autoBackupsList,
        restoreFromAutoBackup: handleRestoreAutoBackup,
        saveCompany,
        saveBankAccount,
        saveSupplier,
        saveCurrency,
        saveMonthEndRate,
        saveSettings,
        savePI,
        saveCI,
        savePayment,
        saveDebitNote,
        saveRefundReceipt,
        saveAdjustment,
        saveOpeningBalance,
        saveBOESubmission,
        batchImportOpeningBalances,
        batchImportSuppliers,
        batchImportCompanies,
        batchImportBankAccounts,
        saveItem,
        saveRequisition,
        generatePIsFromRequisition,
        saveShipment,
        markShipmentReceived,
        saveIGCRLot,
        syncIGCRLotsFromBOEs,
        saveIGCRConsumption,
        deleteIGCRConsumption,
        manualSaveDatabase,
        lastSavedAt,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
