import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  formatFC,
  formatINR,
  parseDateToISO,
  formatDate,
} from '../utils/formatters';
import {
  FileSpreadsheet,
  ClipboardPaste,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Plus,
  X,
  Download,
  Copy,
  Sparkles,
  ArrowRight,
  Save,
  Check,
} from 'lucide-react';
import {
  CommercialInvoice,
  Payment,
  OpeningBalance,
  ItemMaster,
  ProformaInvoice,
  AdjustmentTransfer,
} from '../types';
import { findBestVendorMatch } from '../utils/vendorFuzzyMatcher';

export type ExcelImportEntity =
  | 'ci'
  | 'payments'
  | 'opening_balances'
  | 'items'
  | 'pi'
  | 'jv';

interface ExcelBatchGridModalProps {
  isOpen: boolean;
  initialEntity?: ExcelImportEntity;
  onClose: () => void;
}

interface ColumnDef {
  key: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  type?: 'text' | 'number' | 'date';
}

export const ExcelBatchGridModal: React.FC<ExcelBatchGridModalProps> = ({
  isOpen,
  initialEntity = 'ci',
  onClose,
}) => {
  const {
    db,
    selectedCompanyId,
    saveCI,
    savePayment,
    saveOpeningBalance,
    saveItem,
    savePI,
    saveAdjustment,
  } = useApp();

  const [entity, setEntity] = useState<ExcelImportEntity>(initialEntity);
  const [targetCompanyId, setTargetCompanyId] = useState<string>(
    selectedCompanyId !== 'ALL' ? selectedCompanyId : db.companies[0]?.id || ''
  );
  const [pasteText, setPasteText] = useState('');
  const [gridRows, setGridRows] = useState<Array<Record<string, string>>>([]);
  const [copiedTemplate, setCopiedTemplate] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null);
  const [autoCorrectionNotice, setAutoCorrectionNotice] = useState<string | null>(null);

  const vendorMap = useMemo(() => {
    const map = new Map<string, string>(); // code -> id
    const codeNameMap = new Map<string, string>();
    db.suppliers.forEach(s => {
      map.set(s.vendorCode.toUpperCase(), s.id);
      map.set(s.supplierName.toUpperCase(), s.id);
      codeNameMap.set(s.id, `${s.vendorCode} - ${s.supplierName}`);
    });
    return { idLookup: map, labelLookup: codeNameMap };
  }, [db.suppliers]);

  // Column Definitions per Entity
  const columns: ColumnDef[] = useMemo(() => {
    switch (entity) {
      case 'ci':
        return [
          { key: 'vendorCode', label: 'Vendor Code', required: true, placeholder: 'V00044' },
          { key: 'ciNo', label: 'Invoice No (CI)', required: true, placeholder: 'INV-2026-001' },
          { key: 'ciDate', label: 'Invoice Date', required: true, placeholder: 'YYYY-MM-DD', type: 'date' },
          { key: 'currency', label: 'Currency', required: true, placeholder: 'USD / CNY' },
          { key: 'ciValueFC', label: 'Invoice Value (FC)', required: true, type: 'number', placeholder: '10000.00' },
          { key: 'boeNo', label: 'BOE No', placeholder: 'BOE-123456' },
          { key: 'boeDate', label: 'BOE Date', placeholder: 'YYYY-MM-DD', type: 'date' },
          { key: 'boeExchangeRate', label: 'BOE Rate (INR)', placeholder: '87.50', type: 'number' },
          { key: 'portCode', label: 'Port Code', placeholder: 'INNSA1' },
          { key: 'customsDutyINR', label: 'Customs Duty (INR)', placeholder: '75000', type: 'number' },
          { key: 'linkedPiNo', label: 'Linked PI No', placeholder: 'PI-2026-01' },
        ];
      case 'payments':
        return [
          { key: 'vendorCode', label: 'Vendor Code', required: true, placeholder: 'V00044' },
          { key: 'paymentDate', label: 'Payment Date', required: true, placeholder: 'YYYY-MM-DD', type: 'date' },
          { key: 'currency', label: 'Currency', required: true, placeholder: 'USD / CNY' },
          { key: 'amountFC', label: 'Amount (FC)', required: true, type: 'number', placeholder: '5000.00' },
          { key: 'actualExchangeRate', label: 'Bank Rate', required: true, type: 'number', placeholder: '88.10' },
          { key: 'bankRefNo', label: 'Bank Ref No', placeholder: 'FT260401' },
          { key: 'swiftNo', label: 'SWIFT No', placeholder: 'SWIFT-2026-01' },
          { key: 'utrSwiftRef', label: 'UTR Ref', placeholder: 'HDFCR520260401...' },
          { key: 'paymentAgainst', label: 'Against (PI/CI)', placeholder: 'PI' },
          { key: 'linkedDocNo', label: 'Linked PI/CI No', placeholder: 'PI-2026-01' },
        ];
      case 'opening_balances':
        return [
          { key: 'vendorCode', label: 'Vendor Code', required: true, placeholder: 'V00044' },
          { key: 'balanceType', label: 'Type (Dr/Cr)', required: true, placeholder: 'Dr / Cr' },
          { key: 'refType', label: 'Ref Type (PI/CI/On account)', required: true, placeholder: 'PI / CI' },
          { key: 'refNo', label: 'Ref No', required: true, placeholder: 'OB-2026-01' },
          { key: 'refDate', label: 'Ref Date', required: true, placeholder: '2026-04-01', type: 'date' },
          { key: 'currency', label: 'Currency', required: true, placeholder: 'USD / CNY' },
          { key: 'amountFC', label: 'Amount FC', required: true, type: 'number', placeholder: '2185.00' },
          { key: 'amountINR', label: 'Amount INR', required: true, type: 'number', placeholder: '186270' },
        ];
      case 'items':
        return [
          { key: 'itemCode', label: 'Our Item Code (SAP)', required: true, placeholder: 'RM-LED-001' },
          { key: 'itemName', label: 'Item Description', required: true, placeholder: 'SMD LED Chip 2835' },
          { key: 'supplierItemCode', label: 'Supplier Item Code', placeholder: 'SUP-CHIP-99' },
          { key: 'hsnCode', label: 'HSN Code', required: true, placeholder: '85414100' },
          { key: 'uom', label: 'UOM', required: true, placeholder: 'PCS / KGS / MTR' },
          { key: 'stdPriceFC', label: 'Std Rate (FC)', placeholder: '0.05', type: 'number' },
          { key: 'currency', label: 'Currency', placeholder: 'USD' },
          { key: 'bcdRatePct', label: 'BCD %', placeholder: '7.5', type: 'number' },
          { key: 'igstRatePct', label: 'IGST %', placeholder: '18', type: 'number' },
          { key: 'vendorCode', label: 'Default Supplier Code', placeholder: 'V00044' },
        ];
      case 'pi':
        return [
          { key: 'vendorCode', label: 'Vendor Code', required: true, placeholder: 'V00044' },
          { key: 'piNo', label: 'Proforma Invoice No', required: true, placeholder: 'PI-2026-001' },
          { key: 'piDate', label: 'PI Date', required: true, placeholder: 'YYYY-MM-DD', type: 'date' },
          { key: 'currency', label: 'Currency', required: true, placeholder: 'USD / CNY' },
          { key: 'piValueFC', label: 'PI Value (FC)', required: true, type: 'number', placeholder: '15000.00' },
          { key: 'advancePercentage', label: 'Advance %', placeholder: '30', type: 'number' },
          { key: 'paymentTerms', label: 'Payment Terms', placeholder: 'Advance / CAD / LC' },
          { key: 'creditDays', label: 'Credit Days', placeholder: '60', type: 'number' },
        ];
      case 'jv':
        return [
          { key: 'vendorCode', label: 'Vendor Code', required: true, placeholder: 'V00044' },
          { key: 'date', label: 'JV Date', required: true, placeholder: 'YYYY-MM-DD', type: 'date' },
          { key: 'currency', label: 'Currency', required: true, placeholder: 'USD / CNY' },
          { key: 'fromType', label: 'From (PI/CI/DN)', required: true, placeholder: 'PI' },
          { key: 'fromDocNo', label: 'From Doc No', required: true, placeholder: 'PI-2026-01' },
          { key: 'toType', label: 'To (PI/CI)', required: true, placeholder: 'CI' },
          { key: 'toDocNo', label: 'To Doc No', required: true, placeholder: 'INV-8899' },
          { key: 'amountFC', label: 'Amount FC', required: true, type: 'number', placeholder: '1000.00' },
          { key: 'remarks', label: 'Remarks / Narration', placeholder: 'Excess advance adjusted' },
        ];
      default:
        return [];
    }
  }, [entity]);

  // Parse Clipboard / Pasted Text (Tab Separated Values)
  const handleParsePaste = (rawText: string) => {
    if (!rawText.trim()) return;
    setAutoCorrectionNotice(null);

    const lines = rawText.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length === 0) return;

    // Check if line 0 looks like header
    const firstLineCells = lines[0].split('\t').map(c => c.trim().toLowerCase());
    const hasHeader = columns.some(col =>
      firstLineCells.some(cell => cell.includes(col.key.toLowerCase()) || cell.includes(col.label.toLowerCase()))
    );

    const startIndex = hasHeader ? 1 : 0;
    const newRows: Array<Record<string, string>> = [];
    const corrections: string[] = [];

    for (let i = startIndex; i < lines.length; i++) {
      const cells = lines[i].split('\t').map(c => c.trim().replace(/^["']|["']$/g, ''));
      if (cells.length === 0 || cells.every(c => !c)) continue;

      const rowObj: Record<string, string> = {};
      columns.forEach((col, cIdx) => {
        rowObj[col.key] = cells[cIdx] || '';
      });

      // Smart Vendor Resolution & Auto-Correction for typos/shorthand/names
      if (rowObj.vendorCode?.trim()) {
        const match = findBestVendorMatch(rowObj.vendorCode, db.suppliers);
        if (match.matched && match.officialVendorCode) {
          if (match.isAutoCorrected && rowObj.vendorCode !== match.officialVendorCode) {
            corrections.push(`"${rowObj.vendorCode}" → ${match.officialVendorCode} (${match.officialSupplierName})`);
            rowObj.vendorCode = match.officialVendorCode;
          }
        }
      }

      newRows.push(rowObj);
    }

    if (corrections.length > 0) {
      setAutoCorrectionNotice(
        `⚡ Smart Auto-Correction: Corrected ${corrections.length} vendor spelling/shorthand error(s) based on Vendor Master (${corrections.slice(0, 3).join(', ')}${corrections.length > 3 ? '...' : ''})`
      );
    }

    setGridRows(prev => [...prev, ...newRows]);
    setPasteText('');
  };

  // Copy Template Header to Clipboard
  const handleCopyTemplate = () => {
    const headers = columns.map(c => c.label).join('\t');
    navigator.clipboard.writeText(headers);
    setCopiedTemplate(true);
    setTimeout(() => setCopiedTemplate(false), 2000);
  };

  // Add Empty Row
  const handleAddEmptyRow = () => {
    const emptyRow: Record<string, string> = {};
    columns.forEach(col => {
      emptyRow[col.key] = col.key === 'currency' ? 'USD' : '';
    });
    setGridRows(prev => [...prev, emptyRow]);
  };

  // Update specific cell in grid
  const handleCellChange = (rowIndex: number, key: string, val: string) => {
    setGridRows(prev => {
      const copy = [...prev];
      copy[rowIndex] = { ...copy[rowIndex], [key]: val };
      return copy;
    });
  };

  // Delete row
  const handleDeleteRow = (rowIndex: number) => {
    setGridRows(prev => prev.filter((_, idx) => idx !== rowIndex));
  };

  // Validation function per row
  const validateRow = (row: Record<string, string>): { isValid: boolean; error?: string } => {
    // Check vendorCode if applicable
    if (columns.some(c => c.key === 'vendorCode')) {
      const rawVendor = (row.vendorCode || '').trim();
      if (!rawVendor) return { isValid: false, error: 'Vendor Code required' };
      const match = findBestVendorMatch(rawVendor, db.suppliers);
      if (!match.matched) {
        if (match.suggestion) {
          return {
            isValid: false,
            error: `Vendor "${rawVendor}" not recognized. Did you mean: ${match.suggestion.vendorCode} (${match.suggestion.supplierName})?`,
          };
        }
        return { isValid: false, error: `Supplier "${rawVendor}" not found in Masters` };
      }
    }

    // Check required fields
    for (const col of columns) {
      if (col.required && !row[col.key]?.trim()) {
        return { isValid: false, error: `${col.label} is required` };
      }
      if (col.type === 'number' && row[col.key]?.trim()) {
        const num = parseFloat(row[col.key].replace(/,/g, ''));
        if (isNaN(num)) return { isValid: false, error: `${col.label} must be a number` };
      }
    }

    return { isValid: true };
  };

  // Row validation summary
  const validationSummary = useMemo(() => {
    let validCount = 0;
    let errorCount = 0;
    const validated = gridRows.map((row, idx) => {
      const res = validateRow(row);
      if (res.isValid) validCount++;
      else errorCount++;
      return { rowIndex: idx, ...res };
    });
    return { validCount, errorCount, validated };
  }, [gridRows, columns, db.suppliers]);

  // Save All to Application
  const handleSaveAndApply = () => {
    setSaveErrorMsg(null);
    setSaveSuccessMsg(null);

    if (gridRows.length === 0) {
      setSaveErrorMsg('No rows to import. Please paste or add rows first.');
      return;
    }

    const invalid = validationSummary.validated.find(v => !v.isValid);
    if (invalid) {
      setSaveErrorMsg(`Row #${invalid.rowIndex + 1} has an error: ${invalid.error}. Please correct it before saving.`);
      return;
    }

    const compId = targetCompanyId || db.companies[0]?.id || '';
    let successCount = 0;

    try {
      if (entity === 'ci') {
        for (const row of gridRows) {
          const suppMatch = findBestVendorMatch(row.vendorCode, db.suppliers);
          const suppId = suppMatch.supplier?.id || '';
          const ciVal = parseFloat(row.ciValueFC.replace(/,/g, '')) || 0;
          const boeRate = parseFloat(row.boeExchangeRate?.replace(/,/g, '')) || 87.5;
          const purchaseINR = Math.round(ciVal * boeRate);

          // Find linked PI if provided
          let linkedPiId: string | undefined = undefined;
          if (row.linkedPiNo?.trim()) {
            const pi = db.proformaInvoices.find(
              p => p.piNo.toLowerCase() === row.linkedPiNo.trim().toLowerCase()
            );
            if (pi) linkedPiId = pi.id;
          }

          const ci: CommercialInvoice = {
            id: `CI-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            companyId: compId,
            supplierId: suppId,
            currency: (row.currency?.trim().toUpperCase() as any) || 'USD',
            ciNo: row.ciNo.trim(),
            ciDate: parseDateToISO(row.ciDate) || new Date().toISOString().split('T')[0],
            ciValueFC: ciVal,
            boeExchangeRate: boeRate,
            assessableValueINR: Math.round(ciVal * boeRate),
            purchaseINR,
            boeNo: row.boeNo?.trim() || '',
            boeDate: (row.boeDate?.trim() ? parseDateToISO(row.boeDate) : '') || new Date().toISOString().split('T')[0],
            portCode: row.portCode?.trim() || 'INNSA1',
            customsDutyINR: parseFloat(row.customsDutyINR?.replace(/,/g, '')) || 0,
            linkedPiId: linkedPiId || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          saveCI(ci);
          successCount++;
        }
      } else if (entity === 'payments') {
        const defaultBankId = db.bankAccounts[0]?.id || '';
        for (const row of gridRows) {
          const suppMatch = findBestVendorMatch(row.vendorCode, db.suppliers);
          const suppId = suppMatch.supplier?.id || '';
          const amtFC = parseFloat(row.amountFC.replace(/,/g, '')) || 0;
          const rate = parseFloat(row.actualExchangeRate.replace(/,/g, '')) || 88.0;
          const inr = Math.round(amtFC * rate);

          let linkedPiId: string | undefined = undefined;
          let linkedCiId: string | undefined = undefined;
          if (row.linkedDocNo?.trim()) {
            const pi = db.proformaInvoices.find(p => p.piNo.toLowerCase() === row.linkedDocNo.trim().toLowerCase());
            if (pi) linkedPiId = pi.id;
            const ci = db.commercialInvoices.find(c => c.ciNo.toLowerCase() === row.linkedDocNo.trim().toLowerCase());
            if (ci) linkedCiId = ci.id;
          }

          const pmt: Payment = {
            id: `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            companyId: compId,
            bankAccountId: defaultBankId,
            paymentDate: parseDateToISO(row.paymentDate) || new Date().toISOString().split('T')[0],
            supplierId: suppId,
            currency: (row.currency?.trim().toUpperCase() as any) || 'USD',
            amountFC: amtFC,
            actualExchangeRate: rate,
            inrAmount: inr,
            paymentAgainst: (row.paymentAgainst?.toUpperCase() === 'CI' ? 'CI' : 'PI'),
            linkedPiId,
            linkedCiId,
            paymentMode: 'Advance',
            bankReferenceNo: row.bankRefNo?.trim() || `REF-${Date.now()}`,
            swiftNo: row.swiftNo?.trim() || undefined,
            utrNo: row.utrSwiftRef?.trim() || undefined,
            utrSwiftRef: row.swiftNo?.trim() ? `SWIFT:${row.swiftNo.trim()}` : (row.utrSwiftRef?.trim() || undefined),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          savePayment(pmt);
          successCount++;
        }
      } else if (entity === 'opening_balances') {
        for (const row of gridRows) {
          const suppMatch = findBestVendorMatch(row.vendorCode, db.suppliers);
          const suppId = suppMatch.supplier?.id || '';
          const amtFC = parseFloat(row.amountFC.replace(/,/g, '')) || 0;
          const amtINR = parseFloat(row.amountINR?.replace(/,/g, '')) || Math.round(amtFC * 87.5);
          const rate = amtFC > 0 ? Number((amtINR / amtFC).toFixed(4)) : 87.5;

          const obDate = parseDateToISO(row.refDate) || new Date().toISOString().split('T')[0];
          const ob: OpeningBalance = {
            id: `OB-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            companyId: compId,
            supplierId: suppId,
            currency: (row.currency?.trim().toUpperCase() as any) || 'USD',
            balanceType: (row.balanceType?.toLowerCase().includes('cr') ? 'Cr' : 'Dr'),
            referenceType: (row.refType?.toLowerCase().includes('ci') ? 'CI' : row.refType?.toLowerCase().includes('pi') ? 'PI' : 'On account'),
            referenceNo: row.refNo.trim(),
            referenceDate: obDate,
            originalDocumentDate: obDate,
            amountFC: amtFC,
            amountINR: amtINR,
            rate,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          saveOpeningBalance(ob);
          successCount++;
        }
      } else if (entity === 'items') {
        for (const row of gridRows) {
          const defSuppId = row.vendorCode?.trim()
            ? findBestVendorMatch(row.vendorCode, db.suppliers).supplier?.id
            : undefined;

          const itm: ItemMaster = {
            id: `ITEM-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            companyId: compId,
            itemCode: row.itemCode.trim(),
            itemName: row.itemName.trim(),
            hsnCode: row.hsnCode.trim(),
            uom: row.uom?.trim() || 'PCS',
            defaultSupplierId: defSuppId,
            defaultCurrency: (row.currency?.trim().toUpperCase() as any) || 'USD',
            standardRateFC: parseFloat(row.stdPriceFC?.replace(/,/g, '')) || 0,
            supplierMappings: row.supplierItemCode?.trim() ? [
              {
                supplierId: defSuppId || '',
                supplierItemCode: row.supplierItemCode.trim(),
                supplierItemName: row.itemName.trim(),
              }
            ] : undefined,
            bcdRatePct: parseFloat(row.bcdRatePct?.replace(/,/g, '')) || 7.5,
            igstRatePct: parseFloat(row.igstRatePct?.replace(/,/g, '')) || 18,
            igcrEligible: false,
            igcrBcdRatePct: 0,
            active: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          saveItem(itm);
          successCount++;
        }
      } else if (entity === 'pi') {
        for (const row of gridRows) {
          const suppMatch = findBestVendorMatch(row.vendorCode, db.suppliers);
          const suppId = suppMatch.supplier?.id || '';
          const piVal = parseFloat(row.piValueFC.replace(/,/g, '')) || 0;

          const pi: ProformaInvoice = {
            id: `PI-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            companyId: compId,
            supplierId: suppId,
            piNo: row.piNo.trim(),
            piDate: parseDateToISO(row.piDate) || new Date().toISOString().split('T')[0],
            currency: (row.currency?.trim().toUpperCase() as any) || 'USD',
            piValueFC: piVal,
            advancePercentage: parseFloat(row.advancePercentage?.replace(/,/g, '')) || 30,
            paymentTerms: (row.paymentTerms as any) || 'Advance',
            creditDays: parseInt(row.creditDays?.replace(/,/g, ''), 10) || 0,
            isClosed: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          savePI(pi);
          successCount++;
        }
      } else if (entity === 'jv') {
        for (const row of gridRows) {
          const suppMatch = findBestVendorMatch(row.vendorCode, db.suppliers);
          const suppId = suppMatch.supplier?.id || '';
          const amt = parseFloat(row.amountFC.replace(/,/g, '')) || 0;

          const jv: AdjustmentTransfer = {
            id: `ADJ-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            companyId: compId,
            supplierId: suppId,
            currency: (row.currency?.trim().toUpperCase() as any) || 'USD',
            date: parseDateToISO(row.date) || new Date().toISOString().split('T')[0],
            fromType: (row.fromType?.toUpperCase() as any) || 'PI',
            fromId: row.fromDocNo.trim(),
            toType: (row.toType?.toUpperCase() as any) || 'CI',
            toId: row.toDocNo.trim(),
            amountFC: amt,
            remarks: row.remarks?.trim() || 'Excel Batch JV Adjustment',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          saveAdjustment(jv);
          successCount++;
        }
      }

      setSaveSuccessMsg(`🎉 Successfully imported and applied ${successCount} records into the application!`);
      setTimeout(() => {
        setGridRows([]);
        onClose();
      }, 1500);
    } catch (err: any) {
      setSaveErrorMsg(`Save failed: ${err?.message || 'Unknown error occurred'}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-3 sm:p-5">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-white/10 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden transition-colors">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200/80 dark:border-white/10 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800/50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 via-teal-500 to-indigo-600 text-white flex items-center justify-center font-bold shadow-md shadow-emerald-500/25">
              <ClipboardPaste className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight">
                  Excel Copy-Paste & Inline Spreadsheet Editor
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800/80 uppercase">
                  Batch Importer
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Excel se Ctrl+C karein aur yahan seedha Ctrl+V karein. Data ko table me edit karein aur 1-click me save karein!
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Target Entity Switcher & Company Pill */}
        <div className="px-6 py-3 border-b border-slate-200/70 dark:border-white/10 bg-white/60 dark:bg-slate-900/60 flex flex-wrap items-center justify-between gap-3">
          {/* Entity Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1">Data Type:</span>
            {[
              { id: 'ci', label: 'Commercial Invoices (Purchase / CI)', icon: FileSpreadsheet },
              { id: 'payments', label: 'Payments (Remittances)', icon: FileSpreadsheet },
              { id: 'opening_balances', label: 'Opening Balances (Dr/Cr)', icon: FileSpreadsheet },
              { id: 'items', label: 'Item Master (HSN / Duty)', icon: FileSpreadsheet },
              { id: 'pi', label: 'Proforma Invoices (PI)', icon: FileSpreadsheet },
              { id: 'jv', label: 'Journal Vouchers (JV)', icon: FileSpreadsheet },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  setEntity(tab.id as any);
                  setGridRows([]);
                  setSaveErrorMsg(null);
                  setSaveSuccessMsg(null);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${entity === tab.id
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                  : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Target Company */}
          <div className="flex items-center space-x-2 text-xs">
            <span className="font-semibold text-slate-500 dark:text-slate-400">Target Entity:</span>
            <select
              value={targetCompanyId}
              onChange={e => setTargetCompanyId(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 font-bold text-slate-900 dark:text-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 focus:outline-none cursor-pointer"
            >
              {db.companies.map(c => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.fullName}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* Paste Zone Box */}
          <div className="bg-gradient-to-r from-emerald-50/60 via-teal-50/40 to-indigo-50/50 dark:from-emerald-950/20 dark:via-slate-800/40 dark:to-indigo-950/20 p-4 rounded-2xl border-2 border-dashed border-emerald-300 dark:border-emerald-700/60 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center space-x-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Step 1: Excel se rows copy karein aur yahan Paste karein:</span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleCopyTemplate}
                  className="flex items-center space-x-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 shadow-2xs transition-all cursor-pointer"
                  title="Copy expected column headers to paste into Excel"
                >
                  {copiedTemplate ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                  <span>{copiedTemplate ? 'Headers Copied!' : 'Copy Excel Headers Template'}</span>
                </button>
              </div>
            </div>

            <textarea
              rows={3}
              placeholder="Excel me se rows copy karke yahan direct Paste (Ctrl+V) karein..."
              value={pasteText}
              onChange={e => {
                setPasteText(e.target.value);
                handleParsePaste(e.target.value);
              }}
              onPaste={e => {
                const text = e.clipboardData.getData('text');
                if (text) {
                  e.preventDefault();
                  handleParsePaste(text);
                }
              }}
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-white/10 rounded-xl p-3 text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 shadow-inner"
            />

            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-1">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Expected Columns Order:</span>
                <span className="font-mono text-indigo-600 dark:text-indigo-400">
                  {columns.map(c => c.label).join(' • ')}
                </span>
              </div>
              {gridRows.length > 0 && (
                <button
                  onClick={() => setGridRows([])}
                  className="text-rose-600 hover:text-rose-700 font-bold hover:underline cursor-pointer"
                >
                  Clear All ({gridRows.length} rows)
                </button>
              )}
            </div>
          </div>

          {/* Auto-Correction Notice Banner */}
          {autoCorrectionNotice && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-amber-500/15 via-indigo-500/10 to-emerald-500/15 border border-amber-300 dark:border-amber-600/50 text-xs font-bold text-slate-900 dark:text-slate-100 shadow-xs">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                <span>{autoCorrectionNotice}</span>
              </div>
              <button
                onClick={() => setAutoCorrectionNotice(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1"
                title="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Interactive Editable Spreadsheet Grid */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                  Step 2: Interactive Grid Editor ({gridRows.length} Rows Parsed)
                </h4>
                {gridRows.length > 0 && (
                  <div className="flex items-center space-x-2">
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      <CheckCircle2 className="w-3 h-3" />
                      {validationSummary.validCount} Ready
                    </span>
                    {validationSummary.errorCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                        <AlertTriangle className="w-3 h-3" />
                        {validationSummary.errorCount} Need Fix
                      </span>
                    )}
                  </div>
                )}
              </div>

              <button
                onClick={handleAddEmptyRow}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-indigo-600" />
                <span>+ Add Row Manually</span>
              </button>
            </div>

            {/* Grid Table */}
            <div className="overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-white/10 shadow-xs max-h-80 overflow-y-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-100/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200 dark:border-white/10 sticky top-0 z-10 backdrop-blur-md">
                  <tr>
                    <th className="px-2.5 py-2.5 text-center w-10">#</th>
                    <th className="px-2.5 py-2.5 text-center w-20">Status</th>
                    {columns.map(col => (
                      <th key={col.key} className="px-3 py-2.5 whitespace-nowrap min-w-[130px]">
                        <span>{col.label}</span>
                        {col.required && <span className="text-rose-500 ml-0.5">*</span>}
                      </th>
                    ))}
                    <th className="px-2 py-2.5 text-center w-10">Del</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-medium text-slate-700 dark:text-slate-300">
                  {gridRows.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length + 3} className="px-4 py-12 text-center text-slate-400 dark:text-slate-500">
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <FileSpreadsheet className="w-8 h-8 opacity-40 text-indigo-500" />
                          <p className="font-semibold text-xs">Abhi koi rows paste nahi hui hain.</p>
                          <p className="text-[11px] text-slate-400">
                            Excel me columns copy karke upar wale box me <strong>Ctrl+V</strong> karein, ya <strong>+ Add Row Manually</strong> par click karein.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    gridRows.map((row, rIdx) => {
                      const v = validationSummary.validated[rIdx];
                      const isValid = v?.isValid;

                      return (
                        <tr
                          key={rIdx}
                          className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors ${!isValid ? 'bg-rose-50/30 dark:bg-rose-950/15' : ''
                            }`}
                        >
                          <td className="px-2.5 py-2 text-center text-slate-400 font-mono text-[11px]">
                            {rIdx + 1}
                          </td>
                          <td className="px-2.5 py-2 text-center">
                            {isValid ? (
                              <span className="inline-flex items-center text-emerald-600 dark:text-emerald-400" title="Valid">
                                <CheckCircle2 className="w-4 h-4" />
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center text-rose-500 dark:text-rose-400 cursor-help"
                                title={v?.error}
                              >
                                <AlertTriangle className="w-4 h-4" />
                              </span>
                            )}
                          </td>

                          {columns.map(col => {
                            const val = row[col.key] || '';
                            const isVendorCol = col.key === 'vendorCode';
                            const vendorMatch = isVendorCol && val ? findBestVendorMatch(val, db.suppliers) : null;

                            return (
                              <td key={col.key} className="px-2 py-1.5 align-top">
                                <div className="relative">
                                  <input
                                    type="text"
                                    list={isVendorCol ? 'vendor-master-datalist' : undefined}
                                    value={val}
                                    placeholder={col.placeholder}
                                    onChange={e => handleCellChange(rIdx, col.key, e.target.value)}
                                    className={`w-full bg-white dark:bg-slate-800 px-2.5 py-1 rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 border transition-all ${col.required && !val.trim()
                                      ? 'border-rose-300 dark:border-rose-700 bg-rose-50/20'
                                      : isVendorCol && vendorMatch?.matched
                                        ? 'border-emerald-300 dark:border-emerald-800 text-slate-900 dark:text-white'
                                        : isVendorCol && val.trim() && !vendorMatch?.matched
                                          ? 'border-rose-300 dark:border-rose-700 bg-rose-50/10'
                                          : 'border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white'
                                      }`}
                                  />
                                  {isVendorCol && vendorMatch?.matched && (
                                    <span
                                      className="absolute right-2 top-1.5 text-[10px] text-emerald-600 dark:text-emerald-400 font-bold"
                                      title={`Matched: ${vendorMatch.officialVendorCode} - ${vendorMatch.officialSupplierName}`}
                                    >
                                      ✓
                                    </span>
                                  )}
                                </div>

                                {/* Intelligent Supplier Resolution / Auto-Correction Pills */}
                                {isVendorCol && val.trim() && vendorMatch && (
                                  <div className="mt-1 min-w-[140px] max-w-[200px]">
                                    {vendorMatch.matched ? (
                                      <div
                                        className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 truncate flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.5 rounded border border-emerald-200/60 dark:border-emerald-800/60"
                                        title={`${vendorMatch.officialVendorCode} — ${vendorMatch.officialSupplierName}`}
                                      >
                                        <Check className="w-2.5 h-2.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                        <span className="truncate">{vendorMatch.officialSupplierName}</span>
                                      </div>
                                    ) : vendorMatch.suggestion ? (
                                      <button
                                        type="button"
                                        onClick={() => handleCellChange(rIdx, col.key, vendorMatch.suggestion!.vendorCode)}
                                        className="text-[9.5px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300/80 dark:border-amber-700 text-left truncate w-full flex items-center gap-1 cursor-pointer transition-colors"
                                        title={`Typo detected. Click to auto-fill ${vendorMatch.suggestion.vendorCode} (${vendorMatch.suggestion.supplierName})`}
                                      >
                                        <Sparkles className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                                        <span className="truncate">Fix: {vendorMatch.suggestion.vendorCode}?</span>
                                      </button>
                                    ) : (
                                      <div className="text-[9.5px] text-rose-500 dark:text-rose-400 font-medium px-1">
                                        Not in Masters
                                      </div>
                                    )}
                                  </div>
                                )}
                              </td>
                            );
                          })}

                          <td className="px-2 py-2 text-center">
                            <button
                              onClick={() => handleDeleteRow(rIdx)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                              title="Delete row"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
              <datalist id="vendor-master-datalist">
                {db.suppliers.map(s => (
                  <option key={s.id} value={s.vendorCode}>
                    {s.vendorCode} — {s.supplierName} ({s.defaultCurrency})
                  </option>
                ))}
              </datalist>
            </div>
          </div>

          {/* Success / Error Messages */}
          {saveErrorMsg && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 rounded-2xl flex items-center gap-2 text-xs text-rose-900 dark:text-rose-300 font-semibold">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{saveErrorMsg}</span>
            </div>
          )}

          {saveSuccessMsg && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 rounded-2xl flex items-center gap-2 text-xs text-emerald-900 dark:text-emerald-300 font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{saveSuccessMsg}</span>
            </div>
          )}
        </div>

        {/* Modal Footer & Save Button */}
        <div className="px-6 py-4 border-t border-slate-200/80 dark:border-white/10 flex flex-wrap items-center justify-between gap-3 bg-slate-50/80 dark:bg-slate-800/50">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>Rows: <strong className="text-slate-900 dark:text-white">{gridRows.length}</strong></span>
            <span className="mx-2">•</span>
            <span>Valid: <strong className="text-emerald-600 dark:text-emerald-400">{validationSummary.validCount}</strong></span>
            {validationSummary.errorCount > 0 && (
              <>
                <span className="mx-2">•</span>
                <span>Errors: <strong className="text-rose-600 dark:text-rose-400">{validationSummary.errorCount}</strong></span>
              </>
            )}
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveAndApply}
              disabled={gridRows.length === 0 || validationSummary.errorCount > 0}
              className={`flex items-center space-x-2 px-5 py-2 rounded-xl text-xs font-extrabold transition-all shadow-md cursor-pointer ${gridRows.length > 0 && validationSummary.errorCount === 0
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-emerald-600/30'
                : 'bg-slate-300 dark:bg-slate-800 text-slate-500 cursor-not-allowed opacity-60'
                }`}
            >
              <Save className="w-4 h-4" />
              <span>Save & Apply to System ({gridRows.length} Rows)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
