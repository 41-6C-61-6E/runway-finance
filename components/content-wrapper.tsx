import { ReactNode } from 'react';

interface ContentWrapperProps {
  children: ReactNode;
  className?: string;
}

export default function ContentWrapper({ children, className = '' }: ContentWrapperProps) {
  return (
    <div className={`relative z-10 px-0 sm:px-1 lg:px-4 pt-1 max-w-[1920px] overflow-visible ${className}`}>
      {children}
    </div>
  );
}
