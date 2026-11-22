import React, { useState } from 'react';
import {
  BookOpen,
  X,
  Shield,
  LayoutDashboard,
  FileSpreadsheet,
  FileCheck2,
  Coins,
  TrendingUp,
  Package,
  Ship,
  CheckCircle2,
  ChevronRight,
  Download,
  Search,
} from 'lucide-react';

interface UserGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UserGuideModal: React.FC<UserGuideModalProps> = ({ isOpen, onClose }) => {
  const [activeStep, setActiveStep] = useState<number>(0);

  if (!isOpen) return null;

  const steps = [
    {
      id: 1,
      title: 'Step 1: Sign In & Role Selection',
      short: 'Sign In & RBAC',
      icon: Shield,
      color: 'from-indigo-600 to-blue-600',
      tag: 'Authentication',
      summary: 'Secure login with predefined role selection and session management:',
      details: [
        'Open the official web application URL: http://import.2.31.5.197.sslip.io to view the modern split-screen authentication portal.',
        'Select User Profile: You do not need to type usernames manually. Select your profile from the dropdown or click your role badge card (Admin, Management, Operations, Customs, Banking, or Purchase).',
        'Enter Password: The password input field will automatically focus upon profile selection. Enter your secure password and click "Sign In & Open Workspace →".',
        'Predefined Roles & Access Privileges:',
        '• Head Administrator (admin): Master administrative control, user permissions, and database backup.',
        '• Executive Management (management): Executive dashboard oversight, Net Closing positions, and financial FX audits.',
        '• Import Operations Lead (executor1): Commercial invoice booking and container demurrage tracking.',
        '• Customs & BOE Specialist (executor2): Bill of Entry entry, port logistics, and ICEGATE clearance knock-off.',
        '• Bank Remittance Executive (executor3): Outward foreign currency payments and SWIFT confirmation tracking.',
        '• Purchase & Logistics Managers (purchase1, purchase2): Proforma invoices, vendor purchase orders, and advance release approvals.',
      ],
    },
    {
      id: 2,
      title: 'Step 2: Executive Dashboard & Party Balances',
      short: 'Dashboard Overview',
      icon: LayoutDashboard,
      color: 'from-blue-600 to-indigo-600',
      tag: 'Financial Position',
      summary: 'Real-time financial status, Net Closing positions, and vendor ledgers:',
      details: [
        'Top 4 Financial KPI Summary Cards:',
        '• Total Payables (CR): Total outstanding foreign currency and book INR liabilities owed to overseas suppliers.',
        '• Advances / Excess (DR): Total advance payments held by overseas suppliers awaiting commercial invoice booking.',
        '• Overdue Payables: Commercial invoices past credit period requiring immediate settlement.',
        '• Realized FX Gain / (Loss): Cumulative exchange fluctuation gains or losses realized upon bill settlement.',
        'Net Closing Position Bar (As-on Date): Displays consolidated net balances in USD, CNY, and Book INR.',
        'Party-Wise Closing Balances Table (Positioned directly below the Net Closing Bar):',
        '• Displays Vendor Code (e.g. V00044), Supplier Name, Dr FC (Advances), Cr FC (Payables), Net FC, Dr INR, Cr INR, and Net Valuation INR.',
        '• Instant Search Filter: Type any vendor code (e.g. V00044) or supplier name into the top-right search box to filter rows instantly.',
        '• One-Click Excel Export: Click "Export" to download the filtered party closing balances into a formatted Excel sheet.',
        '• Drill-Down Ledger: Click any party row to view the full audit history of underlying commercial invoices, payment vouchers, and advance knock-offs.',
        'Ageing Analysis: Payables and Advances aged across <30d, 31-60d, 61-90d, and >90d buckets positioned immediately beneath the party table.',
      ],
    },
    {
      id: 3,
      title: 'Step 3: Excel Copy-Paste & Batch Import',
      short: 'Excel Importer',
      icon: FileSpreadsheet,
      color: 'from-emerald-600 to-teal-600',
      tag: 'Fast Data Entry',
      summary: 'High-speed spreadsheet copy-paste, cell-level paste, and file uploads:',
      details: [
        'Click the "Excel Paste & Edit" button located in the top navigation bar from any screen.',
        'Select Data Entity Tab: Choose between Commercial Invoices (CI), Payments (Bank Remittance), Opening Balances (Dr/Cr), Item Master, Proforma Invoices (PI), or Journal Vouchers (JV).',
        'Direct Cell-Level Paste: Click into any cell inside the interactive table and press Ctrl+V. Multi-line and multi-column Excel data will populate automatically across columns and down rows.',
        'Automatic Row Expansion: If your copied Excel data contains 20 rows and only 1 row exists in the grid, the table expands automatically to accommodate all rows.',
        'Smart Header & Synonym Mapping: When copying columns with headers in any order, the system automatically detects column titles (e.g., Vendor Code, Invoice Date, CI No, Amount FC, Exchange Rate, BOE No, SWIFT).',
        'SVN Opening Balance Recognition: When copying sheets in format "Vendor Code | Vendor Name | Opening In INR | Opening In FC":',
        '• Negative amounts (-) are automatically classified as Credit (Cr / Payable) and stored as clean absolute figures.',
        '• Positive amounts (+) are automatically classified as Debit (Dr / Advance).',
        'Excel-Style Keyboard Navigation: Press Enter to move down to the next row (pressing Enter on the last row auto-creates a new row). Use Arrow keys to navigate vertically.',
        'Upload Excel File: Click "Upload Excel File" to load .xlsx, .xls, or .csv files directly. Click "Template (.xlsx)" to download pre-formatted templates with sample data.',
        'Click "Save & Apply" to commit all validated rows to the cloud database with one click.',
      ],
    },
    {
      id: 4,
      title: 'Step 4: Commercial Invoices (CI) & Customs BOE',
      short: 'Invoices & BOE',
      icon: FileCheck2,
      color: 'from-cyan-600 to-blue-600',
      tag: 'Customs Clearance',
      summary: 'Booking purchase invoices, customs duty, and Bill of Entry clearance:',
      details: [
        'Navigate to "Commercial Invoices (CI)" from the left navigation drawer.',
        'Click "+ New Commercial Invoice" to open the invoice entry form.',
        'Enter Company Entity, Supplier, Invoice No (CI No), Invoice Date, Currency (USD/CNY), and Invoice Value (FC).',
        'Enter Customs Details: Bill of Entry (BOE) No, BOE Date, Port Code (INNSA1 for Nhava Sheva / INMUN1 for Mundra), and BOE Customs Exchange Rate.',
        'The system automatically computes Purchase INR: Purchase INR = Invoice Value FC × BOE Exchange Rate.',
        'Link to Proforma Invoice (PI): Select the linked PI to automatically knock off previously remitted advance payments against this cargo.',
        'Save the invoice to instantly update party liabilities, customs compliance tracking, and IDPMS knock-off records.',
      ],
    },
    {
      id: 5,
      title: 'Step 5: Foreign Remittances & SWIFT Tracking',
      short: 'Payments & SWIFT',
      icon: Coins,
      color: 'from-amber-600 to-orange-600',
      tag: 'Treasury Banking',
      summary: 'Recording foreign remittances, bank exchange rates, and SWIFT details:',
      details: [
        'Navigate to "Foreign Remittances" from the left navigation drawer.',
        'Click "+ Record Foreign Remittance" to open the payment voucher form.',
        'Select Remittance Date, Bank Account (e.g. HDFC Bank, DBS Bank), Supplier, and Currency (USD / CNY).',
        'Enter Remittance Amount (FC) and the actual Bank TT Exchange Rate applied by your bank.',
        'The system automatically calculates the exact INR debit: Debit INR = Amount FC × Bank Exchange Rate.',
        'Record Banking Identifiers: Enter the SWIFT MT103 confirmation number and Bank UTR reference for audit verification.',
        'Select Payment Nature:',
        '• Advance against PI: For advance payments remitted before vendor dispatches cargo.',
        '• Direct against Commercial Invoice: For post-customs clearance invoice settlements.',
        'Click "Save Payment Voucher" to execute automated FIFO or bill-specific allocation against open payables.',
      ],
    },
    {
      id: 6,
      title: 'Step 6: Realized & Unrealized FX Gain / Loss',
      short: 'Forex Engine',
      icon: TrendingUp,
      color: 'from-emerald-600 to-green-700',
      tag: 'Statutory Audit',
      summary: 'Forex exchange fluctuation calculations, revaluation, and auditor reports:',
      details: [
        'Navigate to "Realized FX Gain / Loss" from the executive desk.',
        'Realized Foreign Exchange Gain / (Loss) Formula:',
        'FX Gain / (Loss) = Settled FC × (BOE Invoice Rate - Actual Bank Payment Rate)',
        '• Exchange Gain (Profit): If the commercial invoice was booked at ₹88.00 and the bank remittance was executed at ₹87.20, an exchange gain of ₹0.80 per FC is realized.',
        '• Exchange Loss: If the bank remittance rate was ₹88.50, an exchange loss of ₹0.50 per FC is realized.',
        'Month-End Unrealized Forex Revaluation: Revalues all unapplied advances and open commercial invoices at the latest month-end benchmark exchange rate for accurate Balance Sheet reporting.',
        'Auditor Working Export: Click "Export to Excel" to download a complete bill-wise statement with BOE references, payment dates, bank UTR numbers, and realized gain/loss breakdowns for statutory auditors.',
      ],
    },
    {
      id: 7,
      title: 'Step 7: Proforma Invoices (PI) & Purchase Orders',
      short: 'Purchase Desk',
      icon: Package,
      color: 'from-purple-600 to-indigo-600',
      tag: 'Procurement',
      summary: 'Managing supplier proforma orders, advance terms, and dispatch follow-ups:',
      details: [
        'Upon receiving a Proforma Invoice from an overseas vendor, record it under the "Proforma Invoices (PI)" desk.',
        'Enter PI Number, PI Date, Currency, Total Value (FC), and agreed Payment Terms (e.g., 30% Advance, 70% CAD / against B/L).',
        'Pending Advance Radar: The system monitors open PIs and calculates the mandatory advance remittances required before vendors dispatch cargo.',
        'When foreign remittance vouchers are linked to the PI, the advance balance is automatically credited and subsequently knocked off upon cargo arrival.',
      ],
    },
    {
      id: 8,
      title: 'Step 8: Container Demurrage & RBI IDPMS 180-Day Radar',
      short: 'Customs & Logistics',
      icon: Ship,
      color: 'from-rose-600 to-red-700',
      tag: 'Regulatory Safety',
      summary: 'Monitoring 14-day container detention and statutory RBI IDPMS deadlines:',
      details: [
        'Shipping Line Container Detention Radar: Ocean shipping lines (e.g., Maersk, MSC, COSCO) provide a standard 14-day free period after vessel discharge. Demurrage penalties of $50 to $150 per container per day apply beyond this window. The radar tracks remaining free days in real time to ensure timely empty container return.',
        'RBI 180-Day IDPMS Compliance Radar: In accordance with Reserve Bank of India (RBI) Master Directions, every outward advance remittance must be matched against a Customs Bill of Entry (BOE) on the bank IDPMS portal within 180 days.',
        'The system tracks all advance remittances against their 180-day regulatory timeline, flagging warnings at 150 days and overdue alerts at 180 days to maintain flawless statutory compliance.',
      ],
    },
  ];

  const current = steps[activeStep];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-white/10 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200/80 dark:border-white/10 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800/50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 via-blue-600 to-sky-400 text-white flex items-center justify-center shadow-md shadow-indigo-600/25">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight">
                  Import Payment Control — Step-by-Step User Guide
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 uppercase">
                  Official Manual
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Comprehensive operational manual and workflow instructions (Step 1 through Step 8)
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

        {/* Navigation Step Pills */}
        <div className="px-6 py-2.5 border-b border-slate-200/70 dark:border-white/10 bg-slate-100/50 dark:bg-slate-800/40 overflow-x-auto flex items-center gap-2">
          {steps.map((st, idx) => {
            const Icon = st.icon;
            const isActive = activeStep === idx;
            return (
              <button
                key={st.id}
                onClick={() => setActiveStep(idx)}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200/60 dark:border-white/5'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{st.short}</span>
              </button>
            );
          })}
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold px-2.5 py-1 rounded-lg bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300">
                {current.tag}
              </span>
              <h2 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
                {current.title}
              </h2>
            </div>
            <span className="text-xs font-bold text-slate-400 font-mono">
              Step {current.id} of {steps.length}
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-white/5 text-xs font-semibold text-slate-700 dark:text-slate-300">
            {current.summary}
          </div>

          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Operational Instructions &amp; Guidelines:
            </h4>
            <div className="grid grid-cols-1 gap-2.5">
              {current.details.map((item, i) => (
                <div
                  key={i}
                  className="p-3.5 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-white/5 flex items-start space-x-3 shadow-2xs hover:border-indigo-300 transition-all"
                >
                  <div className="w-6 h-6 rounded-lg bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-200 font-medium leading-relaxed">
                    {item}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Navigation */}
        <div className="px-6 py-4 border-t border-slate-200/80 dark:border-white/10 bg-slate-50/80 dark:bg-slate-800/50 flex items-center justify-between">
          <button
            type="button"
            disabled={activeStep === 0}
            onClick={() => setActiveStep(prev => Math.max(0, prev - 1))}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
          >
            ← Previous Step
          </button>

          <span className="text-xs font-bold text-slate-500">
            {activeStep + 1} / {steps.length}
          </span>

          <button
            type="button"
            disabled={activeStep === steps.length - 1}
            onClick={() => setActiveStep(prev => Math.min(steps.length - 1, prev + 1))}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 cursor-pointer shadow-md shadow-indigo-600/20"
          >
            Next Step →
          </button>
        </div>

      </div>
    </div>
  );
};
