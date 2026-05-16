'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';

interface CascadeRule {
  id: string;
  name: string;
  priority: number;
  triggerType: 'task_type' | 'keyword' | 'header' | 'custom';
  triggerValue: string;
  modelOrder: string[]; // Array of model IDs
  wordLimit: number;
  enabled: boolean;
  createdAt: string;
}

interface Model {
  id: string;
  modelId: string;
  providerId: string;
}

export function Cascade() {
  const [rules, setRules] = useState<CascadeRule[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    priority: 1,
    triggerType: 'keyword' as CascadeRule['triggerType'],
    triggerValue: '',
    modelOrder: [] as string[],
    wordLimit: 5,
    enabled: true
  });
  const { apiKey } = useAuth();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [rulesRes, modelsRes] = await Promise.all([
          fetch('/api/cascade-rules', {
            headers: {
              'X-API-Key': apiKey || 'cascade-master-default-key-2026'
            }
          }),
          fetch('/api/models', {
            headers: {
              'X-API-Key': apiKey || 'cascade-master-default-key-2026'
            }
          })
        ]);

        if (rulesRes.ok) {
          const rulesData = await rulesRes.json();
          const mappedRules = rulesData.map((r: any) => ({
            id: r.id,
            name: r.name,
            priority: r.priority,
            triggerType: r.triggerType,
            triggerValue: r.triggerValue,
            modelOrder: JSON.parse(r.modelOrder || '[]'),
            wordLimit: r.wordLimit || 5,
            enabled: Boolean(r.enabled),
            createdAt: r.createdAt || r.created_at
          }));
          setRules(mappedRules);
        }

        if (modelsRes.ok) {
          const modelsData = await modelsRes.json();
          setModels(modelsData);
        }
      } catch (error) {
        console.error('Failed to fetch cascade data:', error);
      }
    };

    fetchData();
  }, [apiKey]); // Re-fetch when API key changes

  const resetForm = () => {
    setFormData({
      name: '',
      priority: 1,
      triggerType: 'keyword',
      triggerValue: '',
      modelOrder: [],
      wordLimit: 5,
      enabled: true
    });
    setIsAdding(false);
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const ruleData = {
      name: formData.name,
      priority: formData.priority,
      triggerType: formData.triggerType,
      triggerValue: formData.triggerValue,
      modelOrder: JSON.stringify(formData.modelOrder),
      wordLimit: formData.wordLimit,
      enabled: formData.enabled
    };

    try {
      if (editingId) {
        // Update existing rule
        const response = await fetch('/api/cascade-rules', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey || 'cascade-master-default-key-2026'
          },
          body: JSON.stringify({ id: editingId, ...ruleData })
        });

        if (response.ok) {
          const updatedRule = await response.json();
          setRules(prev =>
            prev.map(r =>
              r.id === editingId
                ? {
                    ...r,
                    name: updatedRule.name,
                    priority: updatedRule.priority,
                    triggerType: updatedRule.triggerType,
                    triggerValue: updatedRule.triggerValue,
                    modelOrder: JSON.parse(updatedRule.modelOrder),
                    wordLimit: updatedRule.wordLimit,
                    enabled: Boolean(updatedRule.enabled)
                  }
                : r
            )
          );
        }
      } else {
        // Add new rule
        const response = await fetch('/api/cascade-rules', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey || 'cascade-master-default-key-2026'
          },
          body: JSON.stringify(ruleData)
        });

        if (response.ok) {
          const newRule = await response.json();
          const mappedRule: CascadeRule = {
            id: newRule.id,
            name: newRule.name,
            priority: newRule.priority,
            triggerType: newRule.triggerType,
            triggerValue: newRule.triggerValue,
            modelOrder: JSON.parse(newRule.modelOrder),
            wordLimit: newRule.wordLimit,
            enabled: Boolean(newRule.enabled),
            createdAt: newRule.createdAt || newRule.created_at
          };
          setRules(prev => [...prev, mappedRule]);
        }
      }

      resetForm();
    } catch (error) {
      console.error('Failed to save cascade rule:', error);
    }
  };

  const handleEdit = (rule: CascadeRule) => {
    setFormData({
      name: rule.name,
      priority: rule.priority,
      triggerType: rule.triggerType,
      triggerValue: rule.triggerValue,
      modelOrder: rule.modelOrder,
      wordLimit: rule.wordLimit,
      enabled: rule.enabled
    });
    setEditingId(rule.id);
    setIsAdding(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch('/api/cascade-rules', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey || 'cascade-master-default-key-2026'
        },
        body: JSON.stringify({ id })
      });

      if (response.ok) {
        setRules(prev => prev.filter(r => r.id !== id));
      } else {
        const errorData = await response.json().catch(() => ({}));
        alert('Failed to delete rule: ' + (errorData.error || response.statusText));
      }
    } catch (error) {
      console.error('Failed to delete cascade rule:', error);
      alert('Failed to delete rule');
    }
  };

  const handleModelOrderChange = (modelId: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      modelOrder: checked
        ? [...prev.modelOrder, modelId]
        : prev.modelOrder.filter(id => id !== modelId)
    }));
  };

  const moveModel = (index: number, direction: 'up' | 'down') => {
    const newOrder = [...formData.modelOrder];
    if (direction === 'up' && index > 0) {
      [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    } else if (direction === 'down' && index < newOrder.length - 1) {
      [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    }
    setFormData(prev => ({ ...prev, modelOrder: newOrder }));
  };

  const getModelName = (id: string) => {
    const model = models.find(m => m.id === id);
    return model ? `${model.modelId} (${model.providerId})` : id;
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
                <p className="text-xs text-neutral-500 mt-1">
                  Lower numbers = higher priority. General fallback should have highest number (lowest priority).
                </p>
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
              {formData.triggerType === 'keyword' && (
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    Word Limit
                  </label>
                  <input
                    type="number"
                    value={formData.wordLimit}
                    onChange={(e) => setFormData(prev => ({ ...prev, wordLimit: Number(e.target.value) }))}
                    className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="1"
                    max="20"
                    required
                  />
                  <p className="text-xs text-neutral-500 mt-1">
                    Number of words from the start of the message to check for keywords (default: 5)
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                Model Order (Drag to reorder)
              </label>
              <div className="space-y-2">
                {models.map((model) => (
                  <div key={model.id} className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={formData.modelOrder.includes(model.id)}
                      onChange={(e) => handleModelOrderChange(model.id, e.target.checked)}
                      className="w-4 h-4 text-blue-600 bg-neutral-700 border-neutral-600 rounded focus:ring-blue-500"
                    />
                    <span className="text-neutral-300">{model.modelId} ({model.providerId})</span>
                  </div>
                ))}
              </div>
              {formData.modelOrder.length > 0 && (
                <div className="mt-3 p-3 bg-neutral-700 rounded">
                  <div className="text-sm text-neutral-400 mb-2">Current Order:</div>
                  <div className="flex flex-wrap gap-2">
                    {formData.modelOrder.map((modelId, index) => (
                      <div key={modelId} className="flex items-center space-x-1 bg-neutral-600 px-2 py-1 rounded text-sm">
                        <span>{index + 1}.</span>
                        <span>{getModelName(modelId)}</span>
                        <div className="flex space-x-1 ml-2">
                          <button
                            type="button"
                            onClick={() => moveModel(index, 'up')}
                            disabled={index === 0}
                            className="text-neutral-400 hover:text-white disabled:opacity-50"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => moveModel(index, 'down')}
                            disabled={index === formData.modelOrder.length - 1}
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
                    {rule.triggerType === 'keyword' && (
                      <span className="text-neutral-500 text-xs ml-2">
                        (first {rule.wordLimit} words)
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-neutral-400">Model Order:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {rule.modelOrder.map((modelId, index) => (
                      <span key={modelId} className="bg-neutral-700 px-2 py-1 rounded text-xs">
                        {index + 1}. {getModelName(modelId)}
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