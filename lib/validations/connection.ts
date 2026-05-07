import { z } from 'zod';

export const CreateConnectionSchema = z.object({
  setupToken: z.string().min(1),
  label: z.string().max(100).default('Primary'),
});
