'use client';

import { useState, useEffect } from 'react';
import { LayoutDashboard, Sliders, ShieldCheck, BarChart3, Zap, FileSpreadsheet, Heart, Settings, ArrowLeft, Plus } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import PageContent from '@/components/page-content';
import { DashboardView } from '@/components/plans/dashboard-view';
import { PlanTab } from '@/components/plans/plan-tab';
import { TaxAnalyticsTab } from '@/components/plans/tax-analytics-tab';
import { ChanceOfSuccessTab } from '@/components/plans/chance-of-success-tab';
import { CompareTab } from '@/components/plans/compare-tab';
import { OptimizeTab } from '@/components/plans/optimize-tab';
import { ReportsTab } from '@/components/plans/reports-tab';
import { EstateTab } from '@/components/plans/estate-tab';
import { SettingsTab } from '@/components/plans/settings-tab';

export default function PlansPage() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'plan' | 'tax' | 'montecarlo' | 'compare' | 'optimize' | 'reports' | 'estate' | 'settings'>('dashboard');
  const [plansList, setPlansList] = useState<any[]>([]);
  const [accountsList, setAccountsList] = useState<any[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch accounts and plans on load
  useEffect(() => {
    async function fetchData() {
      try {
        const [accRes, planRes] = await Promise.all([
          fetch('/api/accounts'),
          fetch('/api/retirement/plans'),
        ]);

        if (accRes.ok) {
          const accs = await accRes.json();
          setAccountsList(accs);
        }

        if (planRes.ok) {
          const pList = await planRes.json();
          setPlansList(pList);
          if (pList.length > 0 && !selectedPlanId) {
            setSelectedPlanId(pList[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to load plans data', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const handleCreatePlan = async () => {
    try {
      const res = await fetch('/api/retirement/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `Plan ${plansList.length + 1}`, retirementAge: 60 }),
      });
      if (res.ok) {
        const newP = await res.json();
        setPlansList((prev) => [...prev, newP]);
        setSelectedPlanId(newP.id);
        setActiveTab('plan');
      }
    } catch (err) {
      console.error('Failed to create plan', err);
    }
  };

  const selectedPlan = plansList.find((p) => p.id === selectedPlanId) || plansList[0];

  return (
    <div className="min-h-screen w-full pb-12">
      <PageHeader title="Retirement & FIRE Projections" icon={LayoutDashboard} />
      <PageContent>
        <div className="space-y-6">
          {/* Main Top Navigation Tabs */}
          <div className="flex items-center justify-between border-b border-border pb-3 overflow-x-auto">
            <div className="flex items-center gap-1.5 min-w-max">
              {[
                { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
                { id: 'plan', label: 'Plan Timeline', icon: Sliders },
                { id: 'tax', label: 'Tax Analytics', icon: ShieldCheck },
                { id: 'montecarlo', label: 'Chance of Success', icon: BarChart3 },
                { id: 'compare', label: 'Compare Strategies', icon: BarChart3 },
                { id: 'optimize', label: 'Optimizer', icon: Zap },
                { id: 'reports', label: 'Reports', icon: FileSpreadsheet },
                { id: 'estate', label: 'Estate Settlement', icon: Heart },
                { id: 'settings', label: 'Plan Settings', icon: Settings },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Active Plan Selector */}
            {selectedPlan && activeTab !== 'dashboard' && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setActiveTab('dashboard')}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-semibold"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  All Plans
                </button>
                <select
                  value={selectedPlanId || ''}
                  onChange={(e) => setSelectedPlanId(e.target.value)}
                  className="bg-card border border-border rounded-lg px-2.5 py-1 text-xs font-bold text-foreground"
                >
                  {plansList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Active Tab View Render */}
          {activeTab === 'dashboard' && (
            <DashboardView
              accounts={accountsList}
              plans={plansList}
              onSelectPlan={(id) => {
                setSelectedPlanId(id);
                setActiveTab('plan');
              }}
              onCreatePlan={handleCreatePlan}
            />
          )}

          {activeTab === 'plan' && (
            selectedPlan ? (
              <PlanTab plan={selectedPlan} onUpdatePlan={(updates) => console.log('Update plan', updates)} />
            ) : (
              <p className="text-xs text-muted-foreground italic py-6 text-center">No plan selected. Create a plan in the Dashboard first.</p>
            )
          )}

          {activeTab === 'tax' && <TaxAnalyticsTab simulation={selectedPlan?.simulation} />}
          {activeTab === 'montecarlo' && (selectedPlan ? <ChanceOfSuccessTab plan={selectedPlan} /> : null)}
          {activeTab === 'compare' && <CompareTab plan={selectedPlan} allPlans={plansList} />}
          {activeTab === 'optimize' && (selectedPlan ? <OptimizeTab plan={selectedPlan} /> : null)}
          {activeTab === 'reports' && <ReportsTab simulation={selectedPlan?.simulation} />}
          {activeTab === 'estate' && <EstateTab simulation={selectedPlan?.simulation} />}
          {activeTab === 'settings' && (selectedPlan ? <SettingsTab plan={selectedPlan} onUpdatePlan={(u) => console.log(u)} /> : null)}
        </div>
      </PageContent>
    </div>
  );
}
