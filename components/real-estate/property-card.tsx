'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import { Home, BadgeCheck, Pencil, X, Link2 } from 'lucide-react';

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
  principal?: number;
  interest?: number;
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
  snapshots: { date: string; value: number }[];
}

interface PropertyCardProps {
  property: Property;
  onLinkMortgage: (propertyId: string) => void;
  onUnlinkMortgage: (mortgageId: string) => void;
  onOverrideValue: (propertyId: string, value: number) => void;
  onEditMortgage?: (mortgage: MortgageInfo) => void;
}

export function PropertyCard({ property, onLinkMortgage, onUnlinkMortgage, onOverrideValue, onEditMortgage }: PropertyCardProps) {
  const [editingValue, setEditingValue] = useState(false);
  const [newValue, setNewValue] = useState(String(property.value));
  const isWhollyOwned = property.linkedMortgages.length === 0;
  const ltvColor = property.ltv > 80 ? 'text-destructive' : property.ltv > 60 ? 'text-chart-3' : 'text-chart-1';

  const meta = property.metadata || {};
  const propertyType = meta.propertyType as string | undefined;
  const propertyId = meta.propertyId as string | undefined;
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
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-chart-3/20 flex items-center justify-center">
            <Home className="w-4 h-4 text-chart-3" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-foreground">{property.name}</h3>
              {propertyType && (
                <span className="px-1.5 py-0.5 text-[9px] font-medium rounded bg-chart-3/10 text-chart-3 border border-chart-3/20 uppercase tracking-wider">
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
        <div className="text-right">
          {editingValue ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                className="w-24 px-2 py-1 text-xs bg-background border border-input rounded font-mono text-right"
                autoFocus
              />
              <button onClick={handleSaveValue} className="text-[10px] text-primary font-medium">Save</button>
              <button onClick={() => setEditingValue(false)} className="text-[10px] text-muted-foreground">Cancel</button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <span className="font-mono text-base font-bold text-foreground blur-number">
                {formatCurrency(property.value)}
              </span>
              <button onClick={() => { setNewValue(String(property.value)); setEditingValue(true); }} className="p-0.5 rounded hover:bg-muted text-muted-foreground/50 hover:text-foreground transition-colors">
                <Pencil className="w-3 h-3" />
              </button>
            </div>
          )}
          <div className="text-[10px] text-muted-foreground">Estimated Value</div>
        </div>
      </div>

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

      {property.linkedMortgages.length > 0 && (
        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Mortgages</span>
            <button
              onClick={() => onLinkMortgage(property.id)}
              className="inline-flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 font-medium transition-colors"
            >
              <Link2 className="w-3 h-3" />
              Add
            </button>
          </div>
          {property.linkedMortgages.map((m) => {
            const payoffProgress = m.originalLoanAmount > 0
              ? ((m.originalLoanAmount - Math.abs(m.balance)) / m.originalLoanAmount) * 100
              : 0;
            return (
              <div key={m.id} className="p-3 bg-muted/30 border border-border rounded-lg relative group">
                <button
                  onClick={() => onUnlinkMortgage(m.id)}
                  className="absolute top-1 right-1 p-0.5 rounded hover:bg-muted text-muted-foreground/30 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                  title="Unlink mortgage"
                >
                  <X className="w-3 h-3" />
                </button>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-foreground">{m.name}</span>
                  <div className="flex items-center gap-1">
                    {onEditMortgage && (
                      <button
                        onClick={() => onEditMortgage(m)}
                        className="p-0.5 rounded hover:bg-muted text-muted-foreground/30 hover:text-foreground transition-all"
                        title="Edit attributes"
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
                {((m.principal !== undefined && m.principal > 0) ||
                  (m.interest !== undefined && m.interest > 0) ||
                  (m.escrow !== undefined && m.escrow > 0) ||
                  (m.pmi !== undefined && m.pmi > 0) ||
                  (m.extraPrincipal !== undefined && m.extraPrincipal > 0)) && (
                  <div className="mt-2 pt-2 border-t border-border/50 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                    {m.principal !== undefined && m.principal > 0 && (
                      <div className="flex justify-between">
                        <span>Principal</span>
                        <span className="font-mono blur-number">{formatCurrency(m.principal)}</span>
                      </div>
                    )}
                    {m.interest !== undefined && m.interest > 0 && (
                      <div className="flex justify-between">
                        <span>Interest</span>
                        <span className="font-mono blur-number">{formatCurrency(m.interest)}</span>
                      </div>
                    )}
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

      {isWhollyOwned && (
        <button
          onClick={() => onLinkMortgage(property.id)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-2"
        >
          <Link2 className="w-3 h-3" />
          Link a mortgage
        </button>
      )}

      {/* Property Details Section */}
      {(purchasePrice !== undefined || purchaseDate || zipCode || propertyId || initialValue !== undefined) && (
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
            {propertyId && (
              <div className="flex justify-between items-center py-0.5 col-span-2 border-t border-border/30 pt-1.5 mt-1">
                <span className="text-muted-foreground">Redfin ID</span>
                <a
                  href={`https://www.redfin.com/property/${propertyId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  {propertyId}
                  <Link2 className="w-3 h-3" />
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
