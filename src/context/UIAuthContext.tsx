'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface UIAuthContextType {
  isAuthenticated: boolean;
  user: { username: string; role: string } | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
}

const UIAuthContext = createContext<UIAuthContextType | undefined>(undefined);

export function UIAuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('cascadeUIAuth') === 'true';
    }
    return false;
  });
  const [user, setUser] = useState<{ username: string; role: string } | null>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('cascadeUser');
      return stored ? JSON.parse(stored) : null;
    }
    return null;
  });

  useEffect(() => {
    if (isAuthenticated) {
      localStorage.setItem('cascadeUIAuth', 'true');
    } else {
      localStorage.removeItem('cascadeUIAuth');
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (user) {
      localStorage.setItem('cascadeUser', JSON.stringify(user));
    } else {
      localStorage.removeItem('cascadeUser');
    }
  }, [user]);

  const login = async (username: string, password: string) => {
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      if (response.ok) {
        const data = await response.json();
        setIsAuthenticated(true);
        setUser(data.user);
        return true;
      } else {
        return false;
      }
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  };

  const logout = () => {
    setIsAuthenticated(false);
    setUser(null);
    localStorage.removeItem('cascadeUIAuth');
    localStorage.removeItem('cascadeUser');
  };

  const value = {
    isAuthenticated,
    user,
    login,
    logout
  };

  return <UIAuthContext.Provider value={value}>{children}</UIAuthContext.Provider>;
}

export function useUIAuth() {
  const context = useContext(UIAuthContext);
  if (context === undefined) {
    throw new Error('useUIAuth must be used within a UIAuthProvider');
  }
  return context;
}