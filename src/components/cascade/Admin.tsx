'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { CardSkeleton, TableSkeleton } from './Skeleton';

const FALLBACK_KEY = 'cascade-master-default-key-2026';

interface User {
  id: string;
  username: string;
  email: string | null;
  role: string;
  enabled: boolean;
  createdAt: string;
  authKeyCount: number;
  requestCount: number;
  providerCount: number;
}

export function Admin() {
  const { apiKey } = useAuth();
  const { addToast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ username: string; email: string; role: string; enabled: boolean; password: string }>({
    username: '', email: '', role: 'user', enabled: true, password: ''
  });
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedUserAnalytics, setSelectedUserAnalytics] = useState<any>(null);

  useEffect(() => {
    fetchUsers();
  }, [apiKey]);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/users', {
        headers: { 'X-API-Key': apiKey || FALLBACK_KEY }
      });
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      } else {
        const err = await response.json();
        setError(err.error || 'Failed to fetch users');
      }
    } catch {
      setError('Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (user: User) => {
    setEditingUser(user.id);
    setEditForm({
      username: user.username,
      email: user.email || '',
      role: user.role,
      enabled: user.enabled,
      password: ''
    });
    setSaveMessage(null);
  };

  const handleSave = async (userId: string) => {
    try {
      const body: any = {
        username: editForm.username,
        email: editForm.email,
        role: editForm.role,
        enabled: editForm.enabled,
      };
      if (editForm.password) {
        body.password = editForm.password;
      }

      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey || FALLBACK_KEY
        },
        body: JSON.stringify(body)
      });

      if (response.ok) {
        setSaveMessage({ type: 'success', text: 'User updated successfully' });
        setEditingUser(null);
        fetchUsers();
      } else {
        const err = await response.json();
        setSaveMessage({ type: 'error', text: err.error || 'Failed to update user' });
      }
    } catch {
      setSaveMessage({ type: 'error', text: 'Failed to update user' });
    }
  };

  const handleDelete = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user? This cannot be undone.')) return;
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { 'X-API-Key': apiKey || FALLBACK_KEY }
      });
      if (response.ok) {
        fetchUsers();
      } else {
        const err = await response.json();
        addToast('error', err.error || 'Failed to delete user');
      }
    } catch {
      addToast('error', 'Failed to delete user');
    }
  };

  const viewAnalytics = async (userId: string) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}/analytics`, {
        headers: { 'X-API-Key': apiKey || FALLBACK_KEY }
      });
      if (response.ok) {
        const data = await response.json();
        setSelectedUserAnalytics(data);
      }
    } catch {
      addToast('error', 'Failed to fetch user analytics');
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-purple-900/30 text-purple-400';
      case 'user': return 'bg-blue-900/30 text-blue-400';
      default: return 'bg-neutral-700 text-neutral-300';
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-8 w-48" />
        <TableSkeleton rows={4} cols={8} />
      </div>
    );
  }

  if (error) {
    return (
    <div className="space-y-6 animate-fadeIn">
        <h2 className="text-2xl font-bold">Admin Panel</h2>
        <div className="glass rounded-xl p-6 text-center">
          <div className="text-4xl mb-4">🔒</div>
          <h3 className="text-lg font-semibold mb-2">Access Denied</h3>
          <p className="text-neutral-400">{error}</p>
          <p className="text-neutral-500 text-sm mt-2">Admin privileges are required to access this panel.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
<h2 className="text-2xl font-bold gradient-text">Admin Panel</h2>
          <p className="text-neutral-400 mt-1">User management, per-user analytics, and system configuration</p>
        </div>
        <button
          onClick={fetchUsers}
          className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Users Table */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-neutral-700">
          <h3 className="text-lg font-semibold">Users ({users.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-700 bg-neutral-800/50">
                <th className="text-left py-3 px-6">Username</th>
                <th className="text-left py-3 px-6">Email</th>
                <th className="text-center py-3 px-6">Role</th>
                <th className="text-center py-3 px-6">Status</th>
                <th className="text-center py-3 px-6">Auth Keys</th>
                <th className="text-center py-3 px-6">Requests</th>
                <th className="text-center py-3 px-6">Providers</th>
                <th className="text-center py-3 px-6">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-neutral-700/50 hover:bg-neutral-700/30">
                  {editingUser === user.id ? (
                    <>
                      <td className="py-3 px-6">
                        <input
                          type="text"
                          value={editForm.username}
                          onChange={(e) => setEditForm(prev => ({ ...prev, username: e.target.value }))}
                          className="w-full px-2 py-1 bg-neutral-700 border border-neutral-600 rounded text-white text-sm"
                        />
                      </td>
                      <td className="py-3 px-6">
                        <input
                          type="text"
                          value={editForm.email}
                          onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                          className="w-full px-2 py-1 bg-neutral-700 border border-neutral-600 rounded text-white text-sm"
                        />
                      </td>
                      <td className="py-3 px-6 text-center">
                        <select
                          value={editForm.role}
                          onChange={(e) => setEditForm(prev => ({ ...prev, role: e.target.value }))}
                          className="px-2 py-1 bg-neutral-700 border border-neutral-600 rounded text-white text-sm"
                        >
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td className="py-3 px-6 text-center">
                        <label className="flex items-center justify-center">
                          <input
                            type="checkbox"
                            checked={editForm.enabled}
                            onChange={(e) => setEditForm(prev => ({ ...prev, enabled: e.target.checked }))}
                            className="w-4 h-4 text-blue-600 bg-neutral-700 border-neutral-600 rounded"
                          />
                        </label>
                      </td>
                      <td className="py-3 px-6 text-center">{user.authKeyCount}</td>
                      <td className="py-3 px-6 text-center">{user.requestCount}</td>
                      <td className="py-3 px-6 text-center">{user.providerCount}</td>
                      <td className="py-3 px-6 text-center">
                        <div className="flex space-x-1 justify-center">
                          <button
                            onClick={() => handleSave(user.id)}
                            className="px-2 py-1 bg-green-600 hover:bg-green-500 text-white text-xs rounded"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingUser(null)}
                            className="px-2 py-1 bg-neutral-600 hover:bg-neutral-500 text-white text-xs rounded"
                          >
                            Cancel
                          </button>
                        </div>
                        {saveMessage && (
                          <div className={`mt-1 text-xs ${saveMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                            {saveMessage.text}
                          </div>
                        )}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-3 px-6 font-medium">{user.username}</td>
                      <td className="py-3 px-6 text-neutral-400">{user.email || '-'}</td>
                      <td className="py-3 px-6 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs ${getRoleBadgeColor(user.role)}`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="py-3 px-6 text-center">
                        <span className={`text-xs ${user.enabled ? 'text-green-400' : 'text-red-400'}`}>
                          {user.enabled ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="py-3 px-6 text-center">{user.authKeyCount}</td>
                      <td className="py-3 px-6 text-center">{user.requestCount}</td>
                      <td className="py-3 px-6 text-center">{user.providerCount}</td>
                      <td className="py-3 px-6 text-center">
                        <div className="flex space-x-1 justify-center">
                          <button
                            onClick={() => handleEdit(user)}
                            className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => viewAnalytics(user.id)}
                            className="px-2 py-1 bg-neutral-600 hover:bg-neutral-500 text-white text-xs rounded"
                          >
                            Stats
                          </button>
                          <button
                            onClick={() => handleDelete(user.id)}
                            className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Analytics Modal */}
      {selectedUserAnalytics && (
        <div className="glass rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">User Analytics</h3>
            <button
              onClick={() => setSelectedUserAnalytics(null)}
              className="px-2 py-1 bg-neutral-600 hover:bg-neutral-500 text-white text-xs rounded"
            >
              Close
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="glass-light rounded-lg p-3">
              <p className="text-neutral-400 text-xs">Total Requests</p>
              <p className="text-xl font-bold">{selectedUserAnalytics.totalRequests}</p>
            </div>
            <div className="glass-light rounded-lg p-3">
              <p className="text-neutral-400 text-xs">Success Rate</p>
              <p className="text-xl font-bold text-green-400">{selectedUserAnalytics.successRate}%</p>
            </div>
            <div className="glass-light rounded-lg p-3">
              <p className="text-neutral-400 text-xs">Errors</p>
              <p className="text-xl font-bold text-red-400">{selectedUserAnalytics.totalErrors}</p>
            </div>
            <div className="glass-light rounded-lg p-3">
              <p className="text-neutral-400 text-xs">Cost Saved</p>
              <p className="text-xl font-bold text-green-400">${selectedUserAnalytics.totalCostSaved}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-semibold text-neutral-300 mb-2">Provider Usage</h4>
              <div className="space-y-1">
                {selectedUserAnalytics.providerUsage.map((p: any, i: number) => (
                  <div key={i} className="flex justify-between glass-light rounded-lg px-3 py-1 text-sm">
                    <span className="text-neutral-300">{p.provider}</span>
                    <span className="text-neutral-400">{p.count} requests</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-neutral-300 mb-2">Cascade Rule Usage</h4>
              <div className="space-y-1">
                {selectedUserAnalytics.ruleUsage.map((r: any, i: number) => (
                  <div key={i} className="flex justify-between items-center glass-light rounded-lg px-3 py-1 text-sm">
                    <span className="text-neutral-300">{r.ruleId}</span>
                    <span className="text-neutral-400">
                      {r.successes}/{r.requests} success
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* System Overview */}
      <div className="glass rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-4">System Overview</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="glass-light rounded-lg p-3">
            <p className="text-neutral-400 text-xs">Total Users</p>
            <p className="text-xl font-bold">{users.length}</p>
          </div>
          <div className="glass-light rounded-lg p-3">
            <p className="text-neutral-400 text-xs">Active Users</p>
            <p className="text-xl font-bold text-green-400">{users.filter(u => u.enabled).length}</p>
          </div>
          <div className="glass-light rounded-lg p-3">
            <p className="text-neutral-400 text-xs">Admins</p>
            <p className="text-xl font-bold text-purple-400">{users.filter(u => u.role === 'admin').length}</p>
          </div>
          <div className="glass-light rounded-lg p-3">
            <p className="text-neutral-400 text-xs">Total Requests</p>
            <p className="text-xl font-bold">{users.reduce((s, u) => s + u.requestCount, 0)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}