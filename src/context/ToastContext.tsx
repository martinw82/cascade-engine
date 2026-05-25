'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (type: Toast['type'], text: string) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((type: Toast['type'], text: string) => {
    const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    setToasts(prev => [...prev, { id, type, text }]);
    setTimeout(() => removeToast(id), 4000);
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col space-y-2 pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`pointer-events-auto animate-slideIn glass rounded-xl px-4 py-3 text-sm flex items-center space-x-3 min-w-[300px] max-w-[420px] shadow-lg ${
              toast.type === 'success'
                ? 'border border-emerald-500/30'
                : toast.type === 'error'
                ? 'border border-rose-500/30'
                : 'border border-accent-500/30'
            }`}
          >
            <span className="text-lg flex-shrink-0">
              {toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : 'ℹ'}
            </span>
            <span className={`flex-1 ${
              toast.type === 'success' ? 'text-emerald-300' : toast.type === 'error' ? 'text-rose-300' : 'text-accent-300'
            }`}>
              {toast.text}
            </span>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-surface-500 hover:text-surface-300 transition-colors flex-shrink-0"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}
