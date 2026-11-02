'use client';

import React from 'react';
import {
  Landmark, Building2, Zap, HelpCircle, Eye, EyeOff,
  CheckSquare, Square, ChevronDown, ChevronRight,
} from 'lucide-react';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Select } from '@/components/ui/select';
import { formatCurrency } from '@/lib/utils/format';
import {
  safeString,
  PlanAccountItem,
  PlanData,
  getAccountTypeLabel,
  getAccountTypeColor,
  isPreTaxType,
  hasEmployerPlan,
  getContributionAmount as getContributionAmountHelper,
  getMatchAmount as getMatchAmountHelper,
} from './types';

export interface PlanAccountsSectionProps {
  planAccounts: PlanAccountItem[];
  includedAccounts: PlanAccountItem[];
  showExcludedAccounts: boolean;
  setShowExcludedAccounts: (v: boolean) => void;
  isAccountsCollapsed: boolean;
  setIsAccountsCollapsed: (v: boolean) => void;
  expandedAccountId: string | null;
  setExpandedAccountId: (id: string | null) => void;
  showTaxNotice: boolean;
  setShowTaxNotice: (v: boolean) => void;
  plan: PlanData;
  handleToggleAccount: (accId: string, currentIncluded: boolean) => Promise<void>;
  handleUpdateContribution: (accId: string, updates: Record<string, any>) => Promise<void>;
}

export function PlanAccountsSection({
  planAccounts,
  includedAccounts,
  showExcludedAccounts,
  setShowExcludedAccounts,
  isAccountsCollapsed,
  setIsAccountsCollapsed,
  expandedAccountId,
  setExpandedAccountId,
  showTaxNotice,
  setShowTaxNotice,
  plan,
  handleToggleAccount,
  handleUpdateContribution,
}: PlanAccountsSectionProps) {
  const excludedAccountsCount = planAccounts.length - includedAccounts.length;
  const visibleAccounts = showExcludedAccounts ? planAccounts : includedAccounts;
  const primarySalary = parseFloat(plan?.primarySalary) || 0;
  const spouseSalary = parseFloat(plan?.spouseSalary) || 0;
  const combinedSalary = primarySalary + spouseSalary;
  const getContributionAmount = (acc: PlanAccountItem) => getContributionAmountHelper(acc, plan);
  const getMatchAmount = (acc: PlanAccountItem) => getMatchAmountHelper(acc, plan);

  return (
              <div className="@container relative bg-muted hover:bg-muted/85 rounded-xl border border-border transition-all duration-200 p-4 sm:p-5 shadow-sm space-y-4">
            <CollapsibleCardHeader
              isCollapsed={isAccountsCollapsed}
              onToggle={setIsAccountsCollapsed}
              title="Plan Accounts & Contributions"
              description="Configure accumulation phase savings into each asset pool"
              icon={Landmark}
              className="px-0 py-0"
              actions={
                excludedAccountsCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowExcludedAccounts(!showExcludedAccounts)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border border-border bg-background/80 text-muted-foreground hover:text-foreground transition-all cursor-pointer shadow-2xs"
                  >
                    {showExcludedAccounts ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5 text-amber-500" />
                        <span>Hide Excluded ({excludedAccountsCount})</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5 text-primary" />
                        <span>Show Excluded ({excludedAccountsCount})</span>
                      </>
                    )}
                  </button>
                ) : null
              }
            />

            {!isAccountsCollapsed && (
              <div className="space-y-3 pt-1">
                {/* Salary Reminder Banner */}
                {combinedSalary <= 0 && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-600 dark:text-amber-400">
                    <Zap className="w-4 h-4 shrink-0" />
                    <span>
                      <strong>Set your salary</strong> in Profile to enable percentage-based contributions.
                    </span>
                  </div>
                )}

                {visibleAccounts.map((acc: PlanAccountItem, i: number) => {
                  const accName = safeString(acc.name, 'Account');
                  const accId = safeString(acc.id, `acc_${i}`);
                  const isIncluded = acc.isIncluded !== false;
                  const isExpanded = expandedAccountId === accId && isIncluded;
                  const accType = safeString(acc.type);
                  const contribMode = safeString(acc.contributionMode, 'none');
                  const contribAmt = getContributionAmount(acc);
                  const matchAmt = getMatchAmount(acc);
                  const totalInflow = contribAmt + matchAmt;
                  const isSurplus = Boolean(acc.isSurplusDestination);

                  return (
                    <div
                      key={accId}
                      className={`@container relative rounded-xl border transition-all duration-200 p-4 sm:p-4.5 shadow-2xs ${
                        isIncluded
                          ? isExpanded
                            ? 'bg-card border-primary/50 shadow-xs ring-1 ring-primary/20'
                            : 'bg-card border-border hover:border-primary/40 hover:bg-card/90'
                          : 'bg-card/40 border-border/40 opacity-60'
                      }`}
                    >
                      {/* Account Card Header & Body */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          {/* Checkbox toggle */}
                          <button
                            type="button"
                            onClick={() => handleToggleAccount(accId, isIncluded)}
                            className="mt-1 text-primary hover:scale-110 transition-transform shrink-0 cursor-pointer"
                            title={isIncluded ? 'Exclude from plan' : 'Include in plan'}
                          >
                            {isIncluded ? (
                              <CheckSquare className="w-4 h-4 text-primary" />
                            ) : (
                              <Square className="w-4 h-4 text-muted-foreground" />
                            )}
                          </button>

                          {/* Account Icon Badge */}
                          <div className={`p-2.5 rounded-xl shrink-0 ${
                            accType === 'cash'
                              ? 'bg-cyan-500/10 text-cyan-500'
                              : accType === 'roth_ira' || accType === 'roth_401k'
                              ? 'bg-emerald-500/10 text-emerald-500'
                              : isPreTaxType(accType)
                              ? 'bg-amber-500/10 text-amber-500'
                              : 'bg-blue-500/10 text-blue-500'
                          }`}>
                            {accType === 'cash' ? (
                              <Building2 className="w-5 h-5" />
                            ) : (
                              <Landmark className="w-5 h-5" />
                            )}
                          </div>

                          {/* Account Info & Badges */}
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`font-bold text-sm truncate ${isIncluded ? 'text-foreground' : 'text-muted-foreground line-through'}`}>
                                {accName}
                              </span>
                              {!isIncluded && (
                                <span className="inline-flex items-center gap-0.5 text-micro font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 uppercase tracking-wider">
                                  <EyeOff className="w-2.5 h-2.5" /> Excluded
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                                accType === 'cash'
                                  ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20'
                                  : accType === 'roth_ira' || accType === 'roth_401k'
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                  : isPreTaxType(accType)
                                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                                  : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
                              }`}>
                                {getAccountTypeLabel(accType)}
                              </span>

                              {safeString(acc.owner) === 'spouse' && plan.hasSpouse && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                                  {plan.spouseName || 'Spouse'}
                                </span>
                              )}

                              {isPreTaxType(accType) && (!acc.rothPercentage || acc.rothPercentage === 0) && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 uppercase tracking-wider">
                                  Pre-Tax
                                </span>
                              )}

                              {acc.rothPercentage !== undefined && acc.rothPercentage > 0 && acc.rothPercentage < 100 && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/20 text-purple-700 dark:text-purple-300">
                                  <span>{100 - acc.rothPercentage}% Pre-Tax</span>
                                  <span className="text-muted-foreground">•</span>
                                  <span className="text-pink-600 dark:text-pink-400 font-bold">{acc.rothPercentage}% Roth</span>
                                </span>
                              )}

                              {isSurplus && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20 uppercase tracking-wider">
                                  RMD Sweep
                                </span>
                              )}
                            </div>

                            {/* Sub-metrics strip */}
                            {isIncluded && contribMode !== 'none' && (
                              <div className="flex items-center gap-3 text-[11px] text-muted-foreground pt-0.5 flex-wrap">
                                <span className="font-semibold text-primary">
                                  Inflow: +{formatCurrency(totalInflow)}/yr
                                </span>
                                {contribMode === 'percentage' && (
                                  <span>({acc.contributionValue || 0}% of salary)</span>
                                )}
                                {matchAmt > 0 && (
                                  <span className="text-emerald-600 dark:text-emerald-400">
                                    • incl. {formatCurrency(matchAmt)} match
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Right: Balance & Configure Action */}
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <span className="text-[10px] text-muted-foreground block font-medium">Balance</span>
                            <span className={`font-mono text-sm font-bold block ${isIncluded ? 'text-foreground' : 'text-muted-foreground/60 line-through'}`}>
                              {formatCurrency(parseFloat(acc.balance) || 0)}
                            </span>
                          </div>

                          {isIncluded && (
                            <button
                              type="button"
                              onClick={() => setExpandedAccountId(isExpanded ? null : accId)}
                              className={`p-2 rounded-xl border transition-all cursor-pointer ${
                                isExpanded
                                  ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                                  : 'bg-background/50 border-border text-muted-foreground hover:text-foreground hover:bg-background'
                              }`}
                              title={isExpanded ? 'Collapse contribution' : 'Configure contribution'}
                            >
                              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Expanded Contribution Configuration Drawer */}
                      {isExpanded && (
                        <div className="mt-3.5 pt-3.5 border-t border-border/80 p-4 rounded-xl bg-muted/20 space-y-4">
                          {/* Contribution Mode */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                            <div className="space-y-1">
                              <div className="flex items-center gap-1">
                                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Contribution Mode</label>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <HelpCircle className="w-3 h-3 text-muted-foreground/70 hover:text-foreground transition-colors cursor-pointer" />
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs text-xs">
                                      Choose how much money you save into this account each year during your working years before retirement.
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                              <Select
                                value={contribMode}
                                onChange={(e) => handleUpdateContribution(accId, { contributionMode: e.target.value })}
                                className="h-[38px] text-xs font-medium"
                              >
                                <option value="none">No Contribution</option>
                                <option value="percentage">% of Salary</option>
                                <option value="fixed_amount">Fixed $ Amount / Year</option>
                                <option value="maximize">Maximize IRS Limit</option>
                              </Select>
                            </div>

                            {(contribMode === 'percentage' || contribMode === 'fixed_amount') && (
                              <div className="space-y-1">
                                <div className="flex items-center gap-1">
                                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                                    {contribMode === 'percentage' ? 'Salary %' : 'Annual Amount ($)'}
                                  </label>
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <HelpCircle className="w-3 h-3 text-muted-foreground/70 hover:text-foreground transition-colors cursor-pointer" />
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-xs text-xs">
                                        {contribMode === 'percentage'
                                          ? 'Percentage of your annual base salary to deposit into this account each year.'
                                          : 'Fixed dollar amount to contribute each year (compounds with inflation).'
                                        }
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </div>
                                <div className="relative">
                                  {contribMode === 'fixed_amount' && (
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-mono">$</span>
                                  )}
                                  <input
                                    type="number"
                                    step={contribMode === 'percentage' ? '0.5' : '100'}
                                    value={acc.contributionValue || ''}
                                    onChange={(e) => handleUpdateContribution(accId, { contributionValue: parseFloat(e.target.value) || 0 })}
                                    placeholder={contribMode === 'percentage' ? 'e.g. 15' : 'e.g. 23000'}
                                    className={`w-full bg-background border border-border rounded-lg ${contribMode === 'fixed_amount' ? 'pl-7' : 'pl-3'} pr-3 py-2 text-xs font-mono text-foreground focus:ring-1 focus:ring-primary font-bold`}
                                  />
                                  {contribMode === 'percentage' && (
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-mono">%</span>
                                  )}
                                </div>
                              </div>
                            )}

                            {contribMode === 'maximize' && (
                              <div className="space-y-1">
                                <div className="flex items-center gap-1">
                                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">IRS Annual Limit</label>
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <HelpCircle className="w-3 h-3 text-muted-foreground/70 hover:text-foreground transition-colors cursor-pointer" />
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-xs text-xs">
                                        Automatically contributes up to the maximum IRS limit ($23,000 for 401k/403b, $7,000 for IRA, $4,150/$8,300 for HSA, plus catch-up if age 50+).
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </div>
                                <div className="flex items-center h-[38px] px-3 rounded-lg bg-background border border-border">
                                  <span className="text-xs font-mono font-bold text-primary">{formatCurrency(getContributionAmount(acc))}/yr</span>
                                </div>
                              </div>
                            )}

                            {contribMode !== 'none' && plan.hasSpouse && (
                              <div className="space-y-1">
                                <div className="flex items-center gap-1">
                                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Salary Source</label>
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <HelpCircle className="w-3 h-3 text-muted-foreground/70 hover:text-foreground transition-colors cursor-pointer" />
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-xs text-xs">
                                        Which salary to use for calculating this contribution. Useful when you and your partner contribute to separate retirement accounts.
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </div>
                                <Select
                                  value={acc.contributionSalarySource || (safeString(acc.owner) === 'spouse' ? 'spouse' : 'primary')}
                                  onChange={(e) => handleUpdateContribution(accId, { contributionSalarySource: e.target.value })}
                                  className="h-[38px] text-xs font-medium"
                                >
                                  <option value="primary">Primary Salary ({formatCurrency(primarySalary)})</option>
                                  <option value="spouse">{plan.spouseName || 'Spouse'} Salary ({formatCurrency(spouseSalary)})</option>
                                </Select>
                              </div>
                            )}
                          </div>

                          {/* Employer Match Section (for 401k / employer plans) */}
                          {hasEmployerPlan(accType) && (
                            <div className="pt-2 border-t border-border/40">
                              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
                                Employer Match Settings
                              </span>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <label className="text-[11px] text-muted-foreground">Match Rate (% of contribution matched)</label>
                                  <div className="relative">
                                    <input
                                      type="number"
                                      step="5"
                                      min="0"
                                      max="200"
                                      value={acc.companyMatchRate != null ? acc.companyMatchRate * 100 : ''}
                                      onChange={(e) => handleUpdateContribution(accId, { companyMatchRate: (parseFloat(e.target.value) || 0) / 100 })}
                                      placeholder="e.g. 50 (for 50% match)"
                                      className="w-full bg-background border border-border rounded-lg pl-3 pr-7 py-2 text-xs font-mono text-foreground focus:ring-1 focus:ring-primary font-bold"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-mono">%</span>
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[11px] text-muted-foreground">Match Limit (% of salary)</label>
                                  <div className="relative">
                                    <input
                                      type="number"
                                      step="0.5"
                                      min="0"
                                      max="50"
                                      value={acc.companyMatchLimit || ''}
                                      onChange={(e) => handleUpdateContribution(accId, { companyMatchLimit: parseFloat(e.target.value) || 0 })}
                                      placeholder="e.g. 6 (matched up to 6% salary)"
                                      className="w-full bg-background border border-border rounded-lg pl-3 pr-7 py-2 text-xs font-mono text-foreground focus:ring-1 focus:ring-primary font-bold"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-mono">%</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* RMD Sweep Destination Toggle */}
                          <div className="pt-2 border-t border-border/40 space-y-1">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={isSurplus}
                                  onChange={(e) => handleUpdateContribution(accId, { isSurplusDestination: e.target.checked })}
                                  className="w-4 h-4 text-primary focus:ring-primary rounded accent-primary cursor-pointer"
                                />
                                <span className="text-xs font-semibold text-foreground flex items-center gap-1">
                                  Set as RMD Sweep Destination
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <HelpCircle className="w-3 h-3 text-muted-foreground/70 hover:text-foreground transition-colors cursor-pointer" />
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-xs text-xs leading-relaxed">
                                        <strong>RMD Excess Sweep:</strong> In retirement, mandatory RMD distributions in excess of living expenses and taxes are automatically swept into this account. (During accumulation, only defined contributions are made; unallocated surplus is not swept.)
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </span>
                              </label>

                              {contribMode !== 'none' && (
                                <div className="text-right">
                                  <span className="text-xs font-bold text-foreground">Total Inflow: </span>
                                  <span className="text-xs font-mono font-bold text-primary">{formatCurrency(totalInflow)}/yr</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {visibleAccounts.length === 0 && planAccounts.length > 0 && (
                  <div className="col-span-full py-6 text-center border border-dashed border-border rounded-xl space-y-2">
                    <p className="text-xs text-muted-foreground">
                      All {planAccounts.length} accounts are currently excluded from this plan.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowExcludedAccounts(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-primary/10 text-primary hover:bg-primary/20 transition-all cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Show Excluded Accounts ({planAccounts.length})
                    </button>
                  </div>
                )}

                {planAccounts.length === 0 && (
                  <p className="text-xs text-muted-foreground italic py-3 text-center border border-dashed border-border rounded-lg">
                    No accounts. Create a new plan to auto-populate from your linked accounts.
                  </p>
                )}
              </div>
            )}
          </div>
        );
}
