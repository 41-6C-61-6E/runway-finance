'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import { Home, BadgeCheck, Pencil, X, Link2 } from 'lucide-react';

interface MortgageInfo {
  id: string;
  name: string;
  balance: number;
  originalLoanAmount: number;
  interestRate: number;
  monthlyPayment: number;
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
}

export function PropertyCard({ property, onLinkMortgage, onUnlinkMortgage, onOverrideValue }: PropertyCardProps) {
  const [editingValue, setEditingValue] = useState(false);
  const [newValue, setNewValue] = useState(String(property.value));
  const isWhollyOwned = property.linkedMortgages.length === 0;
  const ltvColor = property.ltv > 80 ? 'text-destructive' : property.ltv > 60 ? 'text-chart-3' : 'text-chart-1';

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
            <h3 className="text-sm font-semibold text-foreground">{property.name}</h3>
            {isWhollyOwned && (
              <span className="inline-flex items-center gap-1 text-[10px] text-chart-1 font-medium">
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
                  <span className="font-mono text-xs text-muted-foreground blur-number">{formatCurrency(Math.abs(m.balance))}</span>
                </div>
                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mb-1">
                  <div className="h-full bg-chart-2 rounded-full transition-all" style={{ width: `${Math.min(payoffProgress, 100)}%` }} />
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{payoffProgress.toFixed(1)}% paid off</span>
                  {m.interestRate > 0 && <span className="blur-number">{m.interestRate.toFixed(2)}% APR</span>}
                  {m.monthlyPayment > 0 && <span className="blur-number">{formatCurrency(m.monthlyPayment)}/mo</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isWhollyOwned && (
        <button
          onClick={() => onLinkMortgage(property.id)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Link2 className="w-3 h-3" />
          Link a mortgage
        </button>
      )}
    </div>
  );
}
