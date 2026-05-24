'use client';

import { WifiOff, RotateCw } from 'lucide-react';
import React, { useState } from 'react';

export default function OfflinePage() {
  const [isReloading, setIsReloading] = useState(false);

  const handleRetry = () => {
    setIsReloading(true);
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 bg-background text-foreground">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Offline Icon Container */}
        <div className="mx-auto w-20 h-20 rounded-2xl bg-destructive/10 flex items-center justify-center border border-destructive/20 animate-pulse">
          <WifiOff className="w-10 h-10 text-destructive" />
        </div>

        {/* Text Details */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">You're Offline</h1>
          <p className="text-muted-foreground text-sm leading-relaxed max-w-xs mx-auto">
            It looks like you're not connected to the internet. Please check your network connection and try again.
          </p>
        </div>

        {/* Action Button */}
        <div className="pt-2">
          <button
            onClick={handleRetry}
            disabled={isReloading}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 active:scale-98 transition-all disabled:opacity-50 cursor-pointer shadow-md shadow-primary/10"
          >
            <RotateCw className={`w-4 h-4 ${isReloading ? 'animate-spin' : ''}`} />
            {isReloading ? 'Reconnecting...' : 'Try Again'}
          </button>
        </div>
      </div>
    </div>
  );
}
