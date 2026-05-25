'use client';

import { useState } from 'react';

interface CostInput {
  modelName: string;
  costPerToken: number;
  monthlyRequests: number;
  avgTokensPerRequest: number;
}

interface CostResult {
  modelName: string;
  monthlyTokens: number;
  monthlyCost: number;
  yearlyCost: number;
  vsGpt4o: number;
}

const GPT4O_COST_PER_TOKEN = 0.00001;

const defaultModels: CostInput[] = [
  { modelName: 'GPT-4o', costPerToken: 0.00001, monthlyRequests: 10000, avgTokensPerRequest: 500 },
  { modelName: 'Custom Model', costPerToken: 0, monthlyRequests: 10000, avgTokensPerRequest: 500 },
];

export function CostCalculator() {
  const [models, setModels] = useState<CostInput[]>(defaultModels);
  const [results, setResults] = useState<CostResult[]>([]);

  const updateModel = (index: number, field: keyof CostInput, value: string) => {
    setModels(prev => prev.map((m, i) =>
      i === index ? { ...m, [field]: field === 'modelName' ? value : parseFloat(value) || 0 } : m
    ));
  };

  const addModel = () => {
    setModels(prev => [...prev, {
      modelName: `Model ${prev.length + 1}`,
      costPerToken: 0,
      monthlyRequests: 10000,
      avgTokensPerRequest: 500,
    }]);
  };

  const removeModel = (index: number) => {
    setModels(prev => prev.filter((_, i) => i !== index));
  };

  const calculate = () => {
    const calculated = models.map(m => {
      const monthlyTokens = m.monthlyRequests * m.avgTokensPerRequest;
      const monthlyCost = monthlyTokens * m.costPerToken;
      const gpt4oCost = monthlyTokens * GPT4O_COST_PER_TOKEN;

      return {
        modelName: m.modelName,
        monthlyTokens,
        monthlyCost,
        yearlyCost: monthlyCost * 12,
        vsGpt4o: gpt4oCost > 0 ? ((gpt4oCost - monthlyCost) / gpt4oCost) * 100 : 0,
      };
    });

    setResults(calculated);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Cost Calculator</h2>
        <p className="text-neutral-400 mt-1">Project your savings compared to GPT-4o pricing</p>
      </div>

      <div className="bg-neutral-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Model Configuration</h3>
        <div className="space-y-4">
          {models.map((model, index) => (
            <div key={index} className="bg-neutral-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <input
                  type="text"
                  value={model.modelName}
                  onChange={(e) => updateModel(index, 'modelName', e.target.value)}
                  className="px-2 py-1 bg-neutral-600 border border-neutral-500 rounded text-white font-medium text-sm"
                  placeholder="Model name"
                />
                {models.length > 1 && (
                  <button
                    onClick={() => removeModel(index)}
                    className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded"
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">Cost per Token ($)</label>
                  <input
                    type="number"
                    value={model.costPerToken}
                    onChange={(e) => updateModel(index, 'costPerToken', e.target.value)}
                    className="w-full px-2 py-1 bg-neutral-600 border border-neutral-500 rounded text-white text-sm"
                    step="0.000001"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">Monthly Requests</label>
                  <input
                    type="number"
                    value={model.monthlyRequests}
                    onChange={(e) => updateModel(index, 'monthlyRequests', e.target.value)}
                    className="w-full px-2 py-1 bg-neutral-600 border border-neutral-500 rounded text-white text-sm"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">Avg Tokens/Request</label>
                  <input
                    type="number"
                    value={model.avgTokensPerRequest}
                    onChange={(e) => updateModel(index, 'avgTokensPerRequest', e.target.value)}
                    className="w-full px-2 py-1 bg-neutral-600 border border-neutral-500 rounded text-white text-sm"
                    min="0"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex space-x-3 mt-4">
          <button
            onClick={addModel}
            className="px-4 py-2 bg-neutral-600 hover:bg-neutral-500 text-white rounded-md transition-colors text-sm"
          >
            + Add Model
          </button>
          <button
            onClick={calculate}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md transition-colors text-sm"
          >
            Calculate Savings
          </button>
        </div>
      </div>

      {results.length > 0 && (
        <div className="bg-neutral-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Cost Projection</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-700">
                  <th className="text-left py-2">Model</th>
                  <th className="text-right py-2">Monthly Tokens</th>
                  <th className="text-right py-2">Monthly Cost</th>
                  <th className="text-right py-2">Yearly Cost</th>
                  <th className="text-right py-2">vs GPT-4o</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className="border-b border-neutral-700/50">
                    <td className="py-3 font-medium">{r.modelName}</td>
                    <td className="py-3 text-right">{r.monthlyTokens.toLocaleString()}</td>
                    <td className="py-3 text-right">${r.monthlyCost.toFixed(4)}</td>
                    <td className="py-3 text-right">${r.yearlyCost.toFixed(2)}</td>
                    <td className="py-3 text-right">
                      <span className={r.vsGpt4o > 0 ? 'text-green-400' : r.vsGpt4o < 0 ? 'text-red-400' : 'text-neutral-400'}>
                        {r.vsGpt4o > 0 ? '-' : '+'}{Math.abs(r.vsGpt4o).toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}