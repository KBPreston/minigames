import { ReactNode } from 'react';
import { LandscapeOverlay } from './ui/LandscapeOverlay';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div
      className="h-full w-full bg-gray-800 text-white flex flex-col overflow-hidden"
      style={{
        paddingTop: 'var(--safe-area-inset-top)',
        paddingBottom: 'var(--safe-area-inset-bottom)',
        paddingLeft: 'var(--safe-area-inset-left)',
        paddingRight: 'var(--safe-area-inset-right)',
      }}
    >
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>
      <LandscapeOverlay />
    </div>
  );
}
