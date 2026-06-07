'use client';

import React, { useState, useEffect } from 'react';
import { PageHeader } from '@/components/page-header';
import PageContent from '@/components/page-content';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { PortfolioSummary } from '@/components/investments/portfolio-summary';
import { PortfolioCharts } from '@/components/investments/portfolio-charts';
import { HoldingsTable } from '@/components/investments/holdings-table';
import { AccountConfigDrawer } from '@/components/investments/account-config-drawer';
import { HoldingFormDrawer } from '@/components/investments/holding-form-drawer';
import { TransactionFormDrawer } from '@/components/investments/transaction-form-drawer';
import { TransactionsLedgerDrawer, Transaction } from '@/components/investments/transactions-ledger-drawer';
import { Briefcase, RefreshCw, AlertCircle, PlusCircle, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { 
  PortfolioSummary as PortfolioData, 
  HoldingPosition, 
  InvestmentAccountDetails 
} from '@/lib/services/investments';

export default function InvestmentsPage() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');

  // Drawer States
  const [selectedAccountForConfig, setSelectedAccountForConfig] = useState<InvestmentAccountDetails | null>(null);
  const [accountIdForHolding, setAccountIdForHolding] = useState<string>('');
  const [selectedHoldingForEdit, setSelectedHoldingForEdit] = useState<any>(null);
  const [accountIdForTxn, setAccountIdForTxn] = useState<string>('');
  const [selectedTransactionForEdit, setSelectedTransactionForEdit] = useState<Transaction | null>(null);
  const [selectedAccountForLedger, setSelectedAccountForLedger] = useState<InvestmentAccountDetails | null>(null);

  const fetchPortfolio = async () => {
    try {
      const res = await fetch('/api/investments/holdings', { credentials: 'include' });
      if (!res.ok) {
        throw new Error('Failed to load portfolio details');
      }
      const portfolio: PortfolioData = await res.json();
      setData(portfolio);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred loading investments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPortfolio();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/investments/sync', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('Sync failed');
      }
      // Re-fetch portfolio details
      await fetchPortfolio();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleDeleteHolding = async (holdingId: string) => {
    if (!confirm('Are you sure you want to delete this position?')) {
      return;
    }

    try {
      const res = await fetch(`/api/investments/holdings/${holdingId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete holding');
      }
      // Re-fetch details
      fetchPortfolio();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete holding');
    }
  };

  const handleModalSuccess = () => {
    // Close all drawers
    setSelectedAccountForConfig(null);
    setAccountIdForHolding('');
    setSelectedHoldingForEdit(null);
    setAccountIdForTxn('');
    setSelectedTransactionForEdit(null);
    
    // Refresh page data
    fetchPortfolio();
  };

  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <LoadingSpinner category="default" className="min-h-[400px]" />
      </div>
    );
  }

  const hasAccounts = data && data.accounts && data.accounts.length > 0;

  return (
    <div className="min-h-screen w-full bg-background/50">
      {/* Page Header with Sync Button */}
      <PageHeader title="Investments & Holdings" icon={Briefcase}>
        {hasAccounts && (
          <button
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold rounded-xl border border-primary/20 transition-all active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Prices'}
          </button>
        )}
      </PageHeader>

      <PageContent>
        {error ? (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-sm flex items-center gap-2 mb-6">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        ) : !hasAccounts ? (
          /* Premium Empty / Zero State */
          <div className="py-16 text-center max-w-lg mx-auto mt-12 bg-card/30 backdrop-blur-md border border-border/40 rounded-3xl p-8 shadow-xl">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-6">
              <Briefcase className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-3">No Investment Accounts Found</h2>
            <p className="text-xs text-muted-foreground leading-relaxed mb-8">
              Runway Finance displays investment portfolios, stock holdings, and retirement accounts here. 
              To get started, add or sync an account of type <span className="font-semibold text-foreground">Investment, Brokerage, or Retirement</span>.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
              <Link 
                href="/settings" 
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1 px-5 py-2.5 bg-primary text-primary-foreground text-xs font-semibold rounded-xl hover:opacity-95 transition-opacity"
              >
                Go to Account Settings <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        ) : (
          /* Portfolio Dashboard */
          <div className="space-y-6">
            {/* 1. Value / Cost / Gain cards */}
            <PortfolioSummary
              totalValue={data!.totalValue}
              totalCost={data!.totalCost}
              totalGainLoss={data!.totalGainLoss}
              totalGainLossPercent={data!.totalGainLossPercent}
            />

            {/* 2. Charts (History & Allocation) */}
            <PortfolioCharts
              history={data!.history || []}
              accounts={data!.accounts}
            />

            {/* 3. Holdings Group Table */}
            <div>
              <div className="flex items-center justify-between mb-4 px-1">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Holdings & Positions</h3>
                  <p className="text-xs text-muted-foreground">Detailed asset list grouped by brokerage account</p>
                </div>
              </div>
              <HoldingsTable
                accounts={data!.accounts}
                onAddHolding={(accId) => setAccountIdForHolding(accId)}
                onEditHolding={(holding, accId, holdingId) => {
                  setAccountIdForHolding(accId);
                  setSelectedHoldingForEdit({
                    id: holdingId,
                    ticker: holding.ticker,
                    shares: holding.shares,
                    costBasis: holding.costBasis,
                    // optional date/notes if existing on target computed holding
                    purchaseDate: (holding as any).purchaseDate,
                    notes: (holding as any).notes,
                  });
                }}
                onDeleteHolding={handleDeleteHolding}
                onAddTransaction={(accId) => setAccountIdForTxn(accId)}
                onConfigureAccount={(acc) => setSelectedAccountForConfig(acc)}
                onViewTransactions={(accId) => {
                  const targetAcc = data!.accounts.find(a => a.id === accId);
                  if (targetAcc) setSelectedAccountForLedger(targetAcc);
                }}
              />
            </div>
          </div>
        )}
      </PageContent>

      {/* Account Settings / Config Drawer */}
      <AccountConfigDrawer
        open={selectedAccountForConfig !== null}
        onClose={() => setSelectedAccountForConfig(null)}
        onSuccess={handleModalSuccess}
        account={selectedAccountForConfig}
      />

      {/* Manual Holding form drawer (Positions Mode) */}
      <HoldingFormDrawer
        open={accountIdForHolding !== '' && selectedHoldingForEdit === null}
        onClose={() => setAccountIdForHolding('')}
        onSuccess={handleModalSuccess}
        accountId={accountIdForHolding}
        editHolding={null}
      />

      {/* Manual Holding Edit form drawer (Positions Mode) */}
      <HoldingFormDrawer
        open={selectedHoldingForEdit !== null}
        onClose={() => setSelectedHoldingForEdit(null)}
        onSuccess={handleModalSuccess}
        accountId={accountIdForHolding}
        editHolding={selectedHoldingForEdit}
      />

      {/* Log Transaction drawer (Ledger Mode) */}
      <TransactionFormDrawer
        open={accountIdForTxn !== ''}
        onClose={() => setAccountIdForTxn('')}
        onSuccess={handleModalSuccess}
        accountId={accountIdForTxn}
        editTransaction={null}
      />

      {/* View Ledger / Transaction list drawer */}
      <TransactionsLedgerDrawer
        open={selectedAccountForLedger !== null}
        onClose={() => setSelectedAccountForLedger(null)}
        onSuccess={fetchPortfolio} // just re-fetch portfolio data to update balances/shares
        account={selectedAccountForLedger}
        onEditTransaction={(txn) => {
          setSelectedAccountForLedger(null);
          setSelectedTransactionForEdit(txn);
        }}
      />

      {/* Edit Transaction drawer (Ledger Mode) */}
      <TransactionFormDrawer
        open={selectedTransactionForEdit !== null}
        onClose={() => setSelectedTransactionForEdit(null)}
        onSuccess={handleModalSuccess}
        accountId={selectedTransactionForEdit?.accountId || ''}
        editTransaction={selectedTransactionForEdit}
      />
    </div>
  );
}
