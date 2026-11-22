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
  ExternalLink,
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
      title: 'Step 1: Login & User Selection',
      short: 'Sign In & RBAC',
      icon: Shield,
      color: 'from-indigo-600 to-blue-600',
      tag: 'Authentication',
      summary: 'Kaise login karein aur apna role select karein:',
      details: [
        'URL open karne par modern split-screen Sign In screen khulegi.',
        'User Profile Selector: Username type karne ki zaroorat nahi hai. Dropdown se ya niche diye gaye User Role Cards (Admin, Management, Operations, Customs, Banking, Purchase) par click karein.',
        'Password Dalein: Apna password enter karein aur "Sign In & Open Workspace" button dabayein.',
        'Registered Profiles: Head Administrator (admin), Executive Management (management), Operations Lead (executor1), Customs Specialist (executor2), Bank Remittance (executor3), Purchase Manager (purchase1/2).',
      ],
    },
    {
      id: 2,
      title: 'Step 2: Executive Dashboard',
      short: 'Dashboard Overview',
      icon: LayoutDashboard,
      color: 'from-blue-600 to-indigo-600',
      tag: 'Executive Position',
      summary: 'Dashboard me real-time business status samajhna:',
      details: [
        'Top 4 KPI Cards: Total Payables (CR) [supplier ko dena baaki], Advances/Excess (DR) [hamare advances], Overdue Payables, aur Realized FX Gain/Loss.',
        'Net Closing Position Bar: Net USD (+/-), Net CNY (+/-), aur Net Book INR ek line me summary.',
        'Party-Wise Closing Balances Table: Har supplier ka Vendor Code (e.g. V00044), Dr FC (Advance), Cr FC (Payable), Net FC, Dr INR, Cr INR, aur Net Valuation INR.',
        'Instant Search Bar: Top-right search box me vendor code ya supplier name likhte hi table filter ho jati hai.',
        'One-Click Excel Export: "Export" button dabakar party closing report Excel me download kar sakte hain.',
        'Row Drill-Down: Kisi bhi party par click karne par uske saare commercial invoices, payments aur advance vouchers ki detail ledger khul jati hai.',
        'Ageing Analysis: Payables aur Advances ka <30d, 31-60d, 61-90d, >90d breakdown table ke theek niche available hai.',
      ],
    },
    {
      id: 3,
      title: 'Step 3: Excel Copy-Paste Batch Import',
      short: 'Excel Importer',
      icon: FileSpreadsheet,
      color: 'from-emerald-600 to-teal-600',
      tag: 'Fast Data Entry',
      summary: 'Excel se direct copy-paste kaise karein (Excel Jaisi Feeling):',
      details: [
        'Top Navbar me "Excel Paste & Edit" button par click karein.',
        'Data Type Select Karein: Commercial Invoices (CI), Payments (Bank Remittance), Opening Balances (Dr/Cr), Items, PI, ya JV.',
        'Direct Cell Paste: Table ke kisi bhi cell par click karke direct Ctrl+V dabayein. Excel ka pura data usi cell se aage aur niche arrange ho jayega.',
        'Auto-Add Rows: Agar Excel me 20 rows hain, to paste karte hi saare rows automatic add ho jayenge.',
        'Smart Header Matching: Agar aapne header ke sath copy kiya hai (chahe columns aage-peeche ho), system automatic sahi column match kar leta hai.',
        'SVN Opening Format Auto-Handled: "Vendor Code | Vendor Name | Opening in INR | Opening in FC" aisi sheet paste karne par negative amount (-) ko automatic Credit (Cr) aur positive (+) ko Debit (Dr) banata hai.',
        'Excel Keyboard Navigation: Enter dabane par cursor niche jata hai (last row par Enter dabane par automatic new row add hoti hai). Arrow Up/Down se row navigate kar sakte hain.',
        'Upload Excel File: File upload button se direct .xlsx file select kar sakte hain, ya "Template (.xlsx)" download kar sakte hain.',
      ],
    },
    {
      id: 4,
      title: 'Step 4: Commercial Invoices (CI) & Customs BOE',
      short: 'Invoices & BOE',
      icon: FileCheck2,
      color: 'from-cyan-600 to-blue-600',
      tag: 'Customs Clearance',
      summary: 'Commercial Invoices aur Bill of Entry enter karne ka tareeqa:',
      details: [
        'Left sidebar me "Commercial Invoices (CI)" par jayein.',
        '"+ New Commercial Invoice" button click karein.',
        'Company, Supplier, Invoice No, Invoice Date, Currency (USD/CNY), aur Invoice Value FC bharein.',
        'Customs Bill of Entry (BOE): BOE No, BOE Date, Port Code (INNSA1 Nhava Sheva / INMUN1 Mundra), aur BOE Customs Exchange Rate dalein.',
        'System automatically Purchase INR calculate karta hai: Purchase INR = Invoice FC × BOE Rate.',
        'Linked PI: Agar is bill ka pehle advance diya tha, to PI select karein taaki advance automatically deduct ho jaye.',
      ],
    },
    {
      id: 5,
      title: 'Step 5: Foreign Remittances & SWIFT Tracking',
      short: 'Payments & SWIFT',
      icon: Coins,
      color: 'from-amber-600 to-orange-600',
      tag: 'Bank Remittance',
      summary: 'Bank se foreign payment aur SWIFT entry kaise karein:',
      details: [
        'Left sidebar me "Foreign Remittances" par click karein.',
        '"+ Record Foreign Remittance" button click karein.',
        'Remittance Date, Bank Account (HDFC/DBS/ICICI), Supplier, aur Currency select karein.',
        'Remittance Amount (FC) aur Bank Actual Exchange Rate dalein. System automatically debit INR calculate kar lega: INR = Amount FC × Bank Rate.',
        'SWIFT No aur Bank UTR No dalein (bank confirmation copy track karne ke liye).',
        'Payment Against: "Advance against PI" ya "Direct against Commercial Invoice" choose karein.',
        'Save karne par system FIFO ya linked invoice ke against automatic knock-off karta hai.',
      ],
    },
    {
      id: 6,
      title: 'Step 6: Realized & Unrealized FX Gain / Loss',
      short: 'Forex Engine',
      icon: TrendingUp,
      color: 'from-emerald-600 to-green-700',
      tag: 'Auditor & P&L',
      summary: 'Foreign exchange profit/loss calculate karna aur match karna:',
      details: [
        'Left sidebar me "Realized FX Gain / Loss" par click karein.',
        'Formula: FX Gain/Loss = Settled FC × (BOE Invoice Rate - Bank Payment Rate).',
        'Gain (Faayda): Agar booking rate ₹88.00 tha aur payment ₹87.20 par hui, to ₹0.80/FC ka Realized FX Gain book hoga.',
        'Loss (Nuksan): Agar payment rate ₹88.50 laga, to ₹0.50/FC ka Realized FX Loss book hoga.',
        'Month-End Unrealized Revaluation: Open balances ko latest benchmark rate par revalue kiya jata hai taaki year-end Balance Sheet me true liability dikhe.',
        'Export to Excel: Auditor/CA ke liye pura bill-wise working 1-click me Excel export ho jata hai.',
      ],
    },
    {
      id: 7,
      title: 'Step 7: Proforma Invoices (PI) & Purchase Orders',
      short: 'Purchase Desk',
      icon: Package,
      color: 'from-purple-600 to-indigo-600',
      tag: 'Procurement',
      summary: 'Proforma Invoices aur order advances maintain karna:',
      details: [
        'Supplier se PI aane par "Proforma Invoices (PI)" screen par add karein.',
        'PI No, PI Date, PI Value FC, aur Advance % (e.g. 30% advance, 70% against BL) dalein.',
        'Pending Advance Alert: System show karta hai ki cargo dispatch hone se pehle kitna advance remittance bank se bhejna zaroori hai.',
        'Payment hone par balance automatically reduce ho jata hai.',
      ],
    },
    {
      id: 8,
      title: 'Step 8: Container Demurrage & RBI IDPMS Radar',
      short: 'Customs & Logistics',
      icon: Ship,
      color: 'from-rose-600 to-red-700',
      tag: 'Compliance & Safety',
      summary: 'Shipping line penalty aur RBI compliance se bachna:',
      details: [
        'Container Detention Radar: Sea port par container discharge hone ke baad 14 days free time milta hai. 14 din ke baad $50 se $150/day detention penalty lagti hai. Radar me live days counter chalta hai taaki penalty na lage.',
        'RBI 180-Day IDPMS Radar: RBI Master Direction ke mutabiq foreign remittance ke 180 dino ke andar Bill of Entry (BOE) bank me submit karke knock-off karana zaroori hai.',
        'System har remittance ki 180-day deadline monitor karta hai aur time se pehle alert deta hai.',
      ],
    },
  ];

  const current = steps[activeStep];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-white/10 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Header */}
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
                  Complete Manual
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Application ke sabhi modules ko use karne ka aasan tareeqa (Step 1 se Step 8)
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
              Mukhya Steps &amp; Guidelines:
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
