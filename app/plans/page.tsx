'use client';

import { useState, useEffect, useCallback } from 'react';
import { Flame, TrendingUp, ListChecks, BarChart3, Settings, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import PageContent from '@/components/page-content';
import { ProjectionTab } from '@/components/plans/projection-tab';
import { PlanDetailsTab } from '@/components/plans/plan-details-tab';
import { ScenariosTab } from '@/components/plans/scenarios-tab';
import { SettingsTab } from '@/components/plans/settings-tab';

export default function PlansPage() {
  const [activeTab, setActiveTab] = useState<'projection' | 'details' | 'scenarios' | 'settings'>('projection');
  const [plansList, setPlansList] = useState<any[]>([]);
  const [accountsList, setAccountsList] = useState<any[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

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
        const newPlan = await res.json();
        setPlansList((prev) => [...prev, newPlan]);
        setSelectedPlanId(newPlan.id);
        setActiveTab('projection');
      }
    } catch (err) {
      console.error('Failed to create plan', err);
    }
  };

  const handleUpdatePlan = useCallback(async (updates: any) => {
    if (!selectedPlanId || updating) return;
    setUpdating(true);
    try {
      const res = await fetch('/api/retirement/plans', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: selectedPlanId, ...updates }),
      });
      if (res.ok) {
        const updatedPlan = await res.json();
        setPlansList((prev) =>
          prev.map((p) => (p.id === selectedPlanId ? updatedPlan : p))
        );
      }
    } catch (err) {
      console.error('Failed to update plan', err);
    } finally {
      setUpdating(false);
    }
  }, [selectedPlanId, updating]);

  const handleDeletePlan = async (planId: string) => {
    try {
      const res = await fetch(`/api/retirement/plans?planId=${planId}`, { method: 'DELETE' });
      if (res.ok) {
        setPlansList((prev) => prev.filter((p) => p.id !== planId));
        if (selectedPlanId === planId) {
          const remaining = plansList.filter((p) => p.id !== planId);
          setSelectedPlanId(remaining[0]?.id || null);
        }
      }
    } catch (err) {
      console.error('Failed to delete plan', err);
    }
  };

  const selectedPlan = plansList.find((p) => p.id === selectedPlanId) || plansList[0];

  const tabs = [
    { id: 'projection' as const, label: 'Projection', icon: TrendingUp },
    { id: 'details' as const, label: 'Plan Details', icon: ListChecks },
    { id: 'scenarios' as const, label: 'Scenarios', icon: BarChart3 },
    { id: 'settings' as const, label: 'Settings', icon: Settings },
  ];

  if (loading) {
    return (
      <div className="min-h-screen w-full pb-12">
        <PageHeader title="FIRE Engine & Projections" icon={Flame} />
        <PageContent>
          <div className="flex items-center justify-center py-24">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground font-medium">Loading retirement plans...</p>
            </div>
          </div>
        </PageContent>
      </div>
    );
  }

  // No plans exist — show create CTA
  if (plansList.length === 0) {
    return (
      <div className="min-h-screen w-full pb-12">
        <PageHeader title="FIRE Engine & Projections" icon={Flame} />
        <PageContent>
          <div className="flex items-center justify-center py-24">
            <div className="flex flex-col items-center gap-4 max-w-md text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                <Flame className="w-8 h-8" />
              </div>
              <h2 className="text-lg font-bold text-foreground">Start Planning Your Retirement</h2>
              <p className="text-sm text-muted-foreground">
                Create your first plan to see projections based on your actual accounts, income, and expenses. 
                The engine will auto-populate your data and run a full simulation.
              </p>
              <button
                onClick={handleCreatePlan}
                className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-3 rounded-xl text-sm font-bold shadow-lg transition-all hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
              >
                <Plus className="w-4 h-4" />
                Create Your First Plan
              </button>
            </div>
          </div>
        </PageContent>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full pb-12">
      <PageHeader title="FIRE Engine & Projections" icon={Flame}>
        {/* Plan Selector */}
        <div className="flex items-center gap-2">
          <select
            value={selectedPlanId || ''}
            onChange={(e) => setSelectedPlanId(e.target.value)}
            className="bg-card border border-border rounded-lg px-3 py-1.5 text-xs font-bold text-foreground focus:ring-1 focus:ring-primary"
          >
            {plansList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleCreatePlan}
            className="flex items-center gap-1 bg-primary/10 text-primary hover:bg-primary/20 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all"
            title="Create new plan"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          {plansList.length > 1 && selectedPlan && (
            <button
              onClick={() => handleDeletePlan(selectedPlan.id)}
              className="flex items-center gap-1 text-muted-foreground hover:text-rose-500 px-1.5 py-1.5 rounded-lg text-xs transition-all"
              title="Delete this plan"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </PageHeader>

      <PageContent>
        <div className="space-y-6">
          {/* Tab Navigation */}
          <div className="flex items-center gap-1 border-b border-border pb-3 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
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

            {updating && (
              <div className="flex items-center gap-1.5 ml-auto text-xs text-muted-foreground">
                <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span>Updating...</span>
              </div>
            )}
          </div>

          {/* Tab Content */}
          {activeTab === 'projection' && selectedPlan && (
            <ProjectionTab
              plan={selectedPlan}
              accounts={accountsList}
              onUpdatePlan={handleUpdatePlan}
            />
          )}

          {activeTab === 'details' && selectedPlan && (
            <PlanDetailsTab
              plan={selectedPlan}
              onUpdatePlan={handleUpdatePlan}
            />
          )}

          {activeTab === 'scenarios' && selectedPlan && (
            <ScenariosTab plan={selectedPlan} />
          )}

          {activeTab === 'settings' && selectedPlan && (
            <SettingsTab
              plan={selectedPlan}
              onUpdatePlan={handleUpdatePlan}
            />
          )}

          {!selectedPlan && (
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <p className="text-sm text-muted-foreground font-medium">No plan selected. Create a plan to get started.</p>
            </div>
          )}
        </div>
      </PageContent>
    </div>
  );
}
