'use client';

import { useState, useEffect } from 'react';

interface Model {
  id: string;
  name: string;
  providerId: string;
  modelId: string;
}

interface TestResponse {
  id: string;
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export function Test() {
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState<TestResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res = await fetch('http://localhost:3001/api/models');
        if (res.ok) {
          const data = await res.json();
          setModels(data);
          if (data.length > 0) {
            setSelectedModel(data[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to load models:', err);
      }
    };
    fetchModels();
  }, []);

  const handleTest = async () => {
    if (!selectedModel || !message.trim()) return;

    setLoading(true);
    setError('');
    setResponse(null);

    try {
      const res = await fetch('http://localhost:3001/api/cascade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal': 'true',
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [{ role: 'user', content: message }]
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setResponse(data);
      } else {
        const errData = await res.json().catch(() => ({ error: 'Unknown error' }));
        setError(errData.error || `HTTP ${res.status}`);
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-neutral-800 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Test Cascade</h2>
        <p className="text-neutral-400 mb-4">
          Test your cascade configuration by sending a message through the system.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              Model
            </label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} ({model.modelId})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              Message
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Enter your test message..."
              rows={4}
              className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white placeholder-neutral-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          <button
            onClick={handleTest}
            disabled={loading || !selectedModel || !message.trim()}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-600 text-white rounded-md transition-colors disabled:cursor-not-allowed"
          >
            {loading ? 'Testing...' : 'Send Test Request'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
          <h3 className="text-red-400 font-medium mb-2">Error</h3>
          <p className="text-red-300">{error}</p>
        </div>
      )}

      {response && (
        <div className="bg-green-900/20 border border-green-500 rounded-lg p-4">
          <h3 className="text-green-400 font-medium mb-2">Response</h3>
          <div className="bg-neutral-800 rounded p-3 font-mono text-sm text-neutral-300">
            {response.choices[0]?.message?.content || 'No response content'}
          </div>
          <div className="mt-2 text-xs text-neutral-400">
            Request ID: {response.id}
          </div>
        </div>
      )}
    </div>
  );
}