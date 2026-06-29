'use client';

import React, { useState, useEffect, useRef, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';

interface PullToRefreshProps {
  children: ReactNode;
}

export function PullToRefresh({ children }: PullToRefreshProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [, startTransition] = useTransition();

  const [pullDistance, setPullDistance] = useState(0);
  const [status, setStatus] = useState<'idle' | 'pulling' | 'ready' | 'refreshing' | 'completed'>('idle');

  const containerRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef<number | null>(null);
  const startXRef = useRef<number | null>(null);

  // Keep references to state to prevent re-binding event listeners
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const THRESHOLD = 70;
  const MAX_PULL = 120;
  const REFRESH_HEIGHT = 65;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleTouchStart = (e: TouchEvent) => {
      // Only handle single-finger touch
      if (e.touches.length !== 1) return;

      const currentStatus = statusRef.current;
      if (currentStatus === 'refreshing' || currentStatus === 'completed') return;

      // Only allow pull-to-refresh when scrolled to the absolute top of the page
      if (window.scrollY > 0) return;

      startYRef.current = e.touches[0].clientY;
      startXRef.current = e.touches[0].clientX;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (startYRef.current === null || startXRef.current === null) return;

      const currentStatus = statusRef.current;
      if (currentStatus === 'refreshing' || currentStatus === 'completed') return;

      const currentY = e.touches[0].clientY;
      const currentX = e.touches[0].clientX;
      const diffY = currentY - startYRef.current;
      const diffX = currentX - startXRef.current;

      // If at the top, dragging down, and it's primarily a vertical gesture
      if (window.scrollY === 0 && diffY > 0 && Math.abs(diffY) > Math.abs(diffX)) {
        // Prevent default overscroll / pull-to-refresh browser behavior
        if (e.cancelable) {
          e.preventDefault();
        }

        // Apply resistance/elastic damping
        const distance = Math.min(diffY * 0.45, MAX_PULL);
        setPullDistance(distance);

        if (distance >= THRESHOLD) {
          setStatus('ready');
        } else {
          setStatus('pulling');
        }
      }
    };

    const handleTouchEnd = () => {
      startYRef.current = null;
      startXRef.current = null;

      const currentStatus = statusRef.current;
      if (currentStatus === 'ready') {
        setStatus('refreshing');
        setPullDistance(REFRESH_HEIGHT);

        startTransition(async () => {
          try {
            // Keep indicator showing for at least 800ms to guarantee visual feedback
            const minDelay = new Promise((resolve) => setTimeout(resolve, 800));
            await Promise.all([
              queryClient.refetchQueries(),
              minDelay,
            ]);
            router.refresh();
          } catch (error) {
            console.error('Pull to refresh failed:', error);
          } finally {
            setStatus('completed');
            setPullDistance(0);
            setTimeout(() => {
              setStatus('idle');
            }, 300); // Let transition out animation finish
          }
        });
      } else if (currentStatus === 'pulling') {
        setStatus('completed');
        setPullDistance(0);
        setTimeout(() => {
          setStatus('idle');
        }, 300);
      }
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [queryClient, router]);

  const showIndicator = status !== 'idle' && pullDistance > 10;

  return (
    <div ref={containerRef} className="w-full flex flex-col flex-1 relative">
      {/* Floating glassmorphic pull-to-refresh indicator */}
      <div
        className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] pointer-events-none flex items-center justify-center transition-all ${
          status === 'pulling' ? 'duration-0' : 'duration-300 ease-out'
        }`}
        style={{
          transform: `translate(-50%, ${pullDistance - 55}px) scale(${Math.min(
            pullDistance / REFRESH_HEIGHT,
            1
          )})`,
          opacity: showIndicator ? 1 : 0,
        }}
      >
        <div className="bg-background/85 backdrop-blur-md border border-border shadow-lg rounded-full px-4 py-2 flex items-center gap-2">
          {status === 'refreshing' ? (
            <>
              <Loader2 className="w-4 h-4 text-primary animate-spin" />
              <span className="text-xs font-semibold text-foreground">Refreshing...</span>
            </>
          ) : status === 'ready' ? (
            <>
              <RefreshCw className="w-4 h-4 text-primary transition-transform duration-300 rotate-180" />
              <span className="text-xs font-semibold text-foreground">Release to refresh</span>
            </>
          ) : (
            <>
              <RefreshCw
                className="w-4 h-4 text-muted-foreground"
                style={{ transform: `rotate(${pullDistance * 4}deg)` }}
              />
              <span className="text-xs font-medium text-muted-foreground">Pull to refresh</span>
            </>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
