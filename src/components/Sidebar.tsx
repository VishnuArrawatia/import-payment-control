import React from 'react';
import {
    LayoutDashboard,
    FileSpreadsheet,
    Receipt,
    CreditCard,
    FileMinus,
    RefreshCcw,
    Send,
    BarChart3,
    Database,
    Layers,
    Settings,
    ShieldCheck,
    Link2,
    ClipboardList,
    Package,
    FilePlus2,
    Ship,
    Boxes,
    FileBarChart2,
    Sun,
    Moon,
    Sparkles,
    UserCheck,
    Table,
    BookOpen,
    Crown,
    ChevronRight,
    Zap,
    Users,
    TrendingUp,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { UserAvatar } from './UserAvatar';

export type NavTab =
    | 'dashboard'
    | 'key_position'
    | 'supplier_summary'
    | 'party_ledger'
    | 'fx_gain_loss'
    | 'items_master'
    | 'purchase_requisitions'
    | 'pi'
    | 'shipment_planner'
    | 'material_balances'
    | 'purchase_ci'
    | 'payments'
    | 'debit_notes'
    | 'refunds_adjustments'
    | 'traceability'
    | 'boe_register'
    | 'customs_return'
    | 'igcr_return'
    | 'boe_submission'
    | 'reports'
    | 'masters'
    | 'opening_balances'
    | 'settings'
    | 'backup';

interface SidebarProps {
    currentTab: NavTab;
    onSelectTab: (tab: NavTab) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onSelectTab }) => {
    const { db, engineResult } = useApp();
    const { currentUser, permissions } = useAuth();
    const { isDark, toggleTheme } = useTheme();

    const suggestedDnCount = engineResult.suggestedDebitNotes.length;
    const overdueCount = Array.from(engineResult.ciStates.values()).filter(s => s.isOverdue).length;
    const pendingLinkageCount = db.payments.filter(p => {
        const allocs = engineResult.allocations.filter(a => a.paymentId === p.id);
        if (allocs.length === 0) return true;
        return allocs.some(a => !a.ciId.startsWith('OB-') && (!a.boeNo || a.boeNo.startsWith('PENDING-')));
    }).length;
    const pendingBoeTaxCount = db.commercialInvoices.filter(
        ci => !ci.boeNo || ci.boeNo.startsWith('PENDING-') || !ci.taxPaidDate
    ).length;
    const pendingPrCount = (db.purchaseRequisitions || []).filter(
        pr => pr.status === 'Approved' || pr.status === 'Partially Ordered'
    ).length;
    const activeShipmentCount = (db.shipments || []).filter(s => s.status !== 'Received').length;
    const igcrAlertCount = (db.igcrLots || []).filter(l => {
        const consQty = (db.igcrConsumptions || [])
            .filter(c => c.lotId === l.id)
            .reduce((s, c) => s + Number(c.qty || 0), 0);
        return l.qtyNotReceived > 0 || (l.qtyReceived - consQty > 0 && !l.receiptDate);
    }).length;

    const sections: Array<{
        title: string;
        items: Array<{
            id: NavTab;
            label: string;
            icon: React.FC<{ className?: string }>;
            badge?: number;
            badgeColor?: string;
            adminOnly?: boolean;
            financeOnly?: boolean;
        }>;
    }> = [
            {
                title: 'EXECUTIVE OVERVIEW',
                items: [
                    { id: 'dashboard', label: 'Dashboard Overview', icon: LayoutDashboard, financeOnly: true },
                    { id: 'key_position', label: 'Key Position (As-on Date)', icon: Table, financeOnly: true },
                    { id: 'supplier_summary', label: 'Supplier Position Summary', icon: Users, financeOnly: true },
                ],
            },
            {
                title: 'PURCHASE DESK',
                items: [
                    { id: 'items_master', label: 'Item & HSN Master', icon: Package },
                    {
                        id: 'purchase_requisitions',
                        label: 'Purchase Requisitions',
                        icon: FilePlus2,
                        badge: pendingPrCount > 0 ? pendingPrCount : undefined,
                        badgeColor: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-400/30 font-bold',
                    },
                    { id: 'pi', label: 'Proforma Invoices (PI)', icon: FileSpreadsheet },
                    {
                        id: 'shipment_planner',
                        label: 'Shipment & Duty Planner',
                        icon: Ship,
                        badge: activeShipmentCount > 0 ? activeShipmentCount : undefined,
                        badgeColor: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-400/30 font-bold',
                    },
                    { id: 'material_balances', label: 'Material Balances', icon: Boxes },
                ],
            },
            {
                title: 'PROCUREMENT & BILLS',
                items: [
                    {
                        id: 'purchase_ci',
                        label: 'Purchase / CI & BOE',
                        icon: Receipt,
                        financeOnly: true,
                        badge: overdueCount > 0 ? overdueCount : undefined,
                        badgeColor: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-400/30 font-bold',
                    },
                ],
            },
            {
                title: 'TREASURY & SETTLEMENT',
                items: [
                    { id: 'party_ledger', label: 'Party Ledger (Statement)', icon: BookOpen, financeOnly: true },
                    { id: 'fx_gain_loss', label: 'FX Gain / Loss Working', icon: TrendingUp, financeOnly: true },
                    { id: 'payments', label: 'Import Payments', icon: CreditCard, financeOnly: true },
                    {
                        id: 'debit_notes',
                        label: 'Debit Notes',
                        icon: FileMinus,
                        financeOnly: true,
                        badge: suggestedDnCount > 0 ? suggestedDnCount : undefined,
                        badgeColor: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-400/30 font-bold animate-pulse',
                    },
                    { id: 'refunds_adjustments', label: 'Refunds & JV Adjustments', icon: RefreshCcw, financeOnly: true },
                ],
            },
            {
                title: 'COMPLIANCE & AUDIT',
                items: [
                    {
                        id: 'traceability',
                        label: 'PI-CI-BOE Linkage',
                        icon: Link2,
                        financeOnly: true,
                        badge: pendingLinkageCount > 0 ? pendingLinkageCount : undefined,
                        badgeColor: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-400/30 font-bold',
                    },
                    {
                        id: 'boe_register',
                        label: 'Bill of Entry Register',
                        icon: ClipboardList,
                        financeOnly: true,
                        badge: pendingBoeTaxCount > 0 ? pendingBoeTaxCount : undefined,
                        badgeColor: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-400/30 font-bold',
                    },
                    { id: 'customs_return', label: 'Customs Monthly Return', icon: FileBarChart2, financeOnly: true },
                    {
                        id: 'igcr_return',
                        label: 'IGCR Return (Form IGCR-3)',
                        icon: ShieldCheck,
                        financeOnly: true,
                        badge: igcrAlertCount > 0 ? igcrAlertCount : undefined,
                        badgeColor: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-400/30 font-bold',
                    },
                    { id: 'boe_submission', label: 'BOE Bank Submission', icon: Send, financeOnly: true },
                    { id: 'reports', label: 'Reports & Registers', icon: BarChart3, financeOnly: true },
                ],
            },
            {
                title: 'CONFIGURATION',
                items: [
                    { id: 'masters', label: 'Masters Management', icon: Database, adminOnly: true },
                    { id: 'opening_balances', label: 'Opening Balances', icon: Layers, adminOnly: true },
                    { id: 'settings', label: 'System Settings', icon: Settings, adminOnly: true },
                    { id: 'backup', label: 'Data & Backup', icon: ShieldCheck, adminOnly: true },
                ],
            },
        ];

    return (
        <aside className="no-print w-[272px] bg-white/90 dark:bg-slate-900/95 backdrop-blur-2xl text-slate-700 dark:text-slate-300 flex flex-col border-r border-slate-200/80 dark:border-white/10 shrink-0 select-none transition-colors duration-300 shadow-xl z-20">
            {/* Top Modern Executive Cockpit / User Profile Card */}
            <div className="p-3.5 border-b border-slate-200/70 dark:border-white/10">
                <div className="relative rounded-2xl p-3 bg-gradient-to-br from-slate-100/90 via-white/80 to-slate-100/50 dark:from-slate-800/90 dark:via-slate-800/50 dark:to-indigo-950/40 border border-slate-200/90 dark:border-white/10 shadow-sm overflow-hidden group">
                    {/* Subtle ambient light gleam */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 dark:via-cyan-400/5 to-transparent pointer-events-none"></div>

                    {/* Top Row: Executive Avatar + Details */}
                    <div className="relative flex items-center space-x-3">
                        <UserAvatar size="lg" username={currentUser?.username} role={currentUser?.role} showStatus={true} />
                        
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                                <h4 className="text-xs font-black text-slate-900 dark:text-white truncate tracking-tight">
                                    {currentUser?.displayName || currentUser?.username || 'Administrator'}
                                </h4>
                                <Crown className="w-3.5 h-3.5 text-amber-500 fill-amber-400/30 shrink-0" />
                            </div>

                            <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-cyan-500/10 dark:from-indigo-950/80 dark:to-cyan-950/80 text-indigo-700 dark:text-cyan-300 border border-indigo-200/80 dark:border-cyan-500/40 shadow-2xs">
                                    {currentUser?.role === 'admin' ? 'CHIEF CONTROLLER' : currentUser?.role?.toUpperCase() || 'EXECUTIVE'}
                                </span>
                            </div>

                            <p className="text-[9.5px] text-emerald-600 dark:text-emerald-400 font-semibold tracking-tight mt-1 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                Active Secure Session
                            </p>
                        </div>
                    </div>

                    {/* Micro-Metrics Cockpit Cards */}
                    <div className="relative grid grid-cols-3 gap-1.5 mt-3 pt-2.5 border-t border-slate-200/80 dark:border-white/10 text-center">
                        <div className="flex flex-col bg-white/70 dark:bg-white/[0.04] p-1.5 rounded-xl border border-slate-200/70 dark:border-white/5 shadow-2xs">
                            <span className="text-[8.5px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold">PRs</span>
                            <span className="text-xs font-black text-indigo-600 dark:text-cyan-400">{pendingPrCount}</span>
                        </div>
                        <div className="flex flex-col bg-white/70 dark:bg-white/[0.04] p-1.5 rounded-xl border border-slate-200/70 dark:border-white/5 shadow-2xs">
                            <span className="text-[8.5px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold">Voyage</span>
                            <span className="text-xs font-black text-amber-600 dark:text-amber-400">{activeShipmentCount}</span>
                        </div>
                        <div className="flex flex-col bg-white/70 dark:bg-white/[0.04] p-1.5 rounded-xl border border-slate-200/70 dark:border-white/5 shadow-2xs">
                            <span className="text-[8.5px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold">Overdue</span>
                            <span className={`text-xs font-black ${overdueCount > 0 ? 'text-rose-600 dark:text-rose-400 animate-pulse' : 'text-slate-600 dark:text-slate-400'}`}>
                                {overdueCount}
                            </span>
                        </div>
                    </div>

                    {/* Inline Theme Switcher Bar */}
                    <div className="relative mt-2.5 pt-2.5 border-t border-slate-200/80 dark:border-white/10 flex items-center justify-between">
                        <div className="flex items-center space-x-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                            {isDark ? (
                                <>
                                    <Moon className="w-3.5 h-3.5 text-cyan-400 fill-cyan-400/20" />
                                    <span className="text-cyan-300 font-bold">Cyber Dark</span>
                                </>
                            ) : (
                                <>
                                    <Sun className="w-3.5 h-3.5 text-amber-500 fill-amber-500/20" />
                                    <span className="text-slate-700 font-bold">Luxe Light</span>
                                </>
                            )}
                        </div>
                        <button
                            onClick={toggleTheme}
                            type="button"
                            className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border border-slate-300 dark:border-cyan-500/40 p-0.5 transition-colors duration-300 ease-in-out focus:outline-none ${
                                isDark ? 'bg-gradient-to-r from-indigo-600 to-cyan-500 shadow-[0_0_8px_rgba(34,211,238,0.4)]' : 'bg-slate-200'
                            }`}
                            title="Toggle between Cyber Glass Dark & Luxe Soft-Glass Light Theme"
                        >
                            <span
                                className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-md transition duration-300 ease-in-out ${
                                    isDark ? 'translate-x-5' : 'translate-x-0'
                                }`}
                            />
                        </button>
                    </div>
                </div>
            </div>

            {/* Nav List ("Pattai" - Modernized Ergonomic Glass Pills) */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4 custom-scrollbar">
                {sections.map((sec, sIdx) => {
                    const visibleItems = sec.items.filter(
                        item =>
                            (!item.adminOnly || permissions.canManageSettings) &&
                            (!item.financeOnly || permissions.canViewFinance)
                    );
                    if (visibleItems.length === 0) return null;

                    return (
                        <div key={sIdx} className="space-y-1">
                            {/* Modern Category Section Divider */}
                            <div className="flex items-center gap-2 px-3 pt-2 pb-1 text-[9.5px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500 select-none">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500/60 dark:bg-cyan-400/60"></span>
                                <span>{sec.title}</span>
                            </div>

                            {visibleItems.map(item => {
                                const Icon = item.icon;
                                const isActive = currentTab === item.id;
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => onSelectTab(item.id)}
                                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-all duration-200 cursor-pointer group relative ${
                                            isActive
                                                ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white font-bold shadow-lg shadow-indigo-600/30 dark:shadow-[0_0_20px_rgba(79,70,229,0.35)] translate-x-0.5'
                                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/90 dark:hover:bg-white/[0.06] hover:translate-x-1 font-medium'
                                        }`}
                                    >
                                        {/* Left Glowing Laser Indicator Bar on Active */}
                                        {isActive && (
                                            <span className="absolute left-1 top-2 bottom-2 w-1 rounded-full bg-cyan-300 dark:bg-cyan-400 shadow-[0_0_8px_#22d3ee]"></span>
                                        )}

                                        <div className="flex items-center space-x-2.5 pl-1 min-w-0">
                                            <div
                                                className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                                                    isActive
                                                        ? 'bg-white/20 text-white shadow-2xs'
                                                        : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 group-hover:bg-indigo-50 dark:group-hover:bg-cyan-500/15 group-hover:text-indigo-600 dark:group-hover:text-cyan-400'
                                                }`}
                                            >
                                                <Icon className="w-4 h-4" />
                                            </div>
                                            <span className="tracking-tight text-[12.5px] truncate">{item.label}</span>
                                        </div>

                                        <div className="flex items-center space-x-1.5 shrink-0 ml-2">
                                            {item.badge !== undefined && (
                                                <span
                                                    className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                                                        isActive
                                                            ? 'bg-white/25 text-white border border-white/30'
                                                            : item.badgeColor || 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                                                    }`}
                                                >
                                                    {item.badge}
                                                </span>
                                            )}
                                            {isActive && (
                                                <ChevronRight className="w-3.5 h-3.5 text-white/80" />
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    );
                })}
            </div>

            {/* Modern Footer with Attribution & Engine Status */}
            <div className="p-3 border-t border-slate-200/70 dark:border-white/10 text-[10px] text-slate-500 dark:text-slate-400 flex flex-col gap-1.5 px-4 bg-slate-50/70 dark:bg-slate-900/60">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5">
                        <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                        </span>
                        <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 tracking-tight">IDPMS Engine Live</span>
                    </div>
                    <span className="text-[9px] bg-slate-200/80 dark:bg-white/10 px-2 py-0.5 rounded-md text-slate-600 dark:text-slate-300 font-mono font-bold">
                        FY 26-27
                    </span>
                </div>
                <div className="text-[9px] text-slate-400 dark:text-slate-500 font-medium tracking-tight text-center pt-0.5 border-t border-slate-200/50 dark:border-white/5">
                    Powered by VISHNU INTELLIGENCE SERVICE
                </div>
            </div>
        </aside>
    );
};
