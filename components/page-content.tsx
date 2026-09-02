import { ReactNode } from 'react';

interface PageContentProps {
  children: ReactNode;
  className?: string;
  maxWidth?: string;
}

export default function PageContent({ children, className = '', maxWidth = 'max-w-[1600px]' }: PageContentProps) {
  return (
    <div className="page-content px-4 sm:px-6 lg:px-8 pt-2.5 sm:pt-3 pb-[max(2rem,var(--mobile-subnav-clear,0px))] md:pb-8">
      <div className={`w-full mx-auto ${maxWidth} ${className}`}>
        {children}
      </div>
    </div>
  );
}
