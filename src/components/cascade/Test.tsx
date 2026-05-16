'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';

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

interface Provider {
  id: string;
  name: string;
  baseURL: string;
  apiKey: string;
  status: 'ready' | 'cooldown' | 'errored';
  created: string;
}

export function Test() {
  const [models, setModels] = useState<Model[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('');
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState<TestResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ title: string; details: string } | null>(null);
  const [bypassCascade, setBypassCascade] = useState(false);
  const { apiKey } = useAuth();

  useEffect(() => {
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
          setModels(modelsData);
          if (modelsData.length > 0) {
            setSelectedModel(modelsData[0].id);
          }
        }

        if (providersRes.ok) {
          const providersData = await providersRes.json();
          setProviders(providersData);
          if (providersData.length > 0) {
            setSelectedProvider(providersData[0].id);
          }
        }
      } catch (error) {
        console.error('Failed to load data:', error);
      }
    };
    fetchData();
  }, [apiKey]); // Re-fetch when API key changes

  const handleTest = async () => {
    if (!message.trim()) return;
    if (!bypassCascade && !selectedModel) return;
    if (bypassCascade && (!selectedProvider || !selectedModel)) return;

    setLoading(true);
    setError('');
    setResponse(null);

    try {
      const endpoint = bypassCascade ? '/api/test' : '/api/cascade';
      const body = bypassCascade
        ? {
            providerId: selectedProvider,
            modelId: selectedModel,
            messages: [{ role: 'user', content: message }]
          }
        : {
            model: selectedModel,
            messages: [{ role: 'user', content: message }]
          };

       const res = await fetch(`${endpoint}`, {
         method: 'POST',
         headers: {
           'Content-Type': 'application/json',
           'X-API-Key': apiKey || 'cascade-master-default-key-2026',
           'X-Internal': 'true',
         },
         body: JSON.stringify(body),
       });

       if (res.ok) {
         const data = await res.json();
         setResponse(data);
         setError(null);
       } else {
         const errData = await res.json().catch(() => ({ error: 'Unknown error', details: '' }));
         setError({
           title: errData.error || `HTTP ${res.status}`,
           details: errData.details || ''
         });
         setResponse(null);
       }
     } catch (err: any) {
       setError({
         title: 'Network error',
         details: err.message || 'Could not connect to the server'
       });
       setResponse(null);
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
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={bypassCascade}
                onChange={(e) => setBypassCascade(e.target.checked)}
                className="mr-2 w-4 h-4 text-blue-600 bg-neutral-700 border-neutral-600 rounded focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-neutral-300">Bypass cascade (test specific provider/model)</span>
            </label>
          </div>

          {bypassCascade && (
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                Provider
              </label>
              <select
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              Model
            </label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {models
                .filter(model => !bypassCascade || model.providerId === selectedProvider)
                .map((model) => (
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
            disabled={loading || !message.trim() || (!bypassCascade && !selectedModel) || (bypassCascade && (!selectedProvider || !selectedModel))}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-600 text-white rounded-md transition-colors disabled:cursor-not-allowed"
          >
            {loading ? 'Testing...' : 'Send Test Request'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
          <h3 className="text-red-400 font-medium mb-2">Error</h3>
          <p className="text-red-300 font-medium">{error.title}</p>
          {error.details && (
            <div className="mt-2 p-2 bg-red-950/30 rounded border border-red-800/50">
              <p className="text-red-400 text-xs font-mono whitespace-pre-wrap break-words">
                {error.details}
              </p>
            </div>
          )}
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