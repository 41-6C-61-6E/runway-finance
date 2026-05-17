import { relations } from "drizzle-orm/relations";
import { accounts, transactions, categories, categoryRules, user, account, session, simplefinConnections, accountSnapshots, categorySpendingSummary, categoryIncomeSummary, budgets, financialGoals, fireScenarios, retirementProjections, syncLogs } from "./schema";

export const transactionsRelations = relations(transactions, ({one}) => ({
	account: one(accounts, {
		fields: [transactions.accountId],
		references: [accounts.id]
	}),
	category: one(categories, {
		fields: [transactions.categoryId],
		references: [categories.id]
	}),
}));

export const accountsRelations = relations(accounts, ({one, many}) => ({
	transactions: many(transactions),
	simplefinConnection: one(simplefinConnections, {
		fields: [accounts.connectionId],
		references: [simplefinConnections.id]
	}),
	accountSnapshots: many(accountSnapshots),
	budgets: many(budgets),
	financialGoals: many(financialGoals),
}));

export const categoriesRelations = relations(categories, ({many}) => ({
	transactions: many(transactions),
	categoryRules: many(categoryRules),
	categorySpendingSummaries: many(categorySpendingSummary),
	categoryIncomeSummaries: many(categoryIncomeSummary),
	budgets: many(budgets),
}));

export const categoryRulesRelations = relations(categoryRules, ({one}) => ({
	category: one(categories, {
		fields: [categoryRules.setCategoryId],
		references: [categories.id]
	}),
}));

export const accountRelations = relations(account, ({one}) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id]
	}),
}));

export const userRelations = relations(user, ({many}) => ({
	accounts: many(account),
	sessions: many(session),
}));

export const sessionRelations = relations(session, ({one}) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id]
	}),
}));

export const simplefinConnectionsRelations = relations(simplefinConnections, ({many}) => ({
	accounts: many(accounts),
	syncLogs: many(syncLogs),
}));

export const accountSnapshotsRelations = relations(accountSnapshots, ({one}) => ({
	account: one(accounts, {
		fields: [accountSnapshots.accountId],
		references: [accounts.id]
	}),
}));

export const categorySpendingSummaryRelations = relations(categorySpendingSummary, ({one}) => ({
	category: one(categories, {
		fields: [categorySpendingSummary.categoryId],
		references: [categories.id]
	}),
}));

export const categoryIncomeSummaryRelations = relations(categoryIncomeSummary, ({one}) => ({
	category: one(categories, {
		fields: [categoryIncomeSummary.categoryId],
		references: [categories.id]
	}),
}));

export const budgetsRelations = relations(budgets, ({one}) => ({
	category: one(categories, {
		fields: [budgets.categoryId],
		references: [categories.id]
	}),
	account: one(accounts, {
		fields: [budgets.fundingAccountId],
		references: [accounts.id]
	}),
}));

export const financialGoalsRelations = relations(financialGoals, ({one}) => ({
	account: one(accounts, {
		fields: [financialGoals.linkedAccountId],
		references: [accounts.id]
	}),
}));

export const retirementProjectionsRelations = relations(retirementProjections, ({one}) => ({
	fireScenario: one(fireScenarios, {
		fields: [retirementProjections.fireScenarioId],
		references: [fireScenarios.id]
	}),
}));

export const fireScenariosRelations = relations(fireScenarios, ({many}) => ({
	retirementProjections: many(retirementProjections),
}));

export const syncLogsRelations = relations(syncLogs, ({one}) => ({
	simplefinConnection: one(simplefinConnections, {
		fields: [syncLogs.connectionId],
		references: [simplefinConnections.id]
	}),
}));