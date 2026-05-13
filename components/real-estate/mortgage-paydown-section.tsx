'use client';

import { useState, useEffect } from 'react';
import { MortgagePaydownChart } from './mortgage-paydown-chart';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';

interface MortgageInfo {
  id: string;
  name: string;
  balance: number;
  originalLoanAmount: number;
  interestRate: number;
  monthlyPayment: number;
  termMonths?: number;
  metadata?: Record<string, unknown>;
}

interface PropertyData {
  id: string;
  name: string;
  linkedMortgages: MortgageInfo[];
}

interface RealEstateData {
  properties: PropertyData[];
}

export function MortgagePaydownSection() {
  const [data, setData] = useState<RealEstateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMortgageId, setSelectedMortgageId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/real-estate', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json();
      })
      .then((d) => setData(d))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Mortgage Paydown</h3>
        <div className="flex items-center justify-center text-muted-foreground h-32">
          <div className="w-7 h-7 border-2 border-border border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Mortgage Paydown</h3>
        <ChartEmptyState variant="error" error={error} />
      </div>
    );
  }

  // Collect all mortgages across all properties
  const allMortgages: Array<{ mortgage: MortgageInfo; propertyName: string }> = [];
  for (const prop of data?.properties ?? []) {
    for (const m of prop.linkedMortgages) {
      allMortgages.push({ mortgage: m, propertyName: prop.name });
    }
  }

  if (allMortgages.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Mortgage Paydown</h3>
        <ChartEmptyState variant="nodata" description="Link a mortgage to a property to see paydown analysis" />
      </div>
    );
  }

  if (allMortgages.length === 1) {
    const { mortgage, propertyName } = allMortgages[0];
    return (
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Mortgage Paydown</h3>
        <MortgagePaydownChart mortgage={mortgage} propertyName={propertyName} />
      </div>
    );
  }

  // Multiple mortgages - show selector + selected chart
  const selectedMortgage = selectedMortgageId
    ? allMortgages.find((m) => m.mortgage.id === selectedMortgageId)
    : allMortgages[0];

  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground mb-3">Mortgage Paydown</h3>
      <div className="mb-3">
        <select
          value={selectedMortgage?.mortgage.id ?? allMortgages[0].mortgage.id}
          onChange={(e) => setSelectedMortgageId(e.target.value)}
          className="px-3 py-1.5 text-xs bg-background border border-input rounded-lg text-foreground"
        >
          {allMortgages.map(({ mortgage, propertyName }) => (
            <option key={mortgage.id} value={mortgage.id}>
              {mortgage.name} ({propertyName})
            </option>
          ))}
        </select>
      </div>
      {selectedMortgage && (
        <MortgagePaydownChart
          mortgage={selectedMortgage.mortgage}
          propertyName={selectedMortgage.propertyName}
        />
      )}
    </div>
  );
}
