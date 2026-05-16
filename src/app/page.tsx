'use client';

import { AuthWrapper } from '@/app/auth-wrapper';
import { useUIAuth } from '@/context/UIAuthContext';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dashboard } from '../components/cascade/Dashboard';
import { Providers } from '../components/cascade/Providers';
import { Models } from '../components/cascade/Models';
import { Cascade } from '../components/cascade/Cascade';
import { Analytics } from '../components/cascade/Analytics';
import { Auth } from '../components/cascade/Auth';
import { Test } from '../components/cascade/Test';

type TabType = 'dashboard' | 'providers' | 'models' | 'cascade' | 'analytics' | 'auth' | 'test';

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const { logout } = useUIAuth();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const tabs = [
    { id: 'dashboard' as TabType, label: 'Dashboard', icon: '📊' },
    { id: 'providers' as TabType, label: 'Providers', icon: '🔧' },
    { id: 'models' as TabType, label: 'Models', icon: '🤖' },
    { id: 'cascade' as TabType, label: 'Cascade', icon: '🔀' },
    { id: 'analytics' as TabType, label: 'Analytics', icon: '📈' },
    { id: 'auth' as TabType, label: 'Security', icon: '🔐' },
    { id: 'test' as TabType, label: 'Test', icon: '🧪' },
  ];

  return (
    <AuthWrapper>
      <main className="min-h-screen bg-neutral-900 text-neutral-100">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Cascade Master</h1>
            <p className="text-neutral-400 mt-1">
              Universal AI Traffic Controller - Maximize free-tier LLM usage
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-sm text-neutral-400">
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              <span>Server Online</span>
            </div>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 hover:text-red-300 text-sm rounded-md transition-colors border border-red-600/30"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex space-x-1 mb-8 bg-neutral-800 p-1 rounded-lg">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-neutral-700 text-white'
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-700/50'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="tab-content">
          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'providers' && <Providers />}
          {activeTab === 'models' && <Models />}
          {activeTab === 'cascade' && <Cascade />}
          {activeTab === 'analytics' && <Analytics />}
          {activeTab === 'auth' && <Auth />}
          {activeTab === 'test' && <Test />}
        </div>
      </main>
    </AuthWrapper>
  );
}