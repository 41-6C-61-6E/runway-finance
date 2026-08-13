import { describe, it, expect } from 'vitest';
import {
  normalizePayee,
  classifyStreamType,
  analyzeIntervals,
  calculateNextExpectedDate,
  detectRecurringStreams,
  generateBalanceForecast,
  generateSubscriptionInsights,
  type RawTransactionInput,
  type DetectedRecurringStream,
} from '@/lib/services/recurring-engine';

describe('Recurring Transaction Detection Engine', () => {
  describe('normalizePayee', () => {
    it('cleans payment processor prefixes and noise', () => {
      expect(normalizePayee('SQ *BLUE BOTTLE COFFEE CA')).toBe('Blue Bottle Coffee');
      expect(normalizePayee('TST* SWEETGREEN #1042')).toBe('Sweetgreen');
      expect(normalizePayee('PAYPAL *NETFLIX.COM')).toBe('Netflix.com');
      expect(normalizePayee('AMZN MKTP US*1A2B3C')).toBe('US');
      expect(normalizePayee('ACH DEPOSIT ACME CORP PAYROLL')).toBe('Acme Corp Payroll');
    });

    it('handles empty or clean names gracefully', () => {
      expect(normalizePayee('')).toBe('Unknown');
      expect(normalizePayee('Spotify')).toBe('Spotify');
      expect(normalizePayee('Google Storage')).toBe('Google Storage');
    });
  });

  describe('classifyStreamType', () => {
    it('classifies income transactions correctly', () => {
      expect(classifyStreamType('Acme Payroll', 3500, 'Salary', true)).toBe('income');
      expect(classifyStreamType('Direct Deposit ADP', 2800)).toBe('income');
    });

    it('classifies well-known subscriptions', () => {
      expect(classifyStreamType('Netflix', 15.49, 'Entertainment')).toBe('subscription');
      expect(classifyStreamType('Spotify', 10.99, 'Music')).toBe('subscription');
      expect(classifyStreamType('OpenAI ChatGPT', 20.0, 'Software')).toBe('subscription');
      expect(classifyStreamType('Apple iCloud', 2.99, 'Utilities')).toBe('subscription');
    });

    it('classifies bills, utilities, and loans', () => {
      expect(classifyStreamType('ConEdison Electric', 145.0, 'Utilities')).toBe('bill');
      expect(classifyStreamType('Comcast Internet', 85.0, 'Internet')).toBe('bill');
      expect(classifyStreamType('Geico Insurance', 120.0, 'Auto Insurance')).toBe('bill');
      expect(classifyStreamType('Chase Auto Loan', 420.0, 'Loans')).toBe('loan');
      expect(classifyStreamType('Main Street Rent', 1800.0, 'Housing')).toBe('loan');
    });
  });

  describe('analyzeIntervals', () => {
    it('detects weekly intervals', () => {
      const dates = ['2026-01-07', '2026-01-14', '2026-01-21', '2026-01-28'];
      const res = analyzeIntervals(dates);
      expect(res).not.toBeNull();
      expect(res?.frequency).toBe('weekly');
      expect(res?.intervalDays).toBe(7);
      expect(res?.confidence).toBeGreaterThanOrEqual(70);
    });

    it('detects bi-weekly intervals', () => {
      const dates = ['2026-01-02', '2026-01-16', '2026-01-30', '2026-02-13'];
      const res = analyzeIntervals(dates);
      expect(res).not.toBeNull();
      expect(res?.frequency).toBe('biweekly');
      expect(res?.intervalDays).toBe(14);
    });

    it('detects monthly intervals', () => {
      const dates = ['2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15'];
      const res = analyzeIntervals(dates);
      expect(res).not.toBeNull();
      expect(res?.frequency).toBe('monthly');
      expect(res?.intervalDays).toBe(30);
    });

    it('returns null for sporadic irregular transactions', () => {
      const dates = ['2026-01-02', '2026-01-05', '2026-03-20'];
      const res = analyzeIntervals(dates);
      expect(res).toBeNull();
    });
  });

  describe('calculateNextExpectedDate', () => {
    it('steps monthly date forward to future', () => {
      const next = calculateNextExpectedDate('2026-01-15', 'monthly', '2026-04-01');
      expect(next).toBe('2026-04-15');
    });

    it('steps weekly date forward to future', () => {
      const next = calculateNextExpectedDate('2026-04-01', 'weekly', '2026-04-10');
      expect(next).toBe('2026-04-15');
    });
  });

  describe('detectRecurringStreams', () => {
    it('detects recurring Netflix subscription from past transaction history', () => {
      const txs: RawTransactionInput[] = [
        { id: '1', accountId: 'acc-1', amount: -15.49, description: 'NETFLIX.COM* 1234', date: '2026-01-10' },
        { id: '2', accountId: 'acc-1', amount: -15.49, description: 'NETFLIX.COM* 5678', date: '2026-02-10' },
        { id: '3', accountId: 'acc-1', amount: -15.49, description: 'NETFLIX.COM* 9012', date: '2026-03-10' },
      ];

      const detected = detectRecurringStreams(txs, { referenceDate: '2026-03-15' });
      expect(detected.length).toBe(1);
      expect(detected[0].name).toBe('Netflix.com');
      expect(detected[0].amount).toBe(15.49);
      expect(detected[0].frequency).toBe('monthly');
      expect(detected[0].type).toBe('subscription');
      expect(detected[0].nextExpectedDate).toBe('2026-04-10');
      expect(detected[0].isVariableAmount).toBe(false);
    });

    it('detects recurring bi-weekly direct deposit paycheck', () => {
      const txs: RawTransactionInput[] = [
        { id: '1', accountId: 'acc-1', amount: 3200.0, description: 'DIRECT DEP ACME CORP', date: '2026-01-02', isIncome: true },
        { id: '2', accountId: 'acc-1', amount: 3200.0, description: 'DIRECT DEP ACME CORP', date: '2026-01-16', isIncome: true },
        { id: '3', accountId: 'acc-1', amount: 3200.0, description: 'DIRECT DEP ACME CORP', date: '2026-01-30', isIncome: true },
      ];

      const detected = detectRecurringStreams(txs, { referenceDate: '2026-02-01' });
      expect(detected.length).toBe(1);
      expect(detected[0].name).toBe('Acme Corp');
      expect(detected[0].amount).toBe(3200.0);
      expect(detected[0].frequency).toBe('biweekly');
      expect(detected[0].type).toBe('income');
    });

    it('detects variable electric utility bill with moving average', () => {
      const txs: RawTransactionInput[] = [
        { id: '1', accountId: 'acc-1', amount: -120.0, description: 'CONEDISON ELECTRIC', date: '2026-01-05' },
        { id: '2', accountId: 'acc-1', amount: -140.0, description: 'CONEDISON ELECTRIC', date: '2026-02-05' },
        { id: '3', accountId: 'acc-1', amount: -130.0, description: 'CONEDISON ELECTRIC', date: '2026-03-05' },
      ];

      const detected = detectRecurringStreams(txs, { referenceDate: '2026-03-10' });
      expect(detected.length).toBe(1);
      expect(detected[0].name).toBe('Conedison Electric');
      expect(detected[0].isVariableAmount).toBe(true);
      expect(detected[0].amount).toBe(130.0); // mean of 120, 140, 130
      expect(detected[0].type).toBe('bill');
    });
  });

  describe('generateBalanceForecast', () => {
    it('projects forward daily cash runway and accurately computes lowest balance and ending balance', () => {
      const streams: DetectedRecurringStream[] = [
        {
          id: 'salary',
          name: 'Salary',
          payee: 'Acme',
          normalizedName: 'Acme',
          amount: 3000,
          type: 'income',
          frequency: 'monthly',
          intervalDays: 30,
          anchorDate: '2026-04-01',
          nextExpectedDate: '2026-04-15',
          accountId: 'acc-chk',
          categoryId: null,
          isAutoDetected: false,
          isConfirmed: true,
          isActive: true,
          confidence: 100,
          isVariableAmount: false,
          averageAmount: 3000,
          matchedTransactionIds: [],
          lastOccurrenceDate: '2026-03-15',
          status: 'active',
        },
        {
          id: 'rent',
          name: 'Rent',
          payee: 'Landlord',
          normalizedName: 'Landlord',
          amount: 1500,
          type: 'loan',
          frequency: 'monthly',
          intervalDays: 30,
          anchorDate: '2026-04-01',
          nextExpectedDate: '2026-04-01',
          accountId: 'acc-chk',
          categoryId: null,
          isAutoDetected: false,
          isConfirmed: true,
          isActive: true,
          confidence: 100,
          isVariableAmount: false,
          averageAmount: 1500,
          matchedTransactionIds: [],
          lastOccurrenceDate: '2026-03-01',
          status: 'active',
        },
        {
          id: 'netflix',
          name: 'Netflix',
          payee: 'Netflix',
          normalizedName: 'Netflix',
          amount: 15.49,
          type: 'subscription',
          frequency: 'monthly',
          intervalDays: 30,
          anchorDate: '2026-04-10',
          nextExpectedDate: '2026-04-10',
          accountId: 'acc-chk',
          categoryId: null,
          isAutoDetected: true,
          isConfirmed: false,
          isActive: true,
          confidence: 95,
          isVariableAmount: false,
          averageAmount: 15.49,
          matchedTransactionIds: [],
          lastOccurrenceDate: '2026-03-10',
          status: 'active',
        },
      ];

      const res = generateBalanceForecast({
        accounts: [{ id: 'acc-chk', name: 'Checking', balance: 5000, type: 'checking' }],
        recurringStreams: streams,
        horizonDays: 30,
        startDate: '2026-04-01',
      });

      expect(res.points.length).toBe(31); // day 0 to 30
      expect(res.summary.currentBalance).toBe(5000);
      expect(res.summary.totalUpcomingInflows).toBe(3000);
      expect(res.summary.lowestBalance).toBeLessThan(5000);
      expect(res.summary.projectedEndBalance).toBeGreaterThan(5000);
      expect(res.summary.subscriptionMonthlyTotal).toBe(15.49);
    });

    it('handles active vs paused streams accurately', () => {
      const streams: DetectedRecurringStream[] = [
        {
          id: 'salary',
          name: 'Salary',
          payee: 'Acme',
          normalizedName: 'Acme',
          amount: 3000,
          type: 'income',
          frequency: 'monthly',
          intervalDays: 30,
          anchorDate: '2026-04-01',
          nextExpectedDate: '2026-04-15',
          accountId: 'acc-chk',
          categoryId: null,
          isAutoDetected: false,
          isConfirmed: true,
          isActive: true,
          confidence: 100,
          isVariableAmount: false,
          averageAmount: 3000,
          matchedTransactionIds: [],
          lastOccurrenceDate: '2026-03-15',
          status: 'active',
        },
        {
          id: 'netflix',
          name: 'Netflix',
          payee: 'Netflix',
          normalizedName: 'Netflix',
          amount: 20.0,
          type: 'subscription',
          frequency: 'monthly',
          intervalDays: 30,
          anchorDate: '2026-04-10',
          nextExpectedDate: '2026-04-10',
          accountId: 'acc-chk',
          categoryId: null,
          isAutoDetected: true,
          isConfirmed: false,
          isActive: false, // paused stream should not deduct
          confidence: 95,
          isVariableAmount: false,
          averageAmount: 20.0,
          matchedTransactionIds: [],
          lastOccurrenceDate: '2026-03-10',
          status: 'paused',
        },
      ];

      const res = generateBalanceForecast({
        accounts: [{ id: 'acc-chk', name: 'Checking', balance: 5000, type: 'checking' }],
        recurringStreams: streams,
        horizonDays: 30,
        startDate: '2026-04-01',
      });

      const finalPoint = res.points[res.points.length - 1];
      expect(finalPoint.totalBalance).toBe(5000 + 3000); // 3000 salary without paused netflix
    });
  });

  describe('generateSubscriptionInsights', () => {
    it('detects subscription price increases', () => {
      const stream: DetectedRecurringStream = {
        id: 'netflix-sub',
        name: 'Netflix',
        payee: 'Netflix',
        normalizedName: 'Netflix',
        amount: 17.99,
        type: 'subscription',
        frequency: 'monthly',
        intervalDays: 30,
        anchorDate: '2026-01-01',
        nextExpectedDate: '2026-04-01',
        accountId: 'acc-1',
        categoryId: null,
        isAutoDetected: true,
        isConfirmed: false,
        isActive: true,
        confidence: 95,
        isVariableAmount: false,
        averageAmount: 17.99,
        matchedTransactionIds: [],
        lastOccurrenceDate: '2026-03-01',
        status: 'active',
        priceHistory: [
          { date: '2026-01-01', amount: 15.49 },
          { date: '2026-02-01', amount: 15.49 },
          { date: '2026-03-01', amount: 17.99 },
        ],
      };

      const insights = generateSubscriptionInsights([stream]);
      expect(insights.length).toBe(1);
      expect(insights[0].type).toBe('price_increase');
      expect(insights[0].oldAmount).toBe(15.49);
      expect(insights[0].newAmount).toBe(17.99);
      expect(insights[0].title).toContain('Netflix');
    });
  });
});
