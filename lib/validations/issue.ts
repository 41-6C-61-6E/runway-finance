import { z } from 'zod';

export const CreateIssueSchema = z.object({
  type: z.enum(['bug', 'feature']),
  title: z.string().min(3, 'Title must be at least 3 characters').max(100, 'Title cannot exceed 100 characters'),
  description: z.string().min(5, 'Description must be at least 5 characters').max(2000, 'Description cannot exceed 2000 characters'),
});

export const UpdateIssueStatusSchema = z.object({
  status: z.string().min(1, 'Status is required').max(50, 'Status cannot exceed 50 characters'),
});
