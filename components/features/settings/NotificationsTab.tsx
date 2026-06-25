'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useUserSettings } from '@/components/user-settings-provider';
import { Bell, BellOff, Info, AlertTriangle, Play, Trash2 } from 'lucide-react';
import type { AlertCondition, AlertConditionField, ConditionOperator } from '@/lib/db/schema/notifications';

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

  const [customRules, setCustomRules] = useState<any[]>([]);
  const [loadingRules, setLoadingRules] = useState(true);
  const [accountsList, setAccountsList] = useState<any[]>([]);
  const [goalsList, setGoalsList] = useState<any[]>([]);

  // Form states
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleName, setRuleName] = useState('');
  const [triggerType, setTriggerType] = useState<'transaction' | 'account_balance' | 'savings_goal' | 'cash_flow'>('transaction');

  // Multi-condition states
  const [conditions, setConditions] = useState<AlertCondition[]>([]);
  const [conditionOperator, setConditionOperator] = useState<ConditionOperator>('AND');

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

    fetchCustomRulesData();
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

  const fetchCustomRulesData = async () => {
    try {
      const res = await fetch('/api/notifications/custom-alerts');
      if (res.ok) {
        const data = await res.json();
        setCustomRules(data.rules || []);
      }
    } catch (err) {
      console.error('Error fetching custom rules:', err);
    } finally {
      setLoadingRules(false);
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

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!ruleName.trim()) {
      toast.error('Please enter a name for the rule.');
      return;
    }

    if (conditions.length === 0) {
      toast.error('Please add at least one condition.');
      return;
    }

    const accountFields: AlertConditionField[] = ['account', 'balance_above_account', 'balance_below_account'];
    const goalFields: AlertConditionField[] = ['goal_reached_percentage', 'goal_reached_amount'];

    for (let i = 0; i < conditions.length; i++) {
      const cond = conditions[i];
      if (!cond.field) {
        toast.error(`Condition ${i + 1}: Please select a field.`);
        return;
      }
      if (accountFields.includes(cond.field)) {
        if (!cond.value) {
          toast.error(`Condition ${i + 1}: Please select an account.`);
          return;
        }
      } else if (goalFields.includes(cond.field)) {
        if (!cond.goalId) {
          toast.error(`Condition ${i + 1}: Please select a goal.`);
          return;
        }
        if (cond.value === '' || cond.value === undefined) {
          toast.error(`Condition ${i + 1}: Please enter a value.`);
          return;
        }
      } else {
        if (cond.value === '' || cond.value === undefined) {
          toast.error(`Condition ${i + 1}: Please enter a value.`);
          return;
        }
      }
    }

    try {
      const url = editingRuleId
        ? `/api/notifications/custom-alerts/${editingRuleId}`
        : '/api/notifications/custom-alerts';
      const method = editingRuleId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: ruleName,
          triggerType,
          conditionOperator,
          conditions,
          criteria: {},
        }),
      });

      if (res.ok) {
        toast.success(editingRuleId ? 'Alert rule updated successfully!' : 'Alert rule created successfully!');
        resetForm();
        fetchCustomRulesData();
      } else {
        const errData = await res.json();
        toast.error(errData.error || 'Failed to save alert rule.');
      }
    } catch (err) {
      toast.error('Failed to save alert rule.');
    }
  };

  const convertLegacyCriteriaToConditions = (rule: any): AlertCondition[] => {
    const crit = rule.criteria;
    const result: AlertCondition[] = [];

    if (rule.triggerType === 'transaction') {
      if (crit.accountId) result.push({ field: 'account', value: crit.accountId });
      if (crit.amountMin !== undefined) result.push({ field: 'amount_min', value: crit.amountMin });
      if (crit.amountMax !== undefined) result.push({ field: 'amount_max', value: crit.amountMax });
      if (crit.keyword) result.push({ field: 'keyword', value: crit.keyword });
    } else if (rule.triggerType === 'account_balance') {
      if (crit.operator === 'greater_than') {
        if (crit.compareType === 'account') {
          result.push({ field: 'balance_above_account', value: crit.accountId || '', compareAccountId: crit.compareAccountId });
        } else {
          result.push({ field: 'balance_above_value', value: crit.value ?? 0 });
        }
      } else {
        if (crit.compareType === 'account') {
          result.push({ field: 'balance_below_account', value: crit.accountId || '', compareAccountId: crit.compareAccountId });
        } else {
          result.push({ field: 'balance_below_value', value: crit.value ?? 0 });
        }
      }
    } else if (rule.triggerType === 'savings_goal') {
      if (crit.operator === 'reached_percentage') {
        result.push({ field: 'goal_reached_percentage', value: crit.value ?? 0, goalId: crit.goalId });
      } else {
        result.push({ field: 'goal_reached_amount', value: crit.value ?? 0, goalId: crit.goalId });
      }
    } else if (rule.triggerType === 'cash_flow') {
      const metric = crit.metric || 'net_savings';
      const op = crit.operator || 'less_than';
      let field: AlertConditionField;
      if (metric === 'net_savings') {
        field = op === 'less_than' ? 'cf_net_savings_below' : 'cf_net_savings_above';
      } else {
        field = op === 'less_than' ? 'cf_savings_rate_below' : 'cf_savings_rate_above';
      }
      result.push({ field, value: crit.value ?? 0, consecutiveMonths: crit.consecutiveMonths || 1 });
    }

    return result;
  };

  const handleEditRule = (rule: any) => {
    setEditingRuleId(rule.id);
    setRuleName(rule.name);
    setTriggerType(rule.triggerType);

    if (rule.conditions && rule.conditions.length > 0) {
      setConditions(rule.conditions);
      setConditionOperator(rule.conditionOperator || 'AND');
    } else {
      setConditions(convertLegacyCriteriaToConditions(rule));
      setConditionOperator('AND');
    }

    setShowAddForm(true);
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm('Are you sure you want to delete this custom alert rule?')) return;

    try {
      const res = await fetch(`/api/notifications/custom-alerts/${ruleId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        toast.success('Alert rule deleted successfully.');
        fetchCustomRulesData();
      } else {
        toast.error('Failed to delete alert rule.');
      }
    } catch (err) {
      toast.error('Failed to delete alert rule.');
    }
  };

  const handleToggleRuleEnabled = async (ruleId: string, currentStatus: boolean) => {
    try {
      const res = await fetch(`/api/notifications/custom-alerts/${ruleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isEnabled: !currentStatus }),
      });

      if (res.ok) {
        toast.success(!currentStatus ? 'Alert rule enabled.' : 'Alert rule disabled.');
        fetchCustomRulesData();
      } else {
        toast.error('Failed to toggle alert rule status.');
      }
    } catch (err) {
      toast.error('Failed to toggle alert rule status.');
    }
  };

  const resetForm = () => {
    setShowAddForm(false);
    setEditingRuleId(null);
    setRuleName('');
    setTriggerType('transaction');
    setConditions([]);
    setConditionOperator('AND');
  };

  const getFieldLabel = (field: AlertConditionField): string => {
    const labels: Record<AlertConditionField, string> = {
      account: 'Account',
      amount_min: 'Amount Min ($)',
      amount_max: 'Amount Max ($)',
      keyword: 'Keyword',
      balance_above_value: 'Balance Above Value ($)',
      balance_below_value: 'Balance Below Value ($)',
      balance_above_account: 'Balance Above Account',
      balance_below_account: 'Balance Below Account',
      goal_reached_percentage: 'Goal Reached Percentage (%)',
      goal_reached_amount: 'Goal Reached Amount ($)',
      cf_net_savings_below: 'Net Savings Below ($)',
      cf_net_savings_above: 'Net Savings Above ($)',
      cf_savings_rate_below: 'Savings Rate Below (%)',
      cf_savings_rate_above: 'Savings Rate Above (%)',
    };
    return labels[field] || field;
  };

  const getFieldsForTrigger = (trigger: string): AlertConditionField[] => {
    switch (trigger) {
      case 'transaction':
        return ['account', 'amount_min', 'amount_max', 'keyword'];
      case 'account_balance':
        return ['balance_above_value', 'balance_below_value', 'balance_above_account', 'balance_below_account'];
      case 'savings_goal':
        return ['goal_reached_percentage', 'goal_reached_amount'];
      case 'cash_flow':
        return ['cf_net_savings_below', 'cf_net_savings_above', 'cf_savings_rate_below', 'cf_savings_rate_above'];
      default:
        return [];
    }
  };

  const updateCondition = (index: number, updates: Partial<AlertCondition>) => {
    setConditions((prev) => prev.map((c, i) => (i === index ? { ...c, ...updates } : c)));
  };

  const removeCondition = (index: number) => {
    setConditions((prev) => prev.filter((_, i) => i !== index));
  };

  const addCondition = () => {
    const fields = getFieldsForTrigger(triggerType);
    setConditions((prev) => [...prev, { field: fields[0], value: '' }]);
  };

  const getRuleSummary = (rule: any) => {
    const getAccountName = (id: string) => {
      const acc = accountsList.find((a) => a.id === id);
      return acc ? acc.name : 'Unknown Account';
    };
    const getGoalName = (id: string) => {
      const g = goalsList.find((x) => x.id === id);
      return g ? g.name : 'Unknown Goal';
    };

    // New multi-condition summary
    if (rule.conditions && rule.conditions.length > 0) {
      const op = rule.conditionOperator || 'AND';
      const parts = rule.conditions.map((cond: AlertCondition) => {
        switch (cond.field) {
          case 'account':
            return `Account = ${getAccountName(String(cond.value))}`;
          case 'amount_min':
            return `Amount ≥ $${cond.value}`;
          case 'amount_max':
            return `Amount ≤ $${cond.value}`;
          case 'keyword':
            return `Keyword contains '${cond.value}'`;
          case 'balance_above_value':
            return `Balance rises above $${cond.value}`;
          case 'balance_below_value':
            return `Balance falls below $${cond.value}`;
          case 'balance_above_account':
            return `Balance rises above ${getAccountName(cond.compareAccountId || String(cond.value))}`;
          case 'balance_below_account':
            return `Balance falls below ${getAccountName(cond.compareAccountId || String(cond.value))}`;
          case 'goal_reached_percentage':
            return `Goal "${getGoalName(cond.goalId || '')}" reaches ${cond.value}%`;
          case 'goal_reached_amount':
            return `Goal "${getGoalName(cond.goalId || '')}" reaches $${cond.value}`;
          case 'cf_net_savings_below': {
            const consec = cond.consecutiveMonths && cond.consecutiveMonths > 1 ? ` for ${cond.consecutiveMonths}mo` : '';
            return `Net Savings falls below $${cond.value}${consec}`;
          }
          case 'cf_net_savings_above': {
            const consec = cond.consecutiveMonths && cond.consecutiveMonths > 1 ? ` for ${cond.consecutiveMonths}mo` : '';
            return `Net Savings rises above $${cond.value}${consec}`;
          }
          case 'cf_savings_rate_below': {
            const consec = cond.consecutiveMonths && cond.consecutiveMonths > 1 ? ` for ${cond.consecutiveMonths}mo` : '';
            return `Savings Rate falls below ${cond.value}%${consec}`;
          }
          case 'cf_savings_rate_above': {
            const consec = cond.consecutiveMonths && cond.consecutiveMonths > 1 ? ` for ${cond.consecutiveMonths}mo` : '';
            return `Savings Rate rises above ${cond.value}%${consec}`;
          }
          default:
            return String(cond.value);
        }
      });
      return parts.join(` ${op} `);
    }

    // Legacy criteria summary
    const crit = rule.criteria;
    if (!crit) return 'Unknown Trigger Rule';

    switch (rule.triggerType) {
      case 'transaction': {
        const parts: string[] = [];
        if (crit.accountId) parts.push(`Account: ${getAccountName(crit.accountId)}`);
        if (crit.amountMin !== undefined) parts.push(`Amount ≥ $${crit.amountMin}`);
        if (crit.amountMax !== undefined) parts.push(`Amount ≤ $${crit.amountMax}`);
        if (crit.keyword) parts.push(`Keyword: "${crit.keyword}"`);
        return parts.length > 0 ? parts.join(' AND ') : 'Any transaction';
      }
      case 'account_balance': {
        const accName = getAccountName(crit.accountId);
        const cond = crit.operator === 'less_than' ? 'falls below' : 'rises above';
        if (crit.compareType === 'value') {
          return `${accName} balance ${cond} $${crit.value}`;
        } else {
          return `${accName} balance ${cond} ${getAccountName(crit.compareAccountId)} balance`;
        }
      }
      case 'savings_goal': {
        const gName = getGoalName(crit.goalId);
        if (crit.operator === 'reached_percentage') {
          return `Goal "${gName}" reaches ${crit.value}%`;
        } else {
          return `Goal "${gName}" reaches $${crit.value}`;
        }
      }
      case 'cash_flow': {
        const metricName = crit.metric === 'net_savings' ? 'Net Savings' : 'Savings Rate';
        const cond = crit.operator === 'less_than' ? 'falls below' : 'rises above';
        const formattedVal = crit.metric === 'net_savings' ? `$${crit.value}` : `${crit.value}%`;
        const consec = crit.consecutiveMonths > 1 ? ` for ${crit.consecutiveMonths} consecutive months` : '';
        return `${metricName} ${cond} ${formattedVal}${consec}`;
      }
      default:
        return 'Unknown Trigger Rule';
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Device Registration Status */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-1 flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          Device Subscription
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          Enable notifications on this specific browser or installed PWA.
        </p>
        
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

          <div className="flex items-start gap-2.5 text-xs text-muted-foreground p-3 rounded-lg border border-dashed bg-muted/10">
            <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <p>
              Runway Finance uses W3C standard Web Push. All alert payloads are fully encrypted 
              locally on the device before transmission through third-party hubs (Apple APNs / Google FCM), 
              ensuring your financial privacy remains 100% secure.
            </p>
          </div>
        </div>
      </div>

      {/* Alert Settings Preferences */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-1 flex items-center gap-2">
          <BellOff className="h-5 w-5 text-primary" />
          Alert Preferences
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          Configure which events trigger push notifications.
        </p>

        <div className="border border-border rounded-xl bg-muted/30 divide-y divide-border/50 select-none px-4">
          {/* Sync Errors Toggle */}
          <div className="flex items-center justify-between py-4">
            <div className="space-y-1 pr-4">
              <Label htmlFor="notify-sync" className="font-medium text-sm text-foreground cursor-pointer">Account Sync Issues</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
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

          {/* Large Transactions Toggle & Input */}
          <div className="py-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-1 pr-4">
                <Label htmlFor="notify-large" className="font-medium text-sm text-foreground cursor-pointer">Large Transaction Alerts</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
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
      </div>

      {/* Rate Limiter Configuration */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-1 flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          Rate Limiter Configuration
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          Configure sliding-window rate limiting to prevent notifications from spamming your devices.
        </p>

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

      <hr className="border-border/50" />

      {/* Custom Event Alerts Engine */}
      <div className="space-y-6">
        <div>
          <h2 className="text-base font-semibold text-foreground mb-1 flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Custom Event Alerts
          </h2>
          <p className="text-xs text-muted-foreground">
            Define your own rules and triggers for transactions, balances, savings goals, and cash flow.
          </p>
        </div>

        {/* Add/Edit Rule Form */}
        {showAddForm ? (
          <form onSubmit={handleSaveRule} className="p-5 border border-border rounded-xl bg-muted/30 space-y-4">
            <h3 className="text-sm font-semibold text-foreground">
              {editingRuleId ? 'Edit Alert Rule' : 'New Custom Alert Rule'}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="rule-name" className="text-xs font-semibold">Rule Name</Label>
                <Input
                  id="rule-name"
                  type="text"
                  placeholder="e.g. Low Checking Warning"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  className="h-9 bg-background border border-input rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rule-type" className="text-xs font-semibold">Alert Trigger Type</Label>
                <select
                  id="rule-type"
                  value={triggerType}
                  onChange={(e: any) => {
                    setTriggerType(e.target.value);
                    setConditions([]);
                    setConditionOperator('AND');
                  }}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground"
                >
                  <option value="transaction">Transaction Event</option>
                  <option value="account_balance">Account Balance Event</option>
                  <option value="savings_goal">Savings Goal Event</option>
                  <option value="cash_flow">Cash Flow Event</option>
                </select>
              </div>
            </div>

            {/* AND / OR toggle */}
            {conditions.length > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground">Match:</span>
                <div className="inline-flex rounded-lg overflow-hidden border border-border">
                  <button
                    type="button"
                    id="cond-op-and"
                    onClick={() => setConditionOperator('AND')}
                    className={`px-3 py-1 text-xs font-bold transition-colors ${
                      conditionOperator === 'AND'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/50 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    AND
                  </button>
                  <button
                    type="button"
                    id="cond-op-or"
                    onClick={() => setConditionOperator('OR')}
                    className={`px-3 py-1 text-xs font-bold transition-colors ${
                      conditionOperator === 'OR'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/50 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    OR
                  </button>
                </div>
              </div>
            )}

            {/* Condition rows */}
            <div className="space-y-0">
              {conditions.map((cond, idx) => {
                const isCashFlow = cond.field.startsWith('cf_');
                const isAccountField = cond.field === 'account' || cond.field === 'balance_above_account' || cond.field === 'balance_below_account';
                const isGoalField = cond.field === 'goal_reached_percentage' || cond.field === 'goal_reached_amount';
                const isPercentField = cond.field === 'goal_reached_percentage' || cond.field === 'cf_savings_rate_below' || cond.field === 'cf_savings_rate_above';

                return (
                  <div key={idx}>
                    <div className="flex items-end gap-3 p-3 rounded-lg bg-muted/10 border border-border/50">
                      {/* Field dropdown */}
                      <div className="flex-1 space-y-1.5">
                        <Label htmlFor={`cond-field-${idx}`} className="text-xs font-semibold">Field</Label>
                        <select
                          id={`cond-field-${idx}`}
                          value={cond.field}
                          onChange={(e) => {
                            const newField = e.target.value as AlertConditionField;
                            updateCondition(idx, { field: newField, value: '', compareAccountId: undefined, goalId: undefined, consecutiveMonths: undefined });
                          }}
                          className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground"
                        >
                          {getFieldsForTrigger(triggerType).map((f) => (
                            <option key={f} value={f}>{getFieldLabel(f)}</option>
                          ))}
                        </select>
                      </div>

                      {/* Goal selector (for goal fields) */}
                      {isGoalField && (
                        <div className="flex-1 space-y-1.5">
                          <Label htmlFor={`cond-goal-${idx}`} className="text-xs font-semibold">Goal</Label>
                          <select
                            id={`cond-goal-${idx}`}
                            value={cond.goalId || ''}
                            onChange={(e) => updateCondition(idx, { goalId: e.target.value })}
                            className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground"
                          >
                            <option value="">Select Goal...</option>
                            {goalsList.map((g) => (
                              <option key={g.id} value={g.id}>{g.name}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Value input */}
                      <div className="flex-1 space-y-1.5">
                        <Label htmlFor={`cond-value-${idx}`} className="text-xs font-semibold">Value</Label>
                        {isAccountField ? (
                          <select
                            id={`cond-value-${idx}`}
                            value={cond.field === 'account' ? String(cond.value) : (cond.compareAccountId || '')}
                            onChange={(e) => {
                              if (cond.field === 'account') {
                                updateCondition(idx, { value: e.target.value });
                              } else {
                                updateCondition(idx, { compareAccountId: e.target.value, value: e.target.value });
                              }
                            }}
                            className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground"
                          >
                            <option value="">Select Account...</option>
                            {accountsList.map((acc) => (
                              <option key={acc.id} value={acc.id}>{acc.name}</option>
                            ))}
                          </select>
                        ) : cond.field === 'keyword' ? (
                          <Input
                            id={`cond-value-${idx}`}
                            type="text"
                            placeholder="e.g. Netflix"
                            value={String(cond.value)}
                            onChange={(e) => updateCondition(idx, { value: e.target.value })}
                            className="h-9 bg-background border border-input rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                        ) : (
                          <div className="relative">
                            <Input
                              id={`cond-value-${idx}`}
                              type="number"
                              placeholder="0"
                              value={cond.value === '' ? '' : String(cond.value)}
                              onChange={(e) => updateCondition(idx, { value: e.target.value === '' ? '' : parseFloat(e.target.value) })}
                              className="h-9 bg-background border border-input rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                            {isPercentField && (
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Consecutive Months (cash flow only) */}
                      {isCashFlow && (
                        <div className="space-y-1.5">
                          <Label htmlFor={`cond-months-${idx}`} className="text-xs font-semibold whitespace-nowrap">Months</Label>
                          <select
                            id={`cond-months-${idx}`}
                            value={cond.consecutiveMonths || 1}
                            onChange={(e) => updateCondition(idx, { consecutiveMonths: parseInt(e.target.value) || 1 })}
                            className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground"
                          >
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                            <option value="4">4</option>
                            <option value="5">5</option>
                            <option value="6">6</option>
                          </select>
                        </div>
                      )}

                      {/* Remove button */}
                      {conditions.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          id={`cond-remove-${idx}`}
                          onClick={() => removeCondition(idx)}
                          className="h-9 px-2 text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>

                    {/* AND/OR connector label */}
                    {conditions.length > 1 && idx < conditions.length - 1 && (
                      <div className="flex justify-center py-1.5">
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                          {conditionOperator}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add condition button */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              id="add-condition"
              onClick={addCondition}
            >
              + Add Condition
            </Button>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={resetForm}>
                Cancel
              </Button>
              <Button type="submit" size="sm">
                {editingRuleId ? 'Update Rule' : 'Create Rule'}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex justify-start">
            <Button size="sm" onClick={() => setShowAddForm(true)}>
              Add Custom Alert Rule
            </Button>
          </div>
        )}

        {/* Custom Rules List */}
        {loadingRules ? (
          <p className="text-xs text-muted-foreground">Loading custom alerts...</p>
        ) : customRules.length === 0 ? (
          <div className="text-center p-8 border border-dashed border-border rounded-xl bg-muted/5">
            <p className="text-xs text-muted-foreground">No custom event alert rules configured.</p>
          </div>
        ) : (
          <div className="border border-border rounded-xl bg-muted/30 divide-y divide-border/50 px-4">
            {customRules.map((rule) => (
              <div key={rule.id} className="flex items-center justify-between py-4">
                <div className="space-y-1 pr-4">
                  <span className="font-semibold text-sm text-foreground flex items-center gap-2">
                    {rule.name}
                    <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      {rule.triggerType.replace('_', ' ')}
                    </span>
                  </span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {getRuleSummary(rule)}
                  </p>
                </div>
                
                <div className="flex items-center gap-4">
                  <Switch
                    checked={rule.isEnabled}
                    onCheckedChange={() => handleToggleRuleEnabled(rule.id, rule.isEnabled)}
                  />
                  <div className="flex items-center gap-1.5 border-l border-border/50 pl-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditRule(rule)}
                      className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteRule(rule.id)}
                      className="h-8 px-2.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
