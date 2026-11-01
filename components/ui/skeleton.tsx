import { cn } from "@/lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
export {
  ChartSkeleton,
  StatCardSkeleton,
  TransactionListSkeleton,
} from '@/components/ui/skeleton-loaders';