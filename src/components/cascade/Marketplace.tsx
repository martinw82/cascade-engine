'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';

const FALLBACK_KEY = 'cascade-master-default-key-2026';
const CATEGORIES = ['general', 'coding', 'summarization', 'translation', 'analysis', 'creative', 'custom'];

export function Marketplace() {
  const { apiKey } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [myItems, setMyItems] = useState<any[]>([]);
  const [tab, setTab] = useState<'browse' | 'publish'>('browse');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Publish form
  const [form, setForm] = useState({
    name: '', description: '', triggerType: 'keyword', triggerValue: '',
    modelOrder: '', wordLimit: 5, category: 'general', tags: '', published: false,
  });

  useEffect(() => {
    fetchItems();
    fetchMyItems();
  }, [apiKey, category]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (category) params.set('category', category);
      if (search) params.set('search', search);
      const response = await fetch(`/api/marketplace?${params}`, {
        headers: { 'X-API-Key': apiKey || FALLBACK_KEY }
      });
      if (response.ok) {
        const data = await response.json();
        setItems(data);
      }
    } catch {
      console.error('Failed to fetch marketplace');
    } finally {
      setLoading(false);
    }
  };

  const fetchMyItems = async () => {
    try {
      const response = await fetch('/api/marketplace/mine', {
        headers: { 'X-API-Key': apiKey || FALLBACK_KEY }
      });
      if (response.ok) {
        const data = await response.json();
        setMyItems(data);
      }
    } catch {
      console.error('Failed to fetch my items');
    }
  };

  const handleDownload = async (id: string) => {
    try {
      const response = await fetch(`/api/marketplace/${id}/download`, {
        method: 'POST',
        headers: { 'X-API-Key': apiKey || FALLBACK_KEY }
      });
      if (response.ok) {
        const data = await response.json();
        setMessage({ type: 'success', text: data.message });
        fetchItems();
      } else {
        const err = await response.json();
        setMessage({ type: 'error', text: err.error || 'Download failed' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Download failed' });
    }
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.triggerValue || !form.modelOrder) {
      setMessage({ type: 'error', text: 'Name, trigger value, and model order are required' });
      return;
    }

    try {
      const response = await fetch('/api/marketplace', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey || FALLBACK_KEY
        },
        body: JSON.stringify({
          ...form,
          modelOrder: form.modelOrder.split(',').map((s: string) => s.trim()),
          tags: form.tags.split(',').map((s: string) => s.trim()).filter(Boolean),
        }),
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Published to marketplace!' });
        setForm({ name: '', description: '', triggerType: 'keyword', triggerValue: '', modelOrder: '', wordLimit: 5, category: 'general', tags: '', published: false });
        fetchMyItems();
      } else {
        const err = await response.json();
        setMessage({ type: 'error', text: err.error || 'Publish failed' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Publish failed' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Marketplace</h2>
          <p className="text-neutral-400 mt-1">Discover and share cascade rule templates</p>
        </div>
        <div className="flex space-x-2">
          <button onClick={() => setTab('browse')} className={`px-3 py-1 text-sm rounded ${tab === 'browse' ? 'bg-blue-600 text-white' : 'bg-neutral-700 text-neutral-300'}`}>Browse</button>
          <button onClick={() => setTab('publish')} className={`px-3 py-1 text-sm rounded ${tab === 'publish' ? 'bg-blue-600 text-white' : 'bg-neutral-700 text-neutral-300'}`}>Publish</button>
        </div>
      </div>

      {message && (
        <div className={`px-4 py-2 rounded text-sm ${message.type === 'success' ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
          {message.text}
          <button onClick={() => setMessage(null)} className="ml-2 text-xs">✕</button>
        </div>
      )}

      {tab === 'browse' ? (
        <>
          {/* Filters */}
          <div className="flex space-x-3">
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="px-3 py-2 bg-neutral-700 border border-neutral-600 rounded text-white text-sm">
              <option value="">All Categories</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="flex-1 px-3 py-2 bg-neutral-700 border border-neutral-600 rounded text-white text-sm" />
            <button onClick={fetchItems} className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded">Search</button>
          </div>

          {/* Grid */}
          {loading ? (
            <div className="text-neutral-400 text-center py-12">Loading...</div>
          ) : items.length === 0 ? (
            <div className="text-neutral-500 text-center py-12">No items found. Be the first to publish!</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((item) => (
                <div key={item.id} className="bg-neutral-800 rounded-lg p-5 hover:bg-neutral-750 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-white">{item.name}</h3>
                    <span className="px-2 py-0.5 bg-neutral-700 rounded text-xs text-neutral-300">{item.category}</span>
                  </div>
                  {item.description && <p className="text-sm text-neutral-400 mb-3">{item.description}</p>}
                  <div className="text-xs text-neutral-500 mb-3">
                    <span className="text-blue-400">{item.triggerType}</span>: {item.triggerValue}
                  </div>
                  <div className="flex items-center justify-between text-xs text-neutral-500">
                    <span>⬇️ {item.downloads} downloads</span>
                    <span>⭐ {item.rating?.toFixed(1) || '0.0'}</span>
                  </div>
                  <button onClick={() => handleDownload(item.id)} className="mt-3 w-full px-3 py-2 bg-green-600 hover:bg-green-500 text-white text-sm rounded transition-colors">
                    Download & Install
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {/* Publish Form */}
          <div className="bg-neutral-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Publish Cascade Rule</h3>
            <form onSubmit={handlePublish} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-neutral-300 mb-1">Rule Name *</label>
                  <input type="text" value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded text-white text-sm" />
                </div>
                <div>
                  <label className="block text-sm text-neutral-300 mb-1">Category</label>
                  <select value={form.category} onChange={(e) => setForm(p => ({ ...p, category: e.target.value }))} className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded text-white text-sm">
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm text-neutral-300 mb-1">Description</label>
                <textarea value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} className="w-full h-20 px-3 py-2 bg-neutral-700 border border-neutral-600 rounded text-white text-sm resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-neutral-300 mb-1">Trigger Type</label>
                  <select value={form.triggerType} onChange={(e) => setForm(p => ({ ...p, triggerType: e.target.value }))} className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded text-white text-sm">
                    <option value="keyword">Keyword</option>
                    <option value="regex">Regex</option>
                    <option value="prefix">Prefix</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-neutral-300 mb-1">Trigger Value *</label>
                  <input type="text" value={form.triggerValue} onChange={(e) => setForm(p => ({ ...p, triggerValue: e.target.value }))} className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded text-white text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm text-neutral-300 mb-1">Model Order (comma-separated model IDs) *</label>
                <input type="text" value={form.modelOrder} onChange={(e) => setForm(p => ({ ...p, modelOrder: e.target.value }))} placeholder="model-id-1, model-id-2, model-id-3" className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded text-white text-sm font-mono" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-neutral-300 mb-1">Word Limit</label>
                  <input type="number" value={form.wordLimit} onChange={(e) => setForm(p => ({ ...p, wordLimit: parseInt(e.target.value) || 5 }))} className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded text-white text-sm" />
                </div>
                <div>
                  <label className="block text-sm text-neutral-300 mb-1">Tags (comma-separated)</label>
                  <input type="text" value={form.tags} onChange={(e) => setForm(p => ({ ...p, tags: e.target.value }))} placeholder="ai, coding, fast" className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded text-white text-sm" />
                </div>
              </div>
              <label className="flex items-center">
                <input type="checkbox" checked={form.published} onChange={(e) => setForm(p => ({ ...p, published: e.target.checked }))} className="mr-2 w-4 h-4 text-blue-600 bg-neutral-700 border-neutral-600 rounded" />
                <span className="text-sm text-neutral-300">Publish immediately (visible to everyone)</span>
              </label>
              <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-sm">Publish to Marketplace</button>
            </form>
          </div>

          {/* My Listings */}
          <div className="bg-neutral-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">My Listings ({myItems.length})</h3>
            {myItems.length === 0 ? (
              <p className="text-neutral-500 text-sm">You haven't published any rules yet.</p>
            ) : (
              <div className="space-y-2">
                {myItems.map((item) => (
                  <div key={item.id} className="bg-neutral-700 rounded p-3 flex items-center justify-between">
                    <div>
                      <span className="font-medium text-sm">{item.name}</span>
                      <span className={`ml-2 px-2 py-0.5 rounded text-xs ${item.published ? 'bg-green-900/30 text-green-400' : 'bg-yellow-900/30 text-yellow-400'}`}>
                        {item.published ? 'Published' : 'Draft'}
                      </span>
                      <span className="ml-2 text-xs text-neutral-500">⬇️ {item.downloads} downloads</span>
                    </div>
                    <span className="text-xs text-neutral-400">{item.category}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}