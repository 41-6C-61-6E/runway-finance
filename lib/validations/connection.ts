import { z } from 'zod';

export const CreateConnectionSchema = z.object({
  setupToken: z.string().min(1),
  label: z.string().max(100).default('Primary'),
  balanceSource: z.enum(['current', 'available']).optional(),
});

export const UpdateConnectionSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  syncFrequency: z
    .enum(['manual', '4h', '12h', 'daily', 'weekly', 'monthly', 'hourly'])
    .transform((val) => (val === 'hourly' ? 'daily' : val))
    .optional(),
  disabledAccounts: z.array(z.string()).optional(),
  setupToken: z.string().min(1).optional(),
  accessUrl: z.string().min(1).optional(),
  balanceSource: z.enum(['current', 'available']).optional(),
});
