import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  ChevronLeft,
  Search,
  Maximize2,
  ExternalLink,
  Lightbulb,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';

interface UserGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialStep?: number;
}

interface GuideStep {
  id: number;
  title: string;
  short: string;
  category: string;
  icon: React.FC<{ className?: string }>;
  color: string;
  image: string;
  imageAlt: string;
  summary: string;
  keyHighlights: string[];
  instructions: { title: string; desc: string }[];
  proTip: string;
}

const GUIDE_STEPS: GuideStep[] = [
  {
    id: 1,
    title: 'Step 1: Sign In & Role Selection',
    short: '1. Sign In & Roles',
    category: 'Security & Access',
    icon: Shield,
    color: 'from-blue-600 to-indigo-600',
    image: '/guide/step1_login.jpg',
    imageAlt: 'Modern split-screen login screen with role selector and trade showcase',
    summary: 'Executive split-screen authentication portal with one-click user profile selection and role-based permissions.',
    keyHighlights: [
      'No username typing required — select directly from the profile dropdown or role cards',
      'Dedicated permissions for Admin, Management, Operations, Customs, Banking, and Purchase',
      'Interactive trade showcase highlighting Ocean Cargo, Air Express, and IDPMS compliance',
    ],
    instructions: [
      {
        title: 'Open Official URL',
        desc: 'Navigate to http://import.2.31.5.197.sslip.io in your web browser.',
      },
      {
        title: 'Select User Account',
        desc: 'Click on your designated user card (e.g., Head Administrator, Executive Management, Customs Specialist, Bank Remittance) or choose from the dropdown list.',
      },
      {
        title: 'Enter Password & Sign In',
        desc: 'The password field automatically focuses upon profile selection. Enter your credential and click "Sign In & Open Workspace →".',
      },
      {
        title: 'Role-Based Access Control (RBAC)',
        desc: 'Administrators have full system and master access; Management has financial dashboard views; Purchase teams have purchase requisition & PI desks; Customs has BOE clearance desks.',
      },
    ],
    proTip: 'You can switch users or lock the screen at any time by clicking your user profile avatar in the top-right corner of the header.',
  },
  {
    id: 2,
    title: 'Step 2: Executive Dashboard & Party Balances',
    short: '2. Dashboard & Balances',
    category: 'Financial Position',
    icon: LayoutDashboard,
    color: 'from-indigo-600 to-violet-600',
    image: '/guide/step2_dashboard.jpg',
    imageAlt: 'Executive dashboard showing KPI summary cards, net closing position, and party closing balances table',
    summary: 'Consolidated real-time financial command center showing total supplier payables (Cr), advances (Dr), and net foreign currency balances.',
    keyHighlights: [
      'Top 4 KPI cards: Total Payables (Cr), Advances / Excess (Dr), Overdue Payables, Realized FX Gain / (Loss)',
      'Net Closing Position Bar: Instant consolidated totals in USD, CNY, and Book INR',
      'Party-Wise Closing Balances: Complete supplier list with searchable vendor codes and Excel export',
    ],
    instructions: [
      {
        title: 'Read Top Financial KPI Cards',
        desc: 'View Total Payables (CR) for outstanding commercial liabilities, Advances (DR) for our unadjusted funds with suppliers, and Overdue Payables past maturity.',
      },
      {
        title: 'Monitor Net Closing Currency Positions',
        desc: 'Check the Net Position Bar for consolidated Net USD, Net CNY, and statutory Net Book INR balance sheet figures.',
      },
      {
        title: 'Search & Filter Supplier Accounts',
        desc: 'Type any vendor code (e.g., V00044) or vendor name into the search box in the Party-Wise Closing Balances section to filter rows in real time.',
      },
      {
        title: 'Drill-Down Audit Ledger & Excel Export',
        desc: 'Click on any supplier row to reveal all underlying commercial invoices, payment vouchers, and advance knock-offs. Click "Export" to download the ledger to Excel.',
      },
    ],
    proTip: 'Use the top-left Company selector to switch between Sakar, SVN, or Consolidated group-level financial positions.',
  },
  {
    id: 3,
    title: 'Step 3: Excel Copy-Paste Batch Import',
    short: '3. Excel Batch Import',
    category: 'Fast Data Entry',
    icon: FileSpreadsheet,
    color: 'from-emerald-600 to-teal-600',
    image: '/guide/step3_excel_paste.png',
    imageAlt: 'Excel copy paste grid modal with cell-level paste, entity tabs, and smart synonym detection',
    summary: 'High-speed spreadsheet interface supporting direct copy-paste from Excel, cell-level navigation, and automatic SVN opening balance classification.',
    keyHighlights: [
      'Copy multi-row, multi-column tables in Excel and press Ctrl+V directly into any grid cell',
      'Automatic row expansion: grid creates additional rows automatically to fit pasted data',
      'Smart SVN Accounting recognition: negative amounts (-) become Credit (Cr), positive become Debit (Dr)',
    ],
    instructions: [
      {
        title: 'Open Importer from Header',
        desc: 'Click the "Excel Paste & Edit" button located in the top navigation bar from any screen.',
      },
      {
        title: 'Select Target Entity Tab',
        desc: 'Choose Commercial Invoices (CI), Payments (Bank Remittances), Opening Balances (Dr/Cr), Items Master, Proforma Invoices (PI), or Journal Vouchers (JV).',
      },
      {
        title: 'Paste Data Directly (Ctrl+V)',
        desc: 'Select your data in Microsoft Excel, press Ctrl+C, click into the first cell in the web grid, and press Ctrl+V. All columns and rows populate instantly.',
      },
      {
        title: 'Keyboard Navigation & Auto-Row Creation',
        desc: 'Press Enter to move to the next row below. Pressing Enter on the last row automatically appends a new blank row. Use Arrow keys to navigate.',
      },
      {
        title: 'Commit Records with One Click',
        desc: 'Review the validated rows and click "Save & Apply" to immediately save all entries into the database.',
      },
    ],
    proTip: 'You can also click "Upload Excel File" to load .xlsx/.csv files directly, or click "Template (.xlsx)" to download pre-formatted starter files.',
  },
  {
    id: 4,
    title: 'Step 4: Commercial Invoices (CI) & Customs BOE Clearance',
    short: '4. Invoices & BOE',
    category: 'Trade & Customs',
    icon: FileCheck2,
    color: 'from-blue-600 to-cyan-600',
    image: '/guide/step4_ci_customs.png',
    imageAlt: 'Commercial invoice booking form with Customs Bill of Entry and exchange rate calculations',
    summary: 'Record overseas commercial invoices with Customs Bill of Entry (BOE) details, port clearance rates, and automated duty/purchase calculations.',
    keyHighlights: [
      'Automatic Purchase INR calculation: Invoice Value FC × Customs BOE Exchange Rate',
      'Link open Proforma Invoices (PI) to knock off previously paid advances',
      'Track Bill of Entry date, Port Code (Nhava Sheva, Mundra, etc.), and ICEGATE clearance',
    ],
    instructions: [
      {
        title: 'Navigate to Commercial Invoices',
        desc: 'Select "Commercial Invoices (CI)" under the Commercial Desk in the left navigation sidebar.',
      },
      {
        title: 'Create New Commercial Invoice',
        desc: 'Click "+ New Commercial Invoice" and select Company (Sakar/SVN), Supplier name, and Invoice Date.',
      },
      {
        title: 'Enter Invoice Value & Customs Exchange Rate',
        desc: 'Provide foreign currency amount (USD/CNY) and the notified Customs BOE exchange rate. The system automatically computes statutory Purchase INR.',
      },
      {
        title: 'Assign Customs Bill of Entry (BOE)',
        desc: 'Enter the BOE Number, BOE Date, Port Code, and attach any duty payment receipts.',
      },
      {
        title: 'Knock Off Open Advances',
        desc: 'Select linked Proforma Invoices to automatically adjust prior advance remittances against this shipment.',
      },
    ],
    proTip: 'Invoices booked without a BOE are automatically flagged under the "Pending BOE" audit report to ensure customs compliance.',
  },
  {
    id: 5,
    title: 'Step 5: Foreign Currency Payments & SWIFT Tracking',
    short: '5. Payments & SWIFT',
    category: 'Treasury & Banking',
    icon: Coins,
    color: 'from-purple-600 to-indigo-600',
    image: '/guide/step5_payment_swift.jpg',
    imageAlt: 'Foreign currency payment voucher screen with bank remittance, SWIFT MT103 advice, and bill allocation',
    summary: 'Disburse foreign currency remittances through bank accounts, track SWIFT confirmations, and record bank TT exchange rates.',
    keyHighlights: [
      'Supports Advance against PI, Direct against Commercial Invoice, or On-Account remittances',
      'Captures SWIFT MT103 confirmation advice number and bank UTR reference',
      'Computes exact INR debit: Foreign Amount FC × Bank TT Exchange Rate',
    ],
    instructions: [
      {
        title: 'Open Foreign Remittances Desk',
        desc: 'Select "Foreign Remittances" from the Treasury Desk in the sidebar and click "+ Record Foreign Remittance".',
      },
      {
        title: 'Choose Disbursing Bank & Supplier',
        desc: 'Select your funding bank account (HDFC Bank, DBS Bank, ICICI Bank, etc.) and overseas supplier.',
      },
      {
        title: 'Enter Remittance Amount & Bank Rate',
        desc: 'Enter foreign amount transferred (USD/CNY) and the bank debit exchange rate. System computes bank INR debit.',
      },
      {
        title: 'Log SWIFT & Bank UTR References',
        desc: 'Enter SWIFT MT103 advice number and UTR for bank reconciliation and IDPMS matching.',
      },
      {
        title: 'Execute Bill Allocation',
        desc: 'Allocate payment directly against specific commercial invoices or tag as advance against open PIs.',
      },
    ],
    proTip: 'Recording accurate bank TT debit rates is essential for the Realized FX Gain/Loss engine to calculate precise forex profit/loss.',
  },
  {
    id: 6,
    title: 'Step 6: Realized & Unrealized FX Gain / Loss Engine',
    short: '6. Forex FX Engine',
    category: 'Audit & Accounting',
    icon: TrendingUp,
    color: 'from-emerald-600 to-green-600',
    image: '/guide/step6_fx_gain_loss.png',
    imageAlt: 'Forex gain loss ledger showing bill-wise BOE rate vs payment rate variance and net P&L',
    summary: 'Automated foreign exchange fluctuation calculation comparing Customs BOE invoice rates against actual Bank TT payment rates.',
    keyHighlights: [
      'Transaction-level Realized FX calculation: Settled FC × (BOE Rate − Bank Payment Rate)',
      'Distinguishes between Exchange Profit (Gain) and Exchange Expense (Loss)',
      'One-click export to Excel for Statutory Auditors, Chartered Accountants, and Tax Filings',
    ],
    instructions: [
      {
        title: 'Open Realized FX Gain / Loss Module',
        desc: 'Navigate to "Realized FX Gain / (Loss)" from the Executive Overview section in the sidebar.',
      },
      {
        title: 'Understand the Calculation Formula',
        desc: 'When an invoice booked at BOE ₹88.00 is settled at bank rate ₹87.20, an exchange gain of ₹0.80/USD is realized. If settled at ₹88.50, an exchange loss of ₹0.50/USD is recorded.',
      },
      {
        title: 'Review Bill-Wise Breakdown',
        desc: 'Examine each settled transaction showing Supplier Name, Invoice Number, BOE Rate, Bank Payment Rate, and Realized P&L.',
      },
      {
        title: 'Month-End Unrealized Revaluation',
        desc: 'Open payables and unadjusted advances are automatically revalued against month-end benchmark rates for Balance Sheet reporting.',
      },
    ],
    proTip: 'Click "Export to Excel" to generate the official working sheet required by statutory auditors during annual financial audits.',
  },
  {
    id: 7,
    title: 'Step 7: Proforma Invoices (PI) & Purchase Orders',
    short: '7. Purchase PI Desk',
    category: 'Procurement',
    icon: Package,
    color: 'from-amber-600 to-orange-600',
    image: '/guide/step7_pi_purchase.png',
    imageAlt: 'Proforma invoice tracking screen showing vendor orders, advance terms, and pending balance radar',
    summary: 'Track supplier proforma orders, contract payment terms, advance requirements, and factory dispatch statuses.',
    keyHighlights: [
      'Track agreed commercial terms: e.g., 30% Advance, 70% CAD / against B/L copy',
      'Pending Advance Radar highlights supplier orders awaiting advance payment before manufacturing/dispatch',
      'Automated linkage to subsequent Commercial Invoices upon port arrival',
    ],
    instructions: [
      {
        title: 'Open Proforma Invoices (PI) Desk',
        desc: 'Navigate to "Proforma Invoices (PI)" under the Purchase Desk in the left navigation sidebar.',
      },
      {
        title: 'Record Supplier Order Confirmation',
        desc: 'Click "+ New Proforma Invoice" and enter PI Number, Supplier, Order Date, Currency, and Total Value.',
      },
      {
        title: 'Set Agreed Payment Terms',
        desc: 'Specify advance percentages (e.g., 20% or 30%) and balance terms to enable automatic cash requirement forecasts.',
      },
      {
        title: 'Link Advance Remittances',
        desc: 'When treasury remits advance funds, link the remittance voucher to this PI to mark the advance as satisfied.',
      },
    ],
    proTip: 'The Executive Dashboard displays a "Pending Adv on Open PIs" alert card that keeps procurement teams informed of pending supplier dispatches.',
  },
  {
    id: 8,
    title: 'Step 8: Container Demurrage & RBI IDPMS 180-Day Radar',
    short: '8. Demurrage & IDPMS',
    category: 'Regulatory Compliance',
    icon: Ship,
    color: 'from-rose-600 to-red-600',
    image: '/guide/step8_container_radar.png',
    imageAlt: 'Container detention countdown radar and RBI IDPMS 180-day compliance tracking screen',
    summary: 'Active protection against shipping line container detention charges and statutory Reserve Bank of India 180-day IDPMS knock-off deadlines.',
    keyHighlights: [
      'Shipping Line Container Radar: 14-day free detention countdown avoids $50–$150/day per container penalties',
      'RBI Master Directions: 180-day regulatory knock-off between outward bank remittances and Customs BOEs',
      'Early warning indicators at 150 days prevent compliance notices from Authorized Dealer (AD) banks',
    ],
    instructions: [
      {
        title: 'Container Free-Time Monitoring',
        desc: 'Following ocean vessel arrival and container discharge, the 14-day standard shipping line free timer starts automatically.',
      },
      {
        title: 'Detention Avoidance Workflow',
        desc: 'The radar lists all arriving containers with remaining free days. Any container with ≤3 days remaining is highlighted in red for urgent return to the empty depot.',
      },
      {
        title: 'RBI IDPMS 180-Day Regulatory Knock-Off',
        desc: 'RBI mandates that every outward advance remittance must be paired with an approved Customs Bill of Entry within 180 days.',
      },
      {
        title: 'Automated IDPMS Settlement Audit',
        desc: 'Review the IDPMS Compliance tab to ensure your bank AD code has submitted the Bill of Entry on the RBI EDPMS/IDPMS server.',
      },
    ],
    proTip: 'Maintain clean IDPMS records to ensure uninterrupted issuance of Bank Outward Remittances and Bank Guarantees (BG).',
  },
];

export const UserGuideModal: React.FC<UserGuideModalProps> = ({
  isOpen,
  onClose,
  initialStep = 0,
}) => {
  const [activeStep, setActiveStep] = useState<number>(initialStep);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isImageZoomed, setIsImageZoomed] = useState<boolean>(false);

  // Synchronize initialStep when opened
  useEffect(() => {
    if (isOpen) {
      setActiveStep(initialStep);
    }
  }, [isOpen, initialStep]);

  // Handle ESC key to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isImageZoomed) {
          setIsImageZoomed(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isImageZoomed, onClose]);

  if (!isOpen) return null;

  const filteredSteps = searchQuery.trim()
    ? GUIDE_STEPS.filter(
        s =>
          s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.instructions.some(
            i =>
              i.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
              i.desc.toLowerCase().includes(searchQuery.toLowerCase())
          ) ||
          s.keyHighlights.some(h => h.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : GUIDE_STEPS;

  const current = GUIDE_STEPS[activeStep] || GUIDE_STEPS[0];
  const StepIcon = current.icon;

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-2 sm:p-4 md:p-6 overflow-hidden">
      
      {/* Lightbox / Zoomed Screenshot */}
      {isImageZoomed && (
        <div
          className="fixed inset-0 z-[10000] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setIsImageZoomed(false)}
        >
          <div className="relative max-w-7xl max-h-[90vh] flex flex-col items-center">
            <div className="flex items-center justify-between w-full pb-3 text-white">
              <span className="text-sm font-bold">{current.title} — Full Screenshot View</span>
              <span className="text-xs text-slate-400 bg-white/10 px-3 py-1 rounded-full">
                Click anywhere or press Esc to close
              </span>
            </div>
            <img
              src={current.image}
              alt={current.imageAlt}
              className="max-h-[82vh] w-auto rounded-2xl shadow-2xl border border-white/20 object-contain"
            />
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="relative bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-white/10 w-full max-w-6xl h-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header Bar */}
        <div className="px-5 py-3.5 border-b border-slate-200/80 dark:border-white/10 flex items-center justify-between bg-slate-50/90 dark:bg-slate-800/60 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-indigo-600 via-blue-600 to-sky-400 text-white flex items-center justify-center shadow-md shadow-indigo-600/25">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight">
                  Import Payment Control — Interactive User Manual
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 uppercase">
                  Official Guide
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Visual step-by-step walkthrough with real screenshots (Steps 1 through 8)
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Search Input */}
            <div className="relative hidden md:block">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search topics (e.g., Excel, BOE, Demurrage)..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64 transition-all"
              />
            </div>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-xl hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Close Guide (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Step Navigation Ribbon */}
        <div className="px-4 py-2 border-b border-slate-200/70 dark:border-white/10 bg-slate-100/60 dark:bg-slate-800/40 overflow-x-auto flex items-center gap-1.5 shrink-0 scrollbar-none">
          {filteredSteps.map((st, idx) => {
            const Icon = st.icon;
            const originalIndex = GUIDE_STEPS.findIndex(s => s.id === st.id);
            const isActive = activeStep === originalIndex;
            return (
              <button
                key={st.id}
                onClick={() => setActiveStep(originalIndex)}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700 border border-slate-200/60 dark:border-white/5'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{st.short}</span>
              </button>
            );
          })}
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          
          {/* Step Header Title & Category */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className={`w-10 h-10 rounded-2xl bg-gradient-to-tr ${current.color} text-white flex items-center justify-center shadow-md shadow-indigo-500/20`}>
                <StepIcon className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                    {current.category}
                  </span>
                  <span className="text-xs font-bold text-slate-400">
                    Step {current.id} of {GUIDE_STEPS.length}
                  </span>
                </div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                  {current.title}
                </h2>
              </div>
            </div>

            {/* Quick Action Button for this step */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 hidden sm:inline">
                High-Resolution Preview Available
              </span>
            </div>
          </div>

          {/* Core Summary Callout */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-white/5 text-xs font-medium text-slate-700 dark:text-slate-300 leading-relaxed flex items-start space-x-2.5">
            <HelpCircle className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
            <span>{current.summary}</span>
          </div>

          {/* Two-Column Layout: Screenshot on Left/Top, Steps & Guidelines on Right */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Visual Screenshot Card (7 Columns on large screens) */}
            <div className="lg:col-span-7 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Visual Interface Screenshot
                </span>
                <button
                  type="button"
                  onClick={() => setIsImageZoomed(true)}
                  className="flex items-center space-x-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Click to Enlarge</span>
                </button>
              </div>

              <div
                className="group relative rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10 shadow-md bg-slate-100 dark:bg-slate-800 cursor-zoom-in"
                onClick={() => setIsImageZoomed(true)}
              >
                <img
                  src={current.image}
                  alt={current.imageAlt}
                  className="w-full h-auto object-cover transition-transform duration-300 group-hover:scale-[1.01]"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                  <div className="flex items-center space-x-2 text-white text-xs font-bold">
                    <Maximize2 className="w-4 h-4" />
                    <span>Click anywhere on image to view full-screen</span>
                  </div>
                </div>
              </div>

              {/* Key Capabilities Checklist */}
              <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 space-y-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                  Key Capabilities in this Module:
                </span>
                <div className="space-y-1.5">
                  {current.keyHighlights.map((hl, i) => (
                    <div key={i} className="flex items-start space-x-2 text-xs text-slate-700 dark:text-slate-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span>{hl}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Step-by-Step Instructions (5 Columns on large screens) */}
            <div className="lg:col-span-5 space-y-4">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Step-by-Step Operational Instructions
              </span>

              <div className="space-y-3">
                {current.instructions.map((inst, i) => (
                  <div
                    key={i}
                    className="p-3.5 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-white/5 flex items-start space-x-3 shadow-2xs hover:border-indigo-300 dark:hover:border-indigo-600 transition-all"
                  >
                    <div className="w-6 h-6 rounded-lg bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                      {i + 1}
                    </div>
                    <div className="space-y-0.5">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                        {inst.title}
                      </h4>
                      <p className="text-xs text-slate-600 dark:text-slate-300 font-normal leading-relaxed">
                        {inst.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pro Tip Box */}
              <div className="p-3.5 rounded-2xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 flex items-start space-x-2.5">
                <Lightbulb className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="text-[11px] font-black uppercase tracking-wider text-amber-800 dark:text-amber-300">
                    Operational Best Practice / Pro-Tip:
                  </span>
                  <p className="text-xs text-amber-900 dark:text-amber-200/90 leading-relaxed">
                    {current.proTip}
                  </p>
                </div>
              </div>

            </div>

          </div>

        </div>

        {/* Footer Navigation Bar */}
        <div className="px-5 py-3 border-t border-slate-200/80 dark:border-white/10 bg-slate-50/90 dark:bg-slate-800/60 flex items-center justify-between shrink-0">
          <button
            type="button"
            disabled={activeStep === 0}
            onClick={() => setActiveStep(prev => Math.max(0, prev - 1))}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-100 disabled:opacity-30 cursor-pointer transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Previous Step</span>
          </button>

          {/* Step Dots & Progress */}
          <div className="flex items-center space-x-2">
            {GUIDE_STEPS.map((st, idx) => (
              <button
                key={st.id}
                onClick={() => setActiveStep(idx)}
                className={`w-2.5 h-2.5 rounded-full transition-all cursor-pointer ${
                  activeStep === idx
                    ? 'w-7 bg-indigo-600'
                    : 'bg-slate-300 dark:bg-slate-700 hover:bg-slate-400'
                }`}
                title={`Jump to ${st.short}`}
              />
            ))}
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-2">
              {activeStep + 1} / {GUIDE_STEPS.length}
            </span>
          </div>

          <button
            type="button"
            disabled={activeStep === GUIDE_STEPS.length - 1}
            onClick={() => setActiveStep(prev => Math.min(GUIDE_STEPS.length - 1, prev + 1))}
            className="flex items-center space-x-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-30 cursor-pointer shadow-md shadow-indigo-600/20 transition-all"
          >
            <span>Next Step</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
