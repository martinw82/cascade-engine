'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

const FALLBACK_KEY = 'cascade-master-default-key-2026';

interface AuthContextType {
  apiKey: string | null;
  setApiKey: (key: string | null) => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [apiKey, setApiKeyState] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('cascadeApiKey') || FALLBACK_KEY;
    }
    return FALLBACK_KEY;
  });

  // Validate the stored key on mount — if it's invalid, fall back
  useEffect(() => {
    if (!apiKey) return;
    fetch('/api/auth-keys', {
      headers: { 'X-API-Key': apiKey }
    }).then(res => {
      if (!res.ok) {
        console.warn('Stored API key is invalid, falling back to default');
        setApiKeyState(FALLBACK_KEY);
      }
    }).catch(() => {
      // Server not ready yet, skip validation
    });
  }, []);

  const setApiKey = (key: string | null) => {
    setApiKeyState(key);
    if (key) {
      localStorage.setItem('cascadeApiKey', key);
    } else {
      localStorage.removeItem('cascadeApiKey');
    }
  };

  const value = {
    apiKey,
    setApiKey,
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