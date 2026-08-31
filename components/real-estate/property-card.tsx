'use client';

import { useState, useMemo } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import { Home, BadgeCheck, Pencil, X, Link2, TrendingUp } from 'lucide-react';
import { MortgagePaydownChart } from './mortgage-paydown-chart';
import { PropertyEquityProgressBar } from './property-equity-progress-bar';
import { useChartVisibility } from '@/lib/hooks/use-chart-visibility';
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

function TogglePill<T extends string>({ options, value, onChange }: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="relative inline-flex items-center rounded-full bg-muted p-1 border border-border">
      <span
        className="absolute top-1 bottom-1 rounded-full bg-card shadow-sm border border-border transition-all duration-300 ease-out"
        style={{
          left: value === options[0].id ? '4px' : '50%',
          width: 'calc(50% - 4px)',
        }}
        aria-hidden="true"
      />
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          aria-pressed={value === option.id}
          className={cn(
            'relative z-10 px-5 sm:px-7 py-1.5 text-sm font-semibold rounded-full transition-colors duration-300',
            value === option.id ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

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

export function PropertyCard({
  property,
  onLinkMortgage,
  onUnlinkMortgage,
  onOverrideValue,
  onEditMortgage,
  onEditProperty,
}: PropertyCardProps) {
  const [isCollapsed, setIsCollapsed] = useCardCollapsed(`propertyCard-${property.id}`);
  const [editingValue, setEditingValue] = useState(false);
  const [newValue, setNewValue] = useState(String(property.value));
  const [activeTab, setActiveTab] = useState<'overview' | 'payoff'>('overview');
  const [selectedMortgageId, setSelectedMortgageId] = useState<string | null>(null);
  const [showSupportingDetails, setShowSupportingDetails] = useState(false);

  const { isVisible } = useChartVisibility();

  const activeMortgages = useMemo(() => {
    return property.linkedMortgages.filter(
      (m) => !m.metadata || !['paid_off', 'refinanced'].includes((m.metadata as any)?.mortgageStatus)
    );
  }, [property.linkedMortgages]);

  const closedMortgages = useMemo(() => {
    return property.linkedMortgages.filter(
      (m) => m.metadata && ['paid_off', 'refinanced'].includes((m.metadata as any)?.mortgageStatus)
    );
  }, [property.linkedMortgages]);

  const defaultMortgageId = activeMortgages[0]?.id || null;
  const currentMortgageId = selectedMortgageId || defaultMortgageId;
  const selectedMortgage = activeMortgages.find((m) => m.id === currentMortgageId) || activeMortgages[0];

  const isPayoffVisible = isVisible('mortgagePaydown') && activeMortgages.length > 0;
  const currentTab = isPayoffVisible ? activeTab : 'overview';

  const isWhollyOwned = activeMortgages.length === 0;
  const ltvColor =
    property.ltv > 80
      ? 'text-destructive bg-destructive/10 border-destructive/20'
      : property.ltv > 60
      ? 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20'
      : 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20';

  const meta = property.metadata || {};
  const propertyType = meta.propertyType as string | undefined;
  const valuationMethod = (meta.valuationMethod as string) || (property.manualValue !== null ? 'manual' : 'manual');
  const valuationLabel =
    valuationMethod === 'redfin' ? 'Redfin AVM' : valuationMethod === 'hpi' ? 'FHFA HPI' : 'Manual Entry';
  const address = meta.address as string | undefined;
  const bedrooms = meta.bedrooms as number | undefined;
  const bathrooms = meta.bathrooms as number | undefined;
  const squareFootage = meta.squareFootage as number | undefined;
  const purchasePrice = meta.purchasePrice as number | undefined;
  const purchaseDate = meta.purchaseDate as string | undefined;
  const zipCode = meta.zipCode as string | undefined;
  const initialValue = meta.initialValue as number | undefined;

  const hasPmi = activeMortgages.some((m) => (m.pmi ?? 0) > 0);
  const pmiRemovalEligible = property.ltv <= 80 && hasPmi;

  // Capital gain calculation if purchase price is present
  const capitalGain = purchasePrice && purchasePrice > 0 ? property.value - purchasePrice : null;
  const capitalGainPct = purchasePrice && purchasePrice > 0 ? ((property.value - purchasePrice) / purchasePrice) * 100 : null;

  const handleSaveValue = () => {
    const val = parseFloat(newValue);
    if (!isNaN(val) && val > 0) {
      onOverrideValue(property.id, val);
    }
    setEditingValue(false);
  };

  return (
    <div
      className={cn(
        '@container bg-card border border-border rounded-xl shadow-sm flex flex-col justify-between transition-all duration-200',
        isCollapsed ? 'h-auto' : 'h-full min-h-[320px]'
      )}
    >
      <CollapsibleCardHeader
        isCollapsed={isCollapsed}
        onToggle={setIsCollapsed}
        title={
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-chart-3/15 flex items-center justify-center shrink-0 border border-chart-3/20">
              <Home className="w-4 h-4 text-chart-3" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="text-sm font-semibold text-foreground">{property.name}</h3>
                {propertyType && (
                  <span className="px-1.5 py-0.5 text-micro font-medium rounded bg-muted text-muted-foreground border border-border uppercase">
                    {PROPERTY_TYPE_LABELS[propertyType] || propertyType}
                  </span>
                )}
                <span className="px-1.5 py-0.5 text-micro font-medium rounded bg-muted/60 text-muted-foreground border border-border">
                  {valuationLabel}
                </span>
              </div>
              {isWhollyOwned ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">
                  <BadgeCheck className="w-3 h-3" />
                  Wholly Owned
                </span>
              ) : pmiRemovalEligible ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">
                  <BadgeCheck className="w-3 h-3" />
                  PMI Removal Eligible (≤80% LTV)
                </span>
              ) : null}
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
                  className="w-24 px-1.5 py-0.5 text-xs bg-background border border-input rounded text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  autoFocus
                />
                <button
                  onClick={handleSaveValue}
                  className="p-0.5 rounded hover:bg-muted text-emerald-600 dark:text-emerald-400"
                  type="button"
                >
                  <BadgeCheck className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setEditingValue(false)}
                  className="p-0.5 rounded hover:bg-muted text-destructive"
                  type="button"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <span className="text-sm font-semibold text-foreground font-mono blur-number">
                  {formatCurrency(property.value)}
                </span>
                {!isCollapsed && (
                  <button
                    onClick={() => {
                      setEditingValue(true);
                      setNewValue(String(property.value));
                    }}
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
              <div className="flex justify-center mb-4" role="tablist" aria-label={`${property.name} view`}>
                <TogglePill
                  options={[
                    { id: 'overview', label: 'Overview' },
                    { id: 'payoff', label: 'Payoff Projections' },
                  ]}
                  value={currentTab}
                  onChange={(tab) => setActiveTab(tab)}
                />
              </div>
            )}

            {currentTab === 'overview' ? (
              <div className="space-y-4">
                {/* Sync Error Alert */}
                {meta.syncError && (
                  <div className="p-2.5 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive font-medium flex items-start gap-2">
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

                {/* Core Financial Metrics Grid */}
                <div className="grid grid-cols-2 @sm:grid-cols-4 gap-2.5">
                  <div className="p-2.5 bg-muted/20 border border-border/40 rounded-lg flex flex-col justify-between">
                    <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                      Total Equity
                    </div>
                    <div className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400 blur-number">
                      {formatCurrency(property.equity)}
                    </div>
                  </div>

                  <div className="p-2.5 bg-muted/20 border border-border/40 rounded-lg flex flex-col justify-between">
                    <div
                      className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 flex items-center justify-between"
                      title="Estimated net proceeds assuming 8% seller closing costs and agent commissions"
                    >
                      <span>Est. Net Proceeds</span>
                      <span className="text-micro text-muted-foreground/70 font-sans lowercase">(net 8%)</span>
                    </div>
                    <div className="font-mono text-sm font-bold text-chart-1 blur-number">
                      {formatCurrency(property.saleProceeds)}
                    </div>
                  </div>

                  <div className="p-2.5 bg-muted/20 border border-border/40 rounded-lg flex flex-col justify-between">
                    <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                      Loan-to-Value
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-sm font-bold text-foreground blur-number">
                        {property.ltv.toFixed(1)}%
                      </span>
                      <span
                        className={cn(
                          'px-1.5 py-0.2 rounded text-micro font-semibold border uppercase tracking-wider',
                          ltvColor
                        )}
                      >
                        {property.ltv <= 60 ? 'Healthy' : property.ltv <= 80 ? 'Moderate' : 'High'}
                      </span>
                    </div>
                  </div>

                  <div className="p-2.5 bg-muted/20 border border-border/40 rounded-lg flex flex-col justify-between">
                    <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3 text-muted-foreground" />
                      <span>Appreciation</span>
                    </div>
                    {capitalGain !== null && capitalGainPct !== null ? (
                      <div className="font-mono text-xs font-semibold flex items-baseline gap-1 blur-number">
                        <span
                          className={
                            capitalGain >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
                          }
                        >
                          {capitalGain >= 0 ? '+' : ''}
                          {formatCurrency(capitalGain)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          ({capitalGainPct >= 0 ? '+' : ''}
                          {capitalGainPct.toFixed(0)}%)
                        </span>
                      </div>
                    ) : (
                      <div className="font-mono text-xs text-muted-foreground italic">
                        {property.value > 0 ? 'Current Value' : '—'}
                      </div>
                    )}
                  </div>
                </div>

                {/* Real Estate Asset Breakdown Progress Bar */}
                <div className="p-3 bg-muted/20 border border-border/50 rounded-xl">
                  <PropertyEquityProgressBar
                    propertyValue={property.value}
                    purchasePrice={purchasePrice}
                    initialValue={initialValue}
                    linkedMortgages={property.linkedMortgages}
                  />
                </div>

                {/* Supporting details stay tucked away until they are needed. */}
                <div className="border-t border-border/40 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowSupportingDetails(!showSupportingDetails)}
                    aria-expanded={showSupportingDetails}
                    className="w-full flex items-center justify-between gap-3 text-left rounded-lg px-2.5 py-2 -mx-2.5 hover:bg-muted/40 transition-colors cursor-pointer"
                  >
                    <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider">Supporting details</span>
                    <span className="text-[10px] text-muted-foreground">{showSupportingDetails ? 'Hide' : 'Show'} mortgages &amp; property info</span>
                  </button>
                </div>

                {showSupportingDetails && <div className="space-y-4 animate-in fade-in-50 slide-in-from-top-1 duration-200">
                {/* Mortgages Section */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <span>Mortgages</span>
                      <span className="text-muted-foreground font-normal font-mono text-[10px]">
                        ({activeMortgages.length})
                      </span>
                    </span>
                    <button
                      onClick={() => onLinkMortgage(property.id)}
                      className="inline-flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 font-medium transition-colors cursor-pointer px-2 py-0.5 rounded-md hover:bg-primary/10"
                      type="button"
                    >
                      <Link2 className="w-3 h-3" />
                      Link Mortgage
                    </button>
                  </div>

                  {activeMortgages.length > 0 ? (
                    <div className="space-y-2">
                      {activeMortgages.map((m) => {
                        const payoffProgress =
                          m.originalLoanAmount > 0
                            ? ((m.originalLoanAmount - Math.abs(m.balance)) / m.originalLoanAmount) * 100
                            : 0;

                        return (
                          <div
                            key={m.id}
                            className="p-3 bg-muted/30 hover:bg-muted/40 border border-border rounded-lg transition-colors group"
                          >
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold text-foreground truncate">{m.name}</span>
                                  {m.interestRate > 0 && (
                                    <span className="px-1.5 py-0.2 text-micro font-mono font-medium rounded bg-muted text-muted-foreground border border-border">
                                      {m.interestRate.toFixed(2)}% APR
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="font-mono text-xs font-bold text-foreground blur-number">
                                  {formatCurrency(Math.abs(m.balance))}
                                </span>
                                {onEditMortgage && (
                                  <button
                                    onClick={() => onEditMortgage(m)}
                                    className="p-1 rounded hover:bg-muted text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer"
                                    title="Edit mortgage attributes"
                                    type="button"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                )}
                                <button
                                  onClick={() => onUnlinkMortgage(m.id)}
                                  className="p-1 rounded hover:bg-muted text-muted-foreground/60 hover:text-destructive transition-colors cursor-pointer"
                                  title="Unlink mortgage"
                                  type="button"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Mini Paydown Bar */}
                            <div className="space-y-1">
                              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden flex gap-0.5">
                                <div
                                  className="h-full bg-emerald-500 rounded-full transition-all"
                                  style={{ width: `${Math.min(payoffProgress, 100)}%` }}
                                />
                              </div>
                              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                <span>{payoffProgress.toFixed(1)}% paid off</span>
                                {m.monthlyPayment > 0 && (
                                  <span className="blur-number">{formatCurrency(m.monthlyPayment)}/mo</span>
                                )}
                              </div>
                            </div>

                            {/* Additional attributes badges if present */}
                            {((m.escrow !== undefined && m.escrow > 0) ||
                              (m.pmi !== undefined && m.pmi > 0) ||
                              (m.extraPrincipal !== undefined && m.extraPrincipal > 0)) && (
                              <div className="mt-2 pt-2 border-t border-border/40 grid grid-cols-3 gap-2 text-[10px] text-muted-foreground">
                                {m.escrow !== undefined && m.escrow > 0 && (
                                  <div>
                                    <span className="text-muted-foreground/80 block">Escrow</span>
                                    <span className="font-mono font-medium text-foreground blur-number">
                                      {formatCurrency(m.escrow)}
                                    </span>
                                  </div>
                                )}
                                {m.pmi !== undefined && m.pmi > 0 && (
                                  <div>
                                    <span className="text-muted-foreground/80 block">PMI</span>
                                    <span className="font-mono font-medium text-foreground blur-number">
                                      {formatCurrency(m.pmi)}
                                    </span>
                                  </div>
                                )}
                                {m.extraPrincipal !== undefined && m.extraPrincipal > 0 && (
                                  <div>
                                    <span className="text-emerald-600 dark:text-emerald-400 block font-medium">
                                      Extra Principal
                                    </span>
                                    <span className="font-mono font-medium text-emerald-600 dark:text-emerald-400 blur-number">
                                      {formatCurrency(m.extraPrincipal)}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : isWhollyOwned ? (
                    <div className="p-3 bg-muted/20 border border-dashed border-border rounded-lg text-center text-xs text-muted-foreground">
                      No mortgages linked to this property.
                    </div>
                  ) : null}
                </div>

                {/* Closed Mortgages History */}
                {closedMortgages.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-border/30">
                    <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider block">
                      Closed Mortgages
                    </span>
                    <div className="space-y-1.5">
                      {closedMortgages.map((m) => {
                        const mMeta = m.metadata || {};
                        const isRefi = mMeta.mortgageStatus === 'refinanced';
                        const closedLabel = isRefi ? 'Refinanced' : 'Paid Off';
                        const closedDate = isRefi ? String(mMeta.refinanceDate || '') : String(mMeta.payoffDate || '');

                        return (
                          <div
                            key={m.id}
                            className="p-2.5 bg-muted/20 border border-border/40 rounded-lg flex items-center justify-between text-xs group"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-muted-foreground truncate">{m.name}</span>
                                <span className="px-1.5 py-0.2 text-micro font-medium rounded bg-muted text-muted-foreground border border-border uppercase">
                                  {closedLabel}
                                </span>
                              </div>
                              {closedDate && (
                                <div className="text-[10px] text-muted-foreground/75 mt-0.5">
                                  Date: {closedDate}
                                </div>
                              )}
                            </div>
                            <div className="text-right flex-shrink-0 ml-3 flex items-center gap-1.5">
                              {onEditMortgage && (
                                <button
                                  onClick={() => onEditMortgage(m)}
                                  className="p-1 rounded hover:bg-muted text-muted-foreground/40 hover:text-foreground transition-colors cursor-pointer"
                                  title="Edit attributes"
                                  type="button"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                              )}
                              <button
                                onClick={() => onUnlinkMortgage(m.id)}
                                className="p-1 rounded hover:bg-muted text-muted-foreground/40 hover:text-destructive transition-colors cursor-pointer"
                                title="Unlink mortgage"
                                type="button"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                              <span className="font-mono text-muted-foreground blur-number ml-1">$0.00</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Property Details Section */}
                {(purchasePrice !== undefined || purchaseDate || zipCode || address || initialValue !== undefined || bedrooms !== undefined || bathrooms !== undefined || squareFootage !== undefined) && (
                  <div className="pt-3 border-t border-border/40">
                    <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block mb-2">
                      Property Details
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs">
                      {purchasePrice !== undefined && purchasePrice > 0 && (
                        <div className="flex justify-between items-center py-0.5">
                          <span className="text-muted-foreground">Purchase Price</span>
                          <span className="font-mono font-medium text-foreground blur-number">
                            {formatCurrency(purchasePrice)}
                          </span>
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
                          <span className="font-mono font-medium text-foreground blur-number">
                            {formatCurrency(initialValue)}
                          </span>
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
                      {address && (
                        <div className="flex justify-between items-center py-0.5 col-span-2 sm:col-span-3 border-t border-border/30 pt-1.5 mt-0.5">
                          <span className="text-muted-foreground">Address</span>
                          <span className="text-foreground truncate max-w-[280px]" title={address}>
                            {address}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                </div>}
              </div>
            ) : (
              <div className="space-y-4">
                {/* Mortgage Selector if multiple active */}
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
