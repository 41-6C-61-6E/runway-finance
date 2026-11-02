'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ShieldAlert, Trash2, Upload, Plus, X } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { ActionButton } from '@/components/ui/action-button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { invalidateAfterAccountChange } from '@/lib/query-invalidation';
import { formatDate } from '@/lib/utils/format';
import {
  addMonthsDateStr,
  type EquityGrantType,
  type EquityValuationMode,
  type VestingFrequency,
  type CustomVestingTranche,
} from '@/lib/utils/vesting';
import type { EquityGrantWithMetrics } from '@/lib/services/equity-grants';
import { GrantLogoBadge, formatShareCount } from './grant-logo-badge';

export interface GrantEditSheetProps {
  sheetOpen: boolean;
  setSheetOpen: (open: boolean) => void;
  editingGrant: EquityGrantWithMetrics | null;
  allGrants?: EquityGrantWithMetrics[];
  onSuccess?: () => void;
}

export function GrantEditSheet({
  sheetOpen,
  setSheetOpen,
  editingGrant,
  allGrants,
  onSuccess,
}: GrantEditSheetProps) {
  const queryClient = useQueryClient();
  const grants = allGrants ?? [];
  const todayStr = new Date().toISOString().split('T')[0];
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setFormError('Please select a valid image file (PNG, JPG, SVG, or WebP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;

      if (file.type === 'image/svg+xml' && dataUrl.length < 60000) {
        setLogoUrl(dataUrl);
        return;
      }

      const img = new window.Image();
      img.onload = () => {
        const maxDim = 128;
        const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          setLogoUrl(canvas.toDataURL('image/png', 0.9));
        } else {
          setLogoUrl(dataUrl);
        }
      };
      img.onerror = () => {
        setLogoUrl(dataUrl);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const [companyName, setCompanyName] = useState('');
  const [grantName, setGrantName] = useState('');
  const [grantType, setGrantType] = useState<EquityGrantType>('iso');
  const [grantDate, setGrantDate] = useState('');
  const [vestingStartDate, setVestingStartDate] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [totalShares, setTotalShares] = useState('');
  const [exercisedShares, setExercisedShares] = useState('0');
  const [soldShares, setSoldShares] = useState('0');
  const [strikePrice, setStrikePrice] = useState('');
  const [currentFmv, setCurrentFmv] = useState('');
  const [preferredPrice, setPreferredPrice] = useState('');
  const [valuationMode, setValuationMode] = useState<EquityValuationMode>('fmv');
  const [vestingPreset, setVestingPreset] = useState<string>('standard_48_12');
  const [totalMonths, setTotalMonths] = useState('48');
  const [cliffMonths, setCliffMonths] = useState('12');
  const [cliffPercent, setCliffPercent] = useState('25');
  const [vestingFrequency, setVestingFrequency] = useState<VestingFrequency>('monthly');
  const [customTranches, setCustomTranches] = useState<CustomVestingTranche[]>([]);
  const [earlyExerciseAllowed, setEarlyExerciseAllowed] = useState(false);
  const [filed83b, setFiled83b] = useState(false);
  const [isExcludedFromNetWorth, setIsExcludedFromNetWorth] = useState(false);
  const [applyValuationToCompany, setApplyValuationToCompany] = useState(true);
  const [logoUrl, setLogoUrl] = useState('');
  const [notes, setNotes] = useState('');

  const detectVestingPreset = (sched: {
    totalMonths: number;
    cliffMonths: number;
    cliffPercent: number;
    frequency: VestingFrequency;
  }): string => {
    if (sched.frequency === 'immediate' || sched.totalMonths === 0) return 'immediate';
    if (sched.frequency === 'custom') return 'custom_tranches';
    if (
      sched.frequency === 'monthly' &&
      sched.totalMonths === 48 &&
      sched.cliffMonths === 12 &&
      Math.abs(sched.cliffPercent - 25) < 0.01
    ) {
      return 'standard_48_12';
    }
    if (
      sched.frequency === 'monthly' &&
      sched.totalMonths === 48 &&
      sched.cliffMonths === 0 &&
      sched.cliffPercent === 0
    ) {
      return 'monthly_48_0';
    }
    if (
      sched.frequency === 'quarterly' &&
      sched.totalMonths === 48 &&
      sched.cliffMonths === 12 &&
      Math.abs(sched.cliffPercent - 25) < 0.01
    ) {
      return 'quarterly_48_12';
    }
    if (
      sched.frequency === 'monthly' &&
      sched.totalMonths === 36 &&
      sched.cliffMonths === 12 &&
      Math.abs(sched.cliffPercent - 33.33) < 0.5
    ) {
      return 'standard_36_12';
    }
    return 'custom_periodic';
  };

  const handleVestingPresetChange = (preset: string) => {
    setVestingPreset(preset);
    if (preset === 'standard_48_12') {
      setVestingFrequency('monthly');
      setTotalMonths('48');
      setCliffMonths('12');
      setCliffPercent('25');
    } else if (preset === 'monthly_48_0') {
      setVestingFrequency('monthly');
      setTotalMonths('48');
      setCliffMonths('0');
      setCliffPercent('0');
    } else if (preset === 'quarterly_48_12') {
      setVestingFrequency('quarterly');
      setTotalMonths('48');
      setCliffMonths('12');
      setCliffPercent('25');
    } else if (preset === 'standard_36_12') {
      setVestingFrequency('monthly');
      setTotalMonths('36');
      setCliffMonths('12');
      setCliffPercent('33.33');
    } else if (preset === 'immediate') {
      setVestingFrequency('immediate');
      setTotalMonths('0');
      setCliffMonths('0');
      setCliffPercent('100');
    } else if (preset === 'custom_tranches') {
      setVestingFrequency('custom');
    } else if (preset === 'custom_periodic') {
      if (vestingFrequency === 'immediate' || vestingFrequency === 'custom') {
        setVestingFrequency('monthly');
      }
    }
  };

  useEffect(() => {
    if (sheetOpen) {
      setFormError(null);
      if (editingGrant) {
        setCompanyName(editingGrant.companyName);
        setGrantName(editingGrant.grantName);
        setGrantType(editingGrant.grantType);
        setGrantDate(editingGrant.grantDate);
        setVestingStartDate(editingGrant.vestingStartDate);
        setExpirationDate(editingGrant.expirationDate || '');
        setTotalShares(String(editingGrant.totalShares));
        setExercisedShares(String(editingGrant.exercisedShares));
        setSoldShares(String(editingGrant.soldShares));
        setStrikePrice(String(editingGrant.strikePrice));
        setCurrentFmv(String(editingGrant.currentFmv));
        setPreferredPrice(editingGrant.preferredPrice != null ? String(editingGrant.preferredPrice) : '');
        setValuationMode(editingGrant.valuationMode);
        setVestingPreset(detectVestingPreset(editingGrant.vestingSchedule));
        setTotalMonths(String(editingGrant.vestingSchedule.totalMonths));
        setCliffMonths(String(editingGrant.vestingSchedule.cliffMonths));
        setCliffPercent(String(editingGrant.vestingSchedule.cliffPercent));
        setVestingFrequency(editingGrant.vestingSchedule.frequency);
        setCustomTranches(editingGrant.vestingSchedule.customTranches || []);
        setEarlyExerciseAllowed(Boolean(editingGrant.earlyExerciseAllowed));
        setFiled83b(Boolean(editingGrant.filed83b));
        setIsExcludedFromNetWorth(editingGrant.isExcludedFromNetWorth);
        setApplyValuationToCompany(true);
        setLogoUrl(editingGrant.logoUrl || '');
        setNotes(editingGrant.notes || '');
      } else {
        const todayStr = new Date().toISOString().slice(0, 10);
        setCompanyName('');
        setGrantName('');
        setGrantType('iso');
        setGrantDate(todayStr);
        setVestingStartDate(todayStr);
        setExpirationDate(addMonthsDateStr(todayStr, 120));
        setTotalShares('');
        setExercisedShares('0');
        setSoldShares('0');
        setStrikePrice('');
        setCurrentFmv('');
        setPreferredPrice('');
        setValuationMode('fmv');
        setVestingPreset('standard_48_12');
        setTotalMonths('48');
        setCliffMonths('12');
        setCliffPercent('25');
        setVestingFrequency('monthly');
        setCustomTranches([]);
        setEarlyExerciseAllowed(false);
        setFiled83b(false);
        setIsExcludedFromNetWorth(false);
        setApplyValuationToCompany(true);
        setLogoUrl('');
        setNotes('');
      }
    }
  }, [sheetOpen, editingGrant]);

  const handleSaveGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const parsedTotalShares = parseFloat(totalShares);
    const parsedExercised = parseFloat(exercisedShares || '0') || 0;
    const parsedSold = parseFloat(soldShares || '0') || 0;
    const parsedStrike = grantType === 'rsu' ? 0 : parseFloat(strikePrice || '0') || 0;
    const parsedFmv = parseFloat(currentFmv || '0') || 0;
    const parsedPref = preferredPrice.trim() !== '' ? parseFloat(preferredPrice) : null;

    if (!companyName.trim() || !grantName.trim()) {
      setFormError('Company name and grant name are required.');
      return;
    }
    if (isNaN(parsedTotalShares) || parsedTotalShares <= 0) {
      setFormError('Total shares must be greater than 0.');
      return;
    }
    if (parsedExercised > parsedTotalShares) {
      setFormError('Exercised shares cannot exceed total shares granted.');
      return;
    }
    if (parsedSold > parsedTotalShares) {
      setFormError('Sold shares cannot exceed total shares.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        companyName: companyName.trim(),
        grantName: grantName.trim(),
        grantType,
        grantDate,
        vestingStartDate,
        expirationDate: expirationDate.trim() || null,
        totalShares: parsedTotalShares,
        exercisedShares: parsedExercised,
        soldShares: parsedSold,
        strikePrice: parsedStrike,
        currentFmv: parsedFmv,
        preferredPrice: parsedPref,
        valuationMode,
        vestingSchedule: {
          totalMonths: parseInt(totalMonths, 10) || 0,
          cliffMonths: parseInt(cliffMonths, 10) || 0,
          cliffPercent: parseFloat(cliffPercent) || 0,
          frequency: vestingFrequency,
          customTranches: vestingFrequency === 'custom' ? customTranches : undefined,
        },
        earlyExerciseAllowed,
        filed83b,
        isExcludedFromNetWorth,
        logoUrl: logoUrl.trim() || null,
        notes: notes.trim() || null,
        ...(editingGrant ? { applyValuationToCompany } : {}),
      };

      const url = editingGrant
        ? `/api/investments/equity-grants/${editingGrant.id}`
        : '/api/investments/equity-grants';
      const method = editingGrant ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.message || 'Failed to save equity grant');
      }

      setSheetOpen(false);
      invalidateAfterAccountChange(queryClient);
      if (onSuccess) onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred while saving.';
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {editingGrant ? `Edit ${editingGrant.grantName}` : 'Add Stock Option / Equity Grant'}
            </SheetTitle>
            <SheetDescription>
              Enter your grant details from your option agreement or equity portal. Vesting and intrinsic value update automatically every day.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSaveGrant} className="space-y-4 mt-5">
            {formError && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Section 1: Grant Identity & Company Logo (1 entry per line) */}
            <div className="p-4 rounded-xl bg-muted/30 border border-border/60 space-y-3.5">
              <div className="text-xs font-bold text-foreground uppercase tracking-wider">
                Company & Grant Details
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Company Name</label>
                <Input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Acme Corp"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Grant Name / ID</label>
                <Input
                  value={grantName}
                  onChange={(e) => setGrantName(e.target.value)}
                  placeholder="e.g. ES-104 (Initial Grant)"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Company Logo (Optional)
                </label>
                <div className="flex items-center gap-3">
                  <GrantLogoBadge
                    companyName={companyName}
                    logoUrl={logoUrl}
                    size="md"
                  />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleLogoFileChange}
                        className="hidden"
                      />
                      <ActionButton
                        size="xs"
                        variant="outline"
                        icon={Upload}
                        onClick={() => logoInputRef.current?.click()}
                      >
                        Upload Image
                      </ActionButton>
                      {logoUrl && (
                        <button
                          type="button"
                          onClick={() => setLogoUrl('')}
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </button>
                      )}
                    </div>
                    <Input
                      value={logoUrl.startsWith('data:image/') ? '' : logoUrl}
                      onChange={(e) => setLogoUrl(e.target.value)}
                      placeholder={
                        logoUrl.startsWith('data:image/')
                          ? 'Custom image uploaded (or paste URL / domain)'
                          : 'Or enter company domain (e.g. acme.com) or image URL'
                      }
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Grant Type</label>
                <Select
                  value={grantType}
                  onChange={(e) => setGrantType(e.target.value as EquityGrantType)}
                >
                  <option value="iso">ISO (Incentive Stock Options)</option>
                  <option value="nso">NSO (Non-Qualified Stock Options)</option>
                  <option value="rsu">RSU (Restricted Stock Units)</option>
                  <option value="common">Common / Early-Exercised Shares</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Total Shares Granted</label>
                <Input
                  type="number"
                  step="any"
                  min="1"
                  value={totalShares}
                  onChange={(e) => setTotalShares(e.target.value)}
                  placeholder="e.g. 10000"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Grant Date</label>
                <Input
                  type="date"
                  value={grantDate}
                  onChange={(e) => setGrantDate(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Vesting Start Date</label>
                <Input
                  type="date"
                  value={vestingStartDate}
                  onChange={(e) => setVestingStartDate(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Expiration Date (Optional)
                </label>
                <Input
                  type="date"
                  value={expirationDate}
                  onChange={(e) => setExpirationDate(e.target.value)}
                />
              </div>
            </div>

            {/* Section 2: Pricing & Valuation (1 entry per line) */}
            <div className="p-4 rounded-xl bg-muted/30 border border-border/60 space-y-3.5">
              <div className="text-xs font-bold text-foreground uppercase tracking-wider">
                Strike Price & Valuation
              </div>

              {grantType !== 'rsu' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Strike / Exercise Price per Share ($)
                  </label>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={strikePrice}
                    onChange={(e) => setStrikePrice(e.target.value)}
                    placeholder="e.g. 1.25"
                    required
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Current 409A Fair Market Value per Share ($)
                </label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  value={currentFmv}
                  onChange={(e) => setCurrentFmv(e.target.value)}
                  placeholder="e.g. 4.50"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Preferred / Target Share Price ($) (Optional)
                </label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  value={preferredPrice}
                  onChange={(e) => setPreferredPrice(e.target.value)}
                  placeholder="e.g. 9.00"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Net Worth Valuation Basis
                </label>
                <Select
                  value={valuationMode}
                  onChange={(e) => setValuationMode(e.target.value as EquityValuationMode)}
                >
                  <option value="fmv">409A Fair Market Value (Conservative)</option>
                  <option value="preferred">Preferred / Target Share Price</option>
                </Select>
                <p className="text-[11px] text-muted-foreground leading-relaxed pt-1">
                  <strong>Tip:</strong> Check your equity portal&apos;s grant details or exercise tax calculator for the active <strong>409A FMV</strong>. For <strong>Preferred / Secondary price</strong>, check company funding round announcements or private market trackers.
                </p>
              </div>

              {editingGrant && grants.length > 1 && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={applyValuationToCompany}
                    onChange={(e) => setApplyValuationToCompany(e.target.checked)}
                    className="rounded border-border"
                  />
                  <span>Apply updated valuation &amp; logo to all {companyName} grants</span>
                </label>
              )}
            </div>

            {/* Section 3: Vesting Schedule Configuration (1 entry per line) */}
            <div className="p-4 rounded-xl bg-muted/30 border border-border/60 space-y-3.5">
              <div className="text-xs font-bold text-foreground uppercase tracking-wider">
                Vesting Schedule
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Vesting Schedule Type
                </label>
                <Select
                  value={vestingPreset}
                  onChange={(e) => handleVestingPresetChange(e.target.value)}
                >
                  <option value="standard_48_12">
                    1/48th Monthly, 1-Year Cliff (1/4th at 12 mos, then 1/48th/mo)
                  </option>
                  <option value="monthly_48_0">
                    1/48th Monthly, No Cliff (48 Months)
                  </option>
                  <option value="quarterly_48_12">
                    4-Year Quarterly, 1-Year Cliff (1/4th at 12 mos, then 1/16th/qtr)
                  </option>
                  <option value="standard_36_12">
                    1/36th Monthly, 1-Year Cliff (1/3rd at 12 mos, then 1/36th/mo)
                  </option>
                  <option value="immediate">
                    Immediate (100% Vested on Start Date)
                  </option>
                  <option value="custom_periodic">
                    Custom Periodic Schedule (Set Months, Cliff &amp; Frequency)
                  </option>
                  <option value="custom_tranches">
                    Custom Milestone Tranches (Specific Dates &amp; Shares)
                  </option>
                </Select>
              </div>

              {/* Live Human-Readable Schedule Summary */}
              {vestingFrequency !== 'custom' && vestingFrequency !== 'immediate' && (
                <div className="p-3 rounded-lg bg-background/70 border border-border/60 text-[11px] text-muted-foreground space-y-1.5 leading-relaxed">
                  {vestingPreset === 'standard_48_12' ? (
                    <p>
                      <strong className="text-foreground">1/4th (25%)</strong> of total shares vest on the 12-month anniversary of the Vesting Start Date, and{' '}
                      <strong className="text-foreground">1/48th</strong> vests on the same day of each month thereafter (or on the last day of the month if a month does not have that date).
                    </p>
                  ) : (
                    <p>
                      {Number(cliffMonths) > 0 && Number(cliffPercent) > 0 ? (
                        <>
                          <strong className="text-foreground">{cliffPercent}%</strong> vests at the{' '}
                          <strong className="text-foreground">{cliffMonths}-month</strong> cliff, followed by{' '}
                          <strong className="text-foreground">{vestingFrequency}</strong> vesting over the remaining{' '}
                          <strong className="text-foreground">
                            {Math.max(0, (Number(totalMonths) || 0) - (Number(cliffMonths) || 0))} months
                          </strong>
                          .
                        </>
                      ) : (
                        <>
                          Vests <strong className="text-foreground">{vestingFrequency}</strong> in equal installments over{' '}
                          <strong className="text-foreground">{totalMonths} months</strong> with no cliff.
                        </>
                      )}
                    </p>
                  )}

                  {(Number(totalShares) > 0 || vestingStartDate) && (
                    <div className="pt-1.5 border-t border-border/50 grid grid-cols-1 gap-1 font-mono text-[11px] text-foreground">
                      {Number(cliffMonths) > 0 && Number(cliffPercent) > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground font-sans">
                            {cliffMonths}-Mo Cliff ({cliffPercent}%):
                          </span>
                          <span>
                            {Number(totalShares) > 0
                              ? `${formatShareCount((Number(totalShares) * Number(cliffPercent)) / 100)} sh`
                              : '25%'}{' '}
                            {vestingStartDate
                              ? `on ${formatDate(addMonthsDateStr(vestingStartDate, Number(cliffMonths) || 12))}`
                              : ''}
                          </span>
                        </div>
                      )}
                      {Number(totalShares) > 0 && Number(totalMonths) > Number(cliffMonths) && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground font-sans">
                            {vestingFrequency === 'quarterly'
                              ? 'Each Quarter After Cliff:'
                              : vestingFrequency === 'annual'
                                ? 'Each Year After Cliff:'
                                : 'Each Month After Cliff:'}
                          </span>
                          <span>
                            {formatShareCount(
                              (Number(totalShares) * (1 - (Number(cliffPercent) || 0) / 100)) /
                                Math.max(
                                  1,
                                  Math.ceil(
                                    ((Number(totalMonths) || 48) - (Number(cliffMonths) || 0)) /
                                      (vestingFrequency === 'quarterly'
                                        ? 3
                                        : vestingFrequency === 'annual'
                                          ? 12
                                          : 1)
                                  )
                                )
                            )}{' '}
                            sh
                          </span>
                        </div>
                      )}
                      {vestingStartDate && Number(totalMonths) > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground font-sans">Fully Vested Date:</span>
                          <span>
                            {formatDate(addMonthsDateStr(vestingStartDate, Number(totalMonths) || 48))}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {vestingPreset === 'custom_periodic' && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">
                      Installment Frequency
                    </label>
                    <Select
                      value={vestingFrequency}
                      onChange={(e) => setVestingFrequency(e.target.value as VestingFrequency)}
                    >
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="annual">Annual</option>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">
                      Total Vesting Duration (Months)
                    </label>
                    <Input
                      type="number"
                      min="1"
                      max="240"
                      value={totalMonths}
                      onChange={(e) => setTotalMonths(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">
                      Cliff Duration (Months)
                    </label>
                    <Input
                      type="number"
                      min="0"
                      max="240"
                      value={cliffMonths}
                      onChange={(e) => setCliffMonths(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">
                      Cliff Vesting Percentage (%)
                    </label>
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      max="100"
                      value={cliffPercent}
                      onChange={(e) => setCliffPercent(e.target.value)}
                    />
                  </div>
                </>
              )}

              {vestingFrequency === 'custom' && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">
                      Custom Vesting Tranches
                    </span>
                    <ActionButton
                      size="xs"
                      icon={Plus}
                      onClick={() =>
                        setCustomTranches((prev) => [
                          ...prev,
                          { date: todayStr, shares: 1000 },
                        ])
                      }
                    >
                      Add Tranche
                    </ActionButton>
                  </div>
                  {customTranches.map((tranche, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        type="date"
                        value={tranche.date}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCustomTranches((prev) =>
                            prev.map((t, i) => (i === idx ? { ...t, date: val } : t))
                          );
                        }}
                        className="h-9 text-xs"
                      />
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        value={tranche.shares}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setCustomTranches((prev) =>
                            prev.map((t, i) => (i === idx ? { ...t, shares: val } : t))
                          );
                        }}
                        placeholder="Shares"
                        className="h-9 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setCustomTranches((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="p-1.5 text-muted-foreground hover:text-destructive cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Section 4: Exercise & Tax Status (1 entry per line) */}
            <div className="p-4 rounded-xl bg-muted/30 border border-border/60 space-y-3.5">
              <div className="text-xs font-bold text-foreground uppercase tracking-wider">
                Exercise & Tax Status
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Shares Exercised to Date
                </label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  value={exercisedShares}
                  onChange={(e) => setExercisedShares(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Shares Sold / Liquidated
                </label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  value={soldShares}
                  onChange={(e) => setSoldShares(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-2.5 pt-1">
                <label className="flex items-center gap-2.5 text-xs text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={earlyExerciseAllowed}
                    onChange={(e) => setEarlyExerciseAllowed(e.target.checked)}
                    className="rounded border-border"
                  />
                  <span>Grant allows Early Exercise prior to vesting</span>
                </label>
                <label className="flex items-center gap-2.5 text-xs text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filed83b}
                    onChange={(e) => setFiled83b(e.target.checked)}
                    className="rounded border-border"
                  />
                  <span>83(b) Election filed with IRS</span>
                </label>
                <label className="flex items-center gap-2.5 text-xs text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isExcludedFromNetWorth}
                    onChange={(e) => setIsExcludedFromNetWorth(e.target.checked)}
                    className="rounded border-border"
                  />
                  <span>Exclude this company equity account from liquid Net Worth</span>
                </label>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Notes (Optional)</label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Grant ID, board approval date, or exercise window notes"
              />
            </div>

            <SheetFooter className="pt-3">
              <ActionButton
                variant="outline"
                onClick={() => setSheetOpen(false)}
                disabled={saving}
              >
                Cancel
              </ActionButton>
              <ActionButton
                type="submit"
                variant="primary"
                icon={CheckCircle2}
                disabled={saving}
              >
                {saving ? 'Saving...' : editingGrant ? 'Save Changes' : 'Create Grant'}
              </ActionButton>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

  );
}
