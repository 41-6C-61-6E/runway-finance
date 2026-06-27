import { ReactNode } from 'react';

interface PageContentProps {
  children: ReactNode;
  className?: string;
  maxWidth?: string;
}

export default function PageContent({ children, className = '', maxWidth = 'max-w-[1600px]' }: PageContentProps) {
  return (
    <div className="px-4 sm:px-6 lg:px-8 pt-0 pb-8">
      <div className={`w-full mx-auto ${maxWidth} ${className}`}>
        {children}
      </div>
    </div>
  );
}
