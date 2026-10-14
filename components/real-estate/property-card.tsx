'use client';

import { useState, useMemo } from 'react';
import { formatCurrency, formatPlainPercent } from '@/lib/utils/format';
import {
  Home,
  BadgeCheck,
  Pencil,
  X,
  Link2,
  SlidersHorizontal,
  Bed,
  Bath,
  Maximize2,
  MapPin,
  Building,
  Wallet,
  ChevronDown,
  ShieldCheck,
  Landmark,
} from 'lucide-react';
import { MortgagePaydownChart } from './mortgage-paydown-chart';
import { PropertyEquityProgressBar } from './property-equity-progress-bar';
import { useChartVisibility } from '@/lib/hooks/use-chart-visibility';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { cn } from '@/lib/utils';
import { IconButton } from '@/components/ui/icon-button';
import { IconTip } from '@/components/ui/icon-tip';
import { computeEquityBreakdown } from '@/lib/services/real-estate-equity-breakdown';

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  'single-family': 'Single Family',
  condo: 'Condo',
  townhouse: 'Townhouse',
  'multi-family': 'Multi-Family',
  land: 'Land',
  commercial: 'Commercial',
  other: 'Other',
};

function TogglePill<T extends string>({
  options,
  value,
  onChange,
}: {
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
            'relative z-10 px-5 sm:px-7 py-1.5 text-xs sm:text-sm font-semibold rounded-full transition-colors duration-300',
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

  const meta = property.metadata || {};
  const propertyType = meta.propertyType as string | undefined;
  const valuationMethod = (meta.valuationMethod as string) || (property.manualValue !== null ? 'manual' : 'manual');
  const valuationLabel =
    valuationMethod === 'redfin' ? 'Redfin AVM' : valuationMethod === 'hpi' ? 'FHFA HPI' : 'Manual Entry';
  const address = meta.address as string | undefined;
  const redfinPropertyId = meta.redfinPropertyId as string | undefined;
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

  const equityBreakdown = useMemo(() => {
    return computeEquityBreakdown(
      property.value,
      purchasePrice,
      initialValue,
      property.linkedMortgages
    );
  }, [property.value, purchasePrice, initialValue, property.linkedMortgages]);

  const specsList = [
    bedrooms !== undefined ? `${bedrooms} bed${bedrooms === 1 ? '' : 's'}` : null,
    bathrooms !== undefined ? `${bathrooms} bath${bathrooms === 1 ? '' : 's'}` : null,
    squareFootage !== undefined ? `${squareFootage.toLocaleString()} sq ft` : null,
  ].filter(Boolean);
  const specsSummary = specsList.join(' • ');
  const hasPropertySpecs = specsList.length > 0 || !!zipCode;

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
                {isWhollyOwned ? (
                  <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                    <BadgeCheck className="w-3 h-3" />
                    Wholly Owned
                  </span>
                ) : pmiRemovalEligible ? (
                  <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                    <BadgeCheck className="w-3 h-3" />
                    PMI Removal Eligible (≤80% LTV)
                  </span>
                ) : null}
              </div>
              {specsSummary && (
                <div className="text-[11px] text-muted-foreground mt-0.5 font-normal">
                  {specsSummary}
                </div>
              )}
            </div>
          </div>
        }
        actions={
          <div className="text-right flex items-center gap-2">
            {!isCollapsed && onEditProperty && (
              <IconButton
                size="sm"
                label="Edit property details"
                className="text-muted-foreground hover:text-foreground"
                onClick={onEditProperty}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
              </IconButton>
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
                <IconButton
                  size="sm"
                  label="Save value"
                  className="p-0.5 -m-0.5 text-emerald-600 dark:text-emerald-400"
                  onClick={handleSaveValue}
                >
                  <BadgeCheck className="w-3.5 h-3.5" />
                </IconButton>
                <IconButton
                  size="sm"
                  label="Cancel edit"
                  className="p-0.5 -m-0.5 text-destructive"
                  onClick={() => setEditingValue(false)}
                >
                  <X className="w-3.5 h-3.5" />
                </IconButton>
              </div>
            ) : (
              <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                <span className="text-sm sm:text-base font-bold text-foreground font-mono blur-number">
                  {formatCurrency(property.value)}
                </span>
                {!isCollapsed && (
                  <IconButton
                    size="sm"
                    label="Override property value"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setEditingValue(true);
                      setNewValue(String(property.value));
                    }}
                  >
                    <Pencil className="w-3 h-3" />
                  </IconButton>
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
                    { id: 'overview', label: 'Equity Breakdown' },
                    { id: 'payoff', label: 'Payoff' },
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
                      {String(meta.syncError).toLowerCase().includes('property id') && onEditProperty && (
                        <button
                          onClick={onEditProperty}
                          className="mt-1.5 block text-[10px] font-bold text-primary hover:underline text-left cursor-pointer"
                        >
                          Edit property to enter the Redfin Property ID
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Hero Key Metrics: Total Equity & Est. Net Proceeds (Non-duplicated) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Total Equity Hero Tile */}
                  <div className="p-3.5 bg-muted/25 border border-border/60 rounded-xl flex items-center justify-between">
                    <div>
                      <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Total Equity</span>
                      </div>
                      <div className="text-xl sm:text-2xl font-extrabold font-mono text-emerald-600 dark:text-emerald-400 blur-number">
                        {formatCurrency(property.equity)}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                        <span className="font-medium font-mono text-foreground/80">
                          {formatPlainPercent(equityBreakdown.totalEquityPct)} owned
                        </span>
                        {capitalGain !== null && capitalGainPct !== null && (
                          <>
                            <span>•</span>
                            <span
                              className={cn(
                                'font-mono font-medium',
                                capitalGain >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
                              )}
                            >
                              {capitalGain >= 0 ? '+' : ''}
                              {formatCurrency(capitalGain)} ({capitalGainPct >= 0 ? '+' : ''}
                              {Math.round(capitalGainPct)}% gain)
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Est. Net Proceeds Hero Tile */}
                  <div className="p-3.5 bg-muted/25 border border-border/60 rounded-xl flex items-center justify-between">
                    <div>
                      <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1.5">
                        <Wallet className="w-3.5 h-3.5 text-primary" />
                        <span>Est. Net Proceeds</span>
                        <IconTip
                          size={12}
                          content="Estimated proceeds if sold today, assuming ~8% standard deductions for seller broker commissions (5-6%) and title/transfer closing costs (2-3%)."
                          aria-label="About estimated net proceeds"
                        />
                      </div>
                      <div className="text-xl sm:text-2xl font-extrabold font-mono text-chart-1 blur-number">
                        {formatCurrency(property.saleProceeds)}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        After estimated ~8% selling &amp; closing costs
                      </div>
                    </div>
                  </div>
                </div>

                {/* Real Estate Asset Breakdown Progress Bar */}
                <div className="p-3.5 bg-muted/20 border border-border/50 rounded-xl">
                  <PropertyEquityProgressBar
                    propertyValue={property.value}
                    purchasePrice={purchasePrice}
                    initialValue={initialValue}
                    linkedMortgages={property.linkedMortgages}
                  />
                </div>

                {/* Supporting Details Accordion */}
                <div className="border-t border-border/50 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowSupportingDetails(!showSupportingDetails)}
                    aria-expanded={showSupportingDetails}
                    className="w-full flex items-center justify-between gap-3 text-left rounded-xl px-3 py-2.5 hover:bg-muted/40 transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-md bg-muted/60 flex items-center justify-center text-muted-foreground group-hover:text-foreground transition-colors">
                        <SlidersHorizontal className="w-3 h-3" />
                      </div>
                      <span className="text-xs font-semibold text-foreground">Supporting Details</span>
                      <span className="text-[11px] text-muted-foreground">
                        ({activeMortgages.length} {activeMortgages.length === 1 ? 'Mortgage' : 'Mortgages'}
                        {hasPropertySpecs ? ' • Property Specs' : ''})
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground group-hover:text-foreground">
                      <span>{showSupportingDetails ? 'Hide' : 'Show'}</span>
                      <ChevronDown
                        className={cn(
                          'w-3.5 h-3.5 transition-transform duration-200',
                          showSupportingDetails && 'rotate-180'
                        )}
                      />
                    </div>
                  </button>
                </div>

                {showSupportingDetails && (
                  <div className="space-y-4 pt-1 animate-in fade-in-50 slide-in-from-top-1 duration-200">
                    {/* Section 1: Property Specifications & Purchase Info */}
                    {(hasPropertySpecs ||
                      purchasePrice ||
                      purchaseDate ||
                      zipCode ||
                      address ||
                      initialValue ||
                      redfinPropertyId) && (
                      <div className="p-3.5 bg-muted/20 border border-border/40 rounded-xl space-y-3">
                        <div className="text-[11px] font-semibold text-foreground uppercase tracking-wider flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <Building className="w-3.5 h-3.5 text-muted-foreground" />
                            <span>Property Specifications</span>
                          </span>
                          {onEditProperty && (
                            <button
                              type="button"
                              onClick={onEditProperty}
                              className="text-[10px] text-primary hover:underline font-medium inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Pencil className="w-2.5 h-2.5" />
                              Edit info
                            </button>
                          )}
                        </div>

                        {/* Quick Specs Chips */}
                        {(bedrooms !== undefined || bathrooms !== undefined || squareFootage !== undefined || zipCode) && (
                          <div className="flex flex-wrap gap-2 text-xs">
                            {bedrooms !== undefined && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-card border border-border/60 font-medium text-foreground">
                                <Bed className="w-3.5 h-3.5 text-muted-foreground" />
                                <span>{bedrooms} {bedrooms === 1 ? 'Bed' : 'Beds'}</span>
                              </span>
                            )}
                            {bathrooms !== undefined && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-card border border-border/60 font-medium text-foreground">
                                <Bath className="w-3.5 h-3.5 text-muted-foreground" />
                                <span>{bathrooms} {bathrooms === 1 ? 'Bath' : 'Baths'}</span>
                              </span>
                            )}
                            {squareFootage !== undefined && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-card border border-border/60 font-medium text-foreground">
                                <Maximize2 className="w-3.5 h-3.5 text-muted-foreground" />
                                <span className="font-mono">{squareFootage.toLocaleString()}</span> sq ft
                              </span>
                            )}
                            {zipCode && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-card border border-border/60 font-medium text-foreground">
                                <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                                <span>ZIP {zipCode}</span>
                              </span>
                            )}
                          </div>
                        )}

                        {/* Financial & Valuation Key-Value Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs pt-1">
                          {purchasePrice !== undefined && purchasePrice > 0 && (
                            <div className="p-2 rounded-lg bg-card/60 border border-border/40">
                              <span className="text-[10px] text-muted-foreground block">Purchase Price</span>
                              <span className="font-mono font-semibold text-foreground blur-number">
                                {formatCurrency(purchasePrice)}
                              </span>
                            </div>
                          )}
                          {purchaseDate && (
                            <div className="p-2 rounded-lg bg-card/60 border border-border/40">
                              <span className="text-[10px] text-muted-foreground block">Purchase Date</span>
                              <span className="font-medium text-foreground">{purchaseDate}</span>
                            </div>
                          )}
                          <div className="p-2 rounded-lg bg-card/60 border border-border/40">
                            <span className="text-[10px] text-muted-foreground block">Valuation Source</span>
                            <span className="font-medium text-foreground">{valuationLabel}</span>
                          </div>
                          {initialValue !== undefined && initialValue > 0 && (
                            <div className="p-2 rounded-lg bg-card/60 border border-border/40">
                              <span className="text-[10px] text-muted-foreground block">Initial Value</span>
                              <span className="font-mono font-semibold text-foreground blur-number">
                                {formatCurrency(initialValue)}
                              </span>
                            </div>
                          )}
                          {redfinPropertyId && (
                            <div className="p-2 rounded-lg bg-card/60 border border-border/40">
                              <span className="text-[10px] text-muted-foreground block">Redfin Property ID</span>
                              <span className="font-mono font-medium text-foreground">{redfinPropertyId}</span>
                            </div>
                          )}
                          {address && (
                            <div className="p-2 rounded-lg bg-card/60 border border-border/40 col-span-2 sm:col-span-3">
                              <span className="text-[10px] text-muted-foreground block">Address</span>
                              <span className="font-medium text-foreground truncate block" title={address}>
                                {address}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Section 2: Mortgages Section */}
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                          <Landmark className="w-3.5 h-3.5 text-muted-foreground" />
                          <span>Linked Mortgages</span>
                          <span className="text-muted-foreground font-normal font-mono text-[10px]">
                            ({activeMortgages.length})
                          </span>
                        </span>
                        <button
                          onClick={() => onLinkMortgage(property.id)}
                          className="inline-flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 font-medium transition-colors cursor-pointer px-2.5 py-1 rounded-md hover:bg-primary/10 border border-primary/20"
                          type="button"
                        >
                          <Link2 className="w-3 h-3" />
                          Link Mortgage
                        </button>
                      </div>

                      {activeMortgages.length > 0 ? (
                        <div className="space-y-2.5">
                          {activeMortgages.map((m) => {
                            const payoffProgress =
                              m.originalLoanAmount > 0
                                ? ((m.originalLoanAmount - Math.abs(m.balance)) / m.originalLoanAmount) * 100
                                : 0;

                            return (
                              <div
                                key={m.id}
                                className="p-3.5 bg-card border border-border/70 rounded-xl transition-all shadow-xs hover:border-border space-y-3"
                              >
                                {/* Top Row: Name, APR, Balance, Actions */}
                                <div className="flex items-center justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-xs font-semibold text-foreground truncate">{m.name}</span>
                                      {m.interestRate > 0 && (
                                        <span className="px-1.5 py-0.5 text-micro font-mono font-medium rounded-md bg-muted text-muted-foreground border border-border">
                                          {m.interestRate.toFixed(2)}% APR
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="font-mono text-sm font-bold text-foreground blur-number">
                                      {formatCurrency(Math.abs(m.balance))}
                                    </span>
                                    {onEditMortgage && (
                                      <IconButton
                                        size="sm"
                                        label="Edit mortgage attributes"
                                        className="p-1 text-muted-foreground hover:text-foreground"
                                        onClick={() => onEditMortgage(m)}
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                      </IconButton>
                                    )}
                                    <IconButton
                                      size="sm"
                                      label="Unlink mortgage"
                                      className="p-1 text-muted-foreground hover:text-destructive"
                                      onClick={() => onUnlinkMortgage(m.id)}
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </IconButton>
                                  </div>
                                </div>

                                {/* Paydown Progress Bar */}
                                <div className="space-y-1.5">
                                  <div className="w-full h-2 bg-muted/60 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                                      style={{ width: `${Math.min(payoffProgress, 100)}%` }}
                                    />
                                  </div>
                                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                    <span>
                                      <strong className="text-foreground font-mono">{formatPlainPercent(payoffProgress)}</strong> paid off
                                    </span>
                                    {m.monthlyPayment > 0 && (
                                      <span className="font-mono text-foreground blur-number">
                                        {formatCurrency(m.monthlyPayment)}/mo
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Additional Attributes Badges */}
                                {((m.escrow !== undefined && m.escrow > 0) ||
                                  (m.pmi !== undefined && m.pmi > 0) ||
                                  (m.extraPrincipal !== undefined && m.extraPrincipal > 0)) && (
                                  <div className="pt-2 border-t border-border/40 flex flex-wrap gap-2 text-[10px]">
                                    {m.escrow !== undefined && m.escrow > 0 && (
                                      <span className="px-2 py-0.5 rounded bg-muted/50 border border-border/40 text-muted-foreground">
                                        Escrow: <strong className="font-mono text-foreground blur-number">{formatCurrency(m.escrow)}</strong>
                                      </span>
                                    )}
                                    {m.pmi !== undefined && m.pmi > 0 && (
                                      <span className="px-2 py-0.5 rounded bg-muted/50 border border-border/40 text-muted-foreground">
                                        PMI: <strong className="font-mono text-foreground blur-number">{formatCurrency(m.pmi)}</strong>
                                      </span>
                                    )}
                                    {m.extraPrincipal !== undefined && m.extraPrincipal > 0 && (
                                      <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-medium">
                                        Extra: <strong className="font-mono blur-number">{formatCurrency(m.extraPrincipal)}</strong>
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : isWhollyOwned ? (
                        <div className="p-4 bg-muted/20 border border-dashed border-border rounded-xl text-center text-xs text-muted-foreground">
                          No mortgages linked to this property.
                        </div>
                      ) : null}
                    </div>

                    {/* Section 3: Closed Mortgages History */}
                    {closedMortgages.length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-border/40">
                        <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block">
                          Prior Financing &amp; Closed Loans
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
                                className="p-2.5 bg-muted/20 border border-border/40 rounded-lg flex items-center justify-between text-xs"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-muted-foreground truncate">{m.name}</span>
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
                                    <IconButton
                                      size="sm"
                                      label="Edit attributes"
                                      className="p-1 text-muted-foreground/40 hover:text-foreground"
                                      onClick={() => onEditMortgage(m)}
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </IconButton>
                                  )}
                                  <IconButton
                                    size="sm"
                                    label="Unlink mortgage"
                                    className="p-1 text-muted-foreground/40 hover:text-destructive"
                                    onClick={() => onUnlinkMortgage(m.id)}
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </IconButton>
                                  <span className="font-mono text-muted-foreground blur-number ml-1">$0.00</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
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
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
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

