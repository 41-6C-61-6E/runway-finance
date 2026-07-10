'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Pencil, AlertCircle, AlertTriangle } from 'lucide-react';
import { useUserSettings } from '@/components/user-settings-provider';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

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
  syncStatus?: { status: 'ok' | 'warning' | 'error'; reason?: string; lastSyncAt?: string } | null;
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
        {account.syncStatus && account.syncStatus.status !== 'ok' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link 
                href="/settings?tab=accounts&sub=automatic"
                className="flex-shrink-0 cursor-pointer"
                onClick={(e) => e.stopPropagation()}
              >
                {account.syncStatus.status === 'error' ? (
                  <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                )}
              </Link>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[240px]">
              <p className="font-semibold">{account.syncStatus.status === 'error' ? 'Connection Error' : 'Sync Warning'}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{account.syncStatus.reason}</p>
              <Link 
                href="/settings?tab=accounts&sub=automatic"
                className="text-[10px] text-primary hover:underline mt-1 font-semibold block"
                onClick={(e) => e.stopPropagation()}
              >
                Click to investigate in settings
              </Link>
            </TooltipContent>
          </Tooltip>
        )}
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
