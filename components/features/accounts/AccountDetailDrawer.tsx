'use client';

import { useState, useEffect, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { MortgageAttributesForm } from '@/components/features/mortgages/mortgage-attributes-form';

type Account = {
  id: string;
  name: string;
  type: string;
  balance: string;
  currency: string;
  institution: string | null;
  isHidden: boolean;
  isExcludedFromNetWorth: boolean;
  balanceDate: string | null;
  metadata?: Record<string, unknown> | null;
  connectionId?: string | null;
};

const MAJOR_TYPE_OPTIONS = [
  { value: 'banking', label: 'Banking' },
  { value: 'credit', label: 'Credit Card' },
  { value: 'investment', label: 'Investment' },
  { value: 'realestate', label: 'Real Estate' },
  { value: 'loan', label: 'Loan / Liability' },
  { value: 'asset', label: 'Other Asset' },
];

const SUB_TYPE_OPTIONS: Record<string, { value: string; label: string }[]> = {
  banking: [
    { value: 'checking', label: 'Checking' },
    { value: 'savings', label: 'Savings' },
    { value: 'hsachecking', label: 'HSA (Checking)' },
    { value: 'other', label: 'Other Banking / Cash' },
  ],
  credit: [
    { value: 'credit', label: 'Credit Card' },
  ],
  investment: [
    { value: 'investment', label: 'Taxable Brokerage' },
    { value: 'brokerage', label: 'Brokerage' },
    { value: 'retirement', label: 'Retirement (General)' },
    { value: 'rothira', label: 'Roth IRA' },
    { value: 'traditionalira', label: 'Traditional IRA' },
    { value: '401k', label: '401(k)' },
    { value: '403b', label: '403(b)' },
    { value: 'sepira', label: 'SEP IRA' },
    { value: 'simpleira', label: 'Simple IRA' },
    { value: '529', label: '529 Account' },
    { value: 'hsa', label: 'HSA (Investment)' },
    { value: 'health', label: 'HSA' },
    { value: 'otherinvestment', label: 'Other Investment' },
  ],
  realestate: [
    { value: 'primaryhome', label: 'Primary Residence' },
    { value: 'secondaryhome', label: 'Secondary / Vacation Home' },
    { value: 'rentalproperty', label: 'Rental Property' },
    { value: 'commercial', label: 'Commercial Property' },
    { value: 'land', label: 'Land / Undeveloped' },
    { value: 'otherrealestate', label: 'Other Real Estate' },
    { value: 'realestate', label: 'Real Estate (Other)' },
  ],
  loan: [
    { value: 'loan', label: 'Loan' },
    { value: 'mortgage', label: 'Mortgage' },
    { value: 'otherLiability', label: 'Other Liability' },
  ],
  asset: [
    { value: 'vehicle', label: 'Vehicle' },
    { value: 'crypto', label: 'Bitcoin / Crypto' },
    { value: 'metals', label: 'Metals' },
    { value: 'otherAsset', label: 'Other Asset' },
  ],
};

function findMajorType(type: string): string {
  const normalized = type?.toLowerCase() || '';
  for (const [major, subs] of Object.entries(SUB_TYPE_OPTIONS)) {
    if (subs.some(s => s.value.toLowerCase() === normalized)) return major;
  }
  return 'banking';
}

interface AccountDetailDrawerProps {
  account: Account | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AccountDetailDrawer({ account, open, onClose, onSuccess }: AccountDetailDrawerProps) {
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState(account?.type ?? '');
  const [majorType, setMajorType] = useState('banking');
  const [isHidden, setIsHidden] = useState(account?.isHidden ?? false);
  const [isExcludedFromNetWorth, setIsExcludedFromNetWorth] = useState(account?.isExcludedFromNetWorth ?? false);
  const [saving, setSaving] = useState(false);
  const [mortgageMeta, setMortgageMeta] = useState<Record<string, string>>({});
  const [allAccounts, setAllAccounts] = useState<any[]>([]);

  useEffect(() => {
    if (!account || !open) return;
    setName(account.name);
    setType(account.type);
    setMajorType(findMajorType(account.type));
    setIsHidden(account.isHidden);
    setIsExcludedFromNetWorth(account.isExcludedFromNetWorth);

    if (account.type === 'mortgage') {
      const meta = account.metadata ?? {};
      const flat: Record<string, string> = {};
      Object.entries(meta).forEach(([k, v]) => {
        if (v !== undefined && v !== null) flat[k] = String(v);
      });
      setMortgageMeta(flat);

      fetch('/api/accounts?includeHidden=true', { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => {
          setAllAccounts(Array.isArray(data) ? data : []);
        })
        .catch(() => {});
    } else {
      setMortgageMeta({});
      setAllAccounts([]);
    }
  }, [account, open]);

  const handleSave = useCallback(async () => {
    if (!account) return;
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        name,
        type,
        isHidden,
        isExcludedFromNetWorth,
      };

      if (type === 'mortgage') {
        const metadata: Record<string, unknown> = {
          originalLoanAmount: parseFloat(mortgageMeta.originalLoanAmount || '0'),
          interestRate: parseFloat(mortgageMeta.interestRate || '0'),
          termMonths: parseInt(mortgageMeta.termMonths || '360', 10),
          monthlyPayment: parseFloat(mortgageMeta.monthlyPayment || '0'),
          escrowAmount: parseFloat(mortgageMeta.escrowAmount || '0'),
          extraPrincipal: parseFloat(mortgageMeta.extraPrincipal || '0'),
          pmi: parseFloat(mortgageMeta.pmi || '0'),
          escrow: parseFloat(mortgageMeta.escrow || '0'),
          mortgageStatus: mortgageMeta.mortgageStatus || 'active',
        };
        if (mortgageMeta.purchaseDate) {
          metadata.purchaseDate = mortgageMeta.purchaseDate;
        }
        if (mortgageMeta.linkedPropertyId) {
          metadata.linkedPropertyId = mortgageMeta.linkedPropertyId;
        }
        if (mortgageMeta.mortgageStatus === 'paid_off') {
          metadata.payoffDate = mortgageMeta.payoffDate;
        } else if (mortgageMeta.mortgageStatus === 'refinanced') {
          metadata.refinanceDate = mortgageMeta.refinanceDate;
          metadata.payoffBalance = parseFloat(mortgageMeta.payoffBalance || '0');
          metadata.refinancedByLoanId = mortgageMeta.refinancedByLoanId || '';
        }
        payload.metadata = metadata;

        if (['paid_off', 'refinanced'].includes(mortgageMeta.mortgageStatus)) {
          payload.balance = '0';
        }
      }

      await fetch(`/api/accounts/${account.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      onSuccess();
    } finally {
      setSaving(false);
    }
  }, [account, name, type, isHidden, isExcludedFromNetWorth, mortgageMeta, onSuccess]);

  if (!account || !open) return null;

  const handleMajorTypeChange = (newMajor: string) => {
    setMajorType(newMajor);
    const firstSub = SUB_TYPE_OPTIONS[newMajor]?.[0]?.value || 'other';
    setType(firstSub);
  };

  const formatBalance = (balance: string, currency: string) => {
    const num = parseFloat(balance);
    return {
      text: new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency || 'USD',
        minimumFractionDigits: 2,
      }).format(Math.abs(num)),
    };
  };

  const renderLinkedPropertyField = () => {
    const realEstateAccounts = allAccounts.filter((a) => a.type === 'realestate');
    const alreadyLinked = new Set(
      allAccounts
        .filter((a) => a.type === 'mortgage' && a.id !== account?.id)
        .flatMap((m) => {
          const meta = m.metadata ?? {};
          return meta.linkedPropertyId ? [meta.linkedPropertyId as string] : [];
        })
    );
    const available = realEstateAccounts.filter((re) => !alreadyLinked.has(re.id) || mortgageMeta.linkedPropertyId === re.id);
    return (
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Linked Property (optional)</label>
        <select
          value={mortgageMeta.linkedPropertyId || ''}
          onChange={(e) => setMortgageMeta({ ...mortgageMeta, linkedPropertyId: e.target.value })}
          className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">None</option>
          {available.map((re) => (
            <option key={re.id} value={re.id}>{re.name}</option>
          ))}
        </select>
      </div>
    );
  };

  const { text } = formatBalance(account.balance, account.currency);

  return (
    <Sheet open={open} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[420px] sm:w-[500px] overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle>Account Details</SheetTitle>
        </SheetHeader>

        <div className="space-y-5">
          {/* Balance display */}
          <div className="p-4 bg-card border border-border rounded-xl">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">Current Balance</div>
              {account.connectionId && (
                <span className="text-[10px] text-chart-1 font-medium bg-chart-1/10 px-1.5 py-0.5 rounded">SimpleFIN synced</span>
              )}
            </div>
            <div className={`font-mono text-2xl font-bold mt-1 text-foreground financial-value`}>{text}</div>
            <div className="text-xs text-muted-foreground mt-1">{account.currency}</div>
          </div>

          {/* Editable fields */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Group</label>
                <select
                  value={majorType}
                  onChange={(e) => handleMajorTypeChange(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {MAJOR_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {SUB_TYPE_OPTIONS[majorType]?.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Info fields (read-only) */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-muted-foreground">Institution</div>
                <div className="text-sm text-foreground mt-0.5">{account.institution || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Balance Date</div>
                <div className="text-sm text-foreground mt-0.5">
                  {account.balanceDate ? new Date(account.balanceDate).toLocaleDateString() : '—'}
                </div>
              </div>
            </div>

            {/* Mortgage attributes form */}
            {type === 'mortgage' && (
              <>
                {renderLinkedPropertyField()}
                <MortgageAttributesForm
                  meta={mortgageMeta}
                  onChange={setMortgageMeta}
                  allMortgages={allAccounts.filter((a) => a.type === 'mortgage' && a.id !== account.id)}
                />
              </>
            )}

            {/* Metadata display for manual accounts */}
            {type !== 'mortgage' && account.metadata && Object.keys(account.metadata).length > 0 && (
              <div className="p-3 bg-muted/30 border border-border rounded-lg">
                <div className="text-xs text-muted-foreground mb-1">Asset Details</div>
                {Object.entries(account.metadata).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <span className="text-foreground font-mono text-xs">{String(value)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Toggles */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground/80">Hide from list</span>
                <Switch
                  checked={isHidden}
                  onCheckedChange={setIsHidden}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground/80">Exclude from net worth</span>
                <Switch
                  checked={isExcludedFromNetWorth}
                  onCheckedChange={setIsExcludedFromNetWorth}
                />
              </div>
            </div>
          </div>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full px-4 py-2.5 text-sm font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
