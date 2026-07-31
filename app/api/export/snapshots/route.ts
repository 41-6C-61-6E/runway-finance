import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRow } from '@/lib/crypto';
import { eq, and, gte, lte } from 'drizzle-orm';
import { accounts, netWorthSnapshots, accountSnapshots, holdingSnapshots } from '@/lib/db/schema';
import { toCsv } from '@/lib/utils/export-formatter';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = req.nextUrl.searchParams;
  const snapshotType = searchParams.get('type') || 'net_worth'; // 'net_worth' | 'account' | 'holding'
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const accountId = searchParams.get('accountId');

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? userId;
  const db = getDb();
  const dek = await getSessionDEK();

  try {
    const accountsRaw = await db.select().from(accounts).where(eq(accounts.userId, dataUserId));
    const decryptedAccounts = await Promise.all(
      accountsRaw.map((r) => decryptRow('accounts', r as Record<string, unknown>, dek))
    );
    const accountMap = new Map<string, string>(
      decryptedAccounts.map((a) => [a.id as string, a.name as string])
    );

    let csvData: Record<string, unknown>[] = [];
    const dateStr = new Date().toISOString().split('T')[0];

    if (snapshotType === 'account') {
      const conditions = [eq(accountSnapshots.userId, dataUserId)];
      if (startDate) conditions.push(gte(accountSnapshots.snapshotDate, startDate));
      if (endDate) conditions.push(lte(accountSnapshots.snapshotDate, endDate));
      if (accountId && accountId !== 'all') conditions.push(eq(accountSnapshots.accountId, accountId));

      const rowsRaw = await db.select().from(accountSnapshots).where(and(...conditions));
      const decrypted = await Promise.all(
        rowsRaw.map((r) => decryptRow('account_snapshots', r as Record<string, unknown>, dek))
      );
      decrypted.sort((a, b) => (b.snapshotDate as string).localeCompare(a.snapshotDate as string));

      csvData = decrypted.map((s) => ({
        Date: s.snapshotDate || '',
        Account: accountMap.get(s.accountId as string) || s.accountId || '',
        Balance: parseFloat(String(s.balance || '0')),
        CostBasis: s.costBasis ? parseFloat(String(s.costBasis)) : '',
        Currency: s.currency || 'USD',
        Source: s.source || 'auto',
      }));
    } else if (snapshotType === 'holding') {
      const conditions = [eq(holdingSnapshots.userId, dataUserId)];
      if (startDate) conditions.push(gte(holdingSnapshots.snapshotDate, startDate));
      if (endDate) conditions.push(lte(holdingSnapshots.snapshotDate, endDate));

      const rowsRaw = await db.select().from(holdingSnapshots).where(and(...conditions));
      const decrypted = await Promise.all(
        rowsRaw.map((r) => decryptRow('holding_snapshots', r as Record<string, unknown>, dek))
      );
      decrypted.sort((a, b) => (b.snapshotDate as string).localeCompare(a.snapshotDate as string));

      csvData = decrypted.map((s) => ({
        Date: s.snapshotDate || '',
        Account: accountMap.get(s.accountId as string) || s.accountId || '',
        HoldingId: s.holdingId || '',
        Shares: parseFloat(String(s.shares || '0')),
        PricePerShare: parseFloat(String(s.pricePerShare || '0')),
        MarketValue: parseFloat(String(s.marketValue || '0')),
        CostBasis: s.costBasis ? parseFloat(String(s.costBasis)) : '',
      }));
    } else {
      // Net Worth snapshots
      const conditions = [eq(netWorthSnapshots.userId, dataUserId)];
      if (startDate) conditions.push(gte(netWorthSnapshots.snapshotDate, startDate));
      if (endDate) conditions.push(lte(netWorthSnapshots.snapshotDate, endDate));

      const rowsRaw = await db.select().from(netWorthSnapshots).where(and(...conditions));
      const decrypted = await Promise.all(
        rowsRaw.map((r) => decryptRow('net_worth_snapshots', r as Record<string, unknown>, dek))
      );
      decrypted.sort((a, b) => (b.snapshotDate as string).localeCompare(a.snapshotDate as string));

      csvData = decrypted.map((s) => ({
        Date: s.snapshotDate || '',
        TotalNetWorth: parseFloat(String(s.totalNetWorth || '0')),
        TotalAssets: parseFloat(String(s.totalAssets || '0')),
        TotalLiabilities: parseFloat(String(s.totalLiabilities || '0')),
        LiquidAssets: s.liquidAssets ? parseFloat(String(s.liquidAssets)) : '',
        Investments: s.investmentAssets ? parseFloat(String(s.investmentAssets)) : '',
        RealEstate: s.realEstateAssets ? parseFloat(String(s.realEstateAssets)) : '',
      }));
    }

    const csvContent = toCsv(csvData);

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${snapshotType}_snapshots_export_${dateStr}.csv"`,
      },
    });
  } catch (err) {
    console.error('Error exporting snapshots:', err);
    return NextResponse.json({ error: 'Failed to export snapshots' }, { status: 500 });
  }
}
