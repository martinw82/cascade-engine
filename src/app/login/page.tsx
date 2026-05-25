'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('cascadeUIAuth') : null;
    if (stored === 'true') {
      window.location.href = '/';
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('cascadeUIAuth', 'true');
        localStorage.setItem('cascadeUser', JSON.stringify(data.user));
        localStorage.setItem('cascadeApiKey', data.apiKey);
        window.location.href = '/';
      } else {
        setError('Invalid username or password');
      }
    } catch {
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-950 flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-accent-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md animate-fadeIn">
        <div className="glass rounded-2xl p-8">
          <div className="text-center mb-8">
            <div className="text-4xl mb-3">🏔️</div>
            <h1 className="text-2xl font-bold gradient-text">Cascade Master</h1>
            <p className="text-surface-400 mt-1 text-sm">Sign in to continue</p>
          </div>

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 mb-6 text-sm text-rose-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-surface-300 mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-surface-500 focus:border-accent-500/50 focus:ring-2 focus:ring-accent-500/20 transition-all"
                placeholder="Enter your username"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-300 mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-surface-500 focus:border-accent-500/50 focus:ring-2 focus:ring-accent-500/20 transition-all"
                placeholder="Enter your password"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-accent-600 hover:bg-accent-500 disabled:bg-surface-600 text-white rounded-xl font-medium text-sm transition-all duration-200 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-accent-500/25"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>

            <div className="text-center text-xs text-surface-500">
              <p>Demo: <span className="text-surface-400">admin</span> / <span className="text-surface-400">admin123</span></p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}