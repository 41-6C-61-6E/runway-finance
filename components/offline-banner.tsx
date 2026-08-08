'use client';

import { useState, useEffect } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    const handleOffline = () => {
      setIsOffline(true);
      setShowReconnected(false);
    };

    const handleOnline = () => {
      setIsOffline(false);
      setShowReconnected(true);
      const timer = setTimeout(() => {
        setShowReconnected(false);
      }, 3000);
      return () => clearTimeout(timer);
    };

    if (typeof window !== 'undefined') {
      setIsOffline(!navigator.onLine);
    }

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (!isOffline && !showReconnected) return null;

  return (
    <div
      className={`w-full text-xs font-semibold py-1.5 px-4 flex items-center justify-center gap-2 transition-all duration-300 z-50 ${
        isOffline
          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-b border-amber-500/20'
          : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-b border-emerald-500/20 animate-fade-out'
      }`}
    >
      {isOffline ? (
        <>
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>You are offline — showing cached data</span>
        </>
      ) : (
        <>
          <Wifi className="w-3.5 h-3.5 shrink-0" />
          <span>Back online</span>
        </>
      )}
    </div>
  );
}
