import * as XLSX from 'xlsx';
import { Company, BankAccount, Supplier, OpeningBalance } from '../types';

/**
 * Generic Excel export helper
 */
export function exportToExcel(data: Record<string, any>[], filename: string, sheetName: string = 'Sheet1') {
  if (!data || data.length === 0) {
    alert('No data to export.');
    return;
  }

  const worksheet = XLSX.utils.json_to_sheet(data);

  // Auto-calculate column widths
  const keys = Object.keys(data[0]);
  worksheet['!cols'] = keys.map(key => {
    let maxLen = key.length;
    for (const row of data) {
      const cellVal = row[key];
      if (cellVal !== undefined && cellVal !== null) {
        maxLen = Math.max(maxLen, String(cellVal).length);
      }
    }
    return { wch: Math.min(Math.max(maxLen + 3, 12), 40) };
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
}

/**
 * Multi-sheet workbook export (used for complete system backup to Excel)
 */
export function exportMultiSheetExcel(sheets: { name: string; data: Record<string, any>[] }[], filename: string) {
  const workbook = XLSX.utils.book_new();

  for (const sheet of sheets) {
    const ws = XLSX.utils.json_to_sheet(sheet.data.length > 0 ? sheet.data : [{ 'No Data': '' }]);
    if (sheet.data.length > 0) {
      const keys = Object.keys(sheet.data[0]);
      ws['!cols'] = keys.map(key => ({ wch: Math.min(Math.max(key.length + 3, 12), 35) }));
    }
    XLSX.utils.book_append_sheet(workbook, ws, sheet.name.substring(0, 30));
  }

  XLSX.writeFile(workbook, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
}

/**
 * Generate and download Excel templates for masters and opening balances
 */
export function downloadTemplate(type: 'companies' | 'bankAccounts' | 'suppliers' | 'openingBalances') {
  let sampleData: Record<string, any>[] = [];
  let filename = '';

  switch (type) {
    case 'companies':
      filename = 'Company_Master_Template';
      sampleData = [
        {
          'Company Code*': 'Sakar',
          'Full Name*': 'Sakar Electricals & Electronics Pvt Ltd',
          'GSTIN': '27AAACS1234E1Z1',
          'IEC': '0306012345',
          'Active (Yes/No)': 'Yes',
        },
        {
          'Company Code*': 'SVN',
          'Full Name*': 'SVN Opto Electronics Pvt Ltd',
          'GSTIN': '27AABCS1234F1Z5',
          'IEC': '0307012345',
          'Active (Yes/No)': 'Yes',
        },
      ];
      break;

    case 'bankAccounts':
      filename = 'Bank_Account_Template';
      sampleData = [
        {
          'Company Code*': 'SVN',
          'Bank Name*': 'HDFC Bank',
          'Branch*': 'Andheri East',
          'Account Number*': '50200012345678',
          'AD Code': '0510012',
          'Currency*': 'INR',
          'Active (Yes/No)': 'Yes',
        },
        {
          'Company Code*': 'SVN',
          'Bank Name*': 'DBS Bank',
          'Branch*': 'Nariman Point',
          'Account Number*': '88100098765432',
          'AD Code': '0620023',
          'Currency*': 'INR',
          'Active (Yes/No)': 'Yes',
        },
      ];
      break;

    case 'suppliers':
      filename = 'Supplier_Master_Template';
      sampleData = [
        {
          'Company Code*': 'SVN',
          'Vendor Code*': 'V00088',
          'Supplier Name*': 'Shenzhen Apex Optoelectronics Co., Ltd',
          'Country*': 'China',
          'Default Currency*': 'USD',
          'Active (Yes/No)': 'Yes',
        },
      ];
      break;

    case 'openingBalances':
      filename = 'Opening_Balances_Template';
      sampleData = [
        {
          'Company Code*': 'SVN',
          'Vendor Code*': 'V00088',
          'Currency*': 'USD',
          'Reference Type (PI/CI/On account)*': 'PI',
          'Reference No*': 'PI-OLD-901',
          'Reference Date (DD-MM-YYYY)*': '15-03-2026',
          'Original Document Date (DD-MM-YYYY)*': '10-03-2026',
          'BOE No (if CI)': '',
          'Balance Type (Dr/Cr)*': 'Dr',
          'Amount FC*': 2500.0,
          'Amount INR*': 212500.0,
          'Remarks': 'Advance payment brought forward from FY 2025-26',
        },
      ];
      break;
  }

  const ws = XLSX.utils.json_to_sheet(sampleData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

/**
 * Parse uploaded Excel file and validate row-by-row
 */
export async function parseExcelFile(
  file: File
): Promise<{ rows: Record<string, any>[]; error?: string }> {
  try {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return { rows: [], error: 'Excel workbook contains no sheets.' };
    }
    const worksheet = workbook.Sheets[firstSheetName];
    const json = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });
    return { rows: json };
  } catch (err: any) {
    return { rows: [], error: err?.message || 'Failed to parse Excel file.' };
  }
}
