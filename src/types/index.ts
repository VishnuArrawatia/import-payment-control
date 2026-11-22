// Import Payment Control Data Types

export type CurrencyCode = 'USD' | 'CNY' | 'EUR' | 'GBP' | 'JPY' | 'INR' | string;

export interface Company {
  id: string;
  code: string; // e.g. "Sakar", "SVN"
  fullName: string;
  gstin?: string;
  iec?: string;
  igcrIIN?: string; // IGCR Identification Number
  igcrBondNo?: string; // Continuity Bond No
  igcrBondValueINR?: number; // Total Bond Value (INR)
  igcrNotifications?: string; // Default IGCR notifications e.g. "50/2017-Cus"
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BankAccount {
  id: string;
  companyId: string;
  bankName: string; // e.g. "HDFC Bank", "DBS Bank"
  branch: string;
  accountNumber: string;
  adCode?: string;
  currency: CurrencyCode;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Supplier {
  id: string;
  companyId: string;
  vendorCode: string; // unique within company e.g. "V00088"
  supplierName: string;
  country: string;
  defaultCurrency: CurrencyCode;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CurrencyMaster {
  code: CurrencyCode;
  name: string;
  symbol?: string;
  active: boolean;
}

export interface MonthEndRate {
  id: string;
  monthEndDate: string; // YYYY-MM-DD
  currency: CurrencyCode;
  valuationRate: number; // Valuation rate in INR
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  ageingBuckets: [number, number, number]; // e.g. [30, 60, 90] -> 0-30, 31-60, 61-90, >90
  ageingBaseDateForPayables: 'boeDate' | 'ciDate'; // default 'boeDate'
  revalueAdvancesAtMonthEnd: boolean; // default false
  dnDefaultRecoveryMethod: 'Refund' | 'Adjust against another PI or CI' | 'Write-off';
  financialYearStartMonth: number; // 4 for 1st April
  numberFormat: 'indian'; // INR lakh/crore grouping
}

export type PaymentTerms = 'Advance' | 'Part advance + balance' | 'LC' | 'Credit' | 'Other';

export interface PIItemLine {
  lineId: string;
  itemId?: string;
  prLineId?: string;
  itemCode: string;
  itemName: string;
  hsnCode: string;
  uom: string;
  supplierItemCode?: string;
  supplierItemName?: string;
  orderedQty: number;
  unitPriceFC: number;
  amountFC: number;
  bcdRatePct: number;
  igstRatePct: number;
  igcrEligible: boolean;
  igcrBcdRatePct: number;
  igcrNotificationNo?: string;
  igcrEndUse?: string;
}

export interface ProformaInvoice {
  id: string;
  companyId: string;
  supplierId: string;
  currency: CurrencyCode;
  piNo: string;
  piDate: string; // YYYY-MM-DD
  piValueFC: number;
  advancePercentage: number; // 0 - 100
  paymentTerms: PaymentTerms;
  creditDays: number; // credit days for balance payment
  expectedShipmentDate?: string;
  requisitionId?: string;
  items?: PIItemLine[];
  remarks?: string;
  attachments?: string;
  isClosed: boolean; // closed flag (no more shipment expected, short-shipment)
  createdAt: string;
  updatedAt: string;
}

export interface CommercialInvoiceLandedCost {
  ciId: string;
  internationalFreightINR: number;
  insuranceINR: number;
  chaChargesINR: number;
  portHandlingCfsINR: number;
  localTransportINR: number;
  otherChargesINR: number;
  allocationMethod: 'value' | 'quantity';
  remarks?: string;
  updatedAt: string;
}

export interface LandedCostItemBreakdown {
  lineId?: string;
  itemCode: string;
  itemName: string;
  supplierItemCode?: string;
  qty: number;
  uom: string;
  unitPriceFC: number;
  currency: string;
  fobAmountINR: number;
  bcdAmountINR: number;
  swsAmountINR: number;
  allocatedFreightINR: number;
  allocatedInsuranceINR: number;
  allocatedChaINR: number;
  allocatedPortCfsINR: number;
  allocatedLocalTransportINR: number;
  allocatedOtherINR: number;
  totalLandedCostINR: number;
  landedCostPerUnitINR: number;
  landedMultiplier: number;
}

export interface CommercialInvoice {
  id: string;
  companyId: string;
  supplierId: string;
  currency: CurrencyCode;
  ciNo: string;
  ciDate: string; // YYYY-MM-DD
  ciValueFC: number;
  incoterm?: 'FOB' | 'CIF' | 'CFR' | 'EXW';
  landedCost?: CommercialInvoiceLandedCost;
  linkedPiId: string; // Primary linked PI or main link
  linkedPiSplits?: { piId: string; amountFC: number }[]; // In case one CI links to multiple PIs
  blDate?: string; // BL / AWB Date
  // BOE details (mandatory for complete CI)
  boeNo: string;
  boeDate: string; // YYYY-MM-DD
  portCode: string;
  boeExchangeRate: number; // Customs exchange rate
  taxInvoiceValueINR?: number; // Optional explicit INR override; defaults to purchaseINR
  assessableValueINR: number;
  customsDutyINR: number;
  swsINR?: number; // Social Welfare Surcharge (typically 10% of BCD)
  igstINR?: number; // Integrated GST paid at Customs (GSTR-2B ITC eligible)
  totalTaxINR?: number; // customsDutyINR + swsINR + igstINR
  taxPaidDate?: string; // YYYY-MM-DD (TR-6 / ICEGATE duty payment date)
  challanNo?: string; // Optional TR-6 / ICEGATE challan ref
  purchaseINR: number; // CI FC x BOE exchange rate
  tallyVoucherNo?: string;
  shipmentId?: string;
  igcrEligible?: boolean;
  igcrNotificationNo?: string;
  remarks?: string;
  attachments?: string;
  createdAt: string;
  updatedAt: string;
}

export type PaymentMode = 'Advance' | 'Balance' | 'Full advance' | 'LC' | 'Other';

export interface Payment {
  id: string;
  companyId: string;
  bankAccountId: string;
  paymentDate: string; // YYYY-MM-DD
  supplierId: string;
  currency: CurrencyCode;
  amountFC: number;
  actualExchangeRate: number; // Bank applied exchange rate
  inrAmount: number; // auto = amountFC * actualExchangeRate unless overridden
  inrOverride?: number; // "INR as per bank advice" override takes priority
  bankChargesINR?: number;
  gstOnChargesINR?: number;
  paymentAgainst: 'PI' | 'CI';
  linkedPiId?: string;
  linkedCiId?: string;
  paymentMode: PaymentMode;
  bankReferenceNo: string; // Bank's own transaction ref
  utrSwiftRef?: string;
  purposeCode?: string; // e.g. S0101 advance, S0102 against bill
  formA1RequestNo?: string;
  remarks?: string;
  attachments?: string;
  // LC specific fields
  lcNo?: string;
  lcOpenDate?: string;
  lcAmountFC?: number;
  lcDueDate?: string;
  lcStatus?: 'Open' | 'Paid'; // If 'Open', not treated as financial payment until 'Paid'
  createdAt: string;
  updatedAt: string;
}

export type DebitNoteReason = 'Short shipment' | 'Rate difference' | 'Quality claim' | 'Other';
export type DebitNoteRecoveryMethod = 'Refund' | 'Adjust against another PI or CI' | 'Write-off';

export interface DebitNote {
  id: string;
  companyId: string;
  supplierId: string;
  currency: CurrencyCode;
  dnNo: string;
  dnDate: string; // YYYY-MM-DD
  linkedPiId?: string;
  linkedCiId?: string;
  amountFC: number;
  rate: number; // FIFO rate from unapplied payment(s)
  inrAmount: number; // amountFC * rate
  reason: DebitNoteReason;
  referenceDocuments?: string; // links/filenames
  recoveryMethod: DebitNoteRecoveryMethod;
  status: 'Open' | 'Partially Recovered' | 'Fully Recovered' | 'Written Off';
  recoveredFC?: number;
  remarks?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RefundReceipt {
  id: string;
  companyId: string;
  bankAccountId: string;
  date: string; // YYYY-MM-DD
  supplierId: string;
  currency: CurrencyCode;
  amountFC: number;
  actualExchangeRate: number;
  inrAmount: number; // amountFC * actualExchangeRate
  againstDnId: string;
  bankReferenceNo?: string;
  remarks?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdjustmentTransfer {
  id: string;
  companyId: string;
  supplierId: string;
  currency: CurrencyCode;
  date: string; // YYYY-MM-DD
  fromType: 'PI' | 'CI' | 'DN';
  fromId: string;
  toType: 'PI' | 'CI';
  toId: string;
  amountFC: number;
  remarks?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OpeningBalance {
  id: string;
  companyId: string;
  supplierId: string;
  currency: CurrencyCode;
  referenceType: 'PI' | 'CI' | 'On account';
  referenceNo: string;
  referenceDate: string; // YYYY-MM-DD
  originalDocumentDate: string; // For ageing calculation
  boeNo?: string;
  balanceType: 'Dr' | 'Cr'; // Dr = Advance/excess (supplier holds our money), Cr = Payable
  amountFC: number;
  amountINR: number;
  rate: number; // auto = amountINR / amountFC
  remarks?: string;
  createdAt: string;
  updatedAt: string;
}

export type IDPMSStatus = 'Pending' | 'Submitted' | 'Settled';

export interface BOEBankSubmission {
  id: string;
  allocationId?: string;
  paymentId: string;
  ciId: string;
  boeNo: string;
  amountSubmittedFC: number;
  submissionDate: string;
  bankAccountId: string;
  bankAcknowledgementNo?: string;
  idpmsStatus: IDPMSStatus;
  remarks?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AllocationRecord {
  id: string;
  companyId: string;
  supplierId: string;
  currency: CurrencyCode;
  paymentId: string; // or OpeningBalance ID
  ciId: string;
  piId?: string;
  amountFC: number;
  paymentRate: number;
  boeRate: number;
  realizedGainLossINR: number; // amountFC * (boeRate - paymentRate)
  paymentDate: string;
  ciDate: string;
  boeNo: string;
  boeDate: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  user: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'IMPORT' | 'RESTORE' | 'BACKUP';
  entity: string;
  entityId: string;
  details: string;
}

export interface SupplierItemMapping {
  supplierId: string;
  supplierItemCode: string; // Item code as per Supplier PI / Invoice
  supplierItemName: string; // Item description as per Supplier PI / Invoice
}

export interface ItemMaster {
  id: string;
  companyId: string;
  itemCode: string;
  itemName: string;
  hsnCode: string;
  uom: string;
  defaultSupplierId?: string;
  defaultCurrency: CurrencyCode;
  standardRateFC: number;
  supplierMappings?: SupplierItemMapping[]; // Supplier-wise item code & name (itemCode/itemName = our SAP/Book)
  bcdRatePct: number;
  igstRatePct: number;
  igcrEligible: boolean;
  igcrBcdRatePct: number;
  igcrNotificationNo?: string;
  igcrEndUse?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PRItemLine {
  lineId: string;
  itemId?: string;
  itemCode: string;
  itemName: string;
  hsnCode: string;
  uom: string;
  supplierItemCode?: string;
  supplierItemName?: string;
  qtyRequired: number;
  preferredSupplierId: string;
  currency: CurrencyCode;
  targetUnitPriceFC: number;
  amountFC: number;
  linkedPiId?: string;
  orderedQty: number;
  remarks?: string;
}

export interface PurchaseRequisition {
  id: string;
  companyId: string;
  prNo: string;
  prDate: string; // YYYY-MM-DD
  requestedBy: string;
  department?: string;
  requiredByDate?: string;
  priority: 'Normal' | 'Urgent';
  status: 'Draft' | 'Approved' | 'Partially Ordered' | 'Converted to PI' | 'Closed';
  items: PRItemLine[];
  remarks?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShipmentItemLine {
  lineId: string;
  piLineId?: string;
  itemId?: string;
  itemCode: string;
  itemName: string;
  hsnCode: string;
  uom: string;
  supplierItemCode?: string;
  supplierItemName?: string;
  dispatchedQty: number;
  unitPriceFC: number;
  amountFC: number;
  bcdRatePct: number;
  igstRatePct: number;
  igcrEligible: boolean;
  igcrBcdRatePct: number;
  receivedQty: number;
  shortQty: number;
  receivedDate?: string;
  grnNo?: string;
}

export type ContainerType = '20ft GP' | '40ft GP' | '40ft HQ' | 'LCL' | 'Air Cargo';

export interface ContainerDetentionRisk {
  shipmentId: string;
  shipmentRefNo: string;
  piNo: string;
  supplierName: string;
  containerNo?: string;
  containerType?: ContainerType;
  shippingLine?: string;
  dischargeDate?: string;
  freeDetentionDays: number;
  detentionExpiryDate: string;
  daysRemaining: number;
  riskLevel: 'Safe' | 'Warning' | 'Critical' | 'Expired';
  emptyReturnedDate?: string;
  status: ShipmentPlan['status'];
}

export interface IDPMSAdvanceAlert {
  paymentId: string;
  companyId: string;
  companyCode: string;
  supplierId: string;
  supplierName: string;
  vendorCode: string;
  currency: string;
  paymentDate: string;
  amountFC: number;
  unsettledAmountFC: number;
  inrAmount: number;
  bankName: string;
  daysElapsed: number;
  daysRemaining: number;
  dueDate180: string; // paymentDate + 180 days
  status: 'Safe' | 'Warning' | 'Critical' | 'Overdue';
  linkedPiNo?: string;
}

export interface ShipmentPlan {
  id: string;
  companyId: string;
  supplierId: string;
  piId: string;
  currency: CurrencyCode;
  shipmentRefNo: string;
  mode: 'Sea' | 'Air' | 'Courier';
  shippingLine?: string;
  containerType?: ContainerType;
  freeDetentionDays?: number;
  portFreeDemurrageDays?: number;
  dischargeDate?: string;
  emptyReturnedDate?: string;
  dispatchDate?: string;
  etaPortDate?: string;
  expectedDutyDate?: string;
  expectedDeliveryDate?: string;
  portCode: string;
  blAwbNo?: string;
  containerNo?: string;
  estimatedExchangeRate: number;
  estimatedAssessableINR: number;
  estimatedBcdINR: number;
  estimatedSwsINR: number;
  estimatedIgstINR: number;
  estimatedTotalDutyINR: number;
  status: 'Planned' | 'Dispatched' | 'Arrived Port' | 'Part Received' | 'Received';
  actualReceiptDate?: string;
  grnNo?: string;
  linkedCiId?: string;
  items: ShipmentItemLine[];
  remarks?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IGCRLot {
  id: string;
  companyId: string;
  supplierId?: string;
  ciId?: string;
  shipmentId?: string;
  boeNo: string;
  boeDate: string;
  portCode: string;
  invoiceNo: string;
  invoiceSerialNo: string;
  itemSerialNo: string;
  itemCode?: string;
  itemDescription: string;
  hsnCode: string;
  uom: string;
  specifiedPurpose: string;
  notificationNo?: string;
  qtyImported: number;
  clearanceDate: string;
  assessableValueINR: number;
  normalBcdRatePct: number;
  concessionalBcdRatePct: number;
  bcdForegoneINR: number;
  otherDutyForegoneINR: number;
  igstForegoneINR: number;
  cessForegoneINR: number;
  totalDutyForegoneINR: number;
  qtyReceived: number;
  receiptDate?: string;
  qtyNotReceived: number;
  utilizationMonths: number;
  remarks?: string;
  createdAt: string;
  updatedAt: string;
}

export type IGCRConsumptionType =
  | 'MANUFACTURE_DOMESTIC'
  | 'END_USE_SUPPLY'
  | 'MANUFACTURE_EXPORT'
  | 'RE_EXPORT'
  | 'CLEARED_ON_DUTY';

export interface IGCRConsumption {
  id: string;
  companyId: string;
  lotId: string;
  date: string;
  type: IGCRConsumptionType;
  qty: number;
  documentNo?: string;
  differentialDutyPaidINR?: number;
  interestPaidINR?: number;
  remarks?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppDatabase {
  version: string;
  lastUpdated: string;
  companies: Company[];
  bankAccounts: BankAccount[];
  suppliers: Supplier[];
  currencies: CurrencyMaster[];
  monthEndRates: MonthEndRate[];
  settings: AppSettings;
  proformaInvoices: ProformaInvoice[];
  commercialInvoices: CommercialInvoice[];
  payments: Payment[];
  debitNotes: DebitNote[];
  refundReceipts: RefundReceipt[];
  adjustments: AdjustmentTransfer[];
  openingBalances: OpeningBalance[];
  boeSubmissions: BOEBankSubmission[];
  auditLogs: AuditLog[];
  items?: ItemMaster[];
  purchaseRequisitions?: PurchaseRequisition[];
  shipments?: ShipmentPlan[];
  igcrLots?: IGCRLot[];
  igcrConsumptions?: IGCRConsumption[];
}
