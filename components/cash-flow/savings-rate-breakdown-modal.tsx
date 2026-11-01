import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PiggyBank, ChevronDown, Info } from "lucide-react";
import { formatCurrency, formatPlainPercent } from "@/lib/utils/format";
import { formatChartXAxisDate } from "@/lib/utils/chart-format";
import { formatSafeUTCDate } from "@/lib/utils/date";

interface SavingsRateBreakdownModalProps {
  selectedPoint: any;
  timeframe: string;
  onClose: () => void;
}

export function SavingsRateBreakdownModal({ selectedPoint, timeframe, onClose }: SavingsRateBreakdownModalProps) {
  const [expandedBucket, setExpandedBucket] = useState<string | null>(null);
  if (!selectedPoint) return null;
  const selectedSavingsPoint = selectedPoint;

  return (
        <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
          <DialogContent className="max-w-xl max-h-[85vh] p-0 overflow-hidden flex flex-col">
            {/* Header */}
            <DialogHeader className="p-5 border-b border-border bg-muted/20 shrink-0">
              <div className="flex items-center gap-2">
                <PiggyBank className="w-4 h-4 text-primary" />
                <DialogTitle className="text-base font-semibold text-foreground">
                  Savings Rate Analysis — {formatChartXAxisDate(selectedSavingsPoint.yearMonth + '-01', timeframe, { isMonthly: true })}
                </DialogTitle>
              </div>
            </DialogHeader>

            {/* Content */}
            <div className="p-5 space-y-5 bg-background text-sm">
              {/* Summary Hero Box */}
              {(() => {
                const totSav = (selectedSavingsPoint.retirement || 0) + (selectedSavingsPoint.hsa || 0) + (selectedSavingsPoint.brokerage || 0) + (selectedSavingsPoint.savingsAccount || 0) + (selectedSavingsPoint.cash || 0);
                return (
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-center space-y-1">
                    <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Total Savings</div>
                    <div className={`text-3xl font-extrabold font-mono blur-number ${totSav >= 0 ? 'text-primary' : 'text-destructive'}`}>
                      {totSav >= 0 ? '+' : ''}{formatCurrency(totSav)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Savings Rate: <span className="font-bold text-primary blur-number">{formatPlainPercent(selectedSavingsPoint.savingsRate)}</span>
                      {' '}• Total Income: <span className="font-semibold text-foreground blur-number">{formatCurrency(selectedSavingsPoint.income || 0)}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Savings Breakdown */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Components breakdown</h4>
                  <span className="text-[10px] text-muted-foreground italic">Click any bucket to inspect tracked items</span>
                </div>
                <div className="border border-border rounded-xl divide-y divide-border overflow-hidden bg-background">
                  {/* Retirement */}
                  <div
                    className="flex flex-col hover:bg-muted/5 transition-colors cursor-pointer"
                    onClick={() => setExpandedBucket(expandedBucket === 'retirement' ? null : 'retirement')}
                  >
                    <div className="flex justify-between p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'var(--color-chart-1)' }} />
                        <span className="text-muted-foreground font-medium">Retirement (401k / IRA)</span>
                      </div>
                      <div className="flex items-center gap-1.5 font-semibold font-mono text-foreground">
                        <span className="blur-number">{formatCurrency(selectedSavingsPoint.retirement || 0)}</span>
                        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expandedBucket === 'retirement' ? 'rotate-180' : ''}`} />
                      </div>
                    </div>
                    {expandedBucket === 'retirement' && (
                      <div className="bg-muted/10 border-t border-border px-4 py-2 space-y-1.5 text-xs">
                        {selectedSavingsPoint.details?.retirement?.length > 0 ? (
                          selectedSavingsPoint.details.retirement.map((tx: any, idx: number) => (
                            <div key={idx} className="flex justify-between gap-4 py-1.5 border-b border-border/10 last:border-0">
                              <div className="flex flex-col">
                                <span className="font-medium text-foreground">{tx.description}</span>
                                <span className="text-[10px] text-muted-foreground">{tx.accountName} • {formatSafeUTCDate(tx.date, { month: 'short', day: 'numeric' })}</span>
                              </div>
                              <span className="font-mono font-medium text-primary">
                                +{formatCurrency(Math.abs(tx.amount))}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="text-muted-foreground text-center py-3 italic">No specific retirement transactions in this period.</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* HSA */}
                  <div
                    className="flex flex-col hover:bg-muted/5 transition-colors cursor-pointer"
                    onClick={() => setExpandedBucket(expandedBucket === 'hsa' ? null : 'hsa')}
                  >
                    <div className="flex justify-between p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'var(--color-chart-2)' }} />
                        <span className="text-muted-foreground font-medium">HSA Contributions</span>
                      </div>
                      <div className="flex items-center gap-1.5 font-semibold font-mono text-foreground">
                        <span className="blur-number">{formatCurrency(selectedSavingsPoint.hsa || 0)}</span>
                        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expandedBucket === 'hsa' ? 'rotate-180' : ''}`} />
                      </div>
                    </div>
                    {expandedBucket === 'hsa' && (
                      <div className="bg-muted/10 border-t border-border px-4 py-2 space-y-1.5 text-xs">
                        {selectedSavingsPoint.details?.hsa?.length > 0 ? (
                          selectedSavingsPoint.details.hsa.map((tx: any, idx: number) => (
                            <div key={idx} className="flex justify-between gap-4 py-1.5 border-b border-border/10 last:border-0">
                              <div className="flex flex-col">
                                <span className="font-medium text-foreground">{tx.description}</span>
                                <span className="text-[10px] text-muted-foreground">{tx.accountName} • {formatSafeUTCDate(tx.date, { month: 'short', day: 'numeric' })}</span>
                              </div>
                              <span className="font-mono font-medium text-primary">
                                +{formatCurrency(Math.abs(tx.amount))}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="text-muted-foreground text-center py-3 italic">No specific HSA transactions in this period.</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Brokerage */}
                  <div
                    className="flex flex-col hover:bg-muted/5 transition-colors cursor-pointer"
                    onClick={() => setExpandedBucket(expandedBucket === 'brokerage' ? null : 'brokerage')}
                  >
                    <div className="flex justify-between p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'var(--color-chart-3)' }} />
                        <span className="text-muted-foreground font-medium">Taxable Brokerage</span>
                      </div>
                      <div className="flex items-center gap-1.5 font-semibold font-mono text-foreground">
                        <span className="blur-number">{formatCurrency(selectedSavingsPoint.brokerage || 0)}</span>
                        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expandedBucket === 'brokerage' ? 'rotate-180' : ''}`} />
                      </div>
                    </div>
                    {expandedBucket === 'brokerage' && (
                      <div className="bg-muted/10 border-t border-border px-4 py-2 space-y-1.5 text-xs">
                        {selectedSavingsPoint.details?.brokerage?.length > 0 ? (
                          selectedSavingsPoint.details.brokerage.map((tx: any, idx: number) => (
                            <div key={idx} className="flex justify-between gap-4 py-1.5 border-b border-border/10 last:border-0">
                              <div className="flex flex-col">
                                <span className="font-medium text-foreground">{tx.description}</span>
                                <span className="text-[10px] text-muted-foreground">{tx.accountName} • {formatSafeUTCDate(tx.date, { month: 'short', day: 'numeric' })}</span>
                              </div>
                              <span className="font-mono font-medium text-primary">
                                +{formatCurrency(Math.abs(tx.amount))}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="text-muted-foreground text-center py-3 italic">No specific brokerage transfers in this period.</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Savings Account */}
                  <div
                    className="flex flex-col hover:bg-muted/5 transition-colors cursor-pointer"
                    onClick={() => setExpandedBucket(expandedBucket === 'savingsAccount' ? null : 'savingsAccount')}
                  >
                    <div className="flex justify-between p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'var(--color-chart-4)' }} />
                        <span className="text-muted-foreground font-medium">Savings Accounts</span>
                      </div>
                      <div className="flex items-center gap-1.5 font-semibold font-mono text-foreground">
                        <span className="blur-number">{formatCurrency(selectedSavingsPoint.savingsAccount || 0)}</span>
                        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expandedBucket === 'savingsAccount' ? 'rotate-180' : ''}`} />
                      </div>
                    </div>
                    {expandedBucket === 'savingsAccount' && (
                      <div className="bg-muted/10 border-t border-border px-4 py-2 space-y-1.5 text-xs">
                        {selectedSavingsPoint.details?.savingsAccount?.length > 0 ? (
                          selectedSavingsPoint.details.savingsAccount.map((tx: any, idx: number) => (
                            <div key={idx} className="flex justify-between gap-4 py-1.5 border-b border-border/10 last:border-0">
                              <div className="flex flex-col">
                                <span className="font-medium text-foreground">{tx.description}</span>
                                <span className="text-[10px] text-muted-foreground">{tx.accountName} • {formatSafeUTCDate(tx.date, { month: 'short', day: 'numeric' })}</span>
                              </div>
                              <span className="font-mono font-medium text-primary">
                                +{formatCurrency(Math.abs(tx.amount))}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="text-muted-foreground text-center py-3 italic">No specific savings account transfers in this period.</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Leftover Cash */}
                  <div className="flex justify-between p-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'var(--color-chart-5)' }} />
                      <span className="text-muted-foreground font-medium">Leftover Operating Cash Surplus</span>
                    </div>
                    <div className="font-semibold font-mono text-foreground blur-number">
                      {formatCurrency(selectedSavingsPoint.cash || 0)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Informative Note */}
              <div className="text-xs text-muted-foreground bg-muted/30 border border-border/20 rounded-xl p-3 flex items-start gap-2 leading-relaxed space-y-1">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground/60" />
                <div>
                  <strong>Calculation Formula:</strong> Savings Rate is computed as (Total Tracked Savings / Total Income) × 100%. Debt principal reductions (e.g. mortgage/loans) are accounted for as cash outflows in cash flow analysis and accrue to net worth via liability reduction.
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
  );
}
