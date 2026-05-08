import { ReactNode } from 'react';

interface ContentWrapperProps {
  children: ReactNode;
}

export default function ContentWrapper({ children }: ContentWrapperProps) {
  return (
    <div className="relative z-10 mt-20 px-0 sm:px-1 lg:px-4 max-w-[1920px]">
      {children}
    </div>
  );
}
