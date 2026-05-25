'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';

const FALLBACK_KEY = 'cascade-master-default-key-2026';

interface BenchmarkResult {
  modelId: string;
  modelName: string;
  success: boolean;
  responseTime: number;
  tokensUsed?: number;
  promptTokens?: number;
  completionTokens?: number;
  responsePreview?: string;
  costEstimate?: number;
  error?: string;
}

interface BenchmarkData {
  prompt: string;
  modelCount: number;
  results: BenchmarkResult[];
  costComparison: {
    gpt4oCost: string;
    actualCost: string;
    savings: string;
    savingsPercentage: string;
  };
}

export function Benchmark() {
  const { apiKey } = useAuth();
  const [models, setModels] = useState<any[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BenchmarkData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchModels();
  }, [apiKey]);

  const fetchModels = async () => {
    try {
      const response = await fetch('/api/models', {
        headers: { 'X-API-Key': apiKey || FALLBACK_KEY }
      });
      if (response.ok) {
        const data = await response.json();
        setModels(data);
      }
    } catch {
      console.error('Failed to fetch models');
    }
  };

  const handleBenchmark = async () => {
    if (selectedModels.length === 0 || !prompt) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/models/benchmark', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey || FALLBACK_KEY
        },
        body: JSON.stringify({ modelIds: selectedModels, prompt })
      });

      if (response.ok) {
        const data = await response.json();
        setResult(data);
      } else {
        const err = await response.json();
        setError(err.error || 'Benchmark failed');
      }
    } catch {
      setError('Failed to run benchmark');
    } finally {
      setLoading(false);
    }
  };

  const toggleModel = (id: string) => {
    setSelectedModels(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  const presets = [
    'What is the capital of France?',
    'Write a simple Python function to calculate fibonacci numbers.',
    'Summarize the key benefits of using TypeScript over JavaScript.',
    'Explain quantum computing in simple terms.',
  ];

  return (
    <div className="space-y-6 animate-fadeIn">
      <div>
        <h2 className="text-2xl font-bold gradient-text">Model Benchmark</h2>
        <p className="text-neutral-400 mt-1">Compare model performance, speed, and cost side-by-side</p>
      </div>

      {/* Model Selection */}
      <div className="glass rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-4">Select Models to Compare</h3>
        {models.length === 0 ? (
          <p className="text-neutral-400">No models configured. Add models first.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {models.map((model) => (
              <label
                key={model.id}
                className={`flex items-center p-2 rounded cursor-pointer transition-colors ${
                  selectedModels.includes(model.id)
                    ? 'bg-blue-600/20 border border-blue-500/50'
                    : 'glass-light hover:bg-white/5 border border-transparent'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedModels.includes(model.id)}
                  onChange={() => toggleModel(model.id)}
                  className="mr-2 w-4 h-4 text-blue-600 bg-neutral-600 border-neutral-500 rounded"
                />
                <div className="text-sm">
                  <div className="font-medium">{model.modelId}</div>
                  <div className="text-neutral-400 text-xs">{model.provider}</div>
                </div>
              </label>
            ))}
          </div>
        )}
        <p className="text-xs text-neutral-500 mt-2">
          {selectedModels.length} model{selectedModels.length !== 1 ? 's' : ''} selected
        </p>
      </div>

      {/* Prompt Input */}
      <div className="glass rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-4">Test Prompt</h3>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="w-full h-24 px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          placeholder="Enter a prompt to test across all selected models..."
        />
        <div className="flex flex-wrap gap-2 mt-2">
          {presets.map((preset, i) => (
            <button
              key={i}
              onClick={() => setPrompt(preset)}
              className="px-2 py-1 bg-neutral-700 hover:bg-neutral-600 text-xs text-neutral-300 rounded transition-colors"
            >
              {preset.slice(0, 40)}...
            </button>
          ))}
        </div>
      </div>

      {/* Run Button */}
      <button
        onClick={handleBenchmark}
        disabled={loading || selectedModels.length === 0 || !prompt}
        className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-600 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
      >
        {loading ? 'Running Benchmark...' : `Run Benchmark (${selectedModels.length} models)`}
      </button>

      {error && (
        <div className="glass rounded-lg p-4 text-red-400 border border-red-500/30">{error}</div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Cost Comparison */}
          <div className="glass rounded-xl p-6">
            <h3 className="text-lg font-semibold mb-4">Cost Comparison</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="glass-light rounded-lg p-3">
                <p className="text-neutral-400 text-xs">GPT-4o Estimated Cost</p>
                <p className="text-xl font-bold text-red-400">${parseFloat(result.costComparison.gpt4oCost).toFixed(4)}</p>
              </div>
              <div className="glass-light rounded-lg p-3">
                <p className="text-neutral-400 text-xs">Actual Cost (Selected)</p>
                <p className="text-xl font-bold text-blue-400">${parseFloat(result.costComparison.actualCost).toFixed(4)}</p>
              </div>
              <div className="glass-light rounded-lg p-3">
                <p className="text-neutral-400 text-xs">Savings</p>
                <p className="text-xl font-bold text-green-400">${parseFloat(result.costComparison.savings).toFixed(4)}</p>
              </div>
              <div className="glass-light rounded-lg p-3">
                <p className="text-neutral-400 text-xs">Savings %</p>
                <p className="text-xl font-bold text-green-400">{result.costComparison.savingsPercentage}%</p>
              </div>
            </div>
          </div>

          {/* Results Table */}
          <div className="glass rounded-xl p-6">
            <h3 className="text-lg font-semibold mb-4">Benchmark Results</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-700">
                    <th className="text-left py-2">Model</th>
                    <th className="text-center py-2">Status</th>
                    <th className="text-center py-2">Response Time</th>
                    <th className="text-center py-2">Total Tokens</th>
                    <th className="text-center py-2">Cost</th>
                    <th className="text-left py-2">Preview</th>
                  </tr>
                </thead>
                <tbody>
                  {result.results.map((r, i) => (
                    <tr key={i} className="border-b border-neutral-700/50">
                      <td className="py-3 font-medium">{r.modelName}</td>
                      <td className="py-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          r.success ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
                        }`}>
                          {r.success ? 'OK' : 'FAIL'}
                        </span>
                      </td>
                      <td className="py-3 text-center">
                        <span className={r.responseTime < 5000 ? 'text-green-400' : r.responseTime < 15000 ? 'text-yellow-400' : 'text-red-400'}>
                          {r.responseTime}ms
                        </span>
                      </td>
                      <td className="py-3 text-center">{r.tokensUsed || '-'}</td>
                      <td className="py-3 text-center">${(r.costEstimate || 0).toFixed(6)}</td>
                      <td className="py-3 max-w-xs truncate text-neutral-400 text-xs">
                        {r.success ? r.responsePreview : (r.error || 'Failed')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}