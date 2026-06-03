import { ReactNode } from 'react';

interface PageContentProps {
  children: ReactNode;
  className?: string;
  maxWidth?: string;
}

export default function PageContent({ children, className = '', maxWidth = 'max-w-[1600px]' }: PageContentProps) {
  return (
    <div className={`px-2 sm:px-6 lg:px-8 pb-8 ${className}`}>
      <div className={`w-full mx-auto ${maxWidth}`}>
        {children}
      </div>
    </div>
  );
}
