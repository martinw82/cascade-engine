'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';

interface ProviderStats {
  provider: string;
  providerId: string;
  requests: number;
  successRate: string;
  averageLatency: number;
  costSavings: string;
  totalTokens: number;
}

interface HourlyData {
  hour: string;
  requests: number;
  successes: number;
  errors: number;
}

interface LogEntry {
  id: string;
  timestamp: string;
  provider: string;
  model: string;
  taskType: string;
  status: string;
  responseTime: number;
  tokensUsed: number;
  errorMessage: string;
}

interface AnalyticsData {
  providerStats: ProviderStats[];
  hourlyData: HourlyData[];
  recentLogs: LogEntry[];
  totalRequests: number;
  totalSuccesses: number;
  totalErrors: number;
  totalCostSaved: string;
  systemHealth: {
    uptime: number;
    memoryUsage: { rss: number; heapTotal: number; heapUsed: number };
    cpuUsage: { user: number; system: number };
    timestamp: string;
    nodeVersion: string;
    platform: string;
  };
  fallbackAnalytics?: {
    overallFallbackRate: number;
    avgAttemptsPerRequest: number;
    totalCascadeRequests: number;
    ruleUsage: Array<{
      ruleId: string;
      ruleName: string;
      totalRequests: number;
      successfulRequests: number;
      successRate: string;
      avgAttempts: string;
    }>;
    recentChains: Array<{
      parentRequestId: string;
      ruleId: string;
      ruleName: string;
      totalAttempts: number;
      successful: boolean;
      attempts: Array<{
        order: number;
        providerId: string;
        modelId: string;
        status: string;
        errorMessage?: string;
      }>;
    }>;
  };
}

export function Analytics() {
  const { apiKey } = useAuth();
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('24h');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<'overview' | 'logs' | 'monitoring'>('overview');
  const [clearingLogs, setClearingLogs] = useState(false);

  useEffect(() => {
    const fetchAnalytics = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/analytics', {
          headers: {
            'X-API-Key': apiKey || 'cascade-master-default-key-2026'
          }
        });
        if (response.ok) {
          const result = await response.json();
          setData(result);
        }
      } catch (error) {
        console.error('Failed to fetch analytics:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 30000);
    return () => clearInterval(interval);
  }, [apiKey]);

  const clearLogs = async () => {
    if (!confirm('Are you sure you want to delete ALL request logs? This cannot be undone.')) return;
    setClearingLogs(true);
    try {
      const response = await fetch('/api/logs', {
        method: 'DELETE',
        headers: {
          'X-API-Key': apiKey || 'cascade-master-default-key-2026'
        }
      });
      if (response.ok) {
        setData(prev => prev ? { ...prev, recentLogs: [], totalRequests: 0, totalSuccesses: 0, totalErrors: 0 } : null);
      } else {
        const errorData = await response.json().catch(() => ({}));
        alert('Failed to clear logs: ' + (errorData.error || response.statusText));
      }
    } catch (error) {
      console.error('Failed to clear logs:', error);
      alert('Failed to clear logs');
    } finally {
      setClearingLogs(false);
    }
  };

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-neutral-400">Loading analytics...</div>
      </div>
    );
  }

  if (data.totalRequests === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Analytics Dashboard</h2>
            <p className="text-neutral-400 mt-1">Monitor provider performance and cost savings</p>
          </div>
        </div>
        <div className="bg-neutral-800 rounded-lg p-12 text-center">
          <div className="text-6xl mb-4">📊</div>
          <h3 className="text-xl font-semibold mb-2">No Request Data Yet</h3>
          <p className="text-neutral-400 mb-4">
            Run some test requests or send API calls to see analytics here.
          </p>
          <p className="text-neutral-500 text-sm">
            Use the Test tab to send requests and verify provider connectivity.
          </p>
        </div>
      </div>
    );
  }

  const totalRequests = data.totalRequests;
  const totalSavings = parseFloat(data.totalCostSaved);
  const averageSuccessRate = data.totalRequests > 0
    ? ((data.totalSuccesses / data.totalRequests) * 100).toFixed(1)
    : 0;

  const getSuccessRateColor = (rate: number) => {
    if (rate >= 95) return 'bg-green-500';
    if (rate >= 90) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getHeatmapColor = (value: number, max: number) => {
    const intensity = max > 0 ? value / max : 0;
    if (intensity > 0.8) return 'bg-red-500';
    if (intensity > 0.6) return 'bg-orange-500';
    if (intensity > 0.4) return 'bg-yellow-500';
    if (intensity > 0.2) return 'bg-blue-500';
    return 'bg-blue-300';
  };

  const maxHourlyValue = Math.max(...data.hourlyData.map(d => d.requests), 1);

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
          <button
            onClick={clearLogs}
            disabled={clearingLogs || !data || data.totalRequests === 0}
            className="px-3 py-1 text-sm rounded bg-red-600 hover:bg-red-500 disabled:bg-neutral-600 disabled:opacity-50 text-white"
          >
            {clearingLogs ? 'Clearing...' : 'Clear Logs'}
          </button>
          <button
            onClick={() => setActiveView('overview')}
            className={`px-3 py-1 text-sm rounded ${
              activeView === 'overview'
                ? 'bg-blue-600 text-white'
                : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-300'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveView('logs')}
            className={`px-3 py-1 text-sm rounded ${
              activeView === 'logs'
                ? 'bg-blue-600 text-white'
                : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-300'
            }`}
          >
            Request Logs ({data?.recentLogs.length || 0})
          </button>
          <button
            onClick={() => setActiveView('monitoring')}
            className={`px-3 py-1 text-sm rounded ${
              activeView === 'monitoring'
                ? 'bg-blue-600 text-white'
                : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-300'
            }`}
          >
            System Health
          </button>
        </div>
      </div>

      {activeView === 'overview' ? (
        <>
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
              <p className="text-neutral-500 text-xs mt-2">{data.totalSuccesses} succeeded, {data.totalErrors} failed</p>
            </div>

            <div className="bg-neutral-800 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-neutral-400 text-sm">Avg Success Rate</p>
                  <p className="text-2xl font-bold text-green-400">{averageSuccessRate}%</p>
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
              <p className="text-neutral-500 text-xs mt-2">vs paid API pricing</p>
            </div>

            <div className="bg-neutral-800 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-neutral-400 text-sm">Active Providers</p>
                  <p className="text-2xl font-bold text-blue-400">{data.providerStats.length}</p>
                </div>
                <div className="text-2xl">🔧</div>
              </div>
              <p className="text-neutral-500 text-xs mt-2">With request history</p>
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
                    <th className="text-center py-2">Tokens</th>
                    <th className="text-center py-2">Cost Savings</th>
                  </tr>
                </thead>
                <tbody>
                  {data.providerStats.map((provider, index) => (
                    <tr key={index} className="border-b border-neutral-700/50">
                      <td className="py-3">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium">{provider.provider}</span>
                        </div>
                      </td>
                      <td className="text-center py-3">{provider.requests.toLocaleString()}</td>
                      <td className="text-center py-3">
                        <div className="flex items-center justify-center space-x-2">
                          <div className={`w-3 h-3 rounded-full ${getSuccessRateColor(parseFloat(provider.successRate))}`}></div>
                          <span>{provider.successRate}%</span>
                        </div>
                      </td>
                      <td className="text-center py-3">{provider.averageLatency}ms</td>
                      <td className="text-center py-3">{provider.totalTokens.toLocaleString()}</td>
                      <td className="text-center py-3 text-green-400">${provider.costSavings}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Hourly Activity */}
          <div className="bg-neutral-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Hourly Activity (Last 24h)</h3>
            <div className="overflow-x-auto">
              <div className="min-w-full">
                <div className="grid grid-cols-4 gap-1 mb-2">
                  <div className="text-center text-xs text-neutral-400 py-2">Hour</div>
                  <div className="text-center text-xs text-neutral-400 py-2">Requests</div>
                  <div className="text-center text-xs text-neutral-400 py-2">Success</div>
                  <div className="text-center text-xs text-neutral-400 py-2">Errors</div>
                </div>
                {data.hourlyData.filter(d => d.requests > 0).map((data, index) => (
                  <div key={index} className="grid grid-cols-4 gap-1 mb-1">
                    <div className="text-center text-xs text-neutral-300 py-1 bg-neutral-700 rounded px-2">
                      {data.hour}
                    </div>
                    <div className={`text-center text-xs text-white py-1 rounded px-2 ${getHeatmapColor(data.requests, maxHourlyValue)}`}>
                      {data.requests}
                    </div>
                    <div className="text-center text-xs text-green-400 py-1 rounded px-2 bg-neutral-700/50">
                      {data.successes}
                    </div>
                    <div className="text-center text-xs text-red-400 py-1 rounded px-2 bg-neutral-700/50">
                      {data.errors}
                    </div>
                  </div>
                ))}
                {data.hourlyData.filter(d => d.requests > 0).length === 0 && (
                  <div className="text-center text-neutral-500 py-4">No activity in the last 24 hours</div>
                )}
              </div>
            </div>
          </div>

          {/* Cost Savings Breakdown */}
          <div className="grid gap-6 md:grid-cols-2">
            <div className="bg-neutral-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4">Cost Savings Breakdown</h3>
              <div className="space-y-3">
                {data.providerStats.map((provider, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <span className="text-sm text-neutral-300">{provider.provider}</span>
                    <div className="flex items-center space-x-2">
                      <div className="w-24 bg-neutral-700 rounded-full h-2">
                        <div
                          className="bg-green-500 h-2 rounded-full"
                          style={{ width: `${totalSavings > 0 ? (parseFloat(provider.costSavings) / totalSavings) * 100 : 0}%` }}
                        ></div>
                      </div>
                      <span className="text-sm text-green-400 font-medium">
                        ${provider.costSavings}
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
                {data.providerStats.length > 0 && (
                  <>
                    <div className="p-3 bg-neutral-700 rounded">
                      <div className="text-sm font-medium text-green-400 mb-1">Best Performer</div>
                      <div className="text-sm text-neutral-300">
                        {data.providerStats.reduce((best, current) =>
                          parseFloat(current.successRate) > parseFloat(best.successRate) ? current : best
                        ).provider} with {Math.max(...data.providerStats.map(p => parseFloat(p.successRate)))}% success rate
                      </div>
                    </div>
                    <div className="p-3 bg-neutral-700 rounded">
                      <div className="text-sm font-medium text-blue-400 mb-1">Highest Volume</div>
                      <div className="text-sm text-neutral-300">
                        {data.providerStats.reduce((best, current) =>
                          current.requests > best.requests ? current : best
                        ).provider} handled {Math.max(...data.providerStats.map(p => p.requests)).toLocaleString()} requests
                      </div>
                    </div>
                    <div className="p-3 bg-neutral-700 rounded">
                      <div className="text-sm font-medium text-yellow-400 mb-1">Fastest Response</div>
                      <div className="text-sm text-neutral-300">
                        {data.providerStats.reduce((best, current) =>
                          current.averageLatency < best.averageLatency ? current : best
                        ).provider} at {Math.min(...data.providerStats.map(p => p.averageLatency))}ms average
                      </div>
                    </div>
          {/* Fallback Analytics */}
          <div className="bg-neutral-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Fallback Analytics</h3>
            {!data.fallbackAnalytics || data.fallbackAnalytics.totalCascadeRequests === 0 ? (
              <p className="text-neutral-400">No cascade data available yet.</p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-neutral-700 rounded p-4">
                    <p className="text-neutral-400 text-sm">Cascade Requests</p>
                    <p className="text-2xl font-bold text-white">{data.fallbackAnalytics.totalCascadeRequests}</p>
                  </div>
                  <div className="bg-neutral-700 rounded p-4">
                    <p className="text-neutral-400 text-sm">Fallback Rate</p>
                    <p className={`text-2xl font-bold ${data.fallbackAnalytics.overallFallbackRate > 30 ? 'text-yellow-400' : 'text-green-400'}`}>
                      {data.fallbackAnalytics.overallFallbackRate.toFixed(1)}%
                    </p>
                  </div>
                  <div className="bg-neutral-700 rounded p-4">
                    <p className="text-neutral-400 text-sm">Avg Attempts</p>
                    <p className="text-2xl font-bold text-blue-400">{data.fallbackAnalytics.avgAttemptsPerRequest.toFixed(2)}</p>
                  </div>
                  <div className="bg-neutral-700 rounded p-4">
                    <p className="text-neutral-400 text-sm">Rules Used</p>
                    <p className="text-2xl font-bold text-purple-400">{data.fallbackAnalytics.ruleUsage.length}</p>
                  </div>
                </div>

                <div className="bg-neutral-700 rounded-lg p-4">
                  <h4 className="font-semibold mb-2">Recent Fallback Chains</h4>
                  <div className="space-y-2">
                    {data.fallbackAnalytics.recentChains.slice(0, 5).map((chain, idx) => (
                      <div key={idx} className="bg-neutral-600 rounded p-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span>{chain.ruleName}</span>
                          <span className={chain.successful ? "text-green-400" : "text-red-400"}>
                            {chain.successful ? 'Success' : 'Failed'} ({chain.totalAttempts} attempt{chain.totalAttempts !== 1 ? 's' : ''})
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {chain.attempts.map((att, i) => (
                            <span key={i} className={`px-2 py-0.5 rounded text-xs ${att.status === 'success' ? 'bg-green-900/40 text-green-300' : 'bg-red-900/40 text-red-300'}`}>
                              {att.order}. {att.modelId}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
                )}
              </div>
            </div>
          </div>
        </>
      ) : activeView === 'monitoring' ? (
        /* System Health Monitoring */
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <div className="bg-neutral-800 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-neutral-400 text-sm">Uptime</p>
                  <p className="text-2xl font-bold text-white">
                    {Math.floor(data.systemHealth.uptime / 86400)}d {Math.floor((data.systemHealth.uptime % 86400) / 3600)}h {Math.floor((data.systemHealth.uptime % 3600) / 60)}m
                  </p>
                </div>
                <div className="text-2xl">⏱️</div>
              </div>
              <p className="text-neutral-500 text-xs mt-2">Server running time</p>
            </div>
            <div className="bg-neutral-800 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-neutral-400 text-sm">Memory Usage</p>
                  <p className="text-2xl font-bold text-blue-400">
                    {Math.round(data.systemHealth.memoryUsage.heapUsed / 1024 / 1024)}MB / {Math.round(data.systemHealth.memoryUsage.heapTotal / 1024 / 1024)}MB
                  </p>
                </div>
                <div className="text-2xl">💾</div>
              </div>
              <p className="text-neutral-500 text-xs mt-2">Heap used / Heap total</p>
            </div>
            <div className="bg-neutral-800 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-neutral-400 text-sm">RSS Memory</p>
                  <p className="text-2xl font-bold text-purple-400">
                    {Math.round(data.systemHealth.memoryUsage.rss / 1024 / 1024)}MB
                  </p>
                </div>
                <div className="text-2xl">📊</div>
              </div>
              <p className="text-neutral-500 text-xs mt-2">Resident Set Size</p>
            </div>
            <div className="bg-neutral-800 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-neutral-400 text-sm">Platform</p>
                  <p className="text-2xl font-bold text-green-400">{data.systemHealth.platform}</p>
                </div>
                <div className="text-2xl">⚡</div>
              </div>
              <p className="text-neutral-500 text-xs mt-2">Node {data.systemHealth.nodeVersion}</p>
            </div>
          </div>

          {/* Request Rate */}
          <div className="bg-neutral-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Request Rate</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-neutral-700 rounded p-4">
                <p className="text-neutral-400 text-sm">Total</p>
                <p className="text-2xl font-bold text-white">{data.totalRequests}</p>
              </div>
              <div className="bg-neutral-700 rounded p-4">
                <p className="text-neutral-400 text-sm">Success Rate</p>
                <p className="text-2xl font-bold text-green-400">{averageSuccessRate}%</p>
              </div>
              <div className="bg-neutral-700 rounded p-4">
                <p className="text-neutral-400 text-sm">Errors</p>
                <p className="text-2xl font-bold text-red-400">{data.totalErrors}</p>
              </div>
              <div className="bg-neutral-700 rounded p-4">
                <p className="text-neutral-400 text-sm">Cost Saved</p>
                <p className="text-2xl font-bold text-green-400">${totalSavings.toFixed(2)}</p>
              </div>
            </div>
          </div>

          {/* Hourly Activity Heatmap */}
          <div className="bg-neutral-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Hourly Activity (Last 24h)</h3>
            <div className="grid grid-cols-24 gap-1">
              {data.hourlyData.map((hour, index) => (
                <div key={index} className="flex flex-col items-center">
                  <div
                    className={`w-full ${getHeatmapColor(hour.requests, maxHourlyValue)} rounded`}
                    style={{ height: `${Math.max(8, (hour.requests / maxHourlyValue) * 60)}px` }}
                    title={`${hour.hour}: ${hour.requests} requests (${hour.successes} success, ${hour.errors} errors)`}
                  />
                  <span className="text-[8px] text-neutral-500 mt-1">{hour.hour.split(':')[0]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Request Logs View */
        <div className="bg-neutral-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Recent Request Logs</h3>
          {data.recentLogs.length === 0 ? (
            <div className="text-center text-neutral-500 py-8">No requests logged yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-700">
                    <th className="text-left py-2">Time</th>
                    <th className="text-left py-2">Provider</th>
                    <th className="text-left py-2">Model</th>
                    <th className="text-left py-2">Task</th>
                    <th className="text-center py-2">Status</th>
                    <th className="text-center py-2">Latency</th>
                    <th className="text-center py-2">Tokens</th>
                    <th className="text-left py-2">Error Details</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentLogs.map((log, index) => (
                    <tr key={index} className="border-b border-neutral-700/50">
                      <td className="py-2 text-neutral-400 text-xs">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="py-2">{log.provider}</td>
                      <td className="py-2 font-mono text-xs">{log.model}</td>
                      <td className="py-2">
                        <span className="px-2 py-0.5 bg-neutral-700 rounded text-xs">
                          {log.taskType}
                        </span>
                      </td>
                      <td className="py-2 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          log.status === 'success'
                            ? 'bg-green-900/30 text-green-400'
                            : 'bg-red-900/30 text-red-400'
                        }`}>
                          {log.status}
                        </span>
                      </td>
                      <td className="py-2 text-center">{log.responseTime}ms</td>
                      <td className="py-2 text-center">{log.tokensUsed}</td>
                      <td className="py-2 max-w-xs">
                        {log.status === 'error' && log.errorMessage ? (
                          <span className="text-red-400 text-xs font-mono break-words" title={log.errorMessage}>
                            {log.errorMessage.length > 80 ? log.errorMessage.substring(0, 80) + '...' : log.errorMessage}
                          </span>
                        ) : (
                          <span className="text-neutral-600 text-xs">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
