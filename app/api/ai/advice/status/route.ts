import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSessionDEK } from '@/lib/crypto-context';
import { buildFinanceContext } from '@/lib/finance/context';
import { resolveAiProvider } from '@/lib/ai/client';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const dek = await getSessionDEK().catch(() => null);

  if (!dek) {
    return NextResponse.json(
      { available: false, reason: 'not_configured', readOnly: true, includeAccountNames: false },
      { status: 200 }
    );
  }

  const ctx = await buildFinanceContext({ userId, dek });

  const adviceEnabled = ctx.settings.aiAdviceEnabled ?? (ctx.settings as any).aiAskEnabled;
  if (ctx.settings.aiEnabled === false || adviceEnabled === false) {
    return NextResponse.json({
      available: false,
      reason: 'disabled',
      readOnly: true,
      includeAccountNames: false,
    });
  }

  const provider = await resolveAiProvider(userId, dek);
  if (!provider) {
    return NextResponse.json({
      available: false,
      reason: 'not_configured',
      readOnly: true,
      includeAccountNames: false,
    });
  }

  const model = ctx.settings.aiAdviceModel || (ctx.settings as any).aiAskModel || provider.model;
  const providerHost = provider.host;
  const isOpenRouter = provider.isOpenRouter;
  const isFreeModel = isOpenRouter && model.toLowerCase().endsWith(':free');
  const consentHost = ctx.settings.aiAdviceConsentHost ?? (ctx.settings as any).aiAskConsentHost;
  const consentRequired = consentHost !== providerHost;
  const includeAccountNames = Boolean(
    ctx.settings.aiAdviceIncludeAccountNames ?? (ctx.settings as any).aiAskIncludeAccountNames
  );

  return NextResponse.json({
    available: true,
    providerHost,
    model,
    isOpenRouter,
    isFreeModel,
    consentRequired,
    readOnly: true,
    includeAccountNames,
  });
}
