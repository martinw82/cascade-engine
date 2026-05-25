'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';

const FALLBACK_KEY = 'cascade-master-default-key-2026';

export function ABTest() {
  const { apiKey } = useAuth();
  const [cascadeRules, setCascadeRules] = useState<any[]>([]);
  const [testA, setTestA] = useState({ ruleId: '', prompt: '' });
  const [testB, setTestB] = useState({ ruleId: '', prompt: '' });
  const [results, setResults] = useState<{ a: any; b: any } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iterations, setIterations] = useState(3);

  useEffect(() => {
    fetchRules();
  }, [apiKey]);

  const fetchRules = async () => {
    try {
      const response = await fetch('/api/cascade-rules', {
        headers: { 'X-API-Key': apiKey || FALLBACK_KEY }
      });
      if (response.ok) {
        const data = await response.json();
        setCascadeRules(data);
        if (data.length >= 2) {
          setTestA(prev => ({ ...prev, ruleId: data[0].id }));
          setTestB(prev => ({ ...prev, ruleId: data[1].id }));
        } else if (data.length === 1) {
          setTestA(prev => ({ ...prev, ruleId: data[0].id }));
        }
      }
    } catch {
      console.error('Failed to fetch cascade rules');
    }
  };

  const runTest = async () => {
    if (!testA.ruleId || !testB.ruleId || !testA.prompt) return;
    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const runSingle = async (ruleId: string, label: string) => {
        const timings: number[] = [];
        let successes = 0;
        let totalTokens = 0;

        for (let i = 0; i < iterations; i++) {
          const start = Date.now();
          try {
            const response = await fetch('/api/cascade', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey || FALLBACK_KEY
              },
              body: JSON.stringify({
                messages: [{ role: 'user', content: testA.prompt }],
                cascadeRuleId: ruleId,
                stream: false,
              }),
              signal: AbortSignal.timeout(60000),
            });

            const elapsed = Date.now() - start;
            timings.push(elapsed);

            if (response.ok) {
              successes++;
              const data = await response.json();
              totalTokens += data.usage?.total_tokens || 0;
            }
          } catch {
            timings.push(Date.now() - start);
          }
        }

        const avgTime = timings.reduce((s, t) => s + t, 0) / timings.length;
        return {
          label,
          iterations,
          successes,
          failures: iterations - successes,
          successRate: ((successes / iterations) * 100).toFixed(1),
          avgResponseTime: Math.round(avgTime),
          minResponseTime: Math.min(...timings),
          maxResponseTime: Math.max(...timings),
          totalTokens,
          timings,
        };
      };

      const [resultA, resultB] = await Promise.all([
        runSingle(testA.ruleId, 'Variant A'),
        runSingle(testB.ruleId, 'Variant B'),
      ]);

      setResults({ a: resultA, b: resultB });
    } catch {
      setError('A/B test failed');
    } finally {
      setLoading(false);
    }
  };

  const getWinner = (field: string) => {
    if (!results) return null;
    const aVal = results.a[field];
    const bVal = results.b[field];
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      if (field === 'avgResponseTime' || field === 'failures') {
        return aVal < bVal ? 'A' : bVal < aVal ? 'B' : null;
      }
      return aVal > bVal ? 'A' : bVal > aVal ? 'B' : null;
    }
    return null;
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div>
        <h2 className="text-2xl font-bold gradient-text">A/B Testing</h2>
        <p className="text-neutral-400 mt-1">Compare cascade rule performance with statistical testing</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Variant A */}
        <div className="glass rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4 text-blue-400">Variant A</h3>
          <select
            value={testA.ruleId}
            onChange={(e) => setTestA(prev => ({ ...prev, ruleId: e.target.value }))}
            className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white text-sm mb-3"
          >
            <option value="">Select cascade rule...</option>
            {cascadeRules.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <div className="text-xs text-neutral-400">
            {cascadeRules.find(r => r.id === testA.ruleId)?.modelOrder || 'No rule selected'}
          </div>
        </div>

        {/* Variant B */}
        <div className="glass rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4 text-green-400">Variant B</h3>
          <select
            value={testB.ruleId}
            onChange={(e) => setTestB(prev => ({ ...prev, ruleId: e.target.value }))}
            className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white text-sm mb-3"
          >
            <option value="">Select cascade rule...</option>
            {cascadeRules.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <div className="text-xs text-neutral-400">
            {cascadeRules.find(r => r.id === testB.ruleId)?.modelOrder || 'No rule selected'}
          </div>
        </div>
      </div>

      {/* Prompt + Config */}
      <div className="glass rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-4">Test Configuration</h3>
        <textarea
          value={testA.prompt}
          onChange={(e) => setTestA(prev => ({ ...prev, prompt: e.target.value }))}
          className="w-full h-20 px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white text-sm resize-none mb-3"
          placeholder="Enter test prompt (used for both variants)..."
        />
        <div className="flex items-center space-x-3">
          <label className="text-sm text-neutral-300">Iterations per variant:</label>
          <input
            type="number"
            value={iterations}
            onChange={(e) => setIterations(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-20 px-2 py-1 bg-neutral-700 border border-neutral-600 rounded text-white text-sm"
            min={1}
            max={20}
          />
          <button
            onClick={runTest}
            disabled={loading || !testA.ruleId || !testB.ruleId || !testA.prompt}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-600 disabled:opacity-50 text-white rounded-md text-sm"
          >
            {loading ? 'Running A/B Test...' : 'Run A/B Test'}
          </button>
        </div>
      </div>

      {error && (
        <div className="glass rounded-lg p-4 text-red-400 border border-red-500/30">{error}</div>
      )}

      {/* Results */}
      {results && (
        <div className="glass rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Results</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-700">
                  <th className="text-left py-2">Metric</th>
                  <th className="text-right py-2 text-blue-400">Variant A</th>
                  <th className="text-right py-2 text-green-400">Variant B</th>
                  <th className="text-center py-2">Winner</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-neutral-700/50">
                  <td className="py-2">Success Rate</td>
                  <td className="py-2 text-right">{results.a.successRate}%</td>
                  <td className="py-2 text-right">{results.b.successRate}%</td>
                  <td className="py-2 text-center">
                    {getWinner('successRate') && (
                      <span className={`font-bold ${getWinner('successRate') === 'A' ? 'text-blue-400' : 'text-green-400'}`}>
                        {getWinner('successRate')}
                      </span>
                    )}
                  </td>
                </tr>
                <tr className="border-b border-neutral-700/50">
                  <td className="py-2">Avg Response Time</td>
                  <td className="py-2 text-right">{results.a.avgResponseTime}ms</td>
                  <td className="py-2 text-right">{results.b.avgResponseTime}ms</td>
                  <td className="py-2 text-center">
                    {getWinner('avgResponseTime') && (
                      <span className={`font-bold ${getWinner('avgResponseTime') === 'A' ? 'text-blue-400' : 'text-green-400'}`}>
                        {getWinner('avgResponseTime')}
                      </span>
                    )}
                  </td>
                </tr>
                <tr className="border-b border-neutral-700/50">
                  <td className="py-2">Min Time</td>
                  <td className="py-2 text-right">{results.a.minResponseTime}ms</td>
                  <td className="py-2 text-right">{results.b.minResponseTime}ms</td>
                  <td className="py-2 text-center">
                    {getWinner('minResponseTime') && (
                      <span className={`font-bold ${getWinner('minResponseTime') === 'A' ? 'text-blue-400' : 'text-green-400'}`}>
                        {getWinner('minResponseTime')}
                      </span>
                    )}
                  </td>
                </tr>
                <tr className="border-b border-neutral-700/50">
                  <td className="py-2">Max Time</td>
                  <td className="py-2 text-right">{results.a.maxResponseTime}ms</td>
                  <td className="py-2 text-right">{results.b.maxResponseTime}ms</td>
                  <td className="py-2 text-center">
                    {getWinner('maxResponseTime') && (
                      <span className={`font-bold ${getWinner('maxResponseTime') === 'A' ? 'text-blue-400' : 'text-green-400'}`}>
                        {getWinner('maxResponseTime')}
                      </span>
                    )}
                  </td>
                </tr>
                <tr className="border-b border-neutral-700/50">
                  <td className="py-2">Successes</td>
                  <td className="py-2 text-right">{results.a.successes}/{results.a.iterations}</td>
                  <td className="py-2 text-right">{results.b.successes}/{results.b.iterations}</td>
                  <td className="py-2 text-center">
                    {getWinner('successes') && (
                      <span className={`font-bold ${getWinner('successes') === 'A' ? 'text-blue-400' : 'text-green-400'}`}>
                        {getWinner('successes')}
                      </span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}