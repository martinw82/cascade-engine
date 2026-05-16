'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface AuthContextType {
  apiKey: string | null;
  setApiKey: (key: string | null) => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [apiKey, setApiKey] = useState<string | null>(() => {
    // Try to get from localStorage on initial load
    if (typeof window !== 'undefined') {
      return localStorage.getItem('cascadeApiKey') || 'cascade-master-default-key-2026';
    }
    return 'cascade-master-default-key-2026';
  });

  useEffect(() => {
    // Save to localStorage whenever it changes
    if (apiKey) {
      localStorage.setItem('cascadeApiKey', apiKey);
    } else {
      localStorage.removeItem('cascadeApiKey');
    }
  }, [apiKey]);

  const value = {
    apiKey,
    setApiKey: (key) => setApiKey(key),
    isAuthenticated: !!apiKey
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}