'use client';

import { useState, useEffect } from 'react';

interface CascadeRule {
  id: string;
  name: string;
  priority: number;
  triggerType: 'task_type' | 'keyword' | 'header' | 'custom';
  triggerValue: string;
  providerOrder: string[]; // Array of provider IDs
  enabled: boolean;
  createdAt: string;
}

interface Provider {
  id: string;
  name: string;
}

export function Cascade() {
  const [rules, setRules] = useState<CascadeRule[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    priority: 1,
    triggerType: 'keyword' as CascadeRule['triggerType'],
    triggerValue: '',
    providerOrder: [] as string[],
    enabled: true
  });

  // Mock data for now (will be replaced with API calls)
  useEffect(() => {
    setProviders([
      { id: 'nvidia-nim', name: 'NVIDIA NIM' },
      { id: 'groq', name: 'Groq' },
      { id: 'openrouter', name: 'OpenRouter' }
    ]);

    setRules([
      {
        id: 'coding-rule',
        name: 'Coding Tasks',
        priority: 1,
        triggerType: 'keyword',
        triggerValue: 'code|program|function|debug|programming',
        providerOrder: ['groq', 'nvidia-nim', 'openrouter'],
        enabled: true,
        createdAt: new Date().toISOString()
      },
      {
        id: 'summarization-rule',
        name: 'Summarization Tasks',
        priority: 2,
        triggerType: 'keyword',
        triggerValue: 'summarize|extract|analyze|document|summary',
        providerOrder: ['openrouter', 'nvidia-nim', 'groq'],
        enabled: true,
        createdAt: new Date().toISOString()
      },
      {
        id: 'default-rule',
        name: 'Default Fallback',
        priority: 99,
        triggerType: 'task_type',
        triggerValue: 'general',
        providerOrder: ['nvidia-nim', 'groq', 'openrouter'],
        enabled: true,
        createdAt: new Date().toISOString()
      }
    ]);
  }, []);

  const resetForm = () => {
    setFormData({
      name: '',
      priority: 1,
      triggerType: 'keyword',
      triggerValue: '',
      providerOrder: [],
      enabled: true
    });
    setIsAdding(false);
    setEditingId(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (editingId) {
      // Update existing rule
      setRules(prev =>
        prev.map(r =>
          r.id === editingId
            ? { ...r, ...formData }
            : r
        )
      );
    } else {
      // Add new rule
      const newRule: CascadeRule = {
        id: Date.now().toString(),
        ...formData,
        createdAt: new Date().toISOString()
      };
      setRules(prev => [...prev, newRule]);
    }

    resetForm();
  };

  const handleEdit = (rule: CascadeRule) => {
    setFormData({
      name: rule.name,
      priority: rule.priority,
      triggerType: rule.triggerType,
      triggerValue: rule.triggerValue,
      providerOrder: rule.providerOrder,
      enabled: rule.enabled
    });
    setEditingId(rule.id);
    setIsAdding(true);
  };

  const handleDelete = (id: string) => {
    setRules(prev => prev.filter(r => r.id !== id));
  };

  const handleProviderOrderChange = (providerId: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      providerOrder: checked
        ? [...prev.providerOrder, providerId]
        : prev.providerOrder.filter(id => id !== providerId)
    }));
  };

  const moveProvider = (index: number, direction: 'up' | 'down') => {
    const newOrder = [...formData.providerOrder];
    if (direction === 'up' && index > 0) {
      [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    } else if (direction === 'down' && index < newOrder.length - 1) {
      [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    }
    setFormData(prev => ({ ...prev, providerOrder: newOrder }));
  };

  const getProviderName = (id: string) => {
    return providers.find(p => p.id === id)?.name || id;
  };

  const getTriggerTypeLabel = (type: string) => {
    switch (type) {
      case 'task_type': return 'Task Type';
      case 'keyword': return 'Keyword Match';
      case 'header': return 'Header Match';
      case 'custom': return 'Custom Logic';
      default: return type;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Cascade Management</h2>
          <p className="text-neutral-400 mt-1">
            Configure routing rules and provider priority for intelligent request cascading
          </p>
        </div>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
        >
          {isAdding ? 'Cancel' : '+ Add Rule'}
        </button>
      </div>

      {/* Add/Edit Form */}
      {isAdding && (
        <div className="bg-neutral-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">
            {editingId ? 'Edit Cascade Rule' : 'Add New Cascade Rule'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Rule Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Coding Tasks Rule"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Priority (Lower = Higher Priority)
                </label>
                <input
                  type="number"
                  value={formData.priority}
                  onChange={(e) => setFormData(prev => ({ ...prev, priority: Number(e.target.value) }))}
                  className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="1"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Trigger Type
                </label>
                <select
                  value={formData.triggerType}
                  onChange={(e) => setFormData(prev => ({ ...prev, triggerType: e.target.value as CascadeRule['triggerType'] }))}
                  className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="keyword">Keyword Match (Regex)</option>
                  <option value="task_type">Task Type</option>
                  <option value="header">Header Match</option>
                  <option value="custom">Custom Logic</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Trigger Value
                </label>
                <input
                  type="text"
                  value={formData.triggerValue}
                  onChange={(e) => setFormData(prev => ({ ...prev, triggerValue: e.target.value }))}
                  className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., summarize|extract|analyze"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                Provider Order (Drag to reorder)
              </label>
              <div className="space-y-2">
                {providers.map((provider) => (
                  <div key={provider.id} className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={formData.providerOrder.includes(provider.id)}
                      onChange={(e) => handleProviderOrderChange(provider.id, e.target.checked)}
                      className="w-4 h-4 text-blue-600 bg-neutral-700 border-neutral-600 rounded focus:ring-blue-500"
                    />
                    <span className="text-neutral-300">{provider.name}</span>
                  </div>
                ))}
              </div>
              {formData.providerOrder.length > 0 && (
                <div className="mt-3 p-3 bg-neutral-700 rounded">
                  <div className="text-sm text-neutral-400 mb-2">Current Order:</div>
                  <div className="flex flex-wrap gap-2">
                    {formData.providerOrder.map((providerId, index) => (
                      <div key={providerId} className="flex items-center space-x-1 bg-neutral-600 px-2 py-1 rounded text-sm">
                        <span>{index + 1}.</span>
                        <span>{getProviderName(providerId)}</span>
                        <div className="flex space-x-1 ml-2">
                          <button
                            type="button"
                            onClick={() => moveProvider(index, 'up')}
                            disabled={index === 0}
                            className="text-neutral-400 hover:text-white disabled:opacity-50"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => moveProvider(index, 'down')}
                            disabled={index === formData.providerOrder.length - 1}
                            className="text-neutral-400 hover:text-white disabled:opacity-50"
                          >
                            ↓
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center space-x-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.enabled}
                  onChange={(e) => setFormData(prev => ({ ...prev, enabled: e.target.checked }))}
                  className="mr-2 w-4 h-4 text-blue-600 bg-neutral-700 border-neutral-600 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-neutral-300">Enable Rule</span>
              </label>
            </div>

            <div className="flex space-x-3">
              <button
                type="submit"
                className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-md transition-colors"
              >
                {editingId ? 'Update Rule' : 'Add Rule'}
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

      {/* Rules List */}
      <div className="grid gap-4">
        {rules
          .sort((a, b) => a.priority - b.priority)
          .map((rule) => (
            <div key={rule.id} className="bg-neutral-800 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <h3 className="text-lg font-semibold">{rule.name}</h3>
                  <span className="text-sm text-neutral-400 bg-neutral-700 px-2 py-1 rounded">
                    Priority: {rule.priority}
                  </span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    rule.enabled
                      ? 'text-green-400 bg-green-900/20'
                      : 'text-red-400 bg-red-900/20'
                  }`}>
                    {rule.enabled ? 'ENABLED' : 'DISABLED'}
                  </span>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleEdit(rule)}
                    className="px-3 py-1 bg-neutral-700 hover:bg-neutral-600 text-sm rounded transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(rule.id)}
                    className="px-3 py-1 bg-red-600 hover:bg-red-500 text-sm rounded transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-neutral-400">Trigger:</span>
                  <div className="text-neutral-200 mt-1">
                    <span className="bg-neutral-700 px-2 py-1 rounded text-xs mr-2">
                      {getTriggerTypeLabel(rule.triggerType)}
                    </span>
                    <code className="bg-neutral-900 px-2 py-1 rounded text-xs">
                      {rule.triggerValue}
                    </code>
                  </div>
                </div>
                <div>
                  <span className="text-neutral-400">Provider Order:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {rule.providerOrder.map((providerId, index) => (
                      <span key={providerId} className="bg-neutral-700 px-2 py-1 rounded text-xs">
                        {index + 1}. {getProviderName(providerId)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4 text-xs text-neutral-500">
                Created: {new Date(rule.createdAt).toLocaleDateString()}
              </div>
            </div>
          ))}

        {rules.length === 0 && (
          <div className="bg-neutral-800 rounded-lg p-8 text-center">
            <div className="text-4xl mb-4">🔀</div>
            <h3 className="text-lg font-semibold mb-2">No Cascade Rules</h3>
            <p className="text-neutral-400 mb-4">
              Create rules to intelligently route requests to different providers based on content and context
            </p>
            <button
              onClick={() => setIsAdding(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
            >
              Create First Rule
            </button>
          </div>
        )}
      </div>
    </div>
  );
}