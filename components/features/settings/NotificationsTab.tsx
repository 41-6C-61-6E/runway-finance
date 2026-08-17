'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AppTabs } from '@/components/ui/app-tabs';
import { toast } from 'sonner';

import { useUserSettings } from '@/components/user-settings-provider';
import { Bell, BellOff, AlertTriangle, Play, Trash2 } from 'lucide-react';
import type { AlertCondition, AlertConditionField, ConditionOperator, ConditionTreeNode } from '@/lib/db/schema/notifications';
import CustomAlertRuleList from './CustomAlertRuleList';

function urlBase64ToUint8Array(base64String: string) {
  let cleanStr = base64String.trim();
  if ((cleanStr.startsWith('"') && cleanStr.endsWith('"')) || (cleanStr.startsWith("'") && cleanStr.endsWith("'"))) {
    cleanStr = cleanStr.slice(1, -1);
  }
  const padding = '='.repeat((4 - (cleanStr.length % 4)) % 4);
  const base64 = (cleanStr + padding).replace(/\-/g, '+').replace(/_/g, '/');
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
  const [serverPublicKey, setServerPublicKey] = useState<string | null>(null);

  const [accountsList, setAccountsList] = useState<any[]>([]);
  const [goalsList, setGoalsList] = useState<any[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<'subscriptions' | 'alerts' | 'custom'>('subscriptions');

  // Read preferences from DB settings
  const notifySyncErrors = settings.notifySyncErrors !== false;
  const notifyBudgetAlerts = settings.notifyBudgetAlerts !== false;
  const notifyLargeTransactions = settings.notifyLargeTransactions !== false;
  const largeTransactionThreshold = settings.largeTransactionThreshold ?? 100;
  const notifyMonthlySummary = settings.notifyMonthlySummary !== false;
  const budgetAlertThreshold = settings.budgetAlertThreshold ?? 80;
  const notifyGoalMilestones = settings.notifyGoalMilestones !== false;
  const notifyNetWorthMilestones = settings.notifyNetWorthMilestones !== false;
  const netWorthMilestoneInterval = settings.netWorthMilestoneInterval ?? 100000;
  const notifyWeeklyNetWorthChange = settings.notifyWeeklyNetWorthChange !== false;
  const weeklyNetWorthAlertDay = (settings.weeklyNetWorthAlertDay as string) || 'sunday';
  const userTimezone = (settings.timezone as string) || 'America/New_York';
  const notifyAiProposals = settings.notifyAiProposals !== false;
  const notifyRecurringPriceChanges = settings.notifyRecurringPriceChanges !== false;
  const notifyUpcomingBills = settings.notifyUpcomingBills ?? false;
  const upcomingBillsLeadDays = settings.upcomingBillsLeadDays ?? 3;
  const maxNotificationsPerPeriod = settings.maxNotificationsPerPeriod ?? 5;
  const notificationLimiterPeriodMinutes = settings.notificationLimiterPeriodMinutes ?? 60;

  const [leadDaysDraft, setLeadDaysDraft] = useState<string>(String(upcomingBillsLeadDays));

  useEffect(() => {
    setLeadDaysDraft(String(upcomingBillsLeadDays));
  }, [upcomingBillsLeadDays]);

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
      if (sub && Notification.permission === 'granted') {
        fetch('/api/notifications/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscription: sub.toJSON(),
            userAgent: navigator.userAgent,
          }),
        }).catch((e) => console.warn('Auto-sync of push subscription failed:', e));
      }
    } catch (err) {
      console.error('Error checking device push subscription:', err);
    } finally {
      setCheckingSubscription(false);
    }
  };


  useEffect(() => {
    checkDeviceSubscription();

    fetch('/api/notifications/subscribe')
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error('Failed to fetch subscription config');
      })
      .then((data) => {
        if (data.publicKey) {
          setServerPublicKey(data.publicKey);
        }
      })
      .catch((err) => {
        console.error('Error fetching VAPID public key from server:', err);
      });

    fetchAccountsAndGoals();
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
        const publicKey = serverPublicKey || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
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

        const res = await fetch('/api/notifications/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscription: sub.toJSON(),
            userAgent: navigator.userAgent,
          }),
        });

        if (!res.ok) {
          // Subscription was created in the browser but failed to save server-side
          await sub.unsubscribe();
          throw new Error('Failed to save subscription to the server. Please try again.');
        }

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
        const data = await res.json();
        if (data.success) {
          toast.success('Test notification dispatched. It should arrive shortly.');
          try {
            const bc = new BroadcastChannel('notification-updates');
            bc.postMessage({ type: 'REFRESH' });
            bc.close();
          } catch (e) {
            console.warn('BroadcastChannel failed to post message:', e);
          }
        } else {
          toast.warning(data.reason || 'Notification was not sent. Check server configuration.');
        }
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

  const commitLeadDays = () => {
    const parsed = parseInt(leadDaysDraft, 10);
    if (Number.isNaN(parsed) || parsed < 1 || parsed > 14) {
      setLeadDaysDraft(String(upcomingBillsLeadDays));
    } else if (parsed !== upcomingBillsLeadDays) {
      handleUpdateSetting('upcomingBillsLeadDays', parsed);
      setLeadDaysDraft(String(parsed));
    } else {
      setLeadDaysDraft(String(parsed));
    }
  };

  const fetchAccountsAndGoals = async () => {
    try {
      const [accRes, goalRes] = await Promise.all([
        fetch('/api/accounts?includeHidden=true'),
        fetch('/api/financial-goals'),
      ]);
      if (accRes.ok) {
        const data = await accRes.json();
        setAccountsList(Array.isArray(data) ? data : []);
      }
      if (goalRes.ok) {
        const data = await goalRes.json();
        setGoalsList(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error fetching accounts or goals:', err);
    }
  };
  return (
    <div className="space-y-6 max-w-4xl">
      {/* Segmented Sub-Tab Switcher */}
      <AppTabs
        tabs={[
          { id: 'subscriptions', label: 'Subscriptions' },
          { id: 'alerts', label: 'Alerts' },
          { id: 'custom', label: 'Custom' },
        ]}
        activeTab={activeSubTab}
        onChange={(tab) => setActiveSubTab(tab as any)}
        fullWidth
        size="sm"
        className="mb-6"
      />


      {/* ── Subscriptions Tab ─────────────────────────────────────────────────── */}
      {activeSubTab === 'subscriptions' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div>
            <h2 className="text-base font-semibold text-foreground mb-1 flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              Device Subscription
            </h2>
            <p className="text-xs text-muted-foreground">
              Enable notifications on this specific browser or installed PWA.
            </p>
          </div>

          <div className="space-y-4">
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

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-border bg-muted/30">
                  <div className="space-y-1">
                    <span className="text-sm font-semibold text-foreground">
                      {checkingSubscription ? 'Checking status...' : isSubscribed ? 'Subscribed' : 'Not Subscribed'}
                    </span>
                    <p className="text-xs text-muted-foreground mt-0.5">
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
          </div>
        </div>
      )}

      {/* ── Alerts Tab ────────────────────────────────────────────────────────── */}
      {activeSubTab === 'alerts' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div>
            <h2 className="text-base font-semibold text-foreground mb-1 flex items-center gap-2">
              <BellOff className="h-5 w-5 text-primary" />
              Alert Preferences
            </h2>
            <p className="text-xs text-muted-foreground">
              Configure which events trigger push notifications.
            </p>
          </div>

          <div className="border border-border rounded-xl bg-muted/30 divide-y divide-border/50 select-none px-4">
            {/* Sync Errors Toggle */}
            <div className="flex items-center justify-between py-4">
              <div className="space-y-1 pr-4">
                <Label htmlFor="notify-sync" className="font-medium text-sm text-foreground cursor-pointer">Account Sync Issues</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Receive notifications when Plaid, Redfin, or background synchronization jobs encounter credential expirations or execution errors.
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
                  <Label htmlFor="notify-budget" className="font-medium text-sm text-foreground cursor-pointer">Budget Limit Alerts</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
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

            {/* Transaction Alerts Toggle & Input */}
            <div className="py-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-1 pr-4">
                  <Label htmlFor="notify-large" className="font-medium text-sm text-foreground cursor-pointer">Transaction Alerts</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Receive alerts when a newly imported transaction exceeds a specific threshold.
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
                <Label htmlFor="notify-goal-milestones" className="font-medium text-sm text-foreground cursor-pointer">Savings Goal Completed</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
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
                  <Label htmlFor="notify-networth-milestones" className="font-medium text-sm text-foreground cursor-pointer">Net Worth Milestones</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
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


            {/* Weekly Net Worth Change Toggle */}
            <div className="flex items-center justify-between py-4">
              <div className="space-y-1 pr-4">
                <Label htmlFor="notify-weekly-networth" className="font-medium text-sm text-foreground cursor-pointer">Weekly Net Worth Change Alert</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Receive an alert on your chosen day of the week with net worth changes over the past 7 days.
                </p>
              </div>
              <Switch
                id="notify-weekly-networth"
                checked={notifyWeeklyNetWorthChange}
                onCheckedChange={(checked) => handleUpdateSetting('notifyWeeklyNetWorthChange', checked)}
              />
            </div>
            {notifyWeeklyNetWorthChange && (
              <div className="flex flex-col gap-1.5 pl-1 -mt-2 pb-2">
                <div className="flex items-center gap-3">
                  <Label htmlFor="weekly-networth-day" className="text-xs text-muted-foreground whitespace-nowrap">Alert day</Label>
                  <select
                    id="weekly-networth-day"
                    value={weeklyNetWorthAlertDay}
                    onChange={(e) => handleUpdateSetting('weeklyNetWorthAlertDay', e.target.value)}
                    className="h-8 text-xs bg-background border border-input rounded-md px-2 py-1 font-medium text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring capitalize"
                  >
                    <option value="sunday">Sunday</option>
                    <option value="monday">Monday</option>
                    <option value="tuesday">Tuesday</option>
                    <option value="wednesday">Wednesday</option>
                    <option value="thursday">Thursday</option>
                    <option value="friday">Friday</option>
                    <option value="saturday">Saturday</option>
                  </select>
                  <span className="text-xs text-muted-foreground">
                    Sent weekly on this day (<span className="font-mono">{userTimezone}</span>)
                  </span>
                </div>
              </div>
            )}

            {/* AI Proposals Toggle */}
            <div className="flex items-center justify-between py-4">
              <div className="space-y-1 pr-4">
                <Label htmlFor="notify-ai-proposals" className="font-medium text-sm text-foreground cursor-pointer">AI Proposal Recommendations</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Receive notifications when background transaction auto-categorization finishes and suggestions are ready.
                </p>
              </div>
              <Switch
                id="notify-ai-proposals"
                checked={notifyAiProposals}
                onCheckedChange={(checked) => handleUpdateSetting('notifyAiProposals', checked)}
              />
            </div>

            {/* Recurring Subscription Price Increases */}
            <div className="flex items-center justify-between py-4">
              <div className="space-y-1 pr-4">
                <Label htmlFor="notify-recurring-price" className="font-medium text-sm text-foreground cursor-pointer">Subscription Price Increase Alerts</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Receive an alert whenever a recurring subscription charge increases by more than 5%.
                </p>
              </div>
              <Switch
                id="notify-recurring-price"
                checked={notifyRecurringPriceChanges}
                onCheckedChange={(checked) => handleUpdateSetting('notifyRecurringPriceChanges', checked)}
              />
            </div>

            {/* Upcoming Bills Reminders */}
            <div className="py-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-1 pr-4">
                  <Label htmlFor="notify-upcoming-bills" className="font-medium text-sm text-foreground cursor-pointer">Upcoming Bill Reminders</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Receive reminders when recurring bills are due within a set number of days.
                  </p>
                </div>
                <Switch
                  id="notify-upcoming-bills"
                  checked={notifyUpcomingBills}
                  onCheckedChange={(checked) => handleUpdateSetting('notifyUpcomingBills', checked)}
                />
              </div>
              {notifyUpcomingBills && (
                <div className="flex items-center gap-3 pl-4 max-w-sm">
                  <Label htmlFor="upcoming-lead-days" className="text-xs text-muted-foreground whitespace-nowrap">
                    Lead time (days before due date)
                  </Label>
                  <Input
                    id="upcoming-lead-days"
                    type="number"
                    min="1"
                    max="14"
                    value={leadDaysDraft}
                    onChange={(e) => setLeadDaysDraft(e.target.value)}
                    onBlur={commitLeadDays}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        commitLeadDays();
                      }
                    }}
                    className="h-8 max-w-[100px]"
                  />
                </div>
              )}
            </div>


            {/* Monthly Finance Summary Toggle */}
            <div className="flex items-center justify-between py-4">
              <div className="space-y-1 pr-4">
                <Label htmlFor="notify-monthly" className="font-medium text-sm text-foreground cursor-pointer">Monthly Summary Report</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Receive a monthly financial health update containing net worth changes and monthly balance breakdowns.
                </p>
              </div>
              <Switch
                id="notify-monthly"
                checked={notifyMonthlySummary}
                onCheckedChange={(checked) => handleUpdateSetting('notifyMonthlySummary', checked)}
              />
            </div>
          </div>

          {/* Rate Limiter Section */}
          <div className="space-y-4 pt-4 border-t border-border/40">
            <div>
              <h2 className="text-base font-semibold text-foreground mb-1 flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" />
                Rate Limiter Configuration
              </h2>
              <p className="text-xs text-muted-foreground">
                Configure sliding-window rate limiting to prevent notifications from spamming your devices.
              </p>
            </div>

            <div className="p-4 border border-border rounded-xl bg-muted/30">
              <div className="flex flex-col sm:flex-row gap-6">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="max-notifications" className="text-xs font-semibold text-foreground">Max alerts allowed</Label>
                  <Input
                    id="max-notifications"
                    type="number"
                    min="1"
                    value={maxNotificationsPerPeriod}
                    onChange={(e) => handleUpdateSetting('maxNotificationsPerPeriod', parseInt(e.target.value) || 1)}
                    className="max-w-xs h-9 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Maximum number of push notifications to dispatch during the time window.
                  </p>
                </div>
                
                <div className="flex-1 space-y-2">
                  <Label htmlFor="limiter-period" className="text-xs font-semibold text-foreground">Time window size (minutes)</Label>
                  <Input
                    id="limiter-period"
                    type="number"
                    min="1"
                    value={notificationLimiterPeriodMinutes}
                    onChange={(e) => handleUpdateSetting('notificationLimiterPeriodMinutes', parseInt(e.target.value) || 1)}
                    className="max-w-xs h-9 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Duration of the sliding window in minutes.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Custom Tab ─────────────────────────────────────────────────────────── */}
      {activeSubTab === 'custom' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div>
            <h2 className="text-base font-semibold text-foreground mb-1 flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              Custom Event Alerts
            </h2>
            <p className="text-xs text-muted-foreground">
              Define your own rules and triggers for transactions, account balances, savings goals, and cash flow.
            </p>
          </div>

          <CustomAlertRuleList
            accountsList={accountsList}
            goalsList={goalsList}
          />
        </div>
      )}
    </div>
  );
}
