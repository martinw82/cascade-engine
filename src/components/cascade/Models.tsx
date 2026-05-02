'use client';

import { useState, useEffect } from 'react';

interface Model {
  id: string;
  providerId: string;
  modelId: string;
  contextWindow: number;
  rpmLimit: number;
  tpmLimit: number;
  dailyQuota: number;
  isFree: boolean;
  costPerToken?: number;
  status: 'ready' | 'cooldown' | 'errored';
  created: string;
}

interface Provider {
  id: string;
  name: string;
  baseURL: string;
  apiKey: string;
  status: 'ready' | 'cooldown' | 'errored';
  created: string;
}

export function Models() {
  const [models, setModels] = useState<Model[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [modelsRes, providersRes] = await Promise.all([
          fetch('http://localhost:3001/api/models'),
          fetch('http://localhost:3001/api/providers')
        ]);

        if (modelsRes.ok) {
          const modelsData = await modelsRes.json();
          // Map the API response to full model objects
          const fullModels = modelsData.map((m: any) => ({
            id: m.id,
            providerId: m.providerId,
            modelId: m.modelId,
            contextWindow: 128000, // Default
            rpmLimit: 30, // Default
            tpmLimit: 10000, // Default
            dailyQuota: 1000, // Default
            isFree: true, // Default
            status: 'ready' as const,
            created: new Date().toISOString()
          }));
          setModels(fullModels);
        }

        if (providersRes.ok) {
          const providersData = await providersRes.json();
          setProviders(providersData);
        }
      } catch (error) {
        console.error('Failed to load data:', error);
      }
    };
    fetchData();
  }, []);

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    providerId: '',
    modelId: '',
    contextWindow: 4096,
    rpmLimit: 60,
    tpmLimit: 10000,
    dailyQuota: 1000,
    isFree: true,
    costPerToken: 0
  });

  const resetForm = () => {
    setFormData({
      providerId: '',
      modelId: '',
      contextWindow: 4096,
      rpmLimit: 60,
      tpmLimit: 10000,
      dailyQuota: 1000,
      isFree: true,
      costPerToken: 0
    });
    setIsAdding(false);
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const modelData = {
        id: editingId || Date.now().toString(),
        providerId: formData.providerId,
        modelId: formData.modelId,
        contextWindow: formData.contextWindow,
        rpmLimit: formData.rpmLimit,
        tpmLimit: formData.tpmLimit,
        dailyQuota: formData.dailyQuota,
        isFree: formData.isFree,
        costPerToken: formData.costPerToken,
        status: 'ready',
        createdAt: new Date().toISOString()
      };

      const response = await fetch('http://localhost:3001/api/models', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(modelData),
      });

      if (response.ok) {
        const newModel = await response.json();
        // Map back to local format
        const localModel: Model = {
          id: newModel.id,
          providerId: newModel.providerId,
          modelId: newModel.modelId,
          contextWindow: newModel.contextWindow || 128000,
          rpmLimit: newModel.rpmLimit || 30,
          tpmLimit: newModel.tpmLimit || 10000,
          dailyQuota: newModel.dailyQuota || 1000,
          isFree: newModel.isFree !== undefined ? newModel.isFree : true,
          costPerToken: newModel.costPerToken,
          status: newModel.status || 'ready',
          created: newModel.createdAt || new Date().toISOString()
        };

        if (editingId) {
          setModels(prev => prev.map(m => m.id === editingId ? localModel : m));
        } else {
          setModels(prev => [...prev, localModel]);
        }
        resetForm();
      } else {
        const errorData = await response.json().catch(() => ({}));
        alert('Failed to save model: ' + (errorData.error || response.statusText));
      }
    } catch (error) {
      console.error('Error saving model:', error);
      alert('Error saving model: ' + (error as Error).message);
    }
  };

  const handleEdit = (model: Model) => {
    setFormData({
      providerId: model.providerId,
      modelId: model.modelId,
      contextWindow: model.contextWindow,
      rpmLimit: model.rpmLimit,
      tpmLimit: model.tpmLimit,
      dailyQuota: model.dailyQuota,
      isFree: model.isFree,
      costPerToken: model.costPerToken || 0
    });
    setEditingId(model.id);
    setIsAdding(true);
  };

  const handleDelete = (id: string) => {
    setModels(prev => prev.filter(m => m.id !== id));
  };

  const getProviderName = (providerId: string) => {
    return providers.find(p => p.id === providerId)?.name || 'Unknown';
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
          <h2 className="text-2xl font-bold">Model Configuration</h2>
          <p className="text-neutral-400 mt-1">
            Configure models for each provider with their limits and capabilities
          </p>
        </div>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
        >
          {isAdding ? 'Cancel' : '+ Add Model'}
        </button>
      </div>

      {/* Add/Edit Form */}
      {isAdding && (
        <div className="bg-neutral-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">
            {editingId ? 'Edit Model' : 'Add New Model'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Provider
                </label>
                <select
                  value={formData.providerId}
                  onChange={(e) => setFormData(prev => ({ ...prev, providerId: e.target.value }))}
                  className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Select Provider</option>
                  {providers.map(provider => (
                    <option key={provider.id} value={provider.id}>{provider.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Model ID
                </label>
                <input
                  type="text"
                  value={formData.modelId}
                  onChange={(e) => setFormData(prev => ({ ...prev, modelId: e.target.value }))}
                  className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., gpt-4, llama-3.1-70b"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Context Window
                </label>
                <input
                  type="number"
                  value={formData.contextWindow}
                  onChange={(e) => setFormData(prev => ({ ...prev, contextWindow: Number(e.target.value) }))}
                  className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="1"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  RPM Limit
                </label>
                <input
                  type="number"
                  value={formData.rpmLimit}
                  onChange={(e) => setFormData(prev => ({ ...prev, rpmLimit: Number(e.target.value) }))}
                  className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="1"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  TPM Limit
                </label>
                <input
                  type="number"
                  value={formData.tpmLimit}
                  onChange={(e) => setFormData(prev => ({ ...prev, tpmLimit: Number(e.target.value) }))}
                  className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="1"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Daily Quota
                </label>
                <input
                  type="number"
                  value={formData.dailyQuota}
                  onChange={(e) => setFormData(prev => ({ ...prev, dailyQuota: Number(e.target.value) }))}
                  className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="1"
                  required
                />
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.isFree}
                  onChange={(e) => setFormData(prev => ({ ...prev, isFree: e.target.checked }))}
                  className="mr-2"
                />
                <span className="text-sm text-neutral-300">Free Tier Model</span>
              </label>
              {!formData.isFree && (
                <div className="flex items-center space-x-2">
                  <label className="text-sm text-neutral-300">Cost per 1K tokens:</label>
                  <input
                    type="number"
                    value={formData.costPerToken}
                    onChange={(e) => setFormData(prev => ({ ...prev, costPerToken: Number(e.target.value) }))}
                    className="w-20 px-2 py-1 bg-neutral-700 border border-neutral-600 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    min="0"
                    step="0.01"
                  />
                </div>
              )}
            </div>

            <div className="flex space-x-3">
              <button
                type="submit"
                className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-md transition-colors"
              >
                {editingId ? 'Update Model' : 'Add Model'}
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

      {/* Models List */}
      <div className="grid gap-4">
        {models.map((model) => (
          <div key={model.id} className="bg-neutral-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <h3 className="text-lg font-semibold">{model.modelId}</h3>
                <span className="text-sm text-neutral-400 bg-neutral-700 px-2 py-1 rounded">
                  {getProviderName(model.providerId)}
                </span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(model.status)}`}>
                  {model.status.toUpperCase()}
                </span>
                {model.isFree && (
                  <span className="text-xs bg-green-900/20 text-green-400 px-2 py-1 rounded">
                    FREE
                  </span>
                )}
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => handleEdit(model)}
                  className="px-3 py-1 bg-neutral-700 hover:bg-neutral-600 text-sm rounded transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(model.id)}
                  className="px-3 py-1 bg-red-600 hover:bg-red-500 text-sm rounded transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-neutral-400">Context Window:</span>
                <div className="text-neutral-200">{model.contextWindow.toLocaleString()}</div>
              </div>
              <div>
                <span className="text-neutral-400">RPM Limit:</span>
                <div className="text-neutral-200">{model.rpmLimit}</div>
              </div>
              <div>
                <span className="text-neutral-400">TPM Limit:</span>
                <div className="text-neutral-200">{model.tpmLimit.toLocaleString()}</div>
              </div>
              <div>
                <span className="text-neutral-400">Daily Quota:</span>
                <div className="text-neutral-200">{model.dailyQuota.toLocaleString()}</div>
              </div>
            </div>

            <div className="mt-4 text-xs text-neutral-500">
              Created: {new Date(model.created).toLocaleDateString()}
            </div>
          </div>
        ))}

        {models.length === 0 && (
          <div className="bg-neutral-800 rounded-lg p-8 text-center">
            <div className="text-4xl mb-4">🤖</div>
            <h3 className="text-lg font-semibold mb-2">No Models Configured</h3>
            <p className="text-neutral-400 mb-4">
              Add models to your providers to enable intelligent routing
            </p>
            <button
              onClick={() => setIsAdding(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
            >
              Add Model
            </button>
          </div>
        )}
      </div>
    </div>
  );
}