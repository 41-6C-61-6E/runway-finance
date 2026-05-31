'use client';

import { useCallback, useState, useEffect } from 'react';
import { useUserSettings } from '@/components/user-settings-provider';

/**
 * Hook to manage the collapsed/expanded state of a card.
 * Persists the state to the user settings database.
 *
 * @param cardId - Unique identifier for the card (e.g., 'netWorthSummary', 'incomeExpenseChart')
 * @returns [isCollapsed, setIsCollapsed] - Current collapsed state and setter function
 */
export function useCardCollapsed(cardId: string): [boolean, (collapsed: boolean) => void] {
  const context = useUserSettings();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load initial state from context
  useEffect(() => {
    if (context) {
      const cardCollapsedStates = context.settings?.cardCollapsedStates || {};
      setIsCollapsed(cardCollapsedStates[cardId] === true);
      setIsLoaded(true);
    }
  }, [context, cardId]);

  // Listen for changes in the context (e.g., from other tabs/components)
  useEffect(() => {
    if (context && isLoaded) {
      const cardCollapsedStates = context.settings?.cardCollapsedStates || {};
      const newState = cardCollapsedStates[cardId] === true;
      setIsCollapsed(newState);
    }
  }, [context?.settings?.cardCollapsedStates, cardId, isLoaded]);

  const toggleCollapsed = useCallback(
    (collapsed: boolean) => {
      setIsCollapsed(collapsed);
      context?.updateSetting('cardCollapsedStates', { [cardId]: collapsed });
    },
    [cardId, context]
  );

  return [isCollapsed, toggleCollapsed];
}
