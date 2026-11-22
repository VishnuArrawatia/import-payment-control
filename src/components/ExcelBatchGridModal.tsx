import React, { useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { useApp } from '../context/AppContext';
import {
  parseDateToISO,
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
  Upload,
  FileUp,
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
import { parseExcelFile, exportToExcel } from '../utils/excel';

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

const COLUMN_SYNONYMS: Record<ExcelImportEntity, Record<string, string[]>> = {
  ci: {
    vendorCode: ['vendor code', 'vendor_code', 'vendor', 'supplier code', 'party code', 'vcode', 'supp code', 'code'],
    ciNo: ['invoice no', 'invoice_no', 'inv no', 'ci no', 'bill no', 'ci_no', 'invoice', 'ci', 'bill'],
    ciDate: ['invoice date', 'invoice_date', 'inv date', 'ci date', 'bill date', 'date'],
    currency: ['currency', 'curr', 'curr.', 'ccy'],
    ciValueFC: ['invoice value (fc)', 'invoice value', 'ci value', 'amount fc', 'amount (fc)', 'fc amount', 'value fc', 'amount', 'usd', 'cny', 'fc value', 'total fc'],
    boeNo: ['boe no', 'boe_no', 'boe', 'bill of entry', 'b/e no', 'be no'],
    boeDate: ['boe date', 'boe_date', 'b/e date', 'be date'],
    boeExchangeRate: ['boe rate', 'boe_exchange_rate', 'exchange rate', 'rate', 'customs rate', 'boe exch rate'],
    portCode: ['port code', 'port', 'customs port'],
    customsDutyINR: ['customs duty (inr)', 'customs duty', 'duty inr', 'duty'],
    linkedPiNo: ['linked pi no', 'linked pi', 'pi no', 'pi ref'],
  },
  payments: {
    vendorCode: ['vendor code', 'vendor_code', 'vendor', 'supplier code', 'party code', 'vcode', 'supp code', 'code'],
    paymentDate: ['payment date', 'payment_date', 'paid date', 'remittance date', 'date'],
    currency: ['currency', 'curr', 'curr.', 'ccy'],
    amountFC: ['amount (fc)', 'amount fc', 'amount_fc', 'paid fc', 'remittance fc', 'amount', 'fc'],
    actualExchangeRate: ['bank rate', 'actual exchange rate', 'actual_exchange_rate', 'rate', 'tt rate', 'exchange rate'],
    bankRefNo: ['bank ref no', 'bank ref', 'bank reference', 'ref no', 'ft no'],
    swiftNo: ['swift no', 'swift number', 'swift ref', 'swift'],
    utrSwiftRef: ['utr ref', 'utr', 'utr no', 'bank utr', 'reference'],
    paymentAgainst: ['against (pi/ci)', 'against', 'payment against', 'pi/ci', 'type'],
    linkedDocNo: ['linked pi/ci no', 'linked doc no', 'linked no', 'linked pi', 'linked ci'],
  },
  opening_balances: {
    vendorCode: ['vendor code', 'vendor_code', 'vendor', 'supplier code', 'party code', 'vcode', 'supp code', 'code'],
    balanceType: ['type (dr/cr)', 'balance type', 'balance_type', 'type', 'dr/cr', 'dr / cr'],
    refType: ['ref type (pi/ci/on account)', 'ref type', 'ref_type', 'reference type'],
    refNo: ['ref no', 'ref_no', 'reference no', 'doc no'],
    refDate: ['ref date', 'ref_date', 'reference date', 'date'],
    currency: ['currency', 'curr', 'curr.', 'ccy'],
    amountFC: ['amount fc', 'opening in fc', 'amount (fc)', 'opening fc', 'amount_fc', 'fc'],
    amountINR: ['amount inr', 'opening in inr', 'amount (inr)', 'opening inr', 'amount_inr', 'inr'],
  },
  items: {
    itemCode: ['our item code (sap)', 'item code', 'item_code', 'code', 'part no', 'sap code'],
    itemName: ['item description', 'item name', 'item_name', 'description', 'material description'],
    supplierItemCode: ['supplier item code', 'supplier part no', 'vendor item code'],
    hsnCode: ['hsn code', 'hsn', 'hsn_code', 'itc hsn'],
    uom: ['uom', 'unit', 'unit of measure'],
    stdPriceFC: ['std rate (fc)', 'std price', 'price fc', 'standard rate', 'rate fc'],
    currency: ['currency', 'curr', 'ccy'],
    bcdRatePct: ['bcd %', 'bcd rate', 'bcd pct', 'bcd'],
    igstRatePct: ['igst %', 'igst rate', 'igst pct', 'igst'],
    vendorCode: ['default supplier code', 'default vendor code', 'vendor code', 'vendor'],
  },
  pi: {
    vendorCode: ['vendor code', 'vendor_code', 'vendor', 'supplier code', 'party code', 'vcode', 'supp code', 'code'],
    piNo: ['proforma invoice no', 'pi no', 'pi_no', 'pi number', 'pi'],
    piDate: ['pi date', 'pi_date', 'date'],
    currency: ['currency', 'curr', 'curr.', 'ccy'],
    piValueFC: ['pi value (fc)', 'pi value', 'amount fc', 'amount (fc)', 'value fc', 'amount'],
    advancePercentage: ['advance %', 'advance pct', 'advance percentage', 'adv %'],
    paymentTerms: ['payment terms', 'terms', 'payment mode'],
    creditDays: ['credit days', 'credit period', 'days'],
  },
  jv: {
    vendorCode: ['vendor code', 'vendor_code', 'vendor', 'supplier code', 'party code', 'vcode', 'supp code', 'code'],
    date: ['jv date', 'date', 'voucher date'],
    currency: ['currency', 'curr', 'ccy'],
    fromType: ['from (pi/ci/dn)', 'from type', 'from'],
    fromDocNo: ['from doc no', 'from doc', 'from no'],
    toType: ['to (pi/ci)', 'to type', 'to'],
    toDocNo: ['to doc no', 'to doc', 'to no'],
    amountFC: ['amount fc', 'amount', 'adjustment amount'],
    remarks: ['remarks / narration', 'remarks', 'narration', 'note'],
  },
};

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

  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
          { key: 'refType', label: 'Ref Type (PI/CI/On account)', required: true, placeholder: 'PI / CI / On account' },
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

  // Clean raw cell input value (handle currency symbols, commas, negative numbers)
  const cleanCellValue = (val: string, colDef?: ColumnDef): string => {
    if (!val) return '';
    let cleaned = val.trim().replace(/^["']|["']$/g, '');
    if (colDef?.type === 'number') {
      // Remove currency symbols, commas, spaces
      cleaned = cleaned.replace(/[$¥₹, ]/g, '');
      // Handle parentheses negative e.g. (4996.00) -> -4996.00
      if (/^\(.*\)$/.test(cleaned)) {
        cleaned = '-' + cleaned.replace(/[()]/g, '');
      }
    } else if (colDef?.type === 'date') {
      const iso = parseDateToISO(cleaned);
      if (iso) cleaned = iso;
    }
    return cleaned;
  };

  // Smart Parse Clipboard / Pasted Text (Tab/CSV Separated with Header Awareness)
  const handleParsePaste = (rawText: string) => {
    if (!rawText.trim()) return;
    setAutoCorrectionNotice(null);

    const rawLines = rawText.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (rawLines.length === 0) return;

    // Detect delimiter: tab or comma or semicolon
    const firstLine = rawLines[0];
    const isTab = firstLine.includes('\t');
    const delimiter = isTab ? '\t' : (firstLine.includes(',') ? ',' : ';');

    const firstLineCells = firstLine.split(delimiter).map(c => c.trim().toLowerCase().replace(/^["']|["']$/g, ''));

    // Check if line 0 looks like a header row by matching against column synonyms
    const synonyms = COLUMN_SYNONYMS[entity] || {};
    const headerColumnMap: Record<number, string> = {};
    let vendorNameColIdx = -1;

    let matchedHeaderCount = 0;
    firstLineCells.forEach((cell, idx) => {
      // Check if this cell matches "vendor name"
      if (cell.includes('vendor name') || cell.includes('supplier name') || cell.includes('party name')) {
        vendorNameColIdx = idx;
      }

      // Check each column key synonyms
      for (const [colKey, synList] of Object.entries(synonyms)) {
        if (synList.some(s => cell === s || cell.includes(s))) {
          headerColumnMap[idx] = colKey;
          matchedHeaderCount++;
          break;
        }
      }
    });

    const hasHeader = matchedHeaderCount >= 1 || (firstLineCells.length >= 2 && Object.keys(headerColumnMap).length > 0);
    const startIndex = hasHeader ? 1 : 0;
    const newRows: Array<Record<string, string>> = [];
    const corrections: string[] = [];

    for (let i = startIndex; i < rawLines.length; i++) {
      const line = rawLines[i];
      const cells = line.split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''));
      if (cells.length === 0 || cells.every(c => !c)) continue;

      const rowObj: Record<string, string> = {};

      if (hasHeader && Object.keys(headerColumnMap).length > 0) {
        // Map cells based on detected header positions
        cells.forEach((val, cIdx) => {
          const matchedKey = headerColumnMap[cIdx];
          if (matchedKey) {
            const colDef = columns.find(c => c.key === matchedKey);
            rowObj[matchedKey] = cleanCellValue(val, colDef);
          }
        });

        // If vendorCode was missing but vendorName was present in cells
        if (!rowObj.vendorCode && vendorNameColIdx >= 0 && cells[vendorNameColIdx]) {
          const vName = cells[vendorNameColIdx];
          const vMatch = findBestVendorMatch(vName, db.suppliers);
          if (vMatch.matched && vMatch.officialVendorCode) {
            rowObj.vendorCode = vMatch.officialVendorCode;
          }
        }
      } else {
        // Positional mapping based on default columns order
        columns.forEach((col, cIdx) => {
          rowObj[col.key] = cleanCellValue(cells[cIdx] || '', col);
        });
      }

      // Entity-specific smart normalization
      if (entity === 'opening_balances') {
        const rawFC = (rowObj.amountFC || '').replace(/,/g, '').trim();
        const rawINR = (rowObj.amountINR || '').replace(/,/g, '').trim();
        const numFC = parseFloat(rawFC);
        const numINR = parseFloat(rawINR);

        // Auto-detect Debit vs Credit based on sign (Negative = Credit/Payable, Positive = Debit/Advance)
        if (!rowObj.balanceType?.trim()) {
          if ((!isNaN(numFC) && numFC < 0) || (!isNaN(numINR) && numINR < 0)) {
            rowObj.balanceType = 'Cr';
          } else {
            rowObj.balanceType = 'Dr';
          }
        }

        // Store positive amounts in amountFC / amountINR
        if (!isNaN(numFC)) rowObj.amountFC = String(Math.abs(numFC));
        if (!isNaN(numINR)) rowObj.amountINR = String(Math.abs(numINR));

        // Auto-fill sensible accounting defaults if missing from Excel
        if (!rowObj.refNo?.trim()) rowObj.refNo = `OB-${rowObj.vendorCode || 'SVN'}`;
        if (!rowObj.refDate?.trim()) rowObj.refDate = '2026-04-01';
        if (!rowObj.refType?.trim()) rowObj.refType = 'On account';
        if (!rowObj.currency?.trim()) {
          const supp = db.suppliers.find(s => s.vendorCode.toUpperCase() === (rowObj.vendorCode || '').toUpperCase());
          rowObj.currency = supp?.defaultCurrency || 'USD';
        }
      } else if (entity === 'ci') {
        if (!rowObj.currency?.trim()) rowObj.currency = 'USD';
        if (!rowObj.ciDate?.trim()) rowObj.ciDate = new Date().toISOString().split('T')[0];
        if (!rowObj.boeExchangeRate?.trim()) rowObj.boeExchangeRate = '87.50';
      } else if (entity === 'payments') {
        if (!rowObj.currency?.trim()) rowObj.currency = 'USD';
        if (!rowObj.paymentDate?.trim()) rowObj.paymentDate = new Date().toISOString().split('T')[0];
        if (!rowObj.actualExchangeRate?.trim()) rowObj.actualExchangeRate = '88.10';
        if (!rowObj.paymentAgainst?.trim()) rowObj.paymentAgainst = 'PI';
      }

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
        `⚡ Smart Auto-Correction: Corrected ${corrections.length} vendor code/shorthand mismatch(es) (${corrections.slice(0, 3).join(', ')}${corrections.length > 3 ? '...' : ''})`
      );
    }

    setGridRows(prev => [...prev, ...newRows]);
    setPasteText('');
  };

  // Direct Cell-Level Excel Paste (Ctrl+V inside any table input cell)
  const handleCellPaste = (e: React.ClipboardEvent, startRow: number, startKey: string) => {
    const text = e.clipboardData.getData('text');
    if (!text || (!text.includes('\t') && !text.includes('\n'))) {
      return; // Single value paste -> let standard browser input handle it
    }

    e.preventDefault();
    const lines = text.split(/\r?\n/).filter(line => line.length > 0);
    const startColIdx = columns.findIndex(c => c.key === startKey);
    if (startColIdx === -1) return;

    setGridRows(prev => {
      const updated = [...prev];
      lines.forEach((line, lineOffset) => {
        const targetRow = startRow + lineOffset;
        while (updated.length <= targetRow) {
          const emptyRow: Record<string, string> = {};
          columns.forEach(col => {
            emptyRow[col.key] = col.key === 'currency' ? 'USD' : '';
          });
          updated.push(emptyRow);
        }

        const cells = line.split('\t').map(c => c.trim().replace(/^["']|["']$/g, ''));
        const rowObj = { ...updated[targetRow] };

        cells.forEach((cellVal, cellOffset) => {
          const targetColIdx = startColIdx + cellOffset;
          if (targetColIdx < columns.length) {
            const colDef = columns[targetColIdx];
            rowObj[colDef.key] = cleanCellValue(cellVal, colDef);
            if (colDef.key === 'vendorCode' && cellVal) {
              const m = findBestVendorMatch(cellVal, db.suppliers);
              if (m.matched && m.officialVendorCode) {
                rowObj[colDef.key] = m.officialVendorCode;
              }
            }
          }
        });

        updated[targetRow] = rowObj;
      });
      return updated;
    });
  };

  // Excel-like Keyboard Navigation (Enter, ArrowDown, ArrowUp, Tab)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, rIdx: number, cIdx: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (rIdx === gridRows.length - 1) {
        handleAddEmptyRow();
      }
      setTimeout(() => {
        const nextInput = document.getElementById(`cell-${rIdx + 1}-${cIdx}`) as HTMLInputElement;
        if (nextInput) {
          nextInput.focus();
          nextInput.select();
        }
      }, 50);
    } else if (e.key === 'ArrowDown') {
      if (rIdx < gridRows.length - 1) {
        e.preventDefault();
        const nextInput = document.getElementById(`cell-${rIdx + 1}-${cIdx}`) as HTMLInputElement;
        if (nextInput) {
          nextInput.focus();
          nextInput.select();
        }
      }
    } else if (e.key === 'ArrowUp') {
      if (rIdx > 0) {
        e.preventDefault();
        const prevInput = document.getElementById(`cell-${rIdx - 1}-${cIdx}`) as HTMLInputElement;
        if (prevInput) {
          prevInput.focus();
          prevInput.select();
        }
      }
    }
  };

  // Direct File Upload (.xlsx, .xls, .csv)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const parsed = await parseExcelFile(file);
      if (parsed.error || !parsed.rows || parsed.rows.length === 0) {
        setSaveErrorMsg(parsed.error || 'Excel sheet me koi valid rows nahi mili.');
        return;
      }

      // Convert rows back to tab-separated string to run through our intelligent mapper
      const headers = Object.keys(parsed.rows[0]);
      const lines: string[] = [];
      lines.push(headers.join('\t'));
      parsed.rows.forEach(r => {
        lines.push(headers.map(h => String(r[h] ?? '')).join('\t'));
      });

      handleParsePaste(lines.join('\n'));
      setSaveSuccessMsg(`📁 File "${file.name}" se ${parsed.rows.length} rows successfully parse ho gayi!`);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      setSaveErrorMsg(`File parse karne me error: ${err?.message || 'Invalid file format'}`);
    }
  };

  // Download Sample Excel Template (.xlsx) for selected entity
  const handleDownloadTemplate = () => {
    let sampleRows: Record<string, any>[] = [];
    const filename = `${entity}_import_template`;

    switch (entity) {
      case 'ci':
        sampleRows = [
          {
            'Vendor Code': 'V00044',
            'Invoice No (CI)': 'INV-2026-001',
            'Invoice Date': '2026-04-10',
            'Currency': 'USD',
            'Invoice Value (FC)': 12500.0,
            'BOE No': 'BOE-901234',
            'BOE Date': '2026-04-12',
            'BOE Rate (INR)': 87.5,
            'Port Code': 'INNSA1',
            'Customs Duty (INR)': 95000,
            'Linked PI No': 'PI-2026-01',
          },
        ];
        break;
      case 'payments':
        sampleRows = [
          {
            'Vendor Code': 'V00044',
            'Payment Date': '2026-04-05',
            'Currency': 'USD',
            'Amount (FC)': 5000.0,
            'Bank Rate': 88.1,
            'Bank Ref No': 'FT260405-01',
            'SWIFT No': 'SWIFT-HDFC-991',
            'UTR Ref': 'HDFCR5202604051234',
            'Against (PI/CI)': 'PI',
            'Linked PI/CI No': 'PI-2026-01',
          },
        ];
        break;
      case 'opening_balances':
        sampleRows = [
          {
            'Vendor Code': 'V00044',
            'Vendor Name': 'BRIGHT UNIVERSE HK CO LTD',
            'Opening In INR': 474805.94,
            'Opening In FC': 5284.73,
            'Type (Dr/Cr)': 'Dr',
            'Ref Type (PI/CI/On account)': 'On account',
            'Ref No': 'OB-2026-01',
            'Ref Date': '2026-04-01',
            'Currency': 'USD',
          },
          {
            'Vendor Code': 'V00737',
            'Vendor Name': 'FERRICS TECHNOLOGY CO.,LIMITED',
            'Opening In INR': -470873.0,
            'Opening In FC': -4996.0,
            'Type (Dr/Cr)': 'Cr',
            'Ref Type (PI/CI/On account)': 'On account',
            'Ref No': 'OB-2026-02',
            'Ref Date': '2026-04-01',
            'Currency': 'USD',
          },
        ];
        break;
      case 'items':
        sampleRows = [
          {
            'Our Item Code (SAP)': 'RM-LED-001',
            'Item Description': 'SMD LED Chip 2835 0.2W 6500K',
            'Supplier Item Code': 'SUP-CHIP-99',
            'HSN Code': '85414100',
            'UOM': 'PCS',
            'Std Rate (FC)': 0.05,
            'Currency': 'USD',
            'BCD %': 7.5,
            'IGST %': 18,
            'Default Supplier Code': 'V00044',
          },
        ];
        break;
      case 'pi':
        sampleRows = [
          {
            'Vendor Code': 'V00044',
            'Proforma Invoice No': 'PI-2026-001',
            'PI Date': '2026-04-01',
            'Currency': 'USD',
            'PI Value (FC)': 25000.0,
            'Advance %': 30,
            'Payment Terms': 'Advance',
            'Credit Days': 60,
          },
        ];
        break;
      case 'jv':
        sampleRows = [
          {
            'Vendor Code': 'V00044',
            'JV Date': '2026-04-15',
            'Currency': 'USD',
            'From (PI/CI/DN)': 'PI',
            'From Doc No': 'PI-2026-01',
            'To (PI/CI)': 'CI',
            'To Doc No': 'INV-2026-001',
            'Amount FC': 5000.0,
            'Remarks / Narration': 'Advance adjusted against commercial invoice',
          },
        ];
        break;
    }

    const ws = XLSX.utils.json_to_sheet(sampleRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, `${filename}.xlsx`);
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

  // Export current grid to Excel
  const handleExportCurrentGrid = () => {
    if (gridRows.length === 0) return;
    exportToExcel(gridRows, `${entity}_grid_draft`);
  };

  // Validation function per row
  const validateRow = (row: Record<string, string>): { isValid: boolean; error?: string } => {
    if (columns.some(c => c.key === 'vendorCode')) {
      const rawVendor = (row.vendorCode || '').trim();
      if (!rawVendor) return { isValid: false, error: 'Vendor Code required' };
      const match = findBestVendorMatch(rawVendor, db.suppliers);
      if (!match.matched) {
        if (match.suggestion) {
          return {
            isValid: false,
            error: `Vendor "${rawVendor}" not recognized. Suggestion: ${match.suggestion.vendorCode} (${match.suggestion.supplierName})`,
          };
        }
        return { isValid: false, error: `Supplier "${rawVendor}" not found in Masters` };
      }
    }

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
            paymentMode: 'Advance',
            bankReferenceNo: row.bankRefNo?.trim() || `REF-${Date.now()}`,
            swiftNo: row.swiftNo?.trim() || undefined,
            utrNo: row.utrSwiftRef?.trim() || undefined,
            utrSwiftRef: row.swiftNo?.trim() ? `SWIFT:${row.swiftNo.trim()}` : (row.utrSwiftRef?.trim() || undefined),
            paymentAgainst: (row.paymentAgainst?.toUpperCase() === 'CI' ? 'CI' : 'PI'),
            linkedPiId,
            linkedCiId,
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
          const rawFC = parseFloat(row.amountFC.replace(/,/g, '')) || 0;
          const rawINR = parseFloat(row.amountINR?.replace(/,/g, '')) || Math.round(Math.abs(rawFC) * 87.5);
          
          // Auto-detect Debit vs Credit based on sign (Negative = Credit/Payable, Positive = Debit/Advance)
          let finalBalType: 'Dr' | 'Cr' = 'Dr';
          if (row.balanceType?.trim()) {
            finalBalType = row.balanceType.toLowerCase().includes('cr') ? 'Cr' : 'Dr';
          } else if (rawFC < 0 || rawINR < 0) {
            finalBalType = 'Cr';
          }

          const amtFC = Math.abs(rawFC);
          const amtINR = Math.abs(rawINR);
          const rate = amtFC > 0 ? Number((amtINR / amtFC).toFixed(4)) : 87.5;

          const obDate = parseDateToISO(row.refDate) || new Date().toISOString().split('T')[0];
          const ob: OpeningBalance = {
            id: `OB-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            companyId: compId,
            supplierId: suppId,
            currency: (row.currency?.trim().toUpperCase() as any) || 'USD',
            balanceType: finalBalType,
            referenceType: (row.refType?.toLowerCase().includes('ci') ? 'CI' : row.refType?.toLowerCase().includes('pi') ? 'PI' : 'On account'),
            referenceNo: row.refNo?.trim() || `OB-${row.vendorCode}`,
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

  return createPortal(
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
                  Excel Copy-Paste &amp; Smart Spreadsheet Grid
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800/80 uppercase">
                  Batch Importer
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Excel se Ctrl+C karein aur seedha Ctrl+V karein. Enter / Arrow keys se navigate karein, ya Excel file upload karein!
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
                  setAutoCorrectionNotice(null);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  entity === tab.id
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
          {/* Action Tools & Paste Zone Box */}
          <div className="bg-gradient-to-r from-emerald-50/60 via-teal-50/40 to-indigo-50/50 dark:from-emerald-950/20 dark:via-slate-800/40 dark:to-indigo-950/20 p-4 rounded-2xl border-2 border-dashed border-emerald-300 dark:border-emerald-700/60 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center space-x-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Option 1: Excel se rows copy karein aur yahan Paste karein (Ctrl+V) ya File Upload karein:</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* File Upload Button */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".xlsx, .xls, .csv"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-slate-700 text-emerald-800 dark:text-emerald-300 shadow-2xs transition-all cursor-pointer"
                  title="Upload .xlsx / .xls / .csv file"
                >
                  <FileUp className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Upload Excel File</span>
                </button>

                {/* Download Template (.xlsx) */}
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 shadow-2xs transition-all cursor-pointer"
                  title="Download ready-to-fill Excel template file"
                >
                  <Download className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Template (.xlsx)</span>
                </button>

                {/* Copy Template Header to Clipboard */}
                <button
                  type="button"
                  onClick={handleCopyTemplate}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 shadow-2xs transition-all cursor-pointer"
                  title="Copy expected column headers to paste into Excel"
                >
                  {copiedTemplate ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                  <span>{copiedTemplate ? 'Headers Copied!' : 'Copy Headers'}</span>
                </button>
              </div>
            </div>

            <textarea
              rows={2}
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

            <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 gap-2">
              <div className="flex items-center gap-1 overflow-x-auto">
                <span className="font-semibold text-slate-700 dark:text-slate-300 shrink-0">Column Order:</span>
                <span className="font-mono text-indigo-600 dark:text-indigo-400 truncate">
                  {columns.map(c => c.label).join(' • ')}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {gridRows.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={handleExportCurrentGrid}
                      className="text-indigo-600 hover:text-indigo-700 font-bold hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" />
                      <span>Export Grid (.xlsx)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setGridRows([])}
                      className="text-rose-600 hover:text-rose-700 font-bold hover:underline cursor-pointer"
                    >
                      Clear All ({gridRows.length} rows)
                    </button>
                  </>
                )}
              </div>
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
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 cursor-pointer"
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
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Interactive Grid Editor</span>
                  <span className="text-[10px] font-bold text-slate-400 lowercase font-sans">
                    (Direct cell paste Ctrl+V &amp; Enter navigation enabled)
                  </span>
                </h4>
                {gridRows.length > 0 && (
                  <div className="flex items-center space-x-2">
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      <CheckCircle2 className="w-3 h-3" />
                      {validationSummary.validCount} Valid
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
                            Excel me columns copy karke yahan <strong>Ctrl+V</strong> karein, ya <strong>Upload Excel File</strong> karein, ya <strong>+ Add Row Manually</strong> par click karein.
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
                          className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors ${
                            !isValid ? 'bg-rose-50/30 dark:bg-rose-950/15' : ''
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

                          {columns.map((col, cIdx) => {
                            const val = row[col.key] || '';
                            const isVendorCol = col.key === 'vendorCode';
                            const vendorMatch = isVendorCol && val ? findBestVendorMatch(val, db.suppliers) : null;

                            return (
                              <td key={col.key} className="px-2 py-1.5 align-top">
                                <div className="relative">
                                  <input
                                    id={`cell-${rIdx}-${cIdx}`}
                                    type="text"
                                    list={isVendorCol ? 'vendor-master-datalist' : undefined}
                                    value={val}
                                    placeholder={col.placeholder}
                                    onChange={e => handleCellChange(rIdx, col.key, e.target.value)}
                                    onPaste={e => handleCellPaste(e, rIdx, col.key)}
                                    onKeyDown={e => handleKeyDown(e, rIdx, cIdx)}
                                    className={`w-full bg-white dark:bg-slate-800 px-2.5 py-1 rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 border transition-all ${
                                      col.required && !val.trim()
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
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-200/80 dark:border-white/10 bg-slate-50/80 dark:bg-slate-800/50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            {saveErrorMsg && (
              <div className="flex items-center space-x-1.5 text-xs font-bold text-rose-600 dark:text-rose-400">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{saveErrorMsg}</span>
              </div>
            )}
            {saveSuccessMsg && (
              <div className="flex items-center space-x-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{saveSuccessMsg}</span>
              </div>
            )}
            {!saveErrorMsg && !saveSuccessMsg && (
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {gridRows.length > 0 ? (
                  <span>
                    Total: <strong>{gridRows.length} rows</strong> ({validationSummary.validCount} valid,{' '}
                    {validationSummary.errorCount} errors)
                  </span>
                ) : (
                  <span>Excel copy-paste karke direct save karein. Dusre forms bhi active rahenge.</span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveAndApply}
              disabled={gridRows.length === 0 || validationSummary.errorCount > 0}
              className="flex items-center space-x-2 px-5 py-2 rounded-xl text-xs font-extrabold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md shadow-emerald-600/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Save &amp; Apply {gridRows.length > 0 ? `(${gridRows.length} Records)` : ''}</span>
            </button>
          </div>
        </div>

        {/* Global Datalist for Vendor Master auto-complete */}
        <datalist id="vendor-master-datalist">
          {db.suppliers.map(s => (
            <option key={s.id} value={s.vendorCode}>
              {s.vendorCode} — {s.supplierName}
            </option>
          ))}
        </datalist>
      </div>
    </div>,
    document.body
  );
};
