'use client';

import { useState, useEffect, useCallback } from 'react';
import { Flame, TrendingUp, ListChecks, BarChart3, Settings, Plus, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import PageContent from '@/components/page-content';
import { ProjectionTab } from '@/components/plans/projection-tab';
import { PlanDetailsTab } from '@/components/plans/plan-details-tab';
import { ScenariosTab } from '@/components/plans/scenarios-tab';
import { SettingsTab } from '@/components/plans/settings-tab';
import { PlanWizardModal } from '@/components/plans/plan-wizard-modal';
import { DeletePlanDialog } from '@/components/plans/delete-plan-dialog';
import { PlanManagementMenu } from '@/components/plans/plan-management-menu';

import { isFireEligibleAccount } from '@/lib/utils/account-scope';

export default function PlansPage() {
  const [activeTab, setActiveTab] = useState<'projection' | 'details' | 'scenarios' | 'settings'>('projection');
  const [plansList, setPlansList] = useState<any[]>([]);
  const [accountsList, setAccountsList] = useState<any[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  // Plan Wizard Modal State
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardMode, setWizardMode] = useState<'create' | 'edit'>('create');
  const [editingPlanTarget, setEditingPlanTarget] = useState<any>(null);

  // Delete Plan Dialog State
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [planToDelete, setPlanToDelete] = useState<any>(null);

  // Fetch accounts and plans on initial load
  const fetchPlansAndAccounts = useCallback(async () => {
    try {
      const [accRes, planRes] = await Promise.all([
        fetch('/api/accounts'),
        fetch('/api/retirement/plans'),
      ]);

      if (accRes.ok) {
        const accs = await accRes.json();
        setAccountsList(Array.isArray(accs) ? accs.filter(isFireEligibleAccount) : []);
      }

      if (planRes.ok) {
        const pList = await planRes.json();
        setPlansList(pList);
        if (pList.length > 0) {
          // Default to the plan marked isDefault, or the first plan
          const defaultP = pList.find((p: any) => p.isDefault) || pList[0];
          setSelectedPlanId((prev) => (prev && pList.some((p: any) => p.id === prev) ? prev : defaultP.id));
        }
      }
    } catch (err) {
      console.error('Failed to load plans data', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlansAndAccounts();
  }, [fetchPlansAndAccounts]);

  const defaultPlan = plansList.find((p) => p.isDefault) || plansList[0];
  const selectedPlan = plansList.find((p) => p.id === selectedPlanId) || defaultPlan;

  // Open Wizard for new plan (pre-populated with Default Plan settings)
  const openNewPlanWizard = () => {
    setWizardMode('create');
    setEditingPlanTarget(null);
    setWizardOpen(true);
  };

  // Open Wizard to edit / re-run existing plan
  const openEditPlanWizard = (planToEdit: any) => {
    setWizardMode('edit');
    setEditingPlanTarget(planToEdit);
    setWizardOpen(true);
  };

  // Save Wizard Callback (handles both create and edit modes)
  const handleSaveWizard = async (wizardData: any) => {
    setUpdating(true);
    try {
      if (wizardMode === 'create') {
        const res = await fetch('/api/retirement/plans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(wizardData),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Server returned status ${res.status}`);
        }
        const newPlan = await res.json();
        setPlansList((prev) => {
          // If new plan is default, update previous plans isDefault = false
          const nextPlans = wizardData.isDefault ? prev.map((p) => ({ ...p, isDefault: false })) : [...prev];
          return [...nextPlans, newPlan];
        });
        setSelectedPlanId(newPlan.id);
        setActiveTab('projection');
      } else if (wizardMode === 'edit' && editingPlanTarget) {
        const res = await fetch('/api/retirement/plans', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planId: editingPlanTarget.id,
            ...wizardData,
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Server returned status ${res.status}`);
        }
        const updatedPlan = await res.json();
        setPlansList((prev) =>
          prev.map((p) => {
            if (p.id === updatedPlan.id) return updatedPlan;
            if (wizardData.isDefault) return { ...p, isDefault: false };
            return p;
          })
        );
      }
    } finally {
      setUpdating(false);
    }
  };

  // Handle setting a plan as default
  const handleSetDefaultPlan = async (planId: string) => {
    setUpdating(true);
    try {
      const res = await fetch('/api/retirement/plans', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, isDefault: true }),
      });
      if (res.ok) {
        const updatedPlan = await res.json();
        setPlansList((prev) =>
          prev.map((p) => (p.id === planId ? updatedPlan : { ...p, isDefault: false }))
        );
      }
    } catch (err) {
      console.error('Failed to set default plan', err);
    } finally {
      setUpdating(false);
    }
  };

  // Handle resetting default plan / plan live finances
  const handleResetDefaultPlan = async (planId: string) => {
    setUpdating(true);
    try {
      const res = await fetch('/api/retirement/plans', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, resetPlanFinances: true }),
      });
      if (res.ok) {
        const resetPlan = await res.json();
        setPlansList((prev) => prev.map((p) => (p.id === planId ? resetPlan : p)));
        // Re-open wizard pre-populated with reset plan settings so user can review
        openEditPlanWizard(resetPlan);
      }
    } catch (err) {
      console.error('Failed to reset default plan', err);
    } finally {
      setUpdating(false);
    }
  };

  // Generic Update Plan callback for child tabs
  const handleUpdatePlan = useCallback(
    async (updates: any) => {
      if (!selectedPlanId) return;

      // Optimistically update local plan state in plansList immediately
      setPlansList((prev) =>
        prev.map((p) => {
          if (p.id !== selectedPlanId) return p;
          return {
            ...p,
            ...updates,
            settings: updates.settings ? { ...p.settings, ...updates.settings } : p.settings,
          };
        })
      );

      setUpdating(true);
      try {
        const res = await fetch('/api/retirement/plans', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId: selectedPlanId, ...updates }),
        });
        if (res.ok) {
          const updatedPlan = await res.json();
          setPlansList((prev) => prev.map((p) => (p.id === selectedPlanId ? updatedPlan : p)));
        }
      } catch (err) {
        console.error('Failed to update plan', err);
      } finally {
        setUpdating(false);
      }
    },
    [selectedPlanId]
  );

  // Handle plan deletion after user confirms in dialog
  const handleConfirmDeletePlan = async () => {
    if (!planToDelete) return;
    try {
      const res = await fetch(`/api/retirement/plans?planId=${planToDelete.id}`, { method: 'DELETE' });
      if (res.ok) {
        const remaining = plansList.filter((p) => p.id !== planToDelete.id);
        if (remaining.length > 0) {
          setPlansList(remaining);
          if (selectedPlanId === planToDelete.id) {
            const nextDefault = remaining.find((p) => p.isDefault) || remaining[0];
            setSelectedPlanId(nextDefault.id);
          }
        } else {
          // If deleting the last plan (default plan), clear state and open setup wizard
          setPlansList([]);
          setSelectedPlanId(null);
          openNewPlanWizard();
        }
      }
    } catch (err) {
      console.error('Failed to delete plan', err);
    } finally {
      setPlanToDelete(null);
    }
  };

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

  // No plans exist — launch wizard setup CTA
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
                Run the Retirement Setup Wizard to create your default plan based on your actual accounts, tax status, and retirement goals.
              </p>
              <button
                onClick={openNewPlanWizard}
                className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-3 rounded-xl text-sm font-bold shadow-lg transition-all hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Launch Setup Wizard
              </button>
            </div>
          </div>
        </PageContent>

        <PlanWizardModal
          isOpen={wizardOpen}
          onClose={() => setWizardOpen(false)}
          onSave={handleSaveWizard}
          mode="create"
          availableAccounts={accountsList}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full pb-12">
      <PageHeader title="FIRE Engine & Projections" icon={Flame} />

      <PageContent>
        <div className="space-y-6">
          {/* App Consistent Tab Navigation Bar with Enhanced Plan Selector */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border pb-1 mb-6 gap-4">
            {/* App Style Tabs */}
            <div className="flex items-center gap-6 overflow-x-auto scrollbar-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`pb-2.5 text-xs font-semibold transition-all duration-200 cursor-pointer border-b-2 -mb-px flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
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

            {/* Plan Selector & Management Controls */}
            <PlanManagementMenu
              plans={plansList}
              selectedPlan={selectedPlan}
              onSelectPlan={(id) => setSelectedPlanId(id)}
              onOpenWizardNew={openNewPlanWizard}
              onOpenWizardEdit={(plan) => openEditPlanWizard(plan)}
              onSetDefaultPlan={handleSetDefaultPlan}
              onResetDefaultPlan={handleResetDefaultPlan}
              onOpenDeleteConfirm={(plan) => {
                setPlanToDelete(plan);
                setDeleteDialogOpen(true);
              }}
              updating={updating}
            />
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
            <ScenariosTab plan={selectedPlan} allPlans={plansList} />
          )}

          {activeTab === 'settings' && selectedPlan && (
            <SettingsTab
              plan={selectedPlan}
              onUpdatePlan={handleUpdatePlan}
            />
          )}

          {!selectedPlan && (
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <p className="text-sm text-muted-foreground font-medium">
                No plan selected. Create a plan to get started.
              </p>
            </div>
          )}
        </div>
      </PageContent>

      {/* Interactive Plan Setup Wizard */}
      <PlanWizardModal
        isOpen={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onSave={handleSaveWizard}
        mode={wizardMode}
        initialPlan={editingPlanTarget || selectedPlan}
        defaultPlan={defaultPlan}
        availableAccounts={accountsList}
      />

      {/* Delete Plan Confirmation Dialog */}
      <DeletePlanDialog
        isOpen={deleteDialogOpen}
        planName={planToDelete?.name || ''}
        isDefault={Boolean(planToDelete?.isDefault)}
        onClose={() => {
          setDeleteDialogOpen(false);
          setPlanToDelete(null);
        }}
        onConfirmDelete={handleConfirmDeletePlan}
      />
    </div>
  );
}
