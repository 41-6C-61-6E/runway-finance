import { z } from 'zod';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const DailyCashFlowQuerySchema = z
  .object({
    startDate: z.string().regex(DATE_REGEX, 'startDate must be in YYYY-MM-DD format'),
    endDate: z.string().regex(DATE_REGEX, 'endDate must be in YYYY-MM-DD format'),
    search: z.string().max(200).trim().optional(),
  })
  .refine(
    (data) => data.startDate <= data.endDate,
    {
      message: 'startDate must be less than or equal to endDate',
      path: ['endDate'],
    }
  )
  .refine(
    (data) => {
      const start = new Date(data.startDate + 'T00:00:00Z').getTime();
      const end = new Date(data.endDate + 'T00:00:00Z').getTime();
      const diffDays = Math.round((end - start) / (1000 * 60 * 60 * 24));
      return diffDays <= 62;
    },
    {
      message: 'Date range cannot exceed 62 days',
      path: ['endDate'],
    }
  );

export type DailyCashFlowQuery = z.infer<typeof DailyCashFlowQuerySchema>;
