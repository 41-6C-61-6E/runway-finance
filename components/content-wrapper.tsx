import { ReactNode } from 'react';

interface ContentWrapperProps {
  children: ReactNode;
}

export default function ContentWrapper({ children }: ContentWrapperProps) {
  return (
    <div className="relative z-10 mt-20 px-6 lg:px-12 max-w-7xl">
      {children}
    </div>
  );
}
