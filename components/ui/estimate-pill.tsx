'use client';

import { useRouter } from 'next/navigation';

interface EstimatePillProps {
  className?: string;
}

export function EstimatePill({ className }: EstimatePillProps) {
  const router = useRouter();
  
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    router.push('/settings?tab=analytics');
  };

  return (
    <span 
      className={`${className || ''} goal-pill inline-flex items-center gap-1 px-2 py-0.5 rounded-full cursor-pointer hover:bg-chart-3/20 transition-colors`}
      style={{ '--goal-color': 'var(--chart-3)' } as React.CSSProperties}
      onClick={handleClick}
    >
      <span className="text-[10px] font-medium">Includes estimates</span>
    </span>
  );
}