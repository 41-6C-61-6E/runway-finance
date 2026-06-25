'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useUserSettings } from '@/components/user-settings-provider';
import { Bell, BellOff, Info, AlertTriangle, Play } from 'lucide-react';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function NotificationsTab() {
  const settingsContext = useUserSettings();
  const settings = settingsContext?.settings || {};
  const updateSetting = settingsContext?.updateSetting;

  const [isSupported, setIsSupported] = useState(true);
  const [isSWActive, setIsSWActive] = useState(true);
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [checkingSubscription, setCheckingSubscription] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [testingNotification, setTestingNotification] = useState(false);

  // Read preferences from DB settings
  const notifySyncErrors = settings.notifySyncErrors !== false;
  const notifyBudgetAlerts = settings.notifyBudgetAlerts !== false;
  const notifyLargeTransactions = settings.notifyLargeTransactions !== false;
  const largeTransactionThreshold = settings.largeTransactionThreshold ?? 500;
  const notifyMonthlySummary = settings.notifyMonthlySummary !== false;
  const budgetAlertThreshold = settings.budgetAlertThreshold ?? 80;
  const notifyGoalMilestones = settings.notifyGoalMilestones !== false;
  const notifyNetWorthMilestones = settings.notifyNetWorthMilestones !== false;
  const netWorthMilestoneInterval = settings.netWorthMilestoneInterval ?? 100000;
  const notifyAiProposals = settings.notifyAiProposals !== false;
  const maxNotificationsPerPeriod = settings.maxNotificationsPerPeriod ?? 5;
  const notificationLimiterPeriodMinutes = settings.notificationLimiterPeriodMinutes ?? 60;

  const checkDeviceSubscription = async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setIsSupported(false);
      setCheckingSubscription(false);
      return;
    }

    try {
      setPermissionStatus(Notification.permission);
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        setIsSWActive(false);
        setCheckingSubscription(false);
        return;
      }
      setIsSWActive(true);
      const sub = await reg.pushManager.getSubscription();
      setIsSubscribed(!!sub);
    } catch (err) {
      console.error('Error checking device push subscription:', err);
    } finally {
      setCheckingSubscription(false);
    }
  };

  useEffect(() => {
    checkDeviceSubscription();
  }, []);

  const handleToggleSubscription = async () => {
    if (!isSupported) return;

    setSubscribing(true);
    try {
      const reg = await navigator.serviceWorker.ready;

      if (isSubscribed) {
        // Unsubscribe
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
          await fetch('/api/notifications/subscribe', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
        }
        setIsSubscribed(false);
        toast.success('Successfully disabled notifications on this device.');
      } else {
        // Subscribe
        const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!publicKey) {
          toast.error('VAPID public key is not configured in the server environment.');
          setSubscribing(false);
          return;
        }

        // Request permission explicitly
        const permission = await Notification.requestPermission();
        setPermissionStatus(permission);

        if (permission !== 'granted') {
          toast.error('Notification permission denied. Please update your browser settings.');
          setSubscribing(false);
          return;
        }

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });

        await fetch('/api/notifications/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscription: sub.toJSON(),
            userAgent: navigator.userAgent,
          }),
        });

        setIsSubscribed(true);
        toast.success('Successfully enabled notifications on this device!');
      }
    } catch (err: any) {
      console.error('Failed to update push subscription:', err);
      toast.error(err.message || 'Failed to update subscription on this device.');
    } finally {
      setSubscribing(false);
    }
  };

  const handleSendTestNotification = async () => {
    if (!isSubscribed) return;

    setTestingNotification(true);
    try {
      const res = await fetch('/api/notifications/test', {
        method: 'POST',
      });
      if (res.ok) {
        toast.success('Test notification dispatched. It should arrive shortly.');
      } else {
        throw new Error('Server returned an error');
      }
    } catch (err) {
      toast.error('Failed to send test notification.');
    } finally {
      setTestingNotification(false);
    }
  };

  const handleUpdateSetting = async (key: string, value: any) => {
    if (!updateSetting) return;
    try {
      await updateSetting(key, value);
      toast.success('Preference updated successfully.');
    } catch (err) {
      toast.error('Failed to save preference.');
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Device Registration Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Device Subscription
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Enable notifications on this specific browser or installed PWA.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isSWActive ? (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-500 text-sm">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Service Worker Inactive</p>
                <p className="mt-1 opacity-90">
                  No active service worker registration was found. Notifications require an active service worker.
                </p>
                <div className="mt-2.5 text-xs opacity-80 space-y-1.5">
                  <p>
                    By default, service workers are disabled in Next.js development mode to prevent caching issues.
                  </p>
                  <p className="font-semibold">How to resolve and test:</p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>
                      Build and start the application in production mode:
                      <code className="block mt-1 p-1 bg-amber-500/20 rounded font-mono text-amber-600 dark:text-amber-400">
                        pnpm build && pnpm start
                      </code>
                    </li>
                    <li>
                      Or temporarily register service workers in development mode by opening <code className="px-1 bg-amber-500/20 rounded font-mono text-amber-600 dark:text-amber-400">components/pwa-register.tsx</code> and removing the <code className="px-1 bg-amber-500/20 rounded font-mono">process.env.NODE_ENV !== &quot;production&quot;</code> check.
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          ) : !isSupported ? (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-500 text-sm">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Push Notifications Not Supported</p>
                <p className="mt-1 opacity-90">
                  Your browser or operating system does not support the Web Push API. 
                  If you are on iOS, ensure you have added this app to your Home Screen as a PWA first.
                </p>
              </div>
            </div>
          ) : (
            <>
              {permissionStatus === 'denied' && (
                <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
                  <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Permission Denied</p>
                    <p className="mt-1 opacity-90">
                      Notifications are blocked in your browser settings. To enable them, please reset your site permissions in the browser address bar.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg border bg-muted/30">
                <div className="space-y-1">
                  <p className="font-semibold text-sm">
                    {checkingSubscription ? 'Checking status...' : isSubscribed ? 'Subscribed' : 'Not Subscribed'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isSubscribed 
                      ? 'This device is registered to receive background push alerts.' 
                      : 'Enable to register this browser/device for notification delivery.'}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {isSubscribed && (
                    <Button 
                      variant="outline"
                      size="sm" 
                      onClick={handleSendTestNotification} 
                      disabled={testingNotification || subscribing}
                    >
                      <Play className="h-3.5 w-3.5 mr-1.5" />
                      Send Test
                    </Button>
                  )}
                  <Button
                    variant={isSubscribed ? 'destructive' : 'default'}
                    size="sm"
                    onClick={handleToggleSubscription}
                    disabled={subscribing || checkingSubscription}
                  >
                    {subscribing ? 'Processing...' : isSubscribed ? 'Disable' : 'Enable'}
                  </Button>
                </div>
              </div>
            </>
          )}

          <div className="flex items-start gap-2.5 text-xs text-muted-foreground p-3 rounded border border-dashed bg-muted/10">
            <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <p>
              Runway Finance uses W3C standard Web Push. All alert payloads are fully encrypted 
              locally on the device before transmission through third-party hubs (Apple APNs / Google FCM), 
              ensuring your financial privacy remains 100% secure.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Alert Settings Preferences Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BellOff className="h-5 w-5 text-primary" />
            Alert Preferences
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Configure which events trigger push notifications.
          </p>
        </CardHeader>
        <CardContent className="divide-y border-t select-none">
          {/* Sync Errors Toggle */}
          <div className="flex items-center justify-between py-4">
            <div className="space-y-1 pr-4">
              <Label htmlFor="notify-sync" className="font-medium text-sm">Account Sync Issues</Label>
              <p className="text-xs text-muted-foreground">
                Receive notifications when Plaid, RentCast, or background synchronization jobs encounter credential expirations or execution errors.
              </p>
            </div>
            <Switch
              id="notify-sync"
              checked={notifySyncErrors}
              onCheckedChange={(checked) => handleUpdateSetting('notifySyncErrors', checked)}
            />
          </div>

          {/* Budget Alerts Toggle & Warning Threshold Input */}
          <div className="py-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-1 pr-4">
                <Label htmlFor="notify-budget" className="font-medium text-sm">Budget Limit Alerts</Label>
                <p className="text-xs text-muted-foreground">
                  Receive alerts when spending exceeds warning threshold and 100% of your allocated monthly budget.
                </p>
              </div>
              <Switch
                id="notify-budget"
                checked={notifyBudgetAlerts}
                onCheckedChange={(checked) => handleUpdateSetting('notifyBudgetAlerts', checked)}
              />
            </div>
            {notifyBudgetAlerts && (
              <div className="flex items-center gap-3 pl-4 max-w-sm">
                <Label htmlFor="budget-threshold" className="text-xs text-muted-foreground whitespace-nowrap">
                  Warning threshold (%)
                </Label>
                <Input
                  id="budget-threshold"
                  type="number"
                  min="1"
                  max="100"
                  value={budgetAlertThreshold}
                  onChange={(e) => handleUpdateSetting('budgetAlertThreshold', parseInt(e.target.value) || 0)}
                  className="h-8 max-w-[120px]"
                />
              </div>
            )}
          </div>

          {/* Large Transactions Toggle & Input */}
          <div className="py-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-1 pr-4">
                <Label htmlFor="notify-large" className="font-medium text-sm">Large Transaction Alerts</Label>
                <p className="text-xs text-muted-foreground">
                  Receive alerts when a newly imported transaction exceeds a specific currency limit.
                </p>
              </div>
              <Switch
                id="notify-large"
                checked={notifyLargeTransactions}
                onCheckedChange={(checked) => handleUpdateSetting('notifyLargeTransactions', checked)}
              />
            </div>
            {notifyLargeTransactions && (
              <div className="flex items-center gap-3 pl-4 max-w-sm">
                <Label htmlFor="large-threshold" className="text-xs text-muted-foreground whitespace-nowrap">
                  Alert threshold amount ($)
                </Label>
                <Input
                  id="large-threshold"
                  type="number"
                  min="0"
                  value={largeTransactionThreshold}
                  onChange={(e) => handleUpdateSetting('largeTransactionThreshold', parseFloat(e.target.value) || 0)}
                  className="h-8 max-w-[120px]"
                />
              </div>
            )}
          </div>

          {/* Goal Milestones Toggle */}
          <div className="flex items-center justify-between py-4">
            <div className="space-y-1 pr-4">
              <Label htmlFor="notify-goal-milestones" className="font-medium text-sm">Savings Goal Completed</Label>
              <p className="text-xs text-muted-foreground">
                Receive notifications when a savings goal becomes 100% funded.
              </p>
            </div>
            <Switch
              id="notify-goal-milestones"
              checked={notifyGoalMilestones}
              onCheckedChange={(checked) => handleUpdateSetting('notifyGoalMilestones', checked)}
            />
          </div>

          {/* Net Worth Milestones Toggle & Input */}
          <div className="py-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-1 pr-4">
                <Label htmlFor="notify-networth-milestones" className="font-medium text-sm">Net Worth Milestones</Label>
                <p className="text-xs text-muted-foreground">
                  Receive congratulatory alerts when your net worth crosses intervals of a set amount.
                </p>
              </div>
              <Switch
                id="notify-networth-milestones"
                checked={notifyNetWorthMilestones}
                onCheckedChange={(checked) => handleUpdateSetting('notifyNetWorthMilestones', checked)}
              />
            </div>
            {notifyNetWorthMilestones && (
              <div className="flex items-center gap-3 pl-4 max-w-sm">
                <Label htmlFor="networth-interval" className="text-xs text-muted-foreground whitespace-nowrap">
                  Milestone interval ($)
                </Label>
                <Input
                  id="networth-interval"
                  type="number"
                  min="1000"
                  value={netWorthMilestoneInterval}
                  onChange={(e) => handleUpdateSetting('netWorthMilestoneInterval', parseInt(e.target.value) || 0)}
                  className="h-8 max-w-[120px]"
                />
              </div>
            )}
          </div>

          {/* AI Proposals Toggle */}
          <div className="flex items-center justify-between py-4">
            <div className="space-y-1 pr-4">
              <Label htmlFor="notify-ai-proposals" className="font-medium text-sm">AI Proposal Recommendations</Label>
              <p className="text-xs text-muted-foreground">
                Receive notifications when background transaction auto-categorization finishes and suggestions are ready.
              </p>
            </div>
            <Switch
              id="notify-ai-proposals"
              checked={notifyAiProposals}
              onCheckedChange={(checked) => handleUpdateSetting('notifyAiProposals', checked)}
            />
          </div>

          {/* Monthly Finance Summary Toggle */}
          <div className="flex items-center justify-between py-4">
            <div className="space-y-1 pr-4">
              <Label htmlFor="notify-monthly" className="font-medium text-sm">Monthly Summary Report</Label>
              <p className="text-xs text-muted-foreground">
                Receive a monthly financial health update containing net worth changes and monthly balance breakdowns.
              </p>
            </div>
            <Switch
              id="notify-monthly"
              checked={notifyMonthlySummary}
              onCheckedChange={(checked) => handleUpdateSetting('notifyMonthlySummary', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Rate Limiter Configuration Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Rate Limiter Configuration
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Configure sliding-window rate limiting to prevent notifications from spamming your devices.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 space-y-2">
              <Label htmlFor="max-notifications" className="text-sm font-medium">Max alerts allowed</Label>
              <Input
                id="max-notifications"
                type="number"
                min="1"
                value={maxNotificationsPerPeriod}
                onChange={(e) => handleUpdateSetting('maxNotificationsPerPeriod', parseInt(e.target.value) || 1)}
                className="max-w-xs"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Maximum number of push notifications to dispatch during the time window.
              </p>
            </div>
            
            <div className="flex-1 space-y-2">
              <Label htmlFor="limiter-period" className="text-sm font-medium">Time window size (minutes)</Label>
              <Input
                id="limiter-period"
                type="number"
                min="1"
                value={notificationLimiterPeriodMinutes}
                onChange={(e) => handleUpdateSetting('notificationLimiterPeriodMinutes', parseInt(e.target.value) || 1)}
                className="max-w-xs"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Duration of the sliding window in minutes.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
