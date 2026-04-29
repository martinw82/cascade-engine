'use client';

import { useState } from 'react';

interface AuthKey {
  id: string;
  name: string;
  keyValue: string;
  allowedIps: string[];
  permissions: string[];
  enabled: boolean;
  createdAt: string;
}

export function Auth() {
  const [authKeys, setAuthKeys] = useState<AuthKey[]>([
    {
      id: 'default-key',
      name: 'Default Access Key',
      keyValue: 'cascade-master-default-key-2026',
      allowedIps: ['127.0.0.1', '::1', '192.168.1.100'],
      permissions: ['read', 'write', 'admin'],
      enabled: true,
      createdAt: new Date().toISOString()
    }
  ]);

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    keyValue: '',
    allowedIps: [''],
    permissions: ['read', 'write'],
    enabled: true
  });

  const resetForm = () => {
    setFormData({
      name: '',
      keyValue: '',
      allowedIps: [''],
      permissions: ['read', 'write'],
      enabled: true
    });
    setIsAdding(false);
    setEditingId(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Filter out empty IPs
    const cleanIps = formData.allowedIps.filter(ip => ip.trim() !== '');

    if (editingId) {
      // Update existing key
      setAuthKeys(prev =>
        prev.map(k =>
          k.id === editingId
            ? { ...k, ...formData, allowedIps: cleanIps }
            : k
        )
      );
    } else {
      // Add new key
      const newKey: AuthKey = {
        id: Date.now().toString(),
        ...formData,
        allowedIps: cleanIps,
        createdAt: new Date().toISOString()
      };
      setAuthKeys(prev => [...prev, newKey]);
    }

    resetForm();
  };

  const handleEdit = (authKey: AuthKey) => {
    setFormData({
      name: authKey.name,
      keyValue: authKey.keyValue,
      allowedIps: authKey.allowedIps.length > 0 ? authKey.allowedIps : [''],
      permissions: authKey.permissions,
      enabled: authKey.enabled
    });
    setEditingId(authKey.id);
    setIsAdding(true);
  };

  const handleDelete = (id: string) => {
    setAuthKeys(prev => prev.filter(k => k.id !== id));
  };

  const handleIpChange = (index: number, value: string) => {
    const newIps = [...formData.allowedIps];
    newIps[index] = value;
    setFormData(prev => ({ ...prev, allowedIps: newIps }));
  };

  const addIpField = () => {
    setFormData(prev => ({ ...prev, allowedIps: [...prev.allowedIps, ''] }));
  };

  const removeIpField = (index: number) => {
    if (formData.allowedIps.length > 1) {
      const newIps = formData.allowedIps.filter((_, i) => i !== index);
      setFormData(prev => ({ ...prev, allowedIps: newIps }));
    }
  };

  const handlePermissionChange = (permission: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      permissions: checked
        ? [...prev.permissions, permission]
        : prev.permissions.filter(p => p !== permission)
    }));
  };

  const generateNewKey = () => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    const newKey = `cascade-${timestamp}-${random}`;
    setFormData(prev => ({ ...prev, keyValue: newKey }));
  };

  const permissions = ['read', 'write', 'admin'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Authentication & Security</h2>
          <p className="text-neutral-400 mt-1">
            Manage access keys and IP restrictions for secure API usage
          </p>
        </div>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
        >
          {isAdding ? 'Cancel' : '+ Add Access Key'}
        </button>
      </div>

      {/* Add/Edit Form */}
      {isAdding && (
        <div className="bg-neutral-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">
            {editingId ? 'Edit Access Key' : 'Add New Access Key'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Key Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Worker Machine Key"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Access Key
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={formData.keyValue}
                    onChange={(e) => setFormData(prev => ({ ...prev, keyValue: e.target.value }))}
                    className="flex-1 px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter or generate access key"
                    required
                  />
                  <button
                    type="button"
                    onClick={generateNewKey}
                    className="px-3 py-2 bg-neutral-600 hover:bg-neutral-500 text-sm rounded transition-colors"
                    title="Generate new key"
                  >
                    🎲
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                Allowed IP Addresses
              </label>
              <div className="space-y-2">
                {formData.allowedIps.map((ip, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={ip}
                      onChange={(e) => handleIpChange(index, e.target.value)}
                      className="flex-1 px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="192.168.1.100 or 10.0.0.1/24"
                    />
                    {formData.allowedIps.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeIpField(index)}
                        className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white text-sm rounded transition-colors"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addIpField}
                  className="px-3 py-1 bg-neutral-600 hover:bg-neutral-500 text-sm rounded transition-colors"
                >
                  + Add IP
                </button>
              </div>
              <p className="text-xs text-neutral-500 mt-1">
                Leave empty to allow from any IP (not recommended for production)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                Permissions
              </label>
              <div className="flex flex-wrap gap-3">
                {permissions.map((permission) => (
                  <label key={permission} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.permissions.includes(permission)}
                      onChange={(e) => handlePermissionChange(permission, e.target.checked)}
                      className="mr-2 w-4 h-4 text-blue-600 bg-neutral-700 border-neutral-600 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-neutral-300 capitalize">{permission}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.enabled}
                  onChange={(e) => setFormData(prev => ({ ...prev, enabled: e.target.checked }))}
                  className="mr-2 w-4 h-4 text-blue-600 bg-neutral-700 border-neutral-600 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-neutral-300">Enable Key</span>
              </label>
            </div>

            <div className="flex space-x-3">
              <button
                type="submit"
                className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-md transition-colors"
              >
                {editingId ? 'Update Key' : 'Add Access Key'}
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

      {/* Auth Keys List */}
      <div className="grid gap-4">
        {authKeys.map((authKey) => (
          <div key={authKey.id} className="bg-neutral-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <h3 className="text-lg font-semibold">{authKey.name}</h3>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  authKey.enabled
                    ? 'text-green-400 bg-green-900/20'
                    : 'text-red-400 bg-red-900/20'
                }`}>
                  {authKey.enabled ? 'ENABLED' : 'DISABLED'}
                </span>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => handleEdit(authKey)}
                  className="px-3 py-1 bg-neutral-700 hover:bg-neutral-600 text-sm rounded transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(authKey.id)}
                  className="px-3 py-1 bg-red-600 hover:bg-red-500 text-sm rounded transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-neutral-400">Access Key:</span>
                <div className="text-neutral-200 font-mono bg-neutral-900 px-2 py-1 rounded mt-1 text-xs break-all">
                  {authKey.keyValue}
                </div>
              </div>
              <div>
                <span className="text-neutral-400">Allowed IPs:</span>
                <div className="mt-1 space-y-1">
                  {authKey.allowedIps.length > 0 ? (
                    authKey.allowedIps.map((ip, index) => (
                      <div key={index} className="text-neutral-200 font-mono bg-neutral-900 px-2 py-1 rounded text-xs">
                        {ip}
                      </div>
                    ))
                  ) : (
                    <div className="text-neutral-500 text-xs">Any IP allowed</div>
                  )}
                </div>
              </div>
              <div>
                <span className="text-neutral-400">Permissions:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {authKey.permissions.map((permission) => (
                    <span key={permission} className="bg-neutral-700 px-2 py-1 rounded text-xs capitalize">
                      {permission}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 text-xs text-neutral-500">
              Created: {new Date(authKey.createdAt).toLocaleDateString()}
            </div>
          </div>
        ))}

        {authKeys.length === 0 && (
          <div className="bg-neutral-800 rounded-lg p-8 text-center">
            <div className="text-4xl mb-4">🔐</div>
            <h3 className="text-lg font-semibold mb-2">No Access Keys</h3>
            <p className="text-neutral-400 mb-4">
              Create access keys with IP restrictions to secure your Cascade Master API
            </p>
            <button
              onClick={() => setIsAdding(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
            >
              Create First Key
            </button>
          </div>
        )}
      </div>

      {/* API Usage Instructions */}
      <div className="bg-neutral-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">API Usage Instructions</h3>
        <div className="space-y-3 text-sm text-neutral-300">
          <div>
            <strong>Authentication:</strong> Include the access key in the <code className="bg-neutral-900 px-2 py-1 rounded text-xs">X-API-Key</code> header
          </div>
          <div>
            <strong>Example:</strong>
            <pre className="bg-neutral-900 p-3 rounded mt-1 text-xs overflow-x-auto">
{`curl -X POST http://your-server:3001/api/cascade \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: your-access-key-here" \\
  -d '{"messages": [{"role": "user", "content": "Hello"}]}'`}
            </pre>
          </div>
          <div className="text-yellow-400">
            ⚠️ <strong>Security Note:</strong> Always use HTTPS in production and restrict IP ranges to your trusted networks.
          </div>
        </div>
      </div>
    </div>
  );
}