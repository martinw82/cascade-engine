export default function Home() {
  return (
    <main className="min-h-screen bg-neutral-900 text-neutral-100 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Cascade Master</h1>
        <p className="mb-8">
          Universal AI Traffic Controller - Maximize free-tier LLM usage through
          intelligent routing and real-time monitoring.
        </p>
        
        <div className="grid gap-6 md:grid-cols-2">
          <div className="bg-neutral-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">API Gateway Status</h2>
            <div id="api-status" className="space-y-2">
              <div className="flex justify-between">
                <span>Server:</span>
                <span id="server-status" className="text-green-400">Online</span>
              </div>
              <div className="flex justify-between">
                <span>Port:</span>
                <span id="port-status">3000</span>
              </div>
              <div className="flex justify-between">
                <span>Uptime:</span>
                <span id="uptime">00:00:00</span>
              </div>
            </div>
          </div>
          
          <div className="bg-neutral-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Quick Stats</h2>
            <div id="quick-stats" className="space-y-2">
              <div className="flex justify-between">
                <span>Requests Today:</span>
                <span id="requests-today">0</span>
              </div>
              <div className="flex justify-between">
                <span>Success Rate:</span>
                <span id="success-rate">100%</span>
              </div>
              <div className="flex justify-between">
                <span>Estimated Savings:</span>
                <span id="estimated-savings">$0.00</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="mt-8 bg-neutral-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Live Log Feed</h2>
          <div id="log-feed" className="h-64 overflow-y-auto bg-neutral-900 rounded p-4 mb-4">
            <div className="text-neutral-400 text-sm">Waiting for requests...</div>
          </div>
          <button 
            id="clear-logs"
            className="px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-sm rounded"
          >
            Clear Logs
          </button>
        </div>
      </div>
    </main>
  );
}
