'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { FileQuestion, ArrowLeft, Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] p-6 text-center select-none">
      <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-muted/60 text-muted-foreground mb-6 shadow-sm border border-border">
        <FileQuestion className="w-8 h-8 text-primary" />
      </div>
      <h1 className="text-3xl font-bold tracking-tight mb-2">Page Not Found</h1>
      <p className="text-muted-foreground text-sm max-w-md mb-8 leading-relaxed">
        The page you are looking for does not exist, has been moved, or is temporarily unavailable.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link href="/">
          <Button variant="default" className="gap-2">
            <Home className="w-4 h-4" />
            Dashboard
          </Button>
        </Link>
        <Link href="/transactions">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Transactions
          </Button>
        </Link>
      </div>
    </div>
  );
}
