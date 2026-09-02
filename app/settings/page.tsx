'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { 
  Settings, 
  Landmark, 
  LayoutGrid, 
  GitBranch, 
  Tag, 
  BarChart3, 
  Sparkles, 
  UploadCloud, 
  FileText, 
  ShieldAlert,
  Users2,
  Bell,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import PageContent from '@/components/page-content';
import { OnboardingChecklist } from '@/components/onboarding-checklist';
import AccountDetailDrawer from '@/components/features/accounts/AccountDetailDrawer';

// Settings feature tabs
import GeneralTab from '@/components/features/settings/GeneralTab';
import AutomaticAccountsSection from '@/components/features/settings/AutomaticAccountsSection';
import OrphanedAccountsSection, { type SettingsAccount, type SettingsConnection } from '@/components/features/settings/OrphanedAccountsSection';
import ManualAccountsSection from '@/components/features/settings/ManualAccountsSection';
import CategoriesTab from '@/components/features/settings/CategoriesTab';
import RulesTab from '@/components/features/settings/RulesTab';
import TagsTab from '@/components/features/settings/TagsTab';
import AnalyticsTab from '@/components/features/settings/AnalyticsTab';
import SharingTab from '@/components/features/settings/SharingTab';
import AdvancedTab from '@/components/features/settings/AdvancedTab';
import NotificationsTab from '@/components/features/settings/NotificationsTab';
import AiTab from '@/components/features/settings/AiTab';
import ImportExportTab from '@/components/features/settings/ImportExportTab';
import { AppTabs } from '@/components/ui/app-tabs';
import { MobileTabStrip } from '@/components/ui/mobile-tab-strip';
import PayrollTab from '@/components/features/settings/PayrollTab';



const SETTINGS_TABS = [
  { id: 'general' as const, label: 'General', description: 'Appearance, accent color, and layout preferences', icon: Settings },
  { id: 'accounts' as const, label: 'Accounts', description: 'Configure visible accounts, manual accounts, and bank connections', icon: Landmark },
  { id: 'categories' as const, label: 'Categories', description: 'Transaction category display and structure', icon: LayoutGrid },
  { id: 'rules' as const, label: 'Rules', description: 'Automatic transaction categorization rules', icon: GitBranch },
  { id: 'tags' as const, label: 'Tags', description: 'Labels for transactional tagging and filtering', icon: Tag },
  { id: 'analytics' as const, label: 'Analytics', description: 'Chart color schemes and forecasting bounds', icon: BarChart3 },
  { id: 'ai' as const, label: 'AI', description: 'AI provider endpoints, model parameters, and keys', icon: Sparkles },
  { id: 'import' as const, label: 'Data', description: 'Import bank statements, export financial data, and manage full backups', icon: UploadCloud },
  { id: 'payroll' as const, label: 'Payroll', description: 'Paystub parsing templates and forecasts', icon: FileText },
  { id: 'sharing' as const, label: 'Sharing', description: 'Invite others to share your financial data', icon: Users2 },
  { id: 'notifications' as const, label: 'Notifications', description: 'Configure push notifications and alert preferences', icon: Bell },
  { id: 'advanced' as const, label: 'Advanced', description: 'Backups, dev tools, and database settings', icon: ShieldAlert },
];

function SettingsPageBody() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;

  const urlTab = searchParams.get('tab');
  const activeTab = urlTab && SETTINGS_TABS.some((t) => t.id === urlTab)
    ? (urlTab as typeof SETTINGS_TABS[number]['id'])
    : 'general';

  const [accountSubTab, setAccountSubTab] = useState<'automatic' | 'manual' | 'connections'>('connections');
  const urlSub = searchParams.get('sub');

  useEffect(() => {
    if (urlSub && ['automatic', 'manual', 'connections'].includes(urlSub)) {
      setAccountSubTab(urlSub as 'automatic' | 'manual' | 'connections');
    }
  }, [urlSub]);

  const goToTab = useCallback((tab: typeof activeTab, subTab?: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    if (subTab) {
      params.set('sub', subTab);
    } else {
      params.delete('sub');
    }
    router.replace(`/settings?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  const [connections, setConnections] = useState<SettingsConnection[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(true);
  const [accounts, setAccounts] = useState<SettingsAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [sharingGroup, setSharingGroup] = useState<any>(null);

  const [selectedAccount, setSelectedAccount] = useState<SettingsAccount | null>(null);
  const [accountDrawerOpen, setAccountDrawerOpen] = useState(false);

  const fetchConnections = useCallback(async () => {
    try {
      const res = await fetch('/api/connections', { credentials: 'include' });
      const data = await res.json();
      setConnections(Array.isArray(data) ? data : []);
    } catch {
      setConnections([]);
    } finally {
      setConnectionsLoading(false);
    }
  }, []);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/accounts?includeHidden=true', { credentials: 'include' });
      const data = await res.json();
      setAccounts(Array.isArray(data) ? data : []);
    } catch {
      setAccounts([]);
    } finally {
      setAccountsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConnections();
    fetchAccounts();
    fetch('/api/sharing', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setSharingGroup(data?.group ?? null))
      .catch(() => setSharingGroup(null));
  }, [fetchConnections, fetchAccounts]);

  const handleOpenAccountDrawer = useCallback((account: SettingsAccount) => {
    setSelectedAccount(account);
    setAccountDrawerOpen(true);
  }, []);

  const handleCloseAccountDrawer = useCallback(() => {
    setAccountDrawerOpen(false);
  }, []);

  const handleAccountDrawerSuccess = useCallback(() => {
    setAccountDrawerOpen(false);
    fetchAccounts();
  }, [fetchAccounts]);

  return (
    <div className="min-h-screen w-full">
      <PageHeader title="Settings" icon={Settings} />
      <PageContent className="flex flex-col items-center" maxWidth="max-w-6xl">
        {/* Setup Checklist */}
        <div className="mb-5 sm:mb-6">
          <OnboardingChecklist />
        </div>

        {/* Mobile: in-page tab switcher (desktop uses the sidebar aside) */}
        <div className="w-full mb-3 lg:hidden">
          <MobileTabStrip
            tabs={SETTINGS_TABS.map((t) => ({ id: t.id, label: t.label }))}
            activeTab={activeTab}
            onChange={(tabId) => goToTab(tabId as typeof activeTab)}
            fullWidth={false}
            aria-label="Settings sections"
            className="px-1"
          />
        </div>

        <div className="flex flex-col lg:flex-row gap-5 lg:gap-8 items-start w-full">
          {/* Desktop Navigation Sidebar */}
          <aside className="hidden lg:flex flex-col w-72 shrink-0 space-y-0.5 sticky top-24 bg-sidebar/45 backdrop-blur-md border border-border p-2 rounded-xl shadow-sm">
            <div className="px-2 pb-1.5 border-b border-border/60">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">Settings Navigation</h3>
            </div>
            <nav className="space-y-0.5">
              {SETTINGS_TABS.map((tab) => {
                const TabIcon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => goToTab(tab.id)}
                    className={`w-full flex items-start gap-2 py-1.5 px-2.5 rounded-lg transition-all text-left group relative border ${
                      isActive
                        ? 'bg-primary border-primary/30 text-primary-foreground shadow-sm shadow-primary/15'
                        : 'bg-transparent border-border/20 text-muted-foreground hover:text-foreground hover:bg-muted/75'
                    }`}
                  >
                    <TabIcon className={`w-4 h-4 mt-0.5 shrink-0 transition-transform group-hover:scale-110 duration-200 ${isActive ? 'text-primary-foreground' : 'text-muted-foreground group-hover:text-foreground'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold leading-tight">{tab.label}</div>
                      <div className={`text-[10px] leading-tight ${isActive ? 'text-primary-foreground/80' : 'text-muted-foreground/70 group-hover:text-muted-foreground'}`}>
                        {tab.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Settings Tab Content */}
          <main className="flex-1 w-full min-w-0 max-w-3xl space-y-5 sm:space-y-6">
            {activeTab === 'general' && <GeneralTab />}

            {activeTab === 'categories' && (
              <div className="p-3 sm:p-5 bg-card border border-border rounded-xl min-h-[400px]">
                <CategoriesTab />
              </div>
            )}

            {activeTab === 'tags' && (
              <div className="p-3 sm:p-5 bg-card border border-border rounded-xl min-h-[400px]">
                <TagsTab />
              </div>
            )}

            {activeTab === 'accounts' && (
              <>
                {/* Sub-tab toggle */}
                <AppTabs
                  tabs={[
                    { id: 'connections', label: 'Connections' },
                    { id: 'automatic', label: 'Automatic' },
                    { id: 'manual', label: 'Manual' },
                  ]}
                  activeTab={accountSubTab}
                  onChange={(sub) => {
                    setAccountSubTab(sub as any);
                    const params = new URLSearchParams(searchParams.toString());
                    params.set('sub', sub);
                    router.replace(`/settings?${params.toString()}`, { scroll: false });
                  }}
                  fullWidth
                  size="sm"
                  className="mb-3 sm:mb-3.5"
                />


                {accountSubTab === 'manual' && <ManualAccountsSection />}

                  {accountSubTab === 'connections' && (
                  <div className="space-y-5 sm:space-y-6">
                    <OrphanedAccountsSection
                      accounts={accounts}
                      connections={connections}
                      onUpdated={async () => {
                        await fetchAccounts();
                        await fetchConnections();
                      }}
                    />

                    <AutomaticAccountsSection
                      accounts={accounts}
                        accountView="transactions"
                      accountsLoading={accountsLoading}
                      connections={connections}
                      connectionsLoading={connectionsLoading}
                      currentUserId={currentUserId}
                      sharingGroup={sharingGroup}
                      fetchAccounts={fetchAccounts}
                      fetchConnections={fetchConnections}
                      onOpenAccountDrawer={handleOpenAccountDrawer}
                    />
                  </div>
                )}

                  {accountSubTab === 'automatic' && (
                    <AutomaticAccountsSection
                      accounts={accounts}
                      accountView="management"
                      accountsLoading={accountsLoading}
                      connections={connections}
                      connectionsLoading={connectionsLoading}
                      currentUserId={currentUserId}
                      sharingGroup={sharingGroup}
                      fetchAccounts={fetchAccounts}
                      fetchConnections={fetchConnections}
                      onOpenAccountDrawer={handleOpenAccountDrawer}
                    />
                  )}
              </>
            )}

            {activeTab === 'rules' && (
              <div className="p-3 sm:p-5 bg-card border border-border rounded-xl min-h-[400px]">
                <RulesTab />
              </div>
            )}

            {activeTab === 'analytics' && (
              <div className="p-3 sm:p-5 bg-card border border-border rounded-xl min-h-[400px]">
                <AnalyticsTab />
              </div>
            )}

            {activeTab === 'sharing' && (
              <div className="p-3 sm:p-5 bg-card border border-border rounded-xl min-h-[400px]">
                <SharingTab />
              </div>
            )}

            {activeTab === 'advanced' && (
              <div className="p-3 sm:p-5 bg-card border border-border rounded-xl min-h-[400px]">
                <AdvancedTab />
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="p-3 sm:p-5 bg-card border border-border rounded-xl min-h-[400px]">
                <NotificationsTab />
              </div>
            )}

            {activeTab === 'ai' && (
              <div className="p-3 sm:p-5 bg-card border border-border rounded-xl min-h-[400px]">
                <AiTab />
              </div>
            )}

            {activeTab === 'import' && <ImportExportTab />}

            {activeTab === 'payroll' && <PayrollTab />}
          </main>
        </div>

        {/* Account Detail Drawer */}
        <AccountDetailDrawer
          account={selectedAccount as any}
          open={accountDrawerOpen}
          onClose={handleCloseAccountDrawer}
          onSuccess={handleAccountDrawerSuccess}
        />
      </PageContent>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPageBody />
    </Suspense>
  );
}
