'use client';

import { useState, useEffect, useCallback } from 'react';
import { Flame, TrendingUp, ListChecks, BarChart3, Settings, Plus, Trash2, X, Sparkles } from 'lucide-react';
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

  // New Plan Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPlanName, setNewPlanName] = useState('');
  const [newRetirementAge, setNewRetirementAge] = useState(60);
  const [creating, setCreating] = useState(false);

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

  const openNewPlanModal = () => {
    setNewPlanName(plansList.length === 0 ? 'Default Plan' : `Plan ${plansList.length + 1}`);
    setNewRetirementAge(60);
    setShowCreateModal(true);
  };

  const handleCreatePlanSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newPlanName.trim() || creating) return;

    setCreating(true);
    try {
      const res = await fetch('/api/retirement/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newPlanName.trim(),
          retirementAge: Number(newRetirementAge) || 60,
        }),
      });
      if (res.ok) {
        const newPlan = await res.json();
        setPlansList((prev) => [...prev, newPlan]);
        setSelectedPlanId(newPlan.id);
        setActiveTab('projection');
        setShowCreateModal(false);
      }
    } catch (err) {
      console.error('Failed to create plan', err);
    } finally {
      setCreating(false);
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
        const remaining = plansList.filter((p) => p.id !== planId);
        if (remaining.length > 0) {
          setPlansList(remaining);
          if (selectedPlanId === planId) {
            setSelectedPlanId(remaining[0].id);
          }
        } else {
          // If deleting the last plan, GET auto-creates a fresh Default Plan
          const freshRes = await fetch('/api/retirement/plans');
          if (freshRes.ok) {
            const freshPlans = await freshRes.json();
            setPlansList(freshPlans);
            if (freshPlans.length > 0) {
              setSelectedPlanId(freshPlans[0].id);
            }
          }
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
                Create your default plan to see projections based on your actual accounts, income, and expenses. 
                The engine will auto-populate your data and run a full simulation.
              </p>
              <button
                onClick={async () => {
                  setCreating(true);
                  try {
                    const res = await fetch('/api/retirement/plans', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        name: 'Default Plan',
                        retirementAge: 60,
                      }),
                    });
                    if (res.ok) {
                      const newPlan = await res.json();
                      setPlansList((prev) => [...prev, newPlan]);
                      setSelectedPlanId(newPlan.id);
                      setActiveTab('projection');
                      setShowCreateModal(false);
                    }
                  } catch (err) {
                    console.error('Failed to create default plan', err);
                  } finally {
                    setCreating(false);
                  }
                }}
                disabled={creating}
                className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-3 rounded-xl text-sm font-bold shadow-lg transition-all hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                {creating ? 'Creating Default Plan...' : 'Create Default Plan'}
              </button>
            </div>
          </div>
        </PageContent>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full pb-12">
      <PageHeader title="FIRE Engine & Projections" icon={Flame} />

      <PageContent>
        <div className="space-y-6">
          {/* App Consistent Tab Navigation Bar with Plan Selector */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border pb-1 mb-6 gap-4">
            {/* App Style Tabs */}
            <div className="flex items-center gap-6 overflow-x-auto">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`pb-2.5 text-xs font-semibold transition-all duration-200 cursor-pointer border-b-2 -mb-px flex items-center gap-1.5 whitespace-nowrap ${
                      isActive
                        ? 'border-primary text-primary font-bold'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Plan Selector & Action Controls */}
            <div className="flex items-center gap-2 pb-2 sm:pb-0 shrink-0">
              {updating && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground mr-1">
                  <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              <select
                value={selectedPlanId || ''}
                onChange={(e) => setSelectedPlanId(e.target.value)}
                className="bg-card border border-border rounded-lg px-3 py-1.5 text-xs font-bold text-foreground focus:ring-1 focus:ring-primary shadow-sm"
              >
                {plansList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button
                onClick={openNewPlanModal}
                className="flex items-center gap-1 bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm"
                title="Create new plan"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Plan</span>
              </button>
              {selectedPlan && (
                <button
                  onClick={() => handleDeletePlan(selectedPlan.id)}
                  className="flex items-center gap-1 text-muted-foreground hover:text-rose-500 p-1.5 rounded-lg text-xs transition-all cursor-pointer"
                  title="Delete this plan"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
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

      {/* Modern Create Plan Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-card border border-border rounded-2xl p-6 shadow-2xl max-w-md w-full space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">Create Retirement Plan</h3>
                  <p className="text-xs text-muted-foreground">Auto-populates accounts & finances</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreatePlanSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Plan Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Default Plan, Early FIRE at 50, Conservative"
                  value={newPlanName}
                  onChange={(e) => setNewPlanName(e.target.value)}
                  className="w-full bg-muted/40 border border-border rounded-xl px-3.5 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Target Retirement Age</label>
                <input
                  type="number"
                  required
                  min={30}
                  max={80}
                  value={newRetirementAge}
                  onChange={(e) => setNewRetirementAge(parseInt(e.target.value, 10) || 60)}
                  className="w-full bg-muted/40 border border-border rounded-xl px-3.5 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-bold text-muted-foreground hover:text-foreground rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newPlanName.trim()}
                  className="flex items-center gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 px-5 py-2 rounded-xl text-xs font-bold shadow-md transition-all disabled:opacity-50 cursor-pointer"
                >
                  {creating ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>Create Plan</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
