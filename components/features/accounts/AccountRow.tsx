'use client';

import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { useUserSettings } from '@/components/user-settings-provider';

export type Account = {
  id: string;
  name: string;
  type: string;
  balance: string;
  currency: string;
  institution: string | null;
  isHidden: boolean;
  isExcludedFromNetWorth: boolean;
  balanceDate: string | null;
  tags?: { id: string; name: string; color: string }[];
};

export const formatCurrency = (balance: string, currency: string) => {
  const num = parseFloat(balance);
  const isPositive = num >= 0;
  return {
    text: new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.abs(num)),
    sign: isPositive ? '' : '-',
  };
};

export default function AccountRow({
  account,
  onOpenDrawer,
}: {
  account: Account;
  onOpenDrawer: (account: Account) => void;
}) {
  const router = useRouter();
  const fmt = formatCurrency(account.balance, account.currency);
  const settingsContext = useUserSettings();
  const showTags = settingsContext?.settings?.accountTagVisibility?.sidebar !== false;

  return (
    <div
      className="flex items-center justify-between py-1 pl-6 pr-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors group/account"
      onClick={() => router.push(`/transactions?accountId=${account.id}`)}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-[15px] text-muted-foreground truncate blur-number">{account.name}</span>
        {showTags && account.tags && account.tags.length > 0 && (
          <div className="flex items-center gap-1 flex-shrink-0">
            {account.tags.map((tag) => (
              <span
                key={tag.id}
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: tag.color }}
                title={tag.name}
              />
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); onOpenDrawer(account); }}
          className="p-0.5 rounded hover:bg-muted text-muted-foreground/50 hover:text-foreground transition-colors opacity-0 group-hover/account:opacity-100 cursor-pointer"
          title="Edit account"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <span className="font-mono text-[13px] font-semibold tabular-nums blur-number text-foreground">
          {fmt.sign}{fmt.text}
        </span>
      </div>
    </div>
  );
}
