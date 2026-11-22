import React, { useState, useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { Navbar } from './components/Navbar';
import { Sidebar, NavTab } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { KeyPositionScreen } from './components/KeyPositionScreen';
import { SupplierSummaryScreen } from './components/SupplierSummaryScreen';
import { PartyLedgerScreen } from './components/PartyLedgerScreen';
import { ItemsMasterScreen } from './components/ItemsMasterScreen';
import { RequisitionsScreen } from './components/RequisitionsScreen';
import { PIScreen } from './components/PIScreen';
import { ShipmentPlannerScreen } from './components/ShipmentPlannerScreen';
import { MaterialBalanceScreen } from './components/MaterialBalanceScreen';
import { PurchaseCIScreen } from './components/PurchaseCIScreen';
import { PaymentScreen } from './components/PaymentScreen';
import { DebitNotesScreen } from './components/DebitNotesScreen';
import { RefundsAdjustmentsScreen } from './components/RefundsAdjustmentsScreen';
import { TraceabilityScreen } from './components/TraceabilityScreen';
import { BOERegisterScreen } from './components/BOERegisterScreen';
import { CustomsMonthlyReturnScreen } from './components/CustomsMonthlyReturnScreen';
import { IGCRScreen } from './components/IGCRScreen';
import { BOESubmissionScreen } from './components/BOESubmissionScreen';
import { ReportsView } from './components/ReportsView';
import { MastersScreen } from './components/MastersScreen';
import { OpeningBalancesScreen } from './components/OpeningBalancesScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { BackupScreen } from './components/BackupScreen';
import { LoginModal } from './components/LoginModal';
import { HardDrive, AlertTriangle, ShieldAlert } from 'lucide-react';

const PURCHASE_TABS: NavTab[] = [
  'items_master',
  'purchase_requisitions',
  'pi',
  'shipment_planner',
  'material_balances',
];

const MainLayout: React.FC = () => {
  const { permissions, currentUser } = useAuth();
  const [currentTab, setCurrentTab] = useState<NavTab>(() =>
    permissions.canViewFinance ? 'dashboard' : 'purchase_requisitions'
  );
  const { isFileConnected, isServerConnected, connectDiskFile, integrityError, saveError } = useApp();

  useEffect(() => {
    if (!permissions.canViewFinance && !PURCHASE_TABS.includes(currentTab)) {
      setCurrentTab('purchase_requisitions');
    } else if (permissions.canViewFinance && currentUser && currentTab === 'purchase_requisitions' && currentUser.role !== 'purchase') {
      setCurrentTab('dashboard');
    }
  }, [currentUser?.id, permissions.canViewFinance]);

  // Role Protection check
  const isAdminTab = ['masters', 'opening_balances', 'settings', 'backup'].includes(currentTab);
  const isFinanceRestricted = !permissions.canViewFinance && !PURCHASE_TABS.includes(currentTab);
  const isRestricted = (isAdminTab && !permissions.canManageSettings) || isFinanceRestricted;

  return (
    <div className="min-h-screen flex flex-col bg-slate-100/70 dark:bg-[#070b14] text-slate-900 dark:text-slate-100 font-sans relative selection:bg-indigo-500 selection:text-white transition-colors duration-300">
      {/* Top Navbar */}
      <Navbar />

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar currentTab={currentTab} onSelectTab={setCurrentTab} />

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto bg-slate-100/60 dark:bg-[#080d1a] relative p-4 md:p-6 lg:p-7 transition-colors duration-300">
          {integrityError && (
            <div className="no-print bg-rose-50 border-b border-rose-300 px-6 py-2.5 flex items-center space-x-2 text-xs text-rose-900 font-semibold">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{integrityError}</span>
            </div>
          )}

          {saveError && (
            <div className="no-print bg-rose-50 border-b border-rose-300 px-6 py-2.5 flex items-center space-x-2 text-xs text-rose-900 font-semibold">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
              <span>Save Blocked: {saveError}</span>
            </div>
          )}

          {/* File Connection Notification Banner only when neither Server F: drive nor manual disk handle is active */}
          {!isServerConnected && !isFileConnected && (
            <div className="no-print bg-amber-50/90 border-b border-amber-200/80 px-6 py-2 flex items-center justify-between text-xs text-amber-900">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  <strong>Local Cache Mode:</strong> Server storage unavailable; data is saved in encrypted browser cache. Run <code className="font-mono">node server.mjs</code> or connect a JSON file.
                </span>
              </div>
              <button
                onClick={() => connectDiskFile()}
                className="flex items-center space-x-1.5 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg shadow-2xs transition-colors shrink-0 text-[11px]"
              >
                <HardDrive className="w-3.5 h-3.5" />
                <span>Connect Disk File</span>
              </button>
            </div>
          )}

          {/* Access Restriction Screen if role does not permit */}
          {isRestricted ? (
            <div className="p-12 flex flex-col items-center justify-center text-center max-w-lg mx-auto space-y-4">
              <div className="w-14 h-14 rounded-3xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-200 shadow-sm">
                <ShieldAlert className="w-7 h-7" />
              </div>
              <h3 className="text-base font-extrabold text-slate-900">Access Restricted</h3>
              <p className="text-xs text-slate-500">
                You are currently logged in as <strong>{currentUser?.username}</strong> ({currentUser?.role}).
                {isFinanceRestricted
                  ? ' This Treasury / Finance / Customs module is restricted for Purchase Desk roles.'
                  : ' This configuration section requires Administrator privileges.'}
              </p>
              <button
                onClick={() => setCurrentTab(permissions.canViewFinance ? 'dashboard' : 'purchase_requisitions')}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs"
              >
                {permissions.canViewFinance ? 'Return to Dashboard' : 'Return to Purchase Desk'}
              </button>
            </div>
          ) : (
            <>
              {currentTab === 'dashboard' && <DashboardView />}
              {currentTab === 'key_position' && <KeyPositionScreen />}
              {currentTab === 'supplier_summary' && (
                <SupplierSummaryScreen onNavigateToLedger={() => setCurrentTab('party_ledger')} />
              )}
              {currentTab === 'party_ledger' && <PartyLedgerScreen />}
              {currentTab === 'items_master' && <ItemsMasterScreen />}
              {currentTab === 'purchase_requisitions' && <RequisitionsScreen />}
              {currentTab === 'pi' && <PIScreen />}
              {currentTab === 'shipment_planner' && <ShipmentPlannerScreen />}
              {currentTab === 'material_balances' && <MaterialBalanceScreen />}
              {currentTab === 'purchase_ci' && <PurchaseCIScreen />}
              {currentTab === 'payments' && <PaymentScreen />}
              {currentTab === 'debit_notes' && <DebitNotesScreen />}
              {currentTab === 'refunds_adjustments' && <RefundsAdjustmentsScreen />}
              {currentTab === 'traceability' && <TraceabilityScreen />}
              {currentTab === 'boe_register' && <BOERegisterScreen />}
              {currentTab === 'customs_return' && <CustomsMonthlyReturnScreen />}
              {currentTab === 'igcr_return' && <IGCRScreen />}
              {currentTab === 'boe_submission' && <BOESubmissionScreen />}
              {currentTab === 'reports' && <ReportsView />}
              {currentTab === 'masters' && <MastersScreen />}
              {currentTab === 'opening_balances' && <OpeningBalancesScreen />}
              {currentTab === 'settings' && <SettingsScreen />}
              {currentTab === 'backup' && <BackupScreen />}
            </>
          )}
        </main>
      </div>
    </div>
  );
};

const AuthGate: React.FC = () => {
  const { isAuthenticated, authReady } = useAuth();

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0e1217] text-slate-400 text-xs font-medium">
        Initializing security context...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginModal isOpen={true} isBlockingGate={true} onClose={() => {}} />;
  }

  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
};

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <div className="relative min-h-screen">
          <AuthGate />

          {/* Discreet Corner Attribution - Single Location Only */}
          <div className="no-print fixed bottom-3 right-4 z-[60] pointer-events-none select-none">
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[10px] font-medium bg-white/90 dark:bg-slate-900/90 backdrop-blur-md text-slate-500 dark:text-slate-400 border border-slate-200/90 dark:border-white/10 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 dark:bg-cyan-400 animate-pulse"></span>
              <span>
                Powered by <strong className="text-slate-800 dark:text-slate-200 font-semibold tracking-wide">VISHNU INTELLIGENCE SERVICE</strong>
              </span>
            </div>
          </div>
        </div>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
