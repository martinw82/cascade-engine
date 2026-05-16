'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';

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
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isBulkImport, setIsBulkImport] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [testingModel, setTestingModel] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; error?: string } | null>(null);
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
  const { apiKey } = useAuth();

  const fetchData = async () => {
    console.log('Fetching models and providers...');
    try {
      const [modelsRes, providersRes] = await Promise.all([
        fetch('/api/models', {
          headers: {
            'X-API-Key': apiKey || 'cascade-master-default-key-2026'
          }
        }),
        fetch('/api/providers', {
          headers: {
            'X-API-Key': apiKey || 'cascade-master-default-key-2026'
          }
        })
      ]);

      console.log('Models response status:', modelsRes.status);
      console.log('Providers response status:', providersRes.status);

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

  useEffect(() => {
    fetchData();
  }, [apiKey]); // Re-fetch when API key changes

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

      const response = await fetch('/api/models', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey || 'cascade-master-default-key-2026'
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

  const handleDeleteAll = async () => {
    if (!confirm('Are you sure you want to delete ALL models? This cannot be undone.')) return;
    try {
      const response = await fetch('/api/models', {
        method: 'DELETE',
        headers: {
          'X-API-Key': apiKey || 'cascade-master-default-key-2026'
        }
      });
      if (response.ok) {
        setModels([]);
      } else {
        const errorData = await response.json().catch(() => ({}));
        alert('Failed to delete all models: ' + (errorData.error || response.statusText));
      }
    } catch (error) {
      alert('Failed to delete all models: ' + (error as Error).message);
    }
  };

  const handleDeleteByProvider = async (providerId: string) => {
    const providerName = getProviderName(providerId);
    if (!confirm(`Delete all models for ${providerName}?`)) return;
    try {
      const response = await fetch(`/api/models/provider/${providerId}`, {
        method: 'DELETE',
        headers: {
          'X-API-Key': apiKey || 'cascade-master-default-key-2026'
        }
      });
      if (response.ok) {
        setModels(prev => prev.filter(m => m.providerId !== providerId));
      } else {
        const errorData = await response.json().catch(() => ({}));
        alert('Failed to delete models: ' + (errorData.error || response.statusText));
      }
    } catch (error) {
      alert('Failed to delete models: ' + (error as Error).message);
    }
  };

  const testModel = async (providerId: string, modelId: string) => {
    setTestingModel(true);
    setTestResult(null);
    try {
      const response = await fetch('/api/models/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey || 'cascade-master-default-key-2026'
        },
        body: JSON.stringify({ providerId, modelId })
      });
      const result = await response.json();
      setTestResult({
        success: result.success,
        message: result.message,
        error: result.error
      });
    } catch (error) {
      setTestResult({
        success: false,
        message: 'Test failed',
        error: (error as Error).message
      });
    } finally {
      setTestingModel(false);
    }
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
        <div className="flex space-x-2">
          <button
            onClick={fetchData}
            className="px-4 py-2 bg-neutral-600 hover:bg-neutral-500 text-white rounded-lg transition-colors"
          >
            🔄 Refresh
          </button>
          <button
            onClick={handleDeleteAll}
            disabled={models.length === 0}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-neutral-600 disabled:opacity-50 text-white rounded-lg transition-colors"
          >
            🗑️ Delete All
          </button>
          {providers.length > 0 && (
            <div className="relative group">
              <button
                className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors"
              >
                🗑️ By Provider ▾
              </button>
              <div className="absolute right-0 mt-2 w-48 bg-neutral-800 border border-neutral-700 rounded-lg shadow-lg hidden group-hover:block z-50">
                {providers.map(provider => (
                  <button
                    key={provider.id}
                    onClick={() => handleDeleteByProvider(provider.id)}
                    className="block w-full text-left px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-700 first:rounded-t-lg last:rounded-b-lg"
                  >
                    {provider.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            onClick={() => setIsBulkImport(true)}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors"
          >
            📄 Bulk Import
          </button>
          <button
            onClick={() => setIsDiscovering(true)}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors"
          >
            🔍 Discover Models
          </button>
          <button
            onClick={() => setIsAdding(!isAdding)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
          >
            {isAdding ? 'Cancel' : '+ Add Model'}
          </button>
        </div>
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
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={formData.modelId}
                    onChange={(e) => setFormData(prev => ({ ...prev, modelId: e.target.value }))}
                    className="flex-1 px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., gpt-4, llama-3.1-70b"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => testModel(formData.providerId, formData.modelId)}
                    disabled={!formData.providerId || !formData.modelId || testingModel}
                    className="px-3 py-2 bg-yellow-600 hover:bg-yellow-500 disabled:bg-neutral-600 text-white rounded-md transition-colors text-sm whitespace-nowrap"
                  >
                    {testingModel ? 'Testing...' : 'Test'}
                  </button>
                </div>
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

            {testResult && (
              <div className={`p-3 rounded ${testResult.success ? 'bg-green-900/20 border border-green-700' : 'bg-red-900/20 border border-red-700'}`}>
                <div className="flex items-start space-x-2">
                  <span className="text-lg">{testResult.success ? '✅' : '❌'}</span>
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${testResult.success ? 'text-green-400' : 'text-red-400'}`}>
                      {testResult.message}
                    </p>
                    {testResult.error && (
                      <p className="text-xs text-neutral-400 mt-1 font-mono break-all">
                        {testResult.error}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

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

      {/* Bulk Import Modal */}
      {isBulkImport && (
        <BulkImportModal
          providers={providers}
          onClose={() => setIsBulkImport(false)}
          onImport={async (importedModels) => {
            try {
              const response = await fetch('/api/models/bulk', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-API-Key': apiKey || 'cascade-master-default-key-2026'
                },
                body: JSON.stringify({ models: importedModels })
              });

              if (response.ok) {
                const result = await response.json();
                alert(`Bulk import completed! ${result.success} models added, ${result.errors} errors.`);
                fetchData(); // Refresh the list
                setIsBulkImport(false);
              } else {
                const errorData = await response.json().catch(() => ({}));
                alert('Bulk import failed: ' + (errorData.error || response.statusText));
              }
            } catch (error) {
              alert('Bulk import error: ' + (error as Error).message);
            }
          }}
        />
      )}

      {/* Model Discovery Modal */}
      {isDiscovering && (
        <ModelDiscoveryModal
          providers={providers}
          onClose={() => setIsDiscovering(false)}
          onDiscover={async (providerId) => {
            try {
              const response = await fetch(`/api/models/discover/${providerId}`, {
                headers: {
                  'X-API-Key': apiKey || 'cascade-master-default-key-2026'
                }
              });

              if (response.ok) {
                const discoveredModels = await response.json();
                return discoveredModels;
              } else {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || response.statusText);
              }
            } catch (error) {
              throw error;
            }
          }}
          onImport={async (modelsToImport) => {
            try {
              const response = await fetch('/api/models/bulk', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-API-Key': apiKey || 'cascade-master-default-key-2026'
                },
                body: JSON.stringify({ models: modelsToImport })
              });

              if (response.ok) {
                const result = await response.json();
                alert(`Models imported! ${result.success} added, ${result.errors} errors.`);
                fetchData(); // Refresh the list
                setIsDiscovering(false);
              } else {
                const errorData = await response.json().catch(() => ({}));
                alert('Import failed: ' + (errorData.error || response.statusText));
              }
            } catch (error) {
              alert('Import error: ' + (error as Error).message);
            }
          }}
        />
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

// Bulk Import Modal Component
function BulkImportModal({
  providers,
  onClose,
  onImport
}: {
  providers: Provider[];
  onClose: () => void;
  onImport: (models: any[]) => Promise<void>;
}) {
  const [jsonText, setJsonText] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  const template = `[
  {
    "providerId": "${providers[0]?.id || 'openrouter'}",
    "modelId": "gpt-4o-mini",
    "contextWindow": 128000,
    "rpmLimit": 50,
    "tpmLimit": 10000,
    "dailyQuota": 1000,
    "isFree": false,
    "costPerToken": 0.00015,
    "status": "ready"
  },
  {
    "providerId": "${providers[0]?.id || 'openrouter'}",
    "modelId": "claude-3-haiku",
    "contextWindow": 200000,
    "rpmLimit": 100,
    "tpmLimit": 25000,
    "dailyQuota": 2000,
    "isFree": false,
    "costPerToken": 0.00025,
    "status": "ready"
  }
]`;

  const handleImport = async () => {
    if (!jsonText.trim()) return;

    setIsImporting(true);
    try {
      const models = JSON.parse(jsonText);
      await onImport(models);
    } catch (error) {
      alert('Invalid JSON format: ' + (error as Error).message);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-neutral-800 rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Bulk Model Import</h3>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              JSON Configuration
            </label>
            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              placeholder="Paste your JSON model configuration here..."
              className="w-full h-64 px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="bg-neutral-700 p-4 rounded">
            <h4 className="text-sm font-medium mb-2">Template Example:</h4>
            <pre className="text-xs text-neutral-300 font-mono bg-neutral-800 p-2 rounded overflow-x-auto">
              {template}
            </pre>
            <button
              onClick={() => setJsonText(template)}
              className="mt-2 text-xs text-blue-400 hover:text-blue-300"
            >
              Use Template
            </button>
          </div>

          <div className="text-sm text-neutral-400">
            <strong>Required fields:</strong> providerId, modelId<br />
            <strong>Optional fields:</strong> contextWindow, rpmLimit, tpmLimit, dailyQuota, isFree, costPerToken, status
          </div>
        </div>

        <div className="flex space-x-3 mt-6">
          <button
            onClick={handleImport}
            disabled={!jsonText.trim() || isImporting}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-neutral-600 text-white rounded-md transition-colors"
          >
            {isImporting ? 'Importing...' : 'Import Models'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-neutral-600 hover:bg-neutral-500 text-white rounded-md transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// Model Discovery Modal Component
function ModelDiscoveryModal({
  providers,
  onClose,
  onDiscover,
  onImport
}: {
  providers: Provider[];
  onClose: () => void;
  onDiscover: (providerId: string) => Promise<any[]>;
  onImport: (models: any[]) => Promise<void>;
}) {
  const [selectedProvider, setSelectedProvider] = useState('');
  const [discoveredModels, setDiscoveredModels] = useState<any[]>([]);
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [testingModelId, setTestingModelId] = useState<string | null>(null);
  const [modelTestResults, setModelTestResults] = useState<Record<string, { success: boolean; error?: string }>>({});

  const handleDiscover = async () => {
    if (!selectedProvider) return;

    setIsDiscovering(true);
    try {
      const models = await onDiscover(selectedProvider);
      setDiscoveredModels(models);
      setSelectedModels(new Set()); // Reset selections
    } catch (error) {
      alert('Discovery failed: ' + (error as Error).message);
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleImport = async () => {
    const modelsToImport = discoveredModels.filter(model => selectedModels.has(model.id));
    if (modelsToImport.length === 0) return;

    setIsImporting(true);
    try {
      await onImport(modelsToImport);
    } catch (error) {
      alert('Import failed: ' + (error as Error).message);
    } finally {
      setIsImporting(false);
    }
  };

  const toggleModelSelection = (modelId: string) => {
    const newSelected = new Set(selectedModels);
    if (newSelected.has(modelId)) {
      newSelected.delete(modelId);
    } else {
      newSelected.add(modelId);
    }
    setSelectedModels(newSelected);
  };

  const testDiscoveredModel = async (model: any) => {
    setTestingModelId(model.id);
    try {
      const response = await fetch('/api/models/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'cascade-master-default-key-2026'
        },
        body: JSON.stringify({ providerId: model.providerId, modelId: model.modelId })
      });
      const result = await response.json();
      setModelTestResults(prev => ({
        ...prev,
        [model.id]: { success: result.success, error: result.error }
      }));
    } catch (error) {
      setModelTestResults(prev => ({
        ...prev,
        [model.id]: { success: false, error: (error as Error).message }
      }));
    } finally {
      setTestingModelId(null);
    }
  };

  const testAllModels = async () => {
    for (const model of discoveredModels) {
      await testDiscoveredModel(model);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-neutral-800 rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Discover Models</h3>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              Select Provider
            </label>
            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Choose a provider...</option>
              {providers.map(provider => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleDiscover}
            disabled={!selectedProvider || isDiscovering}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-600 text-white rounded-md transition-colors"
          >
            {isDiscovering ? '🔍 Discovering...' : '🔍 Discover Models'}
          </button>

          {discoveredModels.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium">Discovered Models ({discoveredModels.length})</h4>
                <div className="space-x-2">
                  <button
                    onClick={testAllModels}
                    className="text-xs text-yellow-400 hover:text-yellow-300"
                  >
                    Test All
                  </button>
                  <button
                    onClick={() => setSelectedModels(new Set(discoveredModels.filter(m => modelTestResults[m.id]?.success).map(m => m.id)))}
                    className="text-xs text-green-400 hover:text-green-300"
                  >
                    Select Working
                  </button>
                  <button
                    onClick={() => setSelectedModels(new Set(discoveredModels.map(m => m.id)))}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    Select All
                  </button>
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto bg-neutral-700 rounded p-2">
                {discoveredModels.map(model => {
                  const testResult = modelTestResults[model.id];
                  return (
                    <div key={model.id} className="flex items-center space-x-3 py-1">
                      <input
                        type="checkbox"
                        checked={selectedModels.has(model.id)}
                        onChange={() => toggleModelSelection(model.id)}
                        className="w-4 h-4 text-blue-600 bg-neutral-600 border-neutral-500 rounded"
                      />
                      <div className="flex-1">
                        <span className="text-sm text-white">{model.modelId}</span>
                        <span className="text-xs text-neutral-400 ml-2">
                          {model.contextWindow} tokens, {model.isFree ? 'Free' : 'Paid'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => testDiscoveredModel(model)}
                        disabled={testingModelId === model.id}
                        className={`px-2 py-1 text-xs rounded transition-colors ${
                          testResult?.success
                            ? 'bg-green-700 hover:bg-green-600 text-white'
                            : testResult
                            ? 'bg-red-700 hover:bg-red-600 text-white'
                            : 'bg-yellow-600 hover:bg-yellow-500 text-white'
                        } disabled:opacity-50`}
                      >
                        {testingModelId === model.id ? '...' : testResult?.success ? '✓' : testResult ? '✗' : 'Test'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex space-x-3 mt-6">
          <button
            onClick={handleImport}
            disabled={selectedModels.size === 0 || isImporting}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-neutral-600 text-white rounded-md transition-colors"
          >
            {isImporting ? 'Importing...' : `Import ${selectedModels.size} Models`}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-neutral-600 hover:bg-neutral-500 text-white rounded-md transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}