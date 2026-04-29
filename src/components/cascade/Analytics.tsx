'use client';

import { useState, useEffect } from 'react';

interface ProviderStats {
  provider: string;
  requests: number;
  successRate: number;
  averageLatency: number;
  costSavings: number;
}

interface HourlyData {
  hour: string;
  nvidia: number;
  groq: number;
  openrouter: number;
}

export function Analytics() {
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('24h');
  const [providerStats] = useState<ProviderStats[]>([
    { provider: 'NVIDIA NIM', requests: 1450, successRate: 94.2, averageLatency: 1200, costSavings: 45.67 },
    { provider: 'Groq', requests: 890, successRate: 96.8, averageLatency: 800, costSavings: 28.34 },
    { provider: 'OpenRouter', requests: 2340, successRate: 87.5, averageLatency: 1500, costSavings: 67.89 }
  ]);

  const [hourlyData] = useState<HourlyData[]>([
    { hour: '00:00', nvidia: 45, groq: 32, openrouter: 67 },
    { hour: '04:00', nvidia: 28, groq: 45, openrouter: 34 },
    { hour: '08:00', nvidia: 89, groq: 67, openrouter: 123 },
    { hour: '12:00', nvidia: 156, groq: 98, openrouter: 234 },
    { hour: '16:00', nvidia: 134, groq: 87, openrouter: 198 },
    { hour: '20:00', nvidia: 78, groq: 54, openrouter: 145 }
  ]);

  const totalRequests = providerStats.reduce((sum, p) => sum + p.requests, 0);
  const totalSavings = providerStats.reduce((sum, p) => sum + p.costSavings, 0);
  const averageSuccessRate = providerStats.reduce((sum, p) => sum + (p.successRate * p.requests), 0) / totalRequests;

  const getSuccessRateColor = (rate: number) => {
    if (rate >= 95) return 'bg-green-500';
    if (rate >= 90) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getHeatmapColor = (value: number, max: number) => {
    const intensity = value / max;
    if (intensity > 0.8) return 'bg-red-500';
    if (intensity > 0.6) return 'bg-orange-500';
    if (intensity > 0.4) return 'bg-yellow-500';
    if (intensity > 0.2) return 'bg-blue-500';
    return 'bg-blue-300';
  };

  const maxHourlyValue = Math.max(...hourlyData.flatMap(d => [d.nvidia, d.groq, d.openrouter]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Analytics Dashboard</h2>
          <p className="text-neutral-400 mt-1">
            Monitor provider performance and cost savings
          </p>
        </div>
        <div className="flex space-x-2">
          {(['24h', '7d', '30d'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1 text-sm rounded ${
                timeRange === range
                  ? 'bg-blue-600 text-white'
                  : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-300'
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <div className="bg-neutral-800 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-neutral-400 text-sm">Total Requests</p>
              <p className="text-2xl font-bold text-white">{totalRequests.toLocaleString()}</p>
            </div>
            <div className="text-2xl">📈</div>
          </div>
          <p className="text-neutral-500 text-xs mt-2">Last {timeRange}</p>
        </div>

        <div className="bg-neutral-800 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-neutral-400 text-sm">Avg Success Rate</p>
              <p className="text-2xl font-bold text-green-400">{averageSuccessRate.toFixed(1)}%</p>
            </div>
            <div className="text-2xl">✅</div>
          </div>
          <p className="text-neutral-500 text-xs mt-2">Across all providers</p>
        </div>

        <div className="bg-neutral-800 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-neutral-400 text-sm">Total Savings</p>
              <p className="text-2xl font-bold text-green-400">${totalSavings.toFixed(2)}</p>
            </div>
            <div className="text-2xl">💰</div>
          </div>
          <p className="text-neutral-500 text-xs mt-2">vs GPT-4o pricing</p>
        </div>

        <div className="bg-neutral-800 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-neutral-400 text-sm">Active Providers</p>
              <p className="text-2xl font-bold text-blue-400">{providerStats.length}</p>
            </div>
            <div className="text-2xl">🔧</div>
          </div>
          <p className="text-neutral-500 text-xs mt-2">Healthy & online</p>
        </div>
      </div>

      {/* Provider Performance Table */}
      <div className="bg-neutral-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Provider Performance</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-700">
                <th className="text-left py-2">Provider</th>
                <th className="text-center py-2">Requests</th>
                <th className="text-center py-2">Success Rate</th>
                <th className="text-center py-2">Avg Latency</th>
                <th className="text-center py-2">Cost Savings</th>
              </tr>
            </thead>
            <tbody>
              {providerStats.map((provider, index) => (
                <tr key={index} className="border-b border-neutral-700/50">
                  <td className="py-3">
                    <div className="flex items-center space-x-2">
                      <span className="font-medium">{provider.provider}</span>
                    </div>
                  </td>
                  <td className="text-center py-3">{provider.requests.toLocaleString()}</td>
                  <td className="text-center py-3">
                    <div className="flex items-center justify-center space-x-2">
                      <div className={`w-3 h-3 rounded-full ${getSuccessRateColor(provider.successRate)}`}></div>
                      <span>{provider.successRate}%</span>
                    </div>
                  </td>
                  <td className="text-center py-3">{provider.averageLatency}ms</td>
                  <td className="text-center py-3 text-green-400">${provider.costSavings.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Hourly Activity Heatmap */}
      <div className="bg-neutral-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Hourly Activity Heatmap</h3>
        <div className="overflow-x-auto">
          <div className="min-w-full">
            <div className="grid grid-cols-7 gap-1 mb-2">
              <div className="text-center text-xs text-neutral-400 py-2">Hour</div>
              <div className="text-center text-xs text-neutral-400 py-2">NVIDIA</div>
              <div className="text-center text-xs text-neutral-400 py-2">Groq</div>
              <div className="text-center text-xs text-neutral-400 py-2">OpenRouter</div>
              <div className="col-span-3"></div>
            </div>
            {hourlyData.map((data, index) => (
              <div key={index} className="grid grid-cols-7 gap-1 mb-1">
                <div className="text-center text-xs text-neutral-300 py-1 bg-neutral-700 rounded px-2">
                  {data.hour}
                </div>
                <div className={`text-center text-xs text-white py-1 rounded px-2 ${getHeatmapColor(data.nvidia, maxHourlyValue)}`}>
                  {data.nvidia}
                </div>
                <div className={`text-center text-xs text-white py-1 rounded px-2 ${getHeatmapColor(data.groq, maxHourlyValue)}`}>
                  {data.groq}
                </div>
                <div className={`text-center text-xs text-white py-1 rounded px-2 ${getHeatmapColor(data.openrouter, maxHourlyValue)}`}>
                  {data.openrouter}
                </div>
                <div className="col-span-3"></div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-4 flex items-center justify-center space-x-4 text-xs text-neutral-400">
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 bg-blue-300 rounded"></div>
            <span>Low</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 bg-blue-500 rounded"></div>
            <span>Medium</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 bg-yellow-500 rounded"></div>
            <span>High</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 bg-orange-500 rounded"></div>
            <span>Very High</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 bg-red-500 rounded"></div>
            <span>Peak</span>
          </div>
        </div>
      </div>

      {/* Cost Savings Breakdown */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="bg-neutral-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Cost Savings Breakdown</h3>
          <div className="space-y-3">
            {providerStats.map((provider, index) => (
              <div key={index} className="flex items-center justify-between">
                <span className="text-sm text-neutral-300">{provider.provider}</span>
                <div className="flex items-center space-x-2">
                  <div className="w-24 bg-neutral-700 rounded-full h-2">
                    <div
                      className="bg-green-500 h-2 rounded-full"
                      style={{ width: `${(provider.costSavings / totalSavings) * 100}%` }}
                    ></div>
                  </div>
                  <span className="text-sm text-green-400 font-medium">
                    ${provider.costSavings.toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-neutral-700">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-neutral-300">Total Savings</span>
              <span className="text-lg font-bold text-green-400">${totalSavings.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="bg-neutral-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Performance Insights</h3>
          <div className="space-y-4">
            <div className="p-3 bg-neutral-700 rounded">
              <div className="text-sm font-medium text-green-400 mb-1">Best Performer</div>
              <div className="text-sm text-neutral-300">
                {providerStats.reduce((best, current) =>
                  current.successRate > best.successRate ? current : best
                ).provider} with {Math.max(...providerStats.map(p => p.successRate))}% success rate
              </div>
            </div>
            <div className="p-3 bg-neutral-700 rounded">
              <div className="text-sm font-medium text-blue-400 mb-1">Highest Volume</div>
              <div className="text-sm text-neutral-300">
                {providerStats.reduce((best, current) =>
                  current.requests > best.requests ? current : best
                ).provider} handled {Math.max(...providerStats.map(p => p.requests)).toLocaleString()} requests
              </div>
            </div>
            <div className="p-3 bg-neutral-700 rounded">
              <div className="text-sm font-medium text-yellow-400 mb-1">Fastest Response</div>
              <div className="text-sm text-neutral-300">
                {providerStats.reduce((best, current) =>
                  current.averageLatency < best.averageLatency ? current : best
                ).provider} at {Math.min(...providerStats.map(p => p.averageLatency))}ms average
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}