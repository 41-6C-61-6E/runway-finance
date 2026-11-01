import 'server-only';
import type { ProviderAdapter } from '@/lib/integrations/adapters';
import { logger } from '@/lib/logger';

export interface SyncPipelineOptions {
  forceFullSync?: boolean;
}

export class SyncPipeline {
  static async run(
    adapter: ProviderAdapter,
    connectionId: string,
    userId: string,
    options?: SyncPipelineOptions
  ) {
    logger.info('[sync-pipeline] Running sync pipeline', {
      provider: adapter.provider,
      connectionId,
      userId,
      options,
    });
    return { success: true };
  }
}

