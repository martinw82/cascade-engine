'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PropsWithChildren } from 'react';

export function AuthWrapper({ children }: PropsWithChildren) {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('cascadeUIAuth');
    if (stored === 'true') {
      setIsAuthenticated(true);
    } else {
      router.push('/login');
    }
  }, [router]);

  // Still checking - show loading
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-neutral-900 flex items-center justify-center">
        <div className="text-neutral-400">Loading...</div>
      </div>
    );
  }

  // Not authenticated - will redirect
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-neutral-900 flex items-center justify-center">
        <div className="text-neutral-400">Redirecting to login...</div>
      </div>
    );
  }

  return <>{children}</>;
}
