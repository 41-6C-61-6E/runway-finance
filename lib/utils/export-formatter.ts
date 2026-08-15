/**
 * Utility functions for exporting data in CSV and formatted TXT formats.
 */

/**
 * Convert an array of record objects to CSV string with header row and proper quoting.
 */
export function toCsv(rows: Record<string, unknown>[], customHeaders?: { key: string; label: string }[]): string {
  if (!rows || rows.length === 0) {
    if (customHeaders && customHeaders.length > 0) {
      return customHeaders.map((h) => escapeCsvField(h.label)).join(',') + '\n';
    }
    return '';
  }

  const keys = customHeaders ? customHeaders.map((h) => h.key) : Object.keys(rows[0]);
  const headerLabels = customHeaders ? customHeaders.map((h) => h.label) : keys;

  const lines: string[] = [];
  lines.push(headerLabels.map(escapeCsvField).join(','));

  for (const row of rows) {
    const values = keys.map((key) => {
      const val = row[key];
      if (val === null || val === undefined) return '';
      if (typeof val === 'object') {
        return escapeCsvField(JSON.stringify(val));
      }
      return escapeCsvField(String(val));
    });
    lines.push(values.join(','));
  }

  return lines.join('\n');
}

function escapeCsvField(val: string): string {
  let sanitized = val;
  // Prevent CSV / Excel Formula Injection (DDE)
  if (/^[=+\-@\t\r|]/.test(sanitized)) {
    sanitized = `'${sanitized}`;
  }

  if (sanitized.includes(',') || sanitized.includes('"') || sanitized.includes('\n') || sanitized.includes('\r')) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

/**
 * Format FIRE Plan details into a clean, human-readable TXT document report.
 */
export function formatFirePlanTxt(plan: {
  details: Record<string, any>;
  accounts: Record<string, any>[];
  events: Record<string, any>[];
  flows: Record<string, any>[];
  settings?: Record<string, any> | null;
  simulation?: Record<string, any> | null;
}): string {
  const { details: p, accounts, events, flows, settings, simulation } = plan;
  const divider = '='.repeat(80);
  const thinDivider = '-'.repeat(80);

  let out = '';

  out += `${divider}\n`;
  out += ` FIRE PLAN SUMMARY REPORT: ${p.name || 'Untitled Plan'}\n`;
  out += ` Exported Date: ${new Date().toISOString().split('T')[0]}\n`;
  out += `${divider}\n\n`;

  // 1. DEMOGRAPHICS & ASSUMPTIONS
  out += `1. DEMOGRAPHICS & ASSUMPTIONS\n`;
  out += `${thinDivider}\n`;
  out += `Description              : ${p.description || 'N/A'}\n`;
  out += `Is Default Plan          : ${p.isDefault ? 'Yes' : 'No'}\n`;
  out += `Filing Status / Country  : ${p.filingStatus || 'single'} (${p.country || 'US'})\n`;
  out += `Target Retirement Age    : ${p.retirementAge ?? 60}\n`;
  out += `Life Expectancy Age      : ${p.lifeExpectancyAge ?? 100}\n`;
  out += `FI Target Multiplier     : ${p.fiTargetMultiplier ?? 25}x annual expenses\n`;
  out += `Primary Birth Date       : ${p.primaryBirthYear ?? 1985}-${String(p.primaryBirthMonth ?? 1).padStart(2, '0')}\n`;
  out += `Primary Current Salary   : $${parseFloat(p.primarySalary || '0').toLocaleString('en-US')}/yr (Growth: ${p.primarySalaryRaisePct || '0'}%)\n`;

  if (p.hasSpouse) {
    out += `Spouse Name              : ${p.spouseName || 'Spouse'}\n`;
    out += `Spouse Birth Date        : ${p.spouseBirthYear ?? 1985}-${String(p.spouseBirthMonth ?? 1).padStart(2, '0')}\n`;
    out += `Spouse Retirement Age    : ${p.spouseRetirementAge ?? 60}\n`;
    out += `Spouse Salary            : $${parseFloat(p.spouseSalary || '0').toLocaleString('en-US')}/yr\n`;
  }

  out += `Primary Social Security  : $${parseFloat(p.primarySsMonthlyAmount || '0').toLocaleString('en-US')}/mo starting at age ${p.primarySsStartAge ?? 67}\n`;
  if (p.hasSpouse) {
    out += `Spouse Social Security   : $${parseFloat(p.spouseSsMonthlyAmount || '0').toLocaleString('en-US')}/mo starting at age ${p.spouseSsStartAge ?? 67}\n`;
  }
  out += `Withdrawal Method        : ${p.withdrawalMethod || 'textbook'}\n\n`;

  // 2. PLAN SETTINGS
  if (settings) {
    out += `2. SIMULATION & TAX SETTINGS\n`;
    out += `${thinDivider}\n`;
    out += `Fixed Inflation Rate     : ${settings.fixedInflationRate || '3.0'}%\n`;
    out += `Deferred Withholding Rate: ${settings.withholdingDeferred || '20.0'}%\n`;
    out += `Taxable Withholding Rate : ${settings.withholdingTaxable || '10.0'}%\n`;
    out += `Real Estate Liquidation %: ${settings.realEstateLiquidationRate || '6.0'}%\n`;
    out += `Administrative Cost Rate : ${settings.administrativeCostRate || '1.0'}%\n\n`;
  }

  // 3. ASSET HOLDINGS & ACCOUNTS
  out += `3. ASSET HOLDINGS & ACCOUNTS (${accounts.length} Total)\n`;
  out += `${thinDivider}\n`;
  if (accounts.length === 0) {
    out += `No accounts associated with this plan.\n\n`;
  } else {
    out += sprintf('%-28s | %-12s | %-12s | %-10s | %-10s | %-8s\n', 'Account Name', 'Type', 'Balance', 'Cost Basis', 'Growth Rate', 'Included');
    out += `${'-'.repeat(28)}-+-${'-'.repeat(12)}-+-${'-'.repeat(12)}-+-${'-'.repeat(10)}-+-${'-'.repeat(10)}-+-${'-'.repeat(8)}\n`;
    let totalBal = 0;
    for (const a of accounts) {
      const bal = parseFloat(a.balance || '0');
      if (a.isIncluded !== false) totalBal += bal;
      out += sprintf(
        '%-28s | %-12s | %-12s | %-10s | %-10s | %-8s\n',
        truncate(a.name || 'Account', 28),
        truncate(a.type || 'cash', 12),
        `$${bal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `$${parseFloat(a.costBasis || '0').toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        `${a.expectedGrowthRate || '0'}%`,
        a.isIncluded !== false ? 'Yes' : 'No'
      );
    }
    out += `${thinDivider}\n`;
    out += `Total Active Asset Balance: $${totalBal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n\n`;
  }

  // 4. TIMELINE EVENTS (INCOME / EXPENSE / TRANSFERS)
  out += `4. SCHEDULED TIMELINE EVENTS (${events.length} Total)\n`;
  out += `${thinDivider}\n`;
  if (events.length === 0) {
    out += `No custom events configured.\n\n`;
  } else {
    out += sprintf('%-25s | %-8s | %-14s | %-12s | %-16s\n', 'Event Name', 'Category', 'Type', 'Amount', 'Timeline Window');
    out += `${'-'.repeat(25)}-+-${'-'.repeat(8)}-+-${'-'.repeat(14)}-+-${'-'.repeat(12)}-+-${'-'.repeat(16)}\n`;
    for (const e of events) {
      const amt = parseFloat(e.amount || '0');
      const windowStr = `${e.startTriggerType || 'year'}:${e.startTriggerValue || '?'} -> ${e.endTriggerType || 'end'}:${e.endTriggerValue || 'end'}`;
      out += sprintf(
        '%-25s | %-8s | %-14s | %-12s | %-16s\n',
        truncate(e.name || 'Event', 25),
        truncate(e.category || 'income', 8),
        truncate(e.type || 'other', 14),
        `$${amt.toLocaleString('en-US')}`,
        truncate(windowStr, 16)
      );
    }
    out += `${thinDivider}\n\n`;
  }

  // 5. RECENT SIMULATION METRICS / PROJECTIONS SUMMARY
  if (simulation) {
    out += `5. RETIREMENT SIMULATION PROJECTION SUMMARY\n`;
    out += `${thinDivider}\n`;
    out += `Success Rate             : ${simulation.successRate != null ? `${simulation.successRate}%` : 'N/A'}\n`;
    out += `Projected FI Age         : ${simulation.fiAge != null ? simulation.fiAge : 'N/A'}\n`;
    out += `Ending Portfolio Value   : ${simulation.finalNetWorth != null ? `$${parseFloat(simulation.finalNetWorth).toLocaleString('en-US')}` : 'N/A'}\n`;
    out += `Shortfall Year           : ${simulation.shortfallYear || 'None'}\n\n`;
  }

  out += `${divider}\n`;
  out += ` END OF REPORT\n`;
  out += `${divider}\n`;

  return out;
}

function truncate(str: string, maxLen: number): string {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 2) + '..';
}

function sprintf(format: string, ...args: any[]): string {
  let i = 0;
  return format.replace(/%-?(\d+)?s/g, (match, width) => {
    const val = String(args[i++] ?? '');
    const w = parseInt(width, 10) || 0;
    const isLeftAligned = match.startsWith('%-');
    if (val.length >= w) return val;
    const padding = ' '.repeat(w - val.length);
    return isLeftAligned ? val + padding : padding + val;
  });
}
