'use client';

import { useState, useEffect } from 'react';

interface LogEntry {
  timestamp: string;
  level: 'info' | 'success' | 'error' | 'warning';
  message: string;
  provider?: string;
  taskType?: string;
}

export function Dashboard() {
  const [logs, setLogs] = useState<LogEntry[]>([
    { timestamp: new Date().toISOString(), level: 'info', message: 'Cascade Master initialized' },
  ]);
  const [stats, setStats] = useState({
    requestsToday: 0,
    successRate: 100,
    estimatedSavings: 0,
    uptime: '00:00:00'
  });

  const addLog = (entry: LogEntry) => {
    setLogs(prev => [entry, ...prev.slice(0, 99)]); // Keep last 100 logs
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const simulateActivity = () => {
    const messages = [
      { type: 'general', provider: 'NVIDIA NIM', message: 'Processing general query' },
      { type: 'coding', provider: 'Groq', message: 'Routing coding task to optimized provider' },
      { type: 'summarization', provider: 'OpenRouter', message: 'Handling document analysis request' },
    ];

    const randomMessage = messages[Math.floor(Math.random() * messages.length)];
    addLog({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `[Incoming Request] -> [Detected Task: ${randomMessage.type}] -> [Trying ${randomMessage.provider}] -> [200 OK]`,
      provider: randomMessage.provider,
      taskType: randomMessage.type
    });

    setStats(prev => ({
      ...prev,
      requestsToday: prev.requestsToday + 1,
      estimatedSavings: prev.estimatedSavings + 0.02 // Simulate savings per request
    }));
  };

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/metrics');
        if (response.ok) {
        const data = await response.json();
        const uptimeSeconds = data.uptime_seconds || 0;
        const hours = Math.floor(uptimeSeconds / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        const seconds = Math.floor(uptimeSeconds % 60);
        const uptime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        setStats({
          requestsToday: data.today_requests || 0,
          successRate: parseFloat(data.success_rate.replace('%', '')) || 95,
          estimatedSavings: 0, // Could calculate from logs if available
          uptime
        });
        }
      } catch (error) {
        console.error('Failed to fetch metrics:', error);
      }
    };

    // Fetch initial metrics
    fetchMetrics();

    // Fetch metrics every 30 seconds
    const interval = setInterval(fetchMetrics, 30000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      {/* Status Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <div className="bg-neutral-800 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-neutral-400 text-sm">Requests Today</p>
              <p className="text-2xl font-bold text-white">{stats.requestsToday}</p>
            </div>
            <div className="text-2xl">📈</div>
          </div>
        </div>

        <div className="bg-neutral-800 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-neutral-400 text-sm">Success Rate</p>
              <p className="text-2xl font-bold text-green-400">{stats.successRate}%</p>
            </div>
            <div className="text-2xl">✅</div>
          </div>
        </div>

        <div className="bg-neutral-800 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-neutral-400 text-sm">Money Saved</p>
              <p className="text-2xl font-bold text-green-400">${stats.estimatedSavings.toFixed(2)}</p>
            </div>
            <div className="text-2xl">💰</div>
          </div>
        </div>

        <div className="bg-neutral-800 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-neutral-400 text-sm">Uptime</p>
              <p className="text-2xl font-bold text-blue-400">{stats.uptime}</p>
            </div>
            <div className="text-2xl">🕒</div>
          </div>
        </div>
      </div>

      {/* Live Log Feed */}
      <div className="bg-neutral-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Live Request Trace</h2>
          <button
            onClick={clearLogs}
            className="px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-sm rounded transition-colors"
          >
            Clear Logs
          </button>
        </div>

        <div className="h-96 overflow-y-auto bg-neutral-900 rounded p-4 font-mono text-sm">
          {logs.length === 0 ? (
            <div className="text-neutral-400">Waiting for requests...</div>
          ) : (
            logs.map((log, index) => (
              <div
                key={index}
                className={`mb-2 p-2 rounded ${
                  log.level === 'error'
                    ? 'bg-red-900/20 border-l-2 border-red-500'
                    : log.level === 'success'
                    ? 'bg-green-900/20 border-l-2 border-green-500'
                    : log.level === 'warning'
                    ? 'bg-yellow-900/20 border-l-2 border-yellow-500'
                    : 'bg-neutral-800/50'
                }`}
              >
                <div className="flex items-start space-x-2">
                  <span className="text-neutral-500 text-xs min-w-[80px]">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="flex-1 text-neutral-300">{log.message}</span>
                  {log.provider && (
                    <span className="text-xs bg-neutral-700 px-2 py-1 rounded">
                      {log.provider}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 flex space-x-4">
          <button
            onClick={simulateActivity}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-sm rounded transition-colors"
          >
            Simulate Request
          </button>
          <span className="text-neutral-400 text-sm self-center">
            Or send requests to /api/cascade to see real activity
          </span>
        </div>
      </div>
    </div>
  );
}