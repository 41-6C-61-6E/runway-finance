'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { SyncSummary } from '@/components/accounts/sync-summary';
import { SyncLogs } from '@/components/accounts/sync-logs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function AccountsPage() {
  const { data: session } = useSession();
  const [connections, setConnections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    const fetchConnections = async () => {
      if (!session?.user) return;
      
      try {
        const response = await fetch('/api/connections');
        if (!response.ok) {
          throw new Error('Failed to fetch connections');
        }
        const data = await response.json();
        setConnections(data.connections || []);
      } catch (err) {
        console.error('Failed to fetch connections:', err);
        setError('Failed to load connections');
      } finally {
        setLoading(false);
      }
    };

    fetchConnections();
  }, [session?.user]);

  const handleSync = async (connectionId: string) => {
    try {
      const response = await fetch(`/api/connections/simplefin/${connectionId}/sync`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        throw new Error('Failed to sync');
      }
      
      // Refresh connections after sync
      const refreshResponse = await fetch('/api/connections');
      if (refreshResponse.ok) {
        const data = await refreshResponse.json();
        setConnections(data.connections || []);
      }
    } catch (err) {
      console.error('Sync failed:', err);
    }
  };

  // Fetch logs for a specific connection
  const fetchLogs = async (connectionId: string) => {
    try {
      const response = await fetch(`/api/connections/simplefin/${connectionId}/logs`);
      if (!response.ok) {
        throw new Error('Failed to fetch logs');
      }
      const data = await response.json();
      setLogs(data.logs || []);
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen p-6">
        <div className="max-w-4xl mx-auto">
          <Skeleton className="h-8 w-48 mb-6" />
          <div className="space-y-4">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen p-6">
        <div className="max-w-4xl mx-auto">
          <Card>
            <CardContent className="p-6">
              <p className="text-destructive">{error}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-foreground mb-6">Accounts</h1>
        
        {connections.length === 0 ? (
          <Card>
            <CardContent className="p-6">
              <p className="text-muted-foreground">No connections found. Add a connection to start managing your accounts.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {connections.map((connection) => (
              <div key={connection.id} className="space-y-4">
                <SyncSummary 
                  connection={connection} 
                  onSync={() => handleSync(connection.id)} 
                  showSyncButton={true} 
                  compact={false} 
                />
                
                <SyncLogs logs={logs} loading={false} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}