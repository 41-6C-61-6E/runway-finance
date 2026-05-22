'use client';

import { useState, useEffect, useCallback } from 'react';
import { PropertyCard } from './property-card';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter, SheetClose } from '@/components/ui/sheet';
import { MortgageAttributesForm } from '@/components/features/mortgages/mortgage-attributes-form';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/utils/format';

const PROPERTY_TYPES = [
  { value: 'single-family', label: 'Single Family Home' },
  { value: 'condo', label: 'Condo' },
  { value: 'townhouse', label: 'Townhouse' },
  { value: 'multi-family', label: 'Multi-Family' },
  { value: 'land', label: 'Land' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'other', label: 'Other' },
] as const;

interface MortgageInfo {
  id: string;
  name: string;
  balance: number;
  originalLoanAmount: number;
  interestRate: number;
  monthlyPayment: number;
  metadata?: Record<string, unknown>;
  extraPrincipal?: number;
  pmi?: number;
  escrow?: number;
}

interface Property {
  id: string;
  name: string;
  value: number;
  manualValue: number | null;
  metadata: Record<string, unknown>;
  linkedMortgages: MortgageInfo[];
  equity: number;
  ltv: number;
  saleProceeds: number;
  snapshots: { date: string; value: number; isSynthetic?: boolean }[];
}

interface RealEstateData {
  properties: Property[];
  summary: {
    totalValue: number;
    totalMortgage: number;
    totalEquity: number;
    overallLtv: number;
    propertyCount: number;
  };
}

export function PropertyCards() {
  const [data, setData] = useState<RealEstateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mortgageAccounts, setMortgageAccounts] = useState<{ id: string; name: string; balance: string }[]>([]);

  const [linkingPropertyId, setLinkingPropertyId] = useState<string | null>(null);
  const [selectedMortgageId, setSelectedMortgageId] = useState('');

  // Mortgage attribute editing
  const [editingMortgage, setEditingMortgage] = useState<MortgageInfo & { accountId: string } | null>(null);
  const [mortgageEditMeta, setMortgageEditMeta] = useState<Record<string, string>>({});
  const [savingMortgage, setSavingMortgage] = useState(false);

  // Property details editing
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [propertyEditMeta, setPropertyEditMeta] = useState<Record<string, string>>({});
  const [selectedMortgageIds, setSelectedMortgageIds] = useState<string[]>([]);
  const [savingProperty, setSavingProperty] = useState(false);
  const [propertyEditError, setPropertyEditError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [reRes, mortRes] = await Promise.all([
        fetch('/api/real-estate', { credentials: 'include' }),
        fetch('/api/accounts?type=mortgage', { credentials: 'include' }),
      ]);
      if (!reRes.ok) throw new Error('Failed to fetch real estate data');
      setData(await reRes.json());
      if (mortRes.ok) setMortgageAccounts(await mortRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleLinkMortgage = async () => {
    if (!linkingPropertyId || !selectedMortgageId) return;
    const property = data?.properties.find((p) => p.id === linkingPropertyId);
    if (!property) return;

    const currentIds = (property.metadata.mortgageAccountIds as string[]) ?? [];
    if (currentIds.includes(selectedMortgageId)) {
      setLinkingPropertyId(null);
      setSelectedMortgageId('');
      return;
    }
    const newMortgageIds = [...currentIds, selectedMortgageId];

    const res = await fetch(`/api/accounts/${linkingPropertyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        metadata: { ...property.metadata, mortgageAccountIds: newMortgageIds },
      }),
    });
    if (res.ok) {
      setLinkingPropertyId(null);
      setSelectedMortgageId('');
      fetchData();
    }
  };

  const handleUnlinkMortgage = async (propertyId: string, mortgageId: string) => {
    const property = data?.properties.find((p) => p.id === propertyId);
    if (!property) return;

    const currentIds = (property.metadata.mortgageAccountIds as string[]) ?? [];
    const newMortgageIds = currentIds.filter((id) => id !== mortgageId);

    await fetch(`/api/accounts/${propertyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        metadata: { ...property.metadata, mortgageAccountIds: newMortgageIds.length > 0 ? newMortgageIds : [] },
      }),
    });
    fetchData();
  };

  const handleOverrideValue = async (propertyId: string, value: number) => {
    const property = data?.properties.find((p) => p.id === propertyId);
    if (!property) return;

    await fetch(`/api/accounts/${propertyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        balance: String(value),
        metadata: { ...property.metadata, manualValue: value },
      }),
    });
    fetchData();
  };

  const openEditMortgage = (mortgage: MortgageInfo, accountId: string) => {
    setEditingMortgage({ ...mortgage, accountId });
    const meta = mortgage.metadata ?? {};
    const flat: Record<string, string> = {};
    Object.entries(meta).forEach(([k, v]) => {
      if (v !== undefined && v !== null) flat[k] = String(v);
    });
    setMortgageEditMeta(flat);
  };

  const openEditProperty = (property: Property) => {
    setEditingProperty(property);
    setPropertyEditError(null);
    const meta = property.metadata ?? {};
    const flat: Record<string, string> = {};
    Object.entries(meta).forEach(([k, v]) => {
      if (v !== undefined && v !== null && !Array.isArray(v)) flat[k] = String(v);
    });
    // Set selected mortgage IDs state
    const mortgageIds = (meta.mortgageAccountIds as string[]) ?? [];
    setSelectedMortgageIds(mortgageIds);
    setPropertyEditMeta(flat);
  };

  const handleSavePropertyDetails = async () => {
    if (!editingProperty) return;
    setSavingProperty(true);
    setPropertyEditError(null);
    try {
      const metadata: Record<string, unknown> = { ...editingProperty.metadata };
      if (propertyEditMeta.propertyType) metadata.propertyType = propertyEditMeta.propertyType;
      else delete metadata.propertyType;
      metadata.propertyId = propertyEditMeta.propertyId || '';
      if (propertyEditMeta.purchasePrice) metadata.purchasePrice = parseFloat(propertyEditMeta.purchasePrice);
      else delete metadata.purchasePrice;
      if (propertyEditMeta.purchaseDate) metadata.purchaseDate = propertyEditMeta.purchaseDate;
      else delete metadata.purchaseDate;
      if (propertyEditMeta.zipCode) metadata.zipCode = propertyEditMeta.zipCode;
      else delete metadata.zipCode;
      if (propertyEditMeta.initialValue) metadata.initialValue = parseFloat(propertyEditMeta.initialValue);
      else delete metadata.initialValue;
      
      metadata.mortgageAccountIds = selectedMortgageIds;

      const res = await fetch(`/api/accounts/${editingProperty.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ metadata }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to save property details');
      }

      setEditingProperty(null);
      setPropertyEditMeta({});
      await fetchData();
    } catch (err) {
      setPropertyEditError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSavingProperty(false);
    }
  };

  const handleSaveMortgageAttributes = async () => {
    if (!editingMortgage) return;
    setSavingMortgage(true);
    try {
      const metadata: Record<string, unknown> = {
        originalLoanAmount: parseFloat(mortgageEditMeta.originalLoanAmount || '0'),
        interestRate: parseFloat(mortgageEditMeta.interestRate || '0'),
        termMonths: parseInt(mortgageEditMeta.termMonths || '360', 10),
        monthlyPayment: parseFloat(mortgageEditMeta.monthlyPayment || '0'),
        escrowAmount: parseFloat(mortgageEditMeta.escrowAmount || '0'),
        extraPrincipal: parseFloat(mortgageEditMeta.extraPrincipal || '0'),
        pmi: parseFloat(mortgageEditMeta.pmi || '0'),
        escrow: parseFloat(mortgageEditMeta.escrow || '0'),
      };
      if (mortgageEditMeta.purchaseDate) {
        metadata.purchaseDate = mortgageEditMeta.purchaseDate;
      }

      const res = await fetch(`/api/accounts/${editingMortgage.accountId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ metadata }),
      });

      if (!res.ok) {
        throw new Error('Failed to save mortgage attributes');
      }

      setEditingMortgage(null);
      setMortgageEditMeta({});
      await fetchData();
    } catch (err) {
      console.error('Error saving mortgage attributes:', err);
    } finally {
      setSavingMortgage(false);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {[1, 2].map((i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-5 animate-pulse">
            <div className="h-4 w-24 bg-muted rounded mb-4" />
            <div className="h-8 w-32 bg-muted rounded mb-4" />
            <div className="h-4 w-full bg-muted rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl p-5">
        <ChartEmptyState variant="error" error={error} />
      </div>
    );
  }

  if (!data || data.properties.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-5">
        <ChartEmptyState variant="nodata" description="Add a Real Estate asset in Settings to get started" />
      </div>
    );
  }

  const linkedMortgageIds = new Set(
    data.properties.flatMap((p) => p.linkedMortgages.map((m) => m.id))
  );
  const availableMortgages = mortgageAccounts.filter((m) => !linkedMortgageIds.has(m.id));

  return (
    <>
      <div className="grid grid-cols-1 gap-5">
        {data.properties.map((property) => (
          <PropertyCard
            key={property.id}
            property={property}
            onLinkMortgage={() => setLinkingPropertyId(property.id)}
            onUnlinkMortgage={(mortgageId) => handleUnlinkMortgage(property.id, mortgageId)}
            onOverrideValue={handleOverrideValue}
            onEditMortgage={(mortgage) => openEditMortgage(mortgage, mortgage.id)}
            onEditProperty={() => openEditProperty(property)}
          />
        ))}
      </div>

      {/* Link Mortgage Modal */}
      {linkingPropertyId && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-card border border-border rounded-xl p-5 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-sm font-semibold text-foreground mb-3">Link Mortgage</h3>
            {availableMortgages.length === 0 ? (
              <p className="text-xs text-muted-foreground mb-4">No unlinked mortgage accounts available.</p>
            ) : (
              <select
                value={selectedMortgageId}
                onChange={(e) => setSelectedMortgageId(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm mb-4"
              >
                <option value="">Select a mortgage...</option>
                {availableMortgages.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            )}
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => { setLinkingPropertyId(null); setSelectedMortgageId(''); }}
                className="px-3 py-1.5 text-xs text-foreground bg-muted hover:bg-accent rounded-lg transition-colors"
              >
                Cancel
              </button>
              {availableMortgages.length > 0 && (
                <button
                  onClick={handleLinkMortgage}
                  disabled={!selectedMortgageId}
                  className="px-3 py-1.5 text-xs font-medium text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
                >
                  Link Mortgage
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Mortgage Attributes Sheet */}
      <Sheet open={!!editingMortgage} onOpenChange={(open) => { if (!open) setEditingMortgage(null); }}>
        <SheetContent side="right" className="w-[420px] sm:w-[500px] overflow-y-auto">
          <SheetHeader className="pb-4">
            <SheetTitle>Edit Mortgage Attributes</SheetTitle>
            <SheetDescription>
              Update the details for {editingMortgage?.name}.
            </SheetDescription>
          </SheetHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveMortgageAttributes();
            }}
            className="space-y-4"
          >
            <MortgageAttributesForm
              meta={mortgageEditMeta}
              onChange={(meta) => setMortgageEditMeta(meta as Record<string, string>)}
            />
            <SheetFooter className="pt-4">
              <SheetClose asChild>
                <button
                  type="button"
                  className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </SheetClose>
              <button
                type="submit"
                disabled={savingMortgage}
                className="px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
              >
                {savingMortgage ? 'Saving...' : 'Save'}
              </button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Edit Property Details Sheet */}
      <Sheet open={!!editingProperty} onOpenChange={(open) => { if (!open) { setEditingProperty(null); setPropertyEditError(null); setSelectedMortgageIds([]); } }}>
        <SheetContent side="right" className="w-[420px] sm:w-[500px] overflow-y-auto">
          <SheetHeader className="pb-4">
            <SheetTitle>Edit Property Details</SheetTitle>
            <SheetDescription>Update details for {editingProperty?.name}.</SheetDescription>
          </SheetHeader>
          <form
            onSubmit={(e) => { e.preventDefault(); handleSavePropertyDetails(); }}
            className="space-y-4"
          >
            {propertyEditError && (
              <div className="p-3 bg-destructive/20 border border-destructive/30 rounded-lg">
                <p className="text-destructive text-sm">{propertyEditError}</p>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Property Type</label>
              <select
                value={propertyEditMeta.propertyType || ''}
                onChange={(e) => setPropertyEditMeta((m) => ({ ...m, propertyType: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select property type...</option>
                {PROPERTY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Redfin Property ID (optional)</label>
              <Input
                value={propertyEditMeta.propertyId || ''}
                onChange={(e) => setPropertyEditMeta((m) => ({ ...m, propertyId: e.target.value }))}
                placeholder="e.g., 446533"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Purchase Price</label>
                <Input
                  type="number"
                  step="0.01"
                  value={propertyEditMeta.purchasePrice || ''}
                  onChange={(e) => setPropertyEditMeta((m) => ({ ...m, purchasePrice: e.target.value }))}
                  placeholder="e.g., 350000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Purchase Date</label>
                <Input
                  type="date"
                  value={propertyEditMeta.purchaseDate || ''}
                  onChange={(e) => setPropertyEditMeta((m) => ({ ...m, purchaseDate: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">ZIP Code (for HPI estimation)</label>
              <Input
                value={propertyEditMeta.zipCode || ''}
                onChange={(e) => setPropertyEditMeta((m) => ({ ...m, zipCode: e.target.value }))}
                placeholder="e.g., 94105"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Initial Value (optional)</label>
              <Input
                type="number"
                step="0.01"
                value={propertyEditMeta.initialValue || ''}
                onChange={(e) => setPropertyEditMeta((m) => ({ ...m, initialValue: e.target.value }))}
                placeholder="e.g., 500000"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Linked Mortgages</label>
              {(() => {
                const otherPropertiesLinkedMortgages = new Set(
                  data?.properties
                    .filter((p) => p.id !== editingProperty?.id)
                    .flatMap((p) => p.linkedMortgages.map((m) => m.id)) ?? []
                );
                const displayMortgages = mortgageAccounts.filter((m) => !otherPropertiesLinkedMortgages.has(m.id));

                if (displayMortgages.length === 0) {
                  return (
                    <div className="text-xs text-muted-foreground italic py-2 border border-dashed border-border rounded-lg text-center">
                      No mortgages available to link
                    </div>
                  );
                }

                return (
                  <div className="border border-border rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto bg-muted/20">
                    {displayMortgages.map((m) => {
                      const isChecked = selectedMortgageIds.includes(m.id);
                      return (
                        <label
                          key={m.id}
                          className="flex items-start gap-2.5 text-xs text-foreground hover:bg-muted/50 p-2 rounded-md cursor-pointer transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedMortgageIds((prev) => [...prev, m.id]);
                              } else {
                                setSelectedMortgageIds((prev) => prev.filter((id) => id !== m.id));
                              }
                            }}
                            className="rounded border-input text-primary focus:ring-ring mt-0.5 h-4 w-4 cursor-pointer"
                          />
                          <div className="flex flex-col gap-0.5">
                            <span className="font-semibold">{m.name}</span>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              Current Balance: {formatCurrency(Math.abs(parseFloat(m.balance)))}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
            <SheetFooter className="pt-4">
              <SheetClose asChild>
                <button
                  type="button"
                  className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </SheetClose>
              <button
                type="submit"
                disabled={savingProperty}
                className="px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
              >
                {savingProperty ? 'Saving...' : 'Save'}
              </button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
