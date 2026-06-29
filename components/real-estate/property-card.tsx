'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import { Home, BadgeCheck, Pencil, X, Link2 } from 'lucide-react';
import { MortgagePaydownChart } from './mortgage-paydown-chart';
import { useChartVisibility } from '@/lib/hooks/use-chart-visibility';
import { MathDescription } from '@/components/features/settings/math-description';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { cn } from '@/lib/utils';

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  'single-family': 'Single Family',
  condo: 'Condo',
  townhouse: 'Townhouse',
  'multi-family': 'Multi-Family',
  land: 'Land',
  commercial: 'Commercial',
  other: 'Other',
};

interface MortgageInfo {
  id: string;
  name: string;
  balance: number;
  originalLoanAmount: number;
  interestRate: number;
  monthlyPayment: number;
  extraPrincipal?: number;
  pmi?: number;
  escrow?: number;
  metadata?: Record<string, unknown>;
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
  snapshots: { date: string; value: number }[];
}

interface PropertyCardProps {
  property: Property;
  onLinkMortgage: (propertyId: string) => void;
  onUnlinkMortgage: (mortgageId: string) => void;
  onOverrideValue: (propertyId: string, value: number) => void;
  onEditMortgage?: (mortgage: MortgageInfo) => void;
  onEditProperty?: () => void;
}

export function PropertyCard({ property, onLinkMortgage, onUnlinkMortgage, onOverrideValue, onEditMortgage, onEditProperty }: PropertyCardProps) {
  const [isCollapsed, setIsCollapsed] = useCardCollapsed(`propertyCard-${property.id}`);
  const [editingValue, setEditingValue] = useState(false);
  const [newValue, setNewValue] = useState(String(property.value));
  const [activeTab, setActiveTab] = useState<'overview' | 'payoff'>('overview');
  const [selectedMortgageId, setSelectedMortgageId] = useState<string | null>(null);

  const { isVisible } = useChartVisibility();

  const activeMortgages = property.linkedMortgages.filter(
    (m) => !m.metadata || !['paid_off', 'refinanced'].includes((m.metadata as any)?.mortgageStatus)
  );
  const closedMortgages = property.linkedMortgages.filter(
    (m) => m.metadata && ['paid_off', 'refinanced'].includes((m.metadata as any)?.mortgageStatus)
  );

  const defaultMortgageId = activeMortgages[0]?.id || null;
  const currentMortgageId = selectedMortgageId || defaultMortgageId;
  const selectedMortgage = activeMortgages.find((m) => m.id === currentMortgageId) || activeMortgages[0];

  const isPayoffVisible = isVisible('mortgagePaydown') && activeMortgages.length > 0;
  const currentTab = isPayoffVisible ? activeTab : 'overview';

  const isWhollyOwned = activeMortgages.length === 0;
  const ltvColor = property.ltv > 80 ? 'text-destructive' : property.ltv > 60 ? 'text-chart-3' : 'text-chart-1';

  const meta = property.metadata || {};
  const propertyType = meta.propertyType as string | undefined;
  const address = meta.address as string | undefined;
  const bedrooms = meta.bedrooms as number | undefined;
  const bathrooms = meta.bathrooms as number | undefined;
  const squareFootage = meta.squareFootage as number | undefined;
  const purchasePrice = meta.purchasePrice as number | undefined;
  const purchaseDate = meta.purchaseDate as string | undefined;
  const zipCode = meta.zipCode as string | undefined;
  const initialValue = meta.initialValue as number | undefined;


  const handleSaveValue = () => {
    const val = parseFloat(newValue);
    if (!isNaN(val) && val > 0) {
      onOverrideValue(property.id, val);
    }
    setEditingValue(false);
  };

  return (
    <div className={cn(
      "bg-card border border-border rounded-xl shadow-sm flex flex-col justify-between transition-all",
      isCollapsed ? "h-auto" : "h-full min-h-[320px]"
    )}>
      <CollapsibleCardHeader
        isCollapsed={isCollapsed}
        onToggle={setIsCollapsed}
        title={
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-chart-3/20 flex items-center justify-center shrink-0">
              <Home className="w-4 h-4 text-chart-3" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-foreground">{property.name}</h3>
                {propertyType && (
                  <span className="px-1.5 py-0.5 text-[9px] font-medium rounded bg-muted text-muted-foreground border border-border uppercase">
                    {PROPERTY_TYPE_LABELS[propertyType] || propertyType}
                  </span>
                )}
              </div>
              {isWhollyOwned && (
                <span className="inline-flex items-center gap-1 text-[10px] text-chart-1 font-medium mt-0.5">
                  <BadgeCheck className="w-3 h-3" />
                  Wholly Owned
                </span>
              )}
            </div>
          </div>
        }
        actions={
          <div className="text-right flex items-center gap-2">
            {!isCollapsed && onEditProperty && (
              <button
                onClick={onEditProperty}
                title="Edit property details"
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                type="button"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            {editingValue ? (
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <input
                  type="number"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  className="w-20 px-1 py-0.5 text-xs bg-background border border-input rounded text-foreground font-mono focus:outline-none"
                  autoFocus
                />
                <button onClick={handleSaveValue} className="p-0.5 rounded hover:bg-muted text-chart-1" type="button"><BadgeCheck className="w-3.5 h-3.5" /></button>
                <button onClick={() => setEditingValue(false)} className="p-0.5 rounded hover:bg-muted text-destructive" type="button"><X className="w-3.5 h-3.5" /></button>
              </div>
            ) : (
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <span className="text-sm font-semibold text-foreground font-mono blur-number">{formatCurrency(property.value)}</span>
                {!isCollapsed && (
                  <button
                    onClick={() => { setEditingValue(true); setNewValue(String(property.value)); }}
                    className="p-0.5 text-muted-foreground hover:text-foreground rounded hover:bg-muted transition-colors cursor-pointer"
                    title="Override estimated value"
                    type="button"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
          </div>
        }
      />

      {!isCollapsed && (
        <div className="px-5 pb-5 flex-grow flex flex-col justify-between">
          <div>
            {/* Tabs Header */}
            {isPayoffVisible && (
              <div className="flex border-b border-border/60 mb-4">
                <button
                  onClick={() => setActiveTab('overview')}
                  className={`flex-1 pb-2 text-center text-xs font-semibold border-b-2 transition-all cursor-pointer ${
                    currentTab === 'overview'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                  type="button"
                >
                  Overview
                </button>
                <button
                  onClick={() => setActiveTab('payoff')}
                  className={`flex-1 pb-2 text-center text-xs font-semibold border-b-2 transition-all cursor-pointer ${
                    currentTab === 'payoff'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                  type="button"
                >
                  Payoff Projections
                </button>
              </div>
            )}

            {currentTab === 'overview' ? (
              <>
                {meta.syncError && (
                  <div className="mb-4 p-2.5 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive font-medium flex items-start gap-2">
                    <span className="mt-0.5">⚠️</span>
                    <div className="flex-grow min-w-0">
                      <span className="font-semibold block mb-0.5">Sync Failed</span>
                      <span className="break-words block">{String(meta.syncError)}</span>
                      {String(meta.syncError).toLowerCase().includes('address') && onEditProperty && (
                        <button
                          onClick={onEditProperty}
                          className="mt-1.5 block text-[10px] font-bold text-primary hover:underline text-left cursor-pointer"
                        >
                          Edit property to add address
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Core Metrics */}
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-0.5">Equity</div>
                    <div className="font-mono text-sm font-semibold text-chart-2 blur-number">
                      {formatCurrency(property.equity)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-0.5">Est. Sale Proceeds</div>
                    <div className="font-mono text-sm font-semibold text-chart-1 blur-number">
                      {formatCurrency(property.saleProceeds)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-0.5">LTV</div>
                    <div className={`font-mono text-sm font-semibold blur-number ${ltvColor}`}>
                      {property.ltv.toFixed(1)}%
                    </div>
                  </div>
                </div>

                {/* Mortgages List */}
                {activeMortgages.length > 0 && (
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Mortgages</span>
                      <button
                        onClick={() => onLinkMortgage(property.id)}
                        className="inline-flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 font-medium transition-colors cursor-pointer"
                        type="button"
                      >
                        <Link2 className="w-3 h-3" />
                        Add
                      </button>
                    </div>
                    {activeMortgages.map((m) => {
                      const payoffProgress = m.originalLoanAmount > 0
                        ? ((m.originalLoanAmount - Math.abs(m.balance)) / m.originalLoanAmount) * 100
                        : 0;
                      return (
                        <div key={m.id} className="p-3 bg-muted/30 border border-border rounded-lg relative group">
                          <button
                            onClick={() => onUnlinkMortgage(m.id)}
                            className="absolute top-1 right-1 p-0.5 rounded hover:bg-muted text-muted-foreground/30 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                            title="Unlink mortgage"
                            type="button"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-foreground">{m.name}</span>
                            <div className="flex items-center gap-1">
                              {onEditMortgage && (
                                <button
                                  onClick={() => onEditMortgage(m)}
                                  className="p-0.5 rounded hover:bg-muted text-muted-foreground/30 hover:text-foreground transition-all cursor-pointer"
                                  title="Edit attributes"
                                  type="button"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                              )}
                              <span className="font-mono text-xs text-muted-foreground blur-number">{formatCurrency(Math.abs(m.balance))}</span>
                            </div>
                          </div>
                          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mb-1">
                            <div className="h-full bg-chart-2 rounded-full transition-all" style={{ width: `${Math.min(payoffProgress, 100)}%` }} />
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                            <span>{payoffProgress.toFixed(1)}% paid off</span>
                            {m.interestRate > 0 && <span className="blur-number">{m.interestRate.toFixed(2)}% APR</span>}
                            {m.monthlyPayment > 0 && <span className="blur-number">{formatCurrency(m.monthlyPayment)}/mo</span>}
                          </div>
                          {((m.escrow !== undefined && m.escrow > 0) ||
                            (m.pmi !== undefined && m.pmi > 0) ||
                            (m.extraPrincipal !== undefined && m.extraPrincipal > 0)) && (
                            <div className="mt-2 pt-2 border-t border-border/50 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                              {m.escrow !== undefined && m.escrow > 0 && (
                                <div className="flex justify-between">
                                  <span>Escrow</span>
                                  <span className="font-mono blur-number">{formatCurrency(m.escrow)}</span>
                                </div>
                              )}
                              {m.pmi !== undefined && m.pmi > 0 && (
                                <div className="flex justify-between">
                                  <span>PMI</span>
                                  <span className="font-mono blur-number">{formatCurrency(m.pmi)}</span>
                                </div>
                              )}
                              {m.extraPrincipal !== undefined && m.extraPrincipal > 0 && (
                                <div className="flex justify-between text-chart-1 font-medium">
                                  <span>Extra Principal</span>
                                  <span className="font-mono blur-number">{formatCurrency(m.extraPrincipal)}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {closedMortgages.length > 0 && (
                  <div className="space-y-2 mb-4 pt-2 border-t border-border/30">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Closed Mortgages</span>
                    </div>
                    <div className="space-y-1.5">
                      {closedMortgages.map((m) => {
                        const mMeta = m.metadata || {};
                        const isRefi = mMeta.mortgageStatus === 'refinanced';
                        const closedLabel = isRefi ? 'Refinanced' : 'Paid Off';
                        const closedDate = isRefi ? String(mMeta.refinanceDate || '') : String(mMeta.payoffDate || '');
                        return (
                          <div key={m.id} className="p-3 bg-muted/20 border border-border/40 rounded-lg flex items-center justify-between relative group text-xs">
                            <button
                              onClick={() => onUnlinkMortgage(m.id)}
                              className="absolute top-1 right-1 p-0.5 rounded hover:bg-muted text-muted-foreground/30 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                              title="Unlink mortgage"
                              type="button"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-muted-foreground truncate">{m.name}</span>
                                <span className="px-1.5 py-0.5 text-[9px] font-medium rounded bg-muted text-muted-foreground border border-border uppercase">
                                  {closedLabel}
                                </span>
                              </div>
                              {closedDate && (
                                <div className="text-[10px] text-muted-foreground/75 mt-0.5">
                                  Date: {closedDate}
                                </div>
                              )}
                            </div>
                            <div className="text-right flex-shrink-0 ml-4 flex items-center gap-1.5">
                              {onEditMortgage && (
                                <button
                                  onClick={() => onEditMortgage(m)}
                                  className="p-1 rounded hover:bg-muted text-muted-foreground/40 hover:text-foreground transition-all cursor-pointer"
                                  title="Edit attributes"
                                  type="button"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <span className="font-mono text-muted-foreground blur-number">$0.00</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {isWhollyOwned && (
                  <button
                    onClick={() => onLinkMortgage(property.id)}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-2 cursor-pointer"
                    type="button"
                  >
                    <Link2 className="w-3 h-3" />
                    Link a mortgage
                  </button>
                )}

                {/* Property Details Section */}
                {(purchasePrice !== undefined || purchaseDate || zipCode || address || initialValue !== undefined) && (
                  <div className="mt-4 pt-4 border-t border-border/50">
                    <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider block mb-2">Property Details</span>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                      {purchasePrice !== undefined && purchasePrice > 0 && (
                        <div className="flex justify-between items-center py-0.5">
                          <span className="text-muted-foreground">Purchase Price</span>
                          <span className="font-mono font-medium text-foreground blur-number">{formatCurrency(purchasePrice)}</span>
                        </div>
                      )}
                      {purchaseDate && (
                        <div className="flex justify-between items-center py-0.5">
                          <span className="text-muted-foreground">Purchase Date</span>
                          <span className="text-foreground">{purchaseDate}</span>
                        </div>
                      )}
                      {zipCode && (
                        <div className="flex justify-between items-center py-0.5">
                          <span className="text-muted-foreground">ZIP Code</span>
                          <span className="font-mono text-foreground">{zipCode}</span>
                        </div>
                      )}
                      {initialValue !== undefined && initialValue > 0 && (
                        <div className="flex justify-between items-center py-0.5">
                          <span className="text-muted-foreground">Initial Value</span>
                          <span className="font-mono font-medium text-foreground blur-number">{formatCurrency(initialValue)}</span>
                        </div>
                      )}
                      {address && (
                        <div className="flex justify-between items-center py-0.5 col-span-2 border-t border-border/30 pt-1.5 mt-1">
                          <span className="text-muted-foreground">Address</span>
                          <span className="text-foreground truncate max-w-[200px]" title={address}>{address}</span>
                        </div>
                      )}
                      {bedrooms !== undefined && (
                        <div className="flex justify-between items-center py-0.5">
                          <span className="text-muted-foreground">Beds</span>
                          <span className="text-foreground">{bedrooms}</span>
                        </div>
                      )}
                      {bathrooms !== undefined && (
                        <div className="flex justify-between items-center py-0.5">
                          <span className="text-muted-foreground">Baths</span>
                          <span className="text-foreground">{bathrooms}</span>
                        </div>
                      )}
                      {squareFootage !== undefined && (
                        <div className="flex justify-between items-center py-0.5">
                          <span className="text-muted-foreground">Sq Ft</span>
                          <span className="text-foreground font-mono">{squareFootage.toLocaleString()}</span>
                        </div>
                      )}

                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-4">
                {/* Mortgage Selector if multiple */}
                {activeMortgages.length > 1 && (
                  <div className="flex flex-wrap gap-1.5 p-1 bg-muted/40 rounded-lg border border-border mb-3">
                    {activeMortgages.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setSelectedMortgageId(m.id)}
                        className={`px-3 py-1.5 text-[10px] font-medium rounded-md transition-all cursor-pointer ${
                          m.id === currentMortgageId
                            ? 'bg-background text-foreground shadow-sm font-semibold'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                        type="button"
                      >
                        {m.name}
                      </button>
                    ))}
                  </div>
                )}

                {/* Amortization and Payoff Calculator */}
                {selectedMortgage && (
                  <div className="space-y-4">
                    <MortgagePaydownChart
                      mortgage={selectedMortgage}
                      propertyName={property.name}
                      inline={true}
                    />
                    <MathDescription chartId="mortgagePaydown" />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
