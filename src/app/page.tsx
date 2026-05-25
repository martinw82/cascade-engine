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
import { Admin } from '../components/cascade/Admin';
import { Benchmark } from '../components/cascade/Benchmark';
import { CostCalculator } from '../components/cascade/CostCalculator';
import { ABTest } from '../components/cascade/ABTest';
import { Marketplace } from '../components/cascade/Marketplace';

type TabType = 'dashboard' | 'providers' | 'models' | 'cascade' | 'analytics' | 'auth' | 'test' | 'benchmark' | 'cost' | 'abtest' | 'marketplace' | 'admin';

const tabIcons: Record<string, string> = {
  dashboard: '📊', providers: '🔧', models: '🤖', cascade: '🔀',
  analytics: '📈', auth: '🔐', test: '🧪', benchmark: '🏆',
  cost: '💰', abtest: '🔬', marketplace: '🏪', admin: '⚙️',
};

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { logout } = useUIAuth();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const tabs = [
    { id: 'dashboard' as TabType, label: 'Dashboard', icon: '📊', group: 'Core' },
    { id: 'providers' as TabType, label: 'Providers', icon: '🔧', group: 'Configuration' },
    { id: 'models' as TabType, label: 'Models', icon: '🤖', group: 'Configuration' },
    { id: 'cascade' as TabType, label: 'Cascade Rules', icon: '🔀', group: 'Configuration' },
    { id: 'analytics' as TabType, label: 'Analytics', icon: '📈', group: 'Monitoring' },
    { id: 'auth' as TabType, label: 'Security', icon: '🔐', group: 'Monitoring' },
    { id: 'test' as TabType, label: 'Test', icon: '🧪', group: 'Tools' },
    { id: 'benchmark' as TabType, label: 'Benchmark', icon: '🏆', group: 'Tools' },
    { id: 'cost' as TabType, label: 'Cost Calc', icon: '💰', group: 'Tools' },
    { id: 'abtest' as TabType, label: 'A/B Test', icon: '🔬', group: 'Tools' },
    { id: 'marketplace' as TabType, label: 'Marketplace', icon: '🏪', group: 'Community' },
    { id: 'admin' as TabType, label: 'Admin', icon: '⚙️', group: 'System' },
  ];

  const groups = [...new Set(tabs.map(t => t.group))];

  const tabContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'providers': return <Providers />;
      case 'models': return <Models />;
      case 'cascade': return <Cascade />;
      case 'analytics': return <Analytics />;
      case 'auth': return <Auth />;
      case 'test': return <Test />;
      case 'benchmark': return <Benchmark />;
      case 'cost': return <CostCalculator />;
      case 'abtest': return <ABTest />;
      case 'marketplace': return <Marketplace />;
      case 'admin': return <Admin />;
    }
  };

  return (
    <AuthWrapper>
      <div className="flex h-screen bg-surface-950 overflow-hidden">
        {/* Sidebar */}
        <aside className={`${sidebarCollapsed ? 'w-16' : 'w-56'} flex-shrink-0 bg-surface-900 border-r border-white/5 flex flex-col transition-all duration-300 ease-out`}>
          {/* Brand */}
          <div className={`flex items-center h-14 border-b border-white/5 px-4 ${sidebarCollapsed ? 'justify-center' : ''}`}>
            {sidebarCollapsed ? (
              <span className="text-xl font-bold gradient-text">C</span>
            ) : (
              <div>
                <h1 className="text-sm font-bold gradient-text tracking-tight">Cascade Master</h1>
                <p className="text-[10px] text-surface-500 tracking-wide uppercase">AI Traffic Controller</p>
              </div>
            )}
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4 scrollbar-none">
            {groups.map(group => (
              <div key={group}>
                {!sidebarCollapsed && (
                  <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-surface-500 mb-1">{group}</p>
                )}
                {tabs.filter(t => t.group === group).map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : 'space-x-3'} px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                      activeTab === tab.id
                        ? 'bg-accent-500/10 text-accent-400 shadow-[inset_2px_0_0_theme(colors.accent.500)]'
                        : 'text-surface-400 hover:text-surface-200 hover:bg-white/5'
                    }`}
                    title={sidebarCollapsed ? tab.label : undefined}
                  >
                    <span className="text-base flex-shrink-0">{tab.icon}</span>
                    {!sidebarCollapsed && <span className="truncate">{tab.label}</span>}
                  </button>
                ))}
              </div>
            ))}
          </nav>

          {/* Bottom */}
          <div className="border-t border-white/5 p-3 space-y-2">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="w-full flex items-center justify-center px-3 py-2 rounded-lg text-sm text-surface-400 hover:text-surface-200 hover:bg-white/5 transition-colors"
              title={sidebarCollapsed ? 'Expand' : 'Collapse'}
            >
              {sidebarCollapsed ? '→' : '← Collapse'}
            </button>
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center px-3 py-2 rounded-lg text-sm text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
            >
              {sidebarCollapsed ? '⏻' : '⏻ Logout'}
            </button>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-y-auto">
          {/* Top bar */}
          <div className="sticky top-0 z-10 bg-surface-950/80 backdrop-blur-xl border-b border-white/5">
            <div className="flex items-center justify-between px-6 h-14">
              <div className="flex items-center space-x-3">
                <h2 className="text-lg font-semibold text-surface-200 capitalize">{activeTab}</h2>
                <span className="text-lg">{tabIcons[activeTab]}</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2 text-xs text-surface-500">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span>Live</span>
                </div>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 animate-fadeIn" key={activeTab}>
            {tabContent()}
          </div>
        </main>
      </div>
    </AuthWrapper>
  );
}