'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SettingsPage() {
  const router = useRouter();
  const [setupToken, setSetupToken] = useState('');
  const [label, setLabel] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleAddConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          setupToken: setupToken.trim(),
          label: label.trim() || 'Primary',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to add connection');
      }

      setSuccess('Connection added successfully!');
      setSetupToken('');
      setLabel('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full relative overflow-hidden">
      {/* Animated gradient background */}
      <div
        className="absolute inset-0 z-0 opacity-40 dark:opacity-20"
        style={{
          backgroundImage: `
            radial-gradient(ellipse at 20% 30%, rgba(59, 130, 246, 0.5) 0%, transparent 60%),
            radial-gradient(ellipse at 80% 70%, rgba(168, 85, 247, 0.4) 0%, transparent 70%),
            radial-gradient(ellipse at 60% 20%, rgba(236, 72, 153, 0.3) 0%, transparent 50%),
            radial-gradient(ellipse at 40% 80%, rgba(34, 197, 94, 0.3) 0%, transparent 65%)
          `,
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center mt-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl w-full space-y-8">
          {/* Heading */}
          <div className="text-center space-y-4">
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
              <span className="bg-linear-to-r from-blue-600 via-purple-600 to-pink-600 dark:from-blue-400 dark:via-purple-400 dark:to-pink-400 bg-clip-text text-transparent">
                Settings
              </span>
            </h1>
            <p className="text-gray-400 dark:text-gray-500">
              Manage your SimpleFIN connections and account settings
            </p>
          </div>

          {/* Add Connection Form */}
          <div className="p-6 bg-white/5 dark:bg-white/5 backdrop-blur-sm rounded-xl border border-white/10">
            <h2 className="text-xl font-semibold text-white mb-4">Add SimpleFIN Connection</h2>
            <form onSubmit={handleAddConnection} className="space-y-4">
              <div>
                <label htmlFor="setupToken" className="block text-sm font-medium text-gray-300 mb-1">
                  Setup Token
                </label>
                <input
                  id="setupToken"
                  type="text"
                  value={setupToken}
                  onChange={(e) => setSetupToken(e.target.value)}
                  placeholder="Paste your SimpleFIN setup token here..."
                  className="w-full px-4 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label htmlFor="label" className="block text-sm font-medium text-gray-300 mb-1">
                  Label (optional)
                </label>
                <input
                  id="label"
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g., My Bank"
                  className="w-full px-4 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full px-6 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-md hover:shadow-lg transition-all duration-200"
              >
                {loading ? 'Adding...' : 'Add Connection'}
              </button>
            </form>

            {error && (
              <div className="mt-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {success && (
              <div className="mt-4 p-3 bg-green-500/20 border border-green-500/30 rounded-lg">
                <p className="text-green-400 text-sm">{success}</p>
              </div>
            )}
          </div>

          {/* Existing Connections */}
          <ExistingConnections />
        </div>
      </div>
    </div>
  );
}

function ExistingConnections() {
  const [connections, setConnections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useState(() => {
    fetch('/api/connections', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        setConnections(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  });

  if (loading) {
    return (
      <div className="p-6 bg-white/5 dark:bg-white/5 backdrop-blur-sm rounded-xl border border-white/10">
        <h2 className="text-xl font-semibold text-white mb-4">Existing Connections</h2>
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (connections.length === 0) {
    return null;
  }

  return (
    <div className="p-6 bg-white/5 dark:bg-white/5 backdrop-blur-sm rounded-xl border border-white/10">
      <h2 className="text-xl font-semibold text-white mb-4">Existing Connections</h2>
      <div className="space-y-3">
        {connections.map((conn) => (
          <div
            key={conn.id}
            className="p-4 bg-white/5 border border-white/10 rounded-lg flex items-center justify-between"
          >
            <div>
              <div className="text-white font-medium">{conn.label}</div>
              <div className="text-sm text-gray-400">
                Last sync: {conn.lastSyncAt ? new Date(conn.lastSyncAt).toLocaleString() : 'Never'}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`px-2 py-1 text-xs rounded-full ${
                  conn.lastSyncStatus === 'ok'
                    ? 'bg-green-500/20 text-green-400'
                    : conn.lastSyncStatus === 'error'
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-gray-500/20 text-gray-400'
                }`}
              >
                {conn.lastSyncStatus}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
