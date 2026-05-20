'use client';

import { useRouter } from 'next/navigation';

interface EstimatePillProps {
  className?: string;
}

export function EstimatePill({ className }: EstimatePillProps) {
  const router = useRouter();
  
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    router.push('/settings#analytics');
  };

  return (
    <span 
      className={`${className || ''} inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-chart-3/10 border border-chart-3/20 cursor-pointer hover:bg-chart-3/20 transition-colors`}
      onClick={handleClick}
    >
      <span className="text-[10px] text-chart-3 font-medium">Includes estimates</span>
    </span>
  );
}