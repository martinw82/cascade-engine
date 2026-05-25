'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { ListSkeleton } from './Skeleton';

const FALLBACK_KEY = 'cascade-master-default-key-2026';

interface Provider {
  id: string;
  name: string;
  baseURL: string;
  apiKey: string;
  status: 'ready' | 'cooldown' | 'errored';
  created: string;
}

export function Providers() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const { apiKey, setApiKey } = useAuth();
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchProviders = async () => {
      console.log('Fetching providers...');
      try {
        const response = await fetch('/api/providers', {
          headers: {
            'X-API-Key': apiKey || FALLBACK_KEY
          }
        });
        console.log('Providers response status:', response.status);
        if (response.status === 401) {
          // Key is invalid, fall back to default
          console.warn('API key invalid, falling back to default key');
          setApiKey(FALLBACK_KEY);
          return;
        }
        if (response.ok) {
          const data = await response.json();
          console.log('Fetched providers:', data.length);
          setProviders(data);
        } else {
          console.error('Failed to fetch providers, status:', response.status);
        }
      } catch (error) {
        console.error('Failed to fetch providers:', error);
      }
    };
    fetchProviders();
  }, [apiKey]); // Re-fetch when API key changes

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    baseURL: '',
    apiKey: ''
  });

  const resetForm = () => {
    setFormData({ name: '', baseURL: '', apiKey: '' });
    setIsAdding(false);
    setEditingId(null);
  };

  const handleReset = async (id: string) => {
    try {
      await fetch(`/api/providers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey || FALLBACK_KEY
        },
        body: JSON.stringify({
          id,
          status: 'ready'
        }),
      });
      setProviders(prev => prev.map(p => p.id === id ? { ...p, status: 'ready' } : p));
    } catch (error) {
      console.error('Failed to reset provider:', error);
      addToast('error', 'Failed to reset provider');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const response = await fetch('/api/providers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey || FALLBACK_KEY
        },
        body: JSON.stringify({
          ...(editingId && { id: editingId }),
          name: formData.name,
          base_url: formData.baseURL,
          ...(formData.apiKey && { api_key: formData.apiKey }),
          status: 'ready',
          ...(editingId ? {} : { created_at: new Date().toISOString() })
        }),
      });

      if (response.ok) {
        const newProvider = await response.json();
        if (editingId) {
          setProviders(prev => prev.map(p => p.id === editingId ? newProvider : p));
          addToast('success', 'Provider updated');
        } else {
          setProviders(prev => [...prev, newProvider]);
          addToast('success', 'Provider added');
        }
        resetForm();
      } else {
        const errorData = await response.json().catch(() => ({}));
        addToast('error', 'Failed to save provider: ' + (errorData.error || response.statusText));
      }
    } catch (error) {
      console.error('Error saving provider:', error);
      addToast('error', 'Error saving provider: ' + (error as Error).message);
    }
  };

  const handleEdit = (provider: Provider) => {
    setFormData({
      name: provider.name,
      baseURL: provider.baseURL,
      apiKey: ''
    });
    setEditingId(provider.id);
    setIsAdding(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/providers/${id}`, {
        method: 'DELETE',
        headers: {
          'X-API-Key': apiKey || FALLBACK_KEY
        }
      });
      if (response.ok) {
        setProviders(prev => prev.filter(p => p.id !== id));
        addToast('success', 'Provider deleted');
      } else {
        const errorData = await response.json().catch(() => ({}));
        addToast('error', 'Failed to delete provider: ' + (errorData.error || response.statusText));
      }
    } catch (error) {
      console.error('Failed to delete provider:', error);
      addToast('error', 'Failed to delete provider: ' + (error as Error).message);
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm('Are you sure you want to delete ALL providers and models? This cannot be undone.')) return;
    try {
      const response = await fetch('/api/providers', {
        method: 'DELETE',
        headers: {
          'X-API-Key': apiKey || FALLBACK_KEY
        }
      });
      if (response.ok) {
        setProviders([]);
        addToast('success', 'All providers deleted');
      } else {
        const errorData = await response.json().catch(() => ({}));
        addToast('error', 'Failed to delete all providers: ' + (errorData.error || response.statusText));
      }
    } catch (error) {
      addToast('error', 'Failed to delete all providers: ' + (error as Error).message);
    }
  };

  const handleExport = async () => {
    try {
      const response = await fetch('/api/providers/export', {
        headers: { 'X-API-Key': apiKey || FALLBACK_KEY }
      });
      if (response.ok) {
        const data = await response.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `providers-export-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        addToast('success', `Exported ${data.data?.length || 0} providers`);
      } else {
        const err = await response.json();
        addToast('error', err.error || 'Export failed');
      }
    } catch {
      addToast('error', 'Export failed');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const response = await fetch('/api/providers/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey || FALLBACK_KEY
        },
        body: JSON.stringify(data.data ? data : { data: [data] })
      });
      if (response.ok) {
        const result = await response.json();
        addToast('success', result.message || `Imported ${result.imported} providers`);
        // Refresh the list
        const refresh = await fetch('/api/providers', {
          headers: { 'X-API-Key': apiKey || FALLBACK_KEY }
        });
        if (refresh.ok) setProviders(await refresh.json());
      } else {
        const err = await response.json();
        addToast('error', err.error || 'Import failed');
      }
    } catch {
      addToast('error', 'Invalid JSON file');
    }
    if (e.target) e.target.value = '';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready': return 'text-green-400 bg-green-900/20';
      case 'cooldown': return 'text-yellow-400 bg-yellow-900/20';
      case 'errored': return 'text-red-400 bg-red-900/20';
      default: return 'text-neutral-400 bg-neutral-900/20';
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold gradient-text">Provider Management</h2>
          <p className="text-neutral-400 mt-1">
            Configure LLM providers with their base URLs and API keys
          </p>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => {
              const fetchProviders = async () => {
                console.log('Refreshing providers...');
                try {
                  const response = await fetch('/api/providers', {
                    headers: {
                      'X-API-Key': apiKey || FALLBACK_KEY
                    }
                  });
                  console.log('Refresh response status:', response.status);
                  if (response.ok) {
                    const data = await response.json();
                    setProviders(data);
                  }
                } catch (error) {
                  console.error('Failed to refresh providers:', error);
                }
              };
              fetchProviders();
            }}
            className="px-4 py-2 bg-neutral-600 hover:bg-neutral-500 text-white rounded-lg transition-colors"
          >
            🔄 Refresh
          </button>
          <button
            onClick={handleExport}
            disabled={providers.length === 0}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-600 disabled:opacity-50 text-white rounded-lg transition-colors"
          >
            📥 Export
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors"
          >
            📤 Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />
          <button
            onClick={handleDeleteAll}
            disabled={providers.length === 0}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-neutral-600 disabled:opacity-50 text-white rounded-lg transition-colors"
          >
            🗑️ Delete All
          </button>
          <button
            onClick={() => setIsAdding(!isAdding)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
          >
            {isAdding ? 'Cancel' : '+ Add Provider'}
          </button>
        </div>
      </div>

      {/* Add/Edit Form */}
      {isAdding && (
        <div className="glass rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">
            {editingId ? 'Edit Provider' : 'Add New Provider'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Provider Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., OpenAI, Anthropic"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Base URL
                </label>
                <input
                  type="url"
                  value={formData.baseURL}
                  onChange={(e) => setFormData(prev => ({ ...prev, baseURL: e.target.value }))}
                  className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://api.example.com/v1"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                API Key
                {editingId && <span className="text-neutral-500 text-xs ml-2">(leave blank to keep existing)</span>}
              </label>
              <input
                type="password"
                value={formData.apiKey}
                onChange={(e) => setFormData(prev => ({ ...prev, apiKey: e.target.value }))}
                className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={editingId ? 'Enter new key to update, or leave blank' : 'sk-...'}
                required={!editingId}
              />
            </div>
            <div className="flex space-x-3">
              <button
                type="submit"
                className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-md transition-colors"
              >
                {editingId ? 'Update Provider' : 'Add Provider'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 bg-neutral-600 hover:bg-neutral-500 text-white rounded-md transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Providers List */}
      <div className="grid gap-4">
        {providers.map((provider) => (
          <div key={provider.id} className="glass rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <h3 className="text-lg font-semibold">{provider.name}</h3>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(provider.status)}`}>
                  {provider.status.toUpperCase()}
                </span>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => handleEdit(provider)}
                  className="px-3 py-1 bg-neutral-700 hover:bg-neutral-600 text-sm rounded transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleReset(provider.id)}
                  className="px-3 py-1 bg-green-600 hover:bg-green-500 text-sm rounded transition-colors"
                >
                  Reset
                </button>
                <button
                  onClick={() => handleDelete(provider.id)}
                  className="px-3 py-1 bg-red-600 hover:bg-red-500 text-sm rounded transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-neutral-400">Base URL:</span>
                <div className="text-neutral-200 font-mono glass rounded px-2 py-1 mt-1">
                  {provider.baseURL}
                </div>
              </div>
              <div>
                <span className="text-neutral-400">API Key:</span>
                <div className="text-neutral-200 font-mono glass rounded px-2 py-1 mt-1">
                  {provider.apiKey ? '••••••••••••••••' : 'Not set'}
                </div>
              </div>
            </div>

            <div className="mt-4 text-xs text-neutral-500">
              Created: {new Date(provider.created).toLocaleDateString()}
            </div>
          </div>
        ))}

        {providers.length === 0 && (
          <div className="glass rounded-xl p-8 text-center">
            <div className="text-4xl mb-4">🔧</div>
            <h3 className="text-lg font-semibold mb-2">No Providers Configured</h3>
            <p className="text-neutral-400 mb-4">
              Add your first LLM provider to start using Cascade Master
            </p>
            <button
              onClick={() => setIsAdding(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
            >
              Add Provider
            </button>
          </div>
        )}
      </div>
    </div>
  );
}