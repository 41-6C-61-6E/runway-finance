import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowRightLeft, ChevronDown, Info } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import { formatChartXAxisDate } from "@/lib/utils/chart-format";
import { formatSafeUTCDate } from "@/lib/utils/date";

interface CashFlowBreakdownModalProps {
  selectedPoint: any;
  timeframe: string;
  onClose: () => void;
}

export function CashFlowBreakdownModal({ selectedPoint, timeframe, onClose }: CashFlowBreakdownModalProps) {
  const [expandedBucket, setExpandedBucket] = useState<string | null>(null);
  if (!selectedPoint) return null;
  const selectedCashFlowPoint = selectedPoint;

  return (
        <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
          <DialogContent className="max-w-xl max-h-[85vh] p-0 overflow-hidden flex flex-col">
            {/* Header */}
            <DialogHeader className="p-5 border-b border-border bg-muted/20 shrink-0">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-primary" />
                <DialogTitle className="text-base font-semibold text-foreground">
                  Cash Flow Analysis — {formatChartXAxisDate(selectedCashFlowPoint.yearMonth + '-01', timeframe, { isMonthly: true })}
                </DialogTitle>
              </div>
            </DialogHeader>

            {/* Content */}
            <div className="p-5 space-y-5 bg-background text-sm">
              {/* Summary Hero Box */}
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-center space-y-1">
                <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Net Cash Flow</div>
                <div className={`text-3xl font-extrabold font-mono blur-number ${selectedCashFlowPoint.net >= 0 ? 'text-primary' : 'text-destructive'}`}>
                  {selectedCashFlowPoint.net >= 0 ? '+' : ''}{formatCurrency(selectedCashFlowPoint.net)}
                </div>
                <div className="text-xs text-muted-foreground">
                  Income: <span className="font-semibold text-foreground blur-number">{formatCurrency(selectedCashFlowPoint.income)}</span>
                  {' '}• Expenses: <span className="font-semibold text-foreground blur-number">{formatCurrency(Math.abs(selectedCashFlowPoint.expenses))}</span>
                </div>
              </div>

              {/* Cash Flow Breakdown */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Details breakdown</h4>
                  <span className="text-[10px] text-muted-foreground italic">Click any row below to drill down into transaction details</span>
                </div>
                <div className="border border-border rounded-xl divide-y divide-border overflow-hidden bg-background">
                  {/* Total Income */}
                  <div 
                    className="flex flex-col hover:bg-muted/5 transition-colors cursor-pointer"
                    onClick={() => setExpandedBucket(expandedBucket === 'income' ? null : 'income')}
                  >
                    <div className="flex justify-between p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-chart-1" style={{ backgroundColor: 'var(--color-chart-1)' }} />
                        <span className="text-muted-foreground font-medium">Total Income</span>
                      </div>
                      <div className="flex items-center gap-1.5 font-semibold font-mono text-foreground">
                        <span className="blur-number">{formatCurrency(selectedCashFlowPoint.income)}</span>
                        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expandedBucket === 'income' ? 'rotate-180' : ''}`} />
                      </div>
                    </div>
                    {expandedBucket === 'income' && (
                      <div className="bg-muted/10 border-t border-border px-4 py-2 space-y-1.5 text-xs">
                        {selectedCashFlowPoint.details?.income?.length > 0 ? (
                          selectedCashFlowPoint.details.income.map((tx: any, idx: number) => (
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
                          <div className="text-muted-foreground text-center py-3 italic">No income transactions found in this period.</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Total Expenses */}
                  <div 
                    className="flex flex-col hover:bg-muted/5 transition-colors cursor-pointer"
                    onClick={() => setExpandedBucket(expandedBucket === 'expenses' ? null : 'expenses')}
                  >
                    <div className="flex justify-between p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-destructive" style={{ backgroundColor: 'var(--color-destructive)' }} />
                        <span className="text-muted-foreground font-medium">Total Expenses</span>
                      </div>
                      <div className="flex items-center gap-1.5 font-semibold font-mono text-foreground">
                        <span className="blur-number">{formatCurrency(Math.abs(selectedCashFlowPoint.expenses))}</span>
                        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expandedBucket === 'expenses' ? 'rotate-180' : ''}`} />
                      </div>
                    </div>
                    {expandedBucket === 'expenses' && (
                      <div className="bg-muted/10 border-t border-border px-4 py-2 space-y-1.5 text-xs">
                        {selectedCashFlowPoint.details?.expenses?.length > 0 ? (
                          selectedCashFlowPoint.details.expenses.map((tx: any, idx: number) => (
                            <div key={idx} className="flex justify-between gap-4 py-1.5 border-b border-border/10 last:border-0">
                              <div className="flex flex-col">
                                <span className="font-medium text-foreground">{tx.description}</span>
                                <span className="text-[10px] text-muted-foreground">{tx.accountName} • {formatSafeUTCDate(tx.date, { month: 'short', day: 'numeric' })}</span>
                              </div>
                              <span className="font-mono font-medium text-destructive">
                                -{formatCurrency(Math.abs(tx.amount))}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="text-muted-foreground text-center py-3 italic">No expense transactions found in this period.</div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between p-3 bg-primary/[0.03] font-semibold text-foreground border-t border-border">
                    <span>Net Cash Flow</span>
                    <span className={`font-mono blur-number ${selectedCashFlowPoint.net >= 0 ? 'text-primary' : 'text-destructive'}`}>
                      {selectedCashFlowPoint.net >= 0 ? '+' : ''}{formatCurrency(selectedCashFlowPoint.net)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Informative Note */}
              <div className="text-xs text-muted-foreground bg-muted/30 border border-border/20 rounded-xl p-3 flex items-start gap-2 leading-relaxed">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground/60" />
                <span>
                  <strong>Calculation Formula:</strong> Net Cash Flow is computed as Total Income minus Total Expenses. Standard category exclusion rules (e.g. transfers) are automatically applied to reflect true household cash inflows and outflows.
                </span>
              </div>
            </div>
          </DialogContent>
        </Dialog>
  );
}
