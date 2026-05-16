'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';

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
  const { apiKey } = useAuth();

  useEffect(() => {
    const fetchProviders = async () => {
      console.log('Fetching providers...');
      try {
        const response = await fetch('/api/providers', {
          headers: {
            'X-API-Key': apiKey || 'cascade-master-default-key-2026'
          }
        });
        console.log('Providers response status:', response.status);
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
          'X-API-Key': apiKey || 'cascade-master-default-key-2026'
        },
        body: JSON.stringify({
          id,
          status: 'ready'
        }),
      });
      setProviders(prev => prev.map(p => p.id === id ? { ...p, status: 'ready' } : p));
    } catch (error) {
      console.error('Failed to reset provider:', error);
      alert('Failed to reset provider');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const response = await fetch('/api/providers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey || 'cascade-master-default-key-2026'
        },
        body: JSON.stringify({
          id: editingId || Date.now().toString(),
          name: formData.name,
          base_url: formData.baseURL,
          api_key: formData.apiKey,
          status: 'ready',
          created_at: new Date().toISOString()
        }),
      });

      if (response.ok) {
        const newProvider = await response.json();
        if (editingId) {
          setProviders(prev => prev.map(p => p.id === editingId ? newProvider : p));
        } else {
          setProviders(prev => [...prev, newProvider]);
        }
        resetForm();
      } else {
        const errorData = await response.json().catch(() => ({}));
        alert('Failed to save provider: ' + (errorData.error || response.statusText));
      }
    } catch (error) {
      console.error('Error saving provider:', error);
      alert('Error saving provider: ' + (error as Error).message);
    }
  };

  const handleEdit = (provider: Provider) => {
    setFormData({
      name: provider.name,
      baseURL: provider.baseURL,
      apiKey: provider.apiKey
    });
    setEditingId(provider.id);
    setIsAdding(true);
  };

  const handleDelete = (id: string) => {
    setProviders(prev => prev.filter(p => p.id !== id));
  };

  const handleDeleteAll = async () => {
    if (!confirm('Are you sure you want to delete ALL providers and models? This cannot be undone.')) return;
    try {
      const response = await fetch('/api/providers', {
        method: 'DELETE',
        headers: {
          'X-API-Key': apiKey || 'cascade-master-default-key-2026'
        }
      });
      if (response.ok) {
        setProviders([]);
      } else {
        const errorData = await response.json().catch(() => ({}));
        alert('Failed to delete all providers: ' + (errorData.error || response.statusText));
      }
    } catch (error) {
      alert('Failed to delete all providers: ' + (error as Error).message);
    }
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Provider Management</h2>
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
                      'X-API-Key': apiKey || 'cascade-master-default-key-2026'
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
        <div className="bg-neutral-800 rounded-lg p-6">
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
              </label>
              <input
                type="password"
                value={formData.apiKey}
                onChange={(e) => setFormData(prev => ({ ...prev, apiKey: e.target.value }))}
                className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="sk-..."
                required
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
          <div key={provider.id} className="bg-neutral-800 rounded-lg p-6">
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
                <div className="text-neutral-200 font-mono bg-neutral-900 px-2 py-1 rounded mt-1">
                  {provider.baseURL}
                </div>
              </div>
              <div>
                <span className="text-neutral-400">API Key:</span>
                <div className="text-neutral-200 font-mono bg-neutral-900 px-2 py-1 rounded mt-1">
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
          <div className="bg-neutral-800 rounded-lg p-8 text-center">
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